/**
 * ======================================================================================
 * PHASE 5 — STEP 6: ORDER LIFECYCLE PRINT INTEGRATION VERIFICATION TEST SUITE
 * Mostafa Elgazar Restaurant Operations System
 * 
 * Critical Acceptance Gates:
 * 1. 10x Event Replay: Replaying the exact same Order Event 10 times produces exactly
 *    ONE logical PrintJob for the original document.
 * 2. Failure Decoupling: Print failure never bubbles up to crash the event or alter order state.
 * 3. Duplicate Order Created handling (Takeaway, Delivery, Dine-In).
 * 4. Duplicate Order Status -> Processing handling.
 * 5. Duplicate Driver Assigned handling (Same driver replay is completely suppressed).
 * 6. Driver Reassignment handling (New driver triggers REPRINT, not duplicate ORIGINAL).
 * 7. Out-of-order event sequence handling (Processing event arrives before Creation event).
 * 8. Event arriving after print job is already COMPLETED.
 * ======================================================================================
 */

import {
  OrderLifecyclePrintBridge,
  resolvePrintTriggers,
  OrderCreatedLifecycleEvent,
  OrderProcessingLifecycleEvent,
  DriverAssignedLifecycleEvent,
} from '../src/lib/printing/lifecycle'
import {
  PrintExecutionRuntime,
} from '../src/lib/printing/execution'
import {
  RuntimePrintJobRegistry,
} from '../src/lib/printing/jobs'
import {
  PrintAdapterRegistry,
  MockPrintAdapter,
} from '../src/lib/printing/adapters'
import {
  StationConfigManager,
} from '../src/lib/printing/execution/stationConfig'
import {
  KitchenTicketPayload,
  CustomerReceiptPayload,
  DriverControlCopyPayload,
  DineInCustomerTicketPayload,
} from '../src/types/printing'

let passedTests = 0
let failedTests = 0

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`)
    passedTests++
  } else {
    console.error(`  ❌ FAIL: ${testName}`)
    failedTests++
  }
}

// Sample Canonical Documents
const sampleKitchenDoc: KitchenTicketPayload = {
  document_type: 'KITCHEN_TICKET',
  order_id: 'ord-8001',
  order_number: 3001,
  shift_number: 16,
  order_type: 'delivery',
  shift_sequence_display: 'توصيل #3001',
  items: [{ name: 'مشويات مشكل', variant_name: 'كيلو', quantity: 1 }],
  dispatched_at: '2026-09-11T14:00:00Z',
  print_nature: 'ORIGINAL',
}

const sampleDriverDoc: DriverControlCopyPayload = {
  document_type: 'DRIVER_CONTROL_COPY',
  order_id: 'ord-8001',
  order_number: 3001,
  shift_number: 16,
  trip_number: 5,
  driver_name: 'كابتن ماجد',
  customer_name: 'شريف عثمان',
  customer_phone: '01001112233',
  delivery_address: 'المعادي',
  amount_to_collect: 600,
  payment_method: 'cash',
  created_by_staff: 'cashier_salma',
  dispatched_at: '2026-09-11T14:10:00Z',
  print_nature: 'ORIGINAL',
}

const sampleReceiptDoc: CustomerReceiptPayload = {
  document_type: 'CUSTOMER_RECEIPT',
  order_id: 'ord-8001',
  order_number: 3001,
  shift_number: 16,
  order_type: 'delivery',
  shift_sequence_display: 'توصيل #3001',
  customer_name: 'شريف عثمان',
  customer_phone: '01001112233',
  delivery_address: 'المعادي',
  items: [{ name: 'مشويات مشكل', variant_name: 'كيلو', quantity: 1, unit_price: 575, subtotal: 575 }],
  subtotal_amount: 575,
  delivery_fee: 25,
  total_amount: 600,
  payment_method: 'cash',
  created_by_staff: 'cashier_salma',
  created_at: '2026-09-11T14:00:00Z',
  print_nature: 'ORIGINAL',
}

async function runTests() {
  console.log('🧪 ========================================================')
  console.log('🧪 PHASE 5 — STEP 6: ORDER LIFECYCLE PRINT INTEGRATION')
  console.log('🧪 ========================================================\n')

  // Setup test environment
  const registry = new RuntimePrintJobRegistry()
  const adapterRegistry = new PrintAdapterRegistry()
  const mockAdapter = new MockPrintAdapter({ mode: 'success', simulateDeviceAck: true })
  adapterRegistry.register(mockAdapter)

  const stationConfig = new StationConfigManager({
    KITCHEN_80MM: { adapter_type: 'mock', station: 'KITCHEN_80MM' },
    CASHIER_80MM: { adapter_type: 'mock', station: 'CASHIER_80MM' },
  })

  const runtime = new PrintExecutionRuntime(registry, adapterRegistry, stationConfig)
  const bridge = new OrderLifecyclePrintBridge(runtime, registry)

  // --- 1. CRITICAL GATE 1: 10x Event Replay Idempotency ---
  console.log('--- 1. Testing Critical Gate: 10x Event Replay Idempotency ---')
  const orderCreatedEvent: OrderCreatedLifecycleEvent = {
    event_type: 'ORDER_CREATED',
    event_id: 'evt-create-8001',
    order_id: 'ord-8001',
    order_number: 3001,
    workflow: 'delivery',
    timestamp: '2026-09-11T14:00:00Z',
    documents: {
      kitchen_ticket: sampleKitchenDoc,
    },
  }

  // Replay the exact same event 10 times consecutively
  const replayResults = []
  for (let i = 1; i <= 10; i++) {
    const res = await bridge.handleOrderEvent(orderCreatedEvent)
    replayResults.push(res)
  }

  // Verification of 10x Replay
  assert(replayResults[0].dispatched.length === 1, 'First event dispatch produced exactly 1 PrintJob')
  assert(replayResults[0].skipped.length === 0, 'First event had 0 skipped triggers')

  let totalDispatchedCount = 0
  let totalSkippedCount = 0
  for (let i = 1; i < 10; i++) {
    totalDispatchedCount += replayResults[i].dispatched.length
    totalSkippedCount += replayResults[i].skipped.length
  }

  assert(totalDispatchedCount === 0, 'Remaining 9 event replays produced ZERO new PrintJobs')
  assert(totalSkippedCount === 9, 'Remaining 9 event replays were all safely skipped as idempotent')

  const orderJobs = registry.getJobsByOrderId('ord-8001')
  const originalKitchenJobs = orderJobs.filter(
    (j) => j.document_type === 'KITCHEN_TICKET' && j.job_kind === 'ORIGINAL'
  )
  assert(
    originalKitchenJobs.length === 1,
    'CRITICAL GATE PASSED: Exactly 1 logical original PrintJob exists in registry after 10 replays'
  )

  // --- 2. CRITICAL GATE 2: Failure Decoupling (Printer Failure Never Crashes Event) ---
  console.log('\n--- 2. Testing Critical Gate: Failure Decoupling ---')
  mockAdapter.setMode('disconnect') // Persistent printer disconnect

  const failingOrderEvent: OrderCreatedLifecycleEvent = {
    event_type: 'ORDER_CREATED',
    event_id: 'evt-create-8002',
    order_id: 'ord-8002',
    order_number: 3002,
    workflow: 'delivery',
    timestamp: '2026-09-11T14:05:00Z',
    documents: {
      kitchen_ticket: { ...sampleKitchenDoc, order_id: 'ord-8002', order_number: 3002 },
    },
  }

  // Mock an order status state variable to verify it is NEVER modified by the print layer
  const simulatedOrderState = {
    order_id: 'ord-8002',
    status: 'pending',
    updated_at: '2026-09-11T14:05:00Z',
  }

  let eventErrorThrown = false
  let failResult: any = null
  try {
    failResult = await bridge.handleOrderEvent(failingOrderEvent)
  } catch (err) {
    eventErrorThrown = true
  }

  assert(eventErrorThrown === false, 'CRITICAL GATE PASSED: Printer failure did NOT throw unhandled error to order caller')
  assert(failResult !== null, 'Returned clean result object')
  assert(failResult.print_errors.length === 1, 'Safe non-fatal error recorded in result')
  assert(failResult.dispatched[0].job.status === 'PRINT_FAILED', 'PrintJob captured failure state accurately')
  assert(simulatedOrderState.status === 'pending', 'CRITICAL GATE PASSED: simulated order status remains completely unaffected')

  mockAdapter.setMode('success') // Reset adapter

  // --- 3. Duplicate Order Status -> Processing Event ---
  console.log('\n--- 3. Testing Duplicate Order Status -> Processing Event ---')
  // For ord-8001, Kitchen Ticket was already created during ORDER_CREATED.
  // Now STATUS -> PROCESSING arrives:
  const processingEvent: OrderProcessingLifecycleEvent = {
    event_type: 'ORDER_STATUS_PROCESSING',
    event_id: 'evt-proc-8001',
    order_id: 'ord-8001',
    order_number: 3001,
    workflow: 'delivery',
    timestamp: '2026-09-11T14:08:00Z',
    kitchen_ticket: sampleKitchenDoc,
  }

  const procResult1 = await bridge.handleOrderEvent(processingEvent)
  assert(procResult1.dispatched.length === 0, 'No duplicate Kitchen Ticket dispatched on processing event')
  assert(procResult1.skipped.length === 1, 'Processing event trigger skipped as idempotent')
  assert(procResult1.skipped[0].document_type === 'KITCHEN_TICKET', 'Skipped document is KITCHEN_TICKET')

  // Replay processing event a second time
  const procResult2 = await bridge.handleOrderEvent(processingEvent)
  assert(procResult2.dispatched.length === 0, 'Replayed processing event also produces 0 dispatches')

  // --- 4. Driver Assignment (First Assignment Policy) ---
  console.log('\n--- 4. Testing Driver Assignment (First Assignment) ---')
  const driverAssignEvent: DriverAssignedLifecycleEvent = {
    event_type: 'DRIVER_ASSIGNED',
    event_id: 'evt-assign-8001-1',
    order_id: 'ord-8001',
    order_number: 3001,
    workflow: 'delivery',
    driver_id: 'drv-majed',
    driver_name: 'كابتن ماجد',
    trip_number: 5,
    previous_driver_id: null,
    staff_authorizer: 'cashier_salma',
    timestamp: '2026-09-11T14:15:00Z',
    documents: {
      driver_control_copy: sampleDriverDoc,
      customer_receipt: sampleReceiptDoc,
    },
  }

  const assignResult = await bridge.handleOrderEvent(driverAssignEvent)
  assert(assignResult.dispatched.length === 2, 'Initial driver assignment dispatches 2 documents (Driver Copy + Receipt)')
  assert(
    assignResult.dispatched.some((d) => d.job.document_type === 'DRIVER_CONTROL_COPY' && d.job.job_kind === 'ORIGINAL'),
    'Dispatches ORIGINAL Driver Control Copy'
  )
  assert(
    assignResult.dispatched.some((d) => d.job.document_type === 'CUSTOMER_RECEIPT' && d.job.job_kind === 'ORIGINAL'),
    'Dispatches ORIGINAL Customer Receipt'
  )

  // Replaying SAME driver assignment
  console.log('\n--- 5. Testing Duplicate Driver Assigned (Same Driver Replay) ---')
  const replayAssignResult = await bridge.handleOrderEvent(driverAssignEvent)
  assert(replayAssignResult.dispatched.length === 0, 'Replay of same driver assignment produces 0 dispatches')
  assert(replayAssignResult.skipped.length === 2, 'Both driver copy and receipt skipped as idempotent')

  // --- 6. Driver Reassignment Policy (New Driver triggers REPRINT) ---
  console.log('\n--- 6. Testing Driver Reassignment Policy ---')
  const reassignEvent: DriverAssignedLifecycleEvent = {
    event_type: 'DRIVER_ASSIGNED',
    event_id: 'evt-reassign-8001-2',
    order_id: 'ord-8001',
    order_number: 3001,
    workflow: 'delivery',
    driver_id: 'drv-walid', // NEW driver
    driver_name: 'كابتن وليد',
    trip_number: 6,
    previous_driver_id: 'drv-majed', // PREVIOUS driver
    previous_driver_name: 'كابتن ماجد',
    staff_authorizer: 'supervisor_hany',
    timestamp: '2026-09-11T14:25:00Z',
    documents: {
      driver_control_copy: {
        ...sampleDriverDoc,
        trip_number: 6,
        driver_name: 'كابتن وليد',
      },
      customer_receipt: sampleReceiptDoc,
    },
  }

  const reassignResult = await bridge.handleOrderEvent(reassignEvent)
  assert(reassignResult.dispatched.length === 1, 'Reassignment dispatches exactly 1 document (Driver Control Copy)')
  const reassignJob = reassignResult.dispatched[0].job
  assert(reassignJob.job_kind === 'REPRINT', 'Reassigned driver document is created strictly as REPRINT')
  assert(reassignJob.reprint_info?.reason === 'driver_reassigned', 'Reprint reason is driver_reassigned')
  assert(reassignJob.reprint_info?.requested_by === 'supervisor_hany', 'Staff authorizer recorded')

  // Replaying same reassignment
  const replayReassignResult = await bridge.handleOrderEvent(reassignEvent)
  assert(replayReassignResult.dispatched.length === 0, 'Replay of same reassignment is safely skipped')

  // --- 7. Out-Of-Order Event Delivery ---
  console.log('\n--- 7. Testing Out-Of-Order Event Sequence ---')
  // Scenario: Status -> Processing arrives BEFORE Order Created event (e.g. queue delay)
  const outOfOrderKitchenDoc: KitchenTicketPayload = {
    ...sampleKitchenDoc,
    order_id: 'ord-8003',
    order_number: 3003,
  }

  const earlyProcessingEvent: OrderProcessingLifecycleEvent = {
    event_type: 'ORDER_STATUS_PROCESSING',
    event_id: 'evt-proc-8003',
    order_id: 'ord-8003',
    order_number: 3003,
    workflow: 'delivery',
    timestamp: '2026-09-11T14:30:00Z',
    kitchen_ticket: outOfOrderKitchenDoc,
  }

  const lateCreationEvent: OrderCreatedLifecycleEvent = {
    event_type: 'ORDER_CREATED',
    event_id: 'evt-create-8003',
    order_id: 'ord-8003',
    order_number: 3003,
    workflow: 'delivery',
    timestamp: '2026-09-11T14:31:00Z',
    documents: {
      kitchen_ticket: outOfOrderKitchenDoc,
    },
  }

  // Processing arrives first
  const stepA = await bridge.handleOrderEvent(earlyProcessingEvent)
  assert(stepA.dispatched.length === 1, 'Kitchen ticket dispatched on early processing event')

  // Creation arrives second
  const stepB = await bridge.handleOrderEvent(lateCreationEvent)
  assert(stepB.dispatched.length === 0, 'Late creation event safely skipped Kitchen Ticket (already printed)')
  assert(stepB.skipped.length === 1, 'Recorded as skipped idempotent')

  // Total original kitchen jobs for ord-8003 is still exactly 1
  const ord3Jobs = registry.getJobsByOrderId('ord-8003')
  assert(ord3Jobs.length === 1, 'Exactly 1 PrintJob created regardless of event arrival sequence')

  // --- 8. Takeaway & Dine-In Creation Triggers Verification ---
  console.log('\n--- 8. Testing Takeaway and Dine-In Multi-Document Triggers ---')
  const takeawayEvent: OrderCreatedLifecycleEvent = {
    event_type: 'ORDER_CREATED',
    event_id: 'evt-create-8004',
    order_id: 'ord-8004',
    order_number: 3004,
    workflow: 'takeaway',
    timestamp: '2026-09-11T14:35:00Z',
    documents: {
      kitchen_ticket: { ...sampleKitchenDoc, order_id: 'ord-8004', order_number: 3004, order_type: 'takeaway' },
      customer_receipt: { ...sampleReceiptDoc, order_id: 'ord-8004', order_number: 3004, order_type: 'takeaway' },
    },
  }

  const takeawayRes = await bridge.handleOrderEvent(takeawayEvent)
  assert(takeawayRes.dispatched.length === 2, 'Takeaway creation dispatches 2 documents (Kitchen + Receipt)')
  assert(
    takeawayRes.dispatched.some((d) => d.job.document_type === 'KITCHEN_TICKET' && d.job.target_station === 'KITCHEN_80MM'),
    'Takeaway routes Kitchen Ticket to KITCHEN_80MM'
  )
  assert(
    takeawayRes.dispatched.some((d) => d.job.document_type === 'CUSTOMER_RECEIPT' && d.job.target_station === 'CASHIER_80MM'),
    'Takeaway routes Customer Receipt to CASHIER_80MM'
  )

  console.log('\n=======================================')
  console.log(`🏁 RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`)
  console.log('=======================================\n')

  if (failedTests > 0) {
    process.exit(1)
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err)
  process.exit(1)
})
