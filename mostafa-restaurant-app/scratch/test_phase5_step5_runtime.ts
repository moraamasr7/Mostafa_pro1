/**
 * ======================================================================================
 * PHASE 5 — STEP 5: PRINT EXECUTION RUNTIME & DISPATCHER VERIFICATION TEST SUITE
 * Mostafa Elgazar Restaurant Operations System
 * 
 * Demonstrates and verifies the complete end-to-end chain:
 * CanonicalPrintDocument -> Document Renderer -> PrintPayload -> PrintJob ->
 * Station Router -> Adapter Registry -> Concrete Adapter -> PrintResult -> State Machine
 * 
 * Verifies:
 * 1. Full end-to-end dispatch of Kitchen Ticket, Driver Control Copy, and Customer Receipt.
 * 2. Accurate Hardware ACK distinction (never falsely claiming physical printing).
 * 3. Idempotent execution guard (blocks duplicate original dispatch).
 * 4. Auto-retry orchestration on retryable errors with backoff.
 * 5. Fatal failure handling on non-retryable errors or exhausted retries.
 * 6. Reprint dispatch linked to original parent job.
 * 7. Differential Change Ticket dispatch.
 * 8. Cancellation safety before dispatch.
 * ======================================================================================
 */

import {
  PrintExecutionRuntime,
  globalPrintRuntime,
} from '../src/lib/printing/execution'
import {
  RuntimePrintJobRegistry,
  DuplicatePrintJobError,
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
  DifferentialChangeTicketPayload,
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

// Canonical Test Payloads
const sampleKitchenDoc: KitchenTicketPayload = {
  document_type: 'KITCHEN_TICKET',
  order_id: 'ord-5001',
  order_number: 2001,
  shift_number: 15,
  order_type: 'delivery',
  shift_sequence_display: 'توصيل #2001',
  items: [
    { name: 'كباب مشكل', variant_name: 'نصف كيلو', quantity: 2, item_notes: 'مستوي جيداً' },
    { name: 'أرز بسمتي', variant_name: 'وسط', quantity: 2 },
  ],
  order_notes: 'بجوار صيدلية العزبي',
  dispatched_at: '2026-09-11T13:00:00Z',
  print_nature: 'ORIGINAL',
}

const sampleDriverDoc: DriverControlCopyPayload = {
  document_type: 'DRIVER_CONTROL_COPY',
  order_id: 'ord-5001',
  order_number: 2001,
  shift_number: 15,
  trip_number: 4,
  driver_name: 'كابتن طارق',
  customer_name: 'أحمد إبراهيم',
  customer_phone: '01099887766',
  delivery_address: 'مدينة نصر - الحي السابع',
  amount_to_collect: 520, // DB total_amount (includes delivery fee, zero double counting)
  payment_method: 'cash',
  created_by_staff: 'cashier_mona',
  dispatched_at: '2026-09-11T13:00:00Z',
  print_nature: 'ORIGINAL',
}

const sampleCustomerReceipt: CustomerReceiptPayload = {
  document_type: 'CUSTOMER_RECEIPT',
  order_id: 'ord-5002',
  order_number: 2002,
  shift_number: 15,
  order_type: 'takeaway',
  shift_sequence_display: 'سفري #015',
  customer_name: 'محمود سعد',
  customer_phone: '01233445566',
  items: [
    { name: 'حواوشي بلدي', variant_name: 'سوبر', quantity: 3, unit_price: 60, subtotal: 180 },
  ],
  subtotal_amount: 180,
  delivery_fee: 0,
  total_amount: 180,
  payment_method: 'cash',
  created_by_staff: 'cashier_mona',
  created_at: '2026-09-11T13:05:00Z',
  print_nature: 'ORIGINAL',
}

const sampleDiffDoc: DifferentialChangeTicketPayload = {
  document_type: 'DIFFERENTIAL_CHANGE_TICKET',
  order_id: 'ord-5001',
  order_number: 2001,
  shift_sequence_display: 'توصيل #2001',
  modification_number: 1,
  modified_at: '2026-09-11T13:10:00Z',
  modified_by_staff: 'cashier_mona',
  added_items: [{ name: 'طحينة إضافية', variant_name: 'علبة', quantity: 2 }],
  removed_items: [],
  updated_items: [],
}

async function runTests() {
  console.log('🧪 ========================================================')
  console.log('🧪 PHASE 5 — STEP 5: PRINT EXECUTION RUNTIME VERIFICATION')
  console.log('🧪 ========================================================\n')

  // Setup isolated runtime for test execution
  const testRegistry = new RuntimePrintJobRegistry()
  const testAdapterRegistry = new PrintAdapterRegistry()
  const mockAdapter = new MockPrintAdapter({ mode: 'success', simulateDeviceAck: true })
  testAdapterRegistry.register(mockAdapter) // Override mock adapter in test registry

  const stationConfig = new StationConfigManager({
    KITCHEN_80MM: { adapter_type: 'mock', station: 'KITCHEN_80MM' },
    CASHIER_80MM: { adapter_type: 'mock', station: 'CASHIER_80MM' },
  })

  const runtime = new PrintExecutionRuntime(testRegistry, testAdapterRegistry, stationConfig)

  // --- 1. Full End-to-End Kitchen Ticket Dispatch ---
  console.log('--- 1. Testing End-to-End Kitchen Ticket Dispatch ---')
  const kotExec = await runtime.dispatch({
    kind: 'ORIGINAL',
    document: sampleKitchenDoc,
    workflow: 'delivery',
  })

  assert(kotExec.job.status === 'COMPLETED', 'Kitchen ticket reaches COMPLETED status')
  assert(kotExec.job.document_type === 'KITCHEN_TICKET', 'Document type preserved in job')
  assert(kotExec.job.target_station === 'KITCHEN_80MM', 'Routed accurately to KITCHEN_80MM')
  assert(kotExec.payload.raw_text.includes('كباب مشكل'), 'Rendered raw text contains item')
  assert(!kotExec.payload.raw_text.includes('520.00'), 'Kitchen ticket strictly omits prices')
  assert(kotExec.result.success === true, 'Adapter returned success')
  assert(kotExec.hardware_ack_verified === true, 'Hardware ACK correctly verified when device confirms')
  assert(kotExec.duration_ms >= 0, 'Records execution duration')

  // --- 2. Full End-to-End Driver Control Copy Dispatch ---
  console.log('\n--- 2. Testing End-to-End Driver Control Copy Dispatch ---')
  const driverExec = await runtime.dispatch({
    kind: 'ORIGINAL',
    document: sampleDriverDoc,
    workflow: 'delivery',
  })

  assert(driverExec.job.status === 'COMPLETED', 'Driver control copy reaches COMPLETED status')
  assert(driverExec.job.target_station === 'CASHIER_80MM', 'Routed accurately to CASHIER_80MM')
  assert(driverExec.payload.raw_text.includes('520.00'), 'Contains authoritative amount to collect')

  // --- 3. Hardware ACK vs Transport Delivery Verification ---
  console.log('\n--- 3. Testing Hardware ACK vs Transport Delivery Distinction ---')
  // Configure mock adapter to succeed transport delivery but NOT return hardware ack
  mockAdapter.clearHistory()
  const noAckAdapter = new MockPrintAdapter({ mode: 'success', simulateDeviceAck: false })
  testAdapterRegistry.register(noAckAdapter)

  const receiptExec = await runtime.dispatch({
    kind: 'ORIGINAL',
    document: sampleCustomerReceipt,
    workflow: 'takeaway',
  })

  assert(receiptExec.job.status === 'COMPLETED', 'Receipt reaches COMPLETED (transport success)')
  assert(receiptExec.result.success === true, 'Adapter confirmed delivery to spooler/buffer')
  assert(receiptExec.hardware_ack_verified === false, 'hardware_ack_verified is FALSE when device ack is absent')
  assert(receiptExec.result.device_ack_received === false, 'device_ack_received matches adapter result accurately')

  // Restore hardware ack mock adapter
  testAdapterRegistry.register(mockAdapter)

  // --- 4. Idempotency Guard (Blocking Duplicate Original Dispatch) ---
  console.log('\n--- 4. Testing Idempotency Guard on Duplicate Dispatch ---')
  let duplicateBlocked = false
  try {
    await runtime.dispatch({
      kind: 'ORIGINAL',
      document: sampleKitchenDoc, // same doc & order
      workflow: 'delivery',
    })
  } catch (err: any) {
    if (err instanceof DuplicatePrintJobError) {
      duplicateBlocked = true
    }
  }
  assert(duplicateBlocked === true, 'Runtime strictly blocks duplicate dispatch of already completed original job')

  // --- 5. Auto-Retry Orchestration on Retryable Failure ---
  console.log('\n--- 5. Testing Auto-Retry Orchestration on Transient Error ---')
  // Setup an adapter that fails on first attempt and succeeds on second attempt
  class TransientFlakyAdapter extends MockPrintAdapter {
    public printCount = 0
    override async print(payload: any, conn: any) {
      this.printCount++
      if (this.printCount === 1) {
        // Simulate transient socket timeout
        this.setMode('timeout')
        return super.print(payload, conn)
      } else {
        // Succeed on retry
        this.setMode('success')
        return super.print(payload, conn)
      }
    }
  }

  const flakyAdapter = new TransientFlakyAdapter()
  testAdapterRegistry.register(flakyAdapter)

  const transientDoc: CustomerReceiptPayload = {
    ...sampleCustomerReceipt,
    order_id: 'ord-5003',
    order_number: 2003,
  }

  const retryExec = await runtime.dispatch({
    kind: 'ORIGINAL',
    document: transientDoc,
    workflow: 'takeaway',
    options: { autoRetry: true, retryDelayMs: 20, maxAttempts: 3 },
  })

  assert(flakyAdapter.printCount === 2, 'Adapter was called twice (initial + 1 retry)')
  assert(retryExec.job.status === 'COMPLETED', 'Job recovers and completes successfully after retry')
  assert(retryExec.job.attempts === 2, 'Records 2 attempts in job metadata')

  // Restore normal mock adapter
  testAdapterRegistry.register(mockAdapter)

  // --- 6. Retry Exhaustion & Permanent Failure ---
  console.log('\n--- 6. Testing Retry Exhaustion on Persistent Failure ---')
  mockAdapter.setMode('disconnect') // persistent failure

  const failingDoc: CustomerReceiptPayload = {
    ...sampleCustomerReceipt,
    order_id: 'ord-5004',
    order_number: 2004,
  }

  const failExec = await runtime.dispatch({
    kind: 'ORIGINAL',
    document: failingDoc,
    workflow: 'takeaway',
    options: { autoRetry: true, retryDelayMs: 10, maxAttempts: 2 },
  })

  assert(failExec.job.status === 'PRINT_FAILED', 'Job transitions to PRINT_FAILED when retries are exhausted')
  assert(failExec.job.attempts === 2, 'Records all 2 attempts before fatal transition')
  assert(failExec.result.success === false, 'Result indicates failure')
  assert(failExec.job.last_error !== null, 'Records last error in job model')
  assert(failExec.job.completed_at === null, 'Failed job has null completed_at')

  // Reset adapter to success mode
  mockAdapter.setMode('success')

  // --- 7. Non-Retryable Error Immediately Fails ---
  console.log('\n--- 7. Testing Non-Retryable Failure Immediate Rejection ---')
  mockAdapter.setMode('unsupported')

  const unsuppDoc: CustomerReceiptPayload = {
    ...sampleCustomerReceipt,
    order_id: 'ord-5005',
    order_number: 2005,
  }

  const unsuppExec = await runtime.dispatch({
    kind: 'ORIGINAL',
    document: unsuppDoc,
    workflow: 'takeaway',
    options: { autoRetry: true },
  })

  assert(unsuppExec.job.status === 'PRINT_FAILED', 'Job immediately fails on unsupported non-retryable error')
  assert(unsuppExec.job.attempts === 1, 'Does NOT waste retries on non-retryable error (attempts === 1)')

  mockAdapter.setMode('success')

  // --- 8. Reprint Dispatch Linked to Parent Original Job ---
  console.log('\n--- 8. Testing Reprint Dispatch Linked to Parent Job ---')
  const reprintDoc: DriverControlCopyPayload = {
    ...sampleDriverDoc,
    print_nature: 'REPRINT',
    reprint_count: 1,
    reprint_reason: 'damaged_ticket',
  }

  const reprintExec = await runtime.dispatch({
    kind: 'REPRINT',
    document: reprintDoc,
    original_job: driverExec.job,
    reason: 'damaged_ticket',
    requested_by: 'supervisor_hany',
  })

  assert(reprintExec.job.job_kind === 'REPRINT', 'Reprint job has kind REPRINT')
  assert(reprintExec.job.parent_job_id === driverExec.job.job_id, 'Reprint job explicitly links to original parent job_id')
  assert(reprintExec.job.reprint_info?.reprint_number === 1, 'Carries sequential reprint number 1')
  assert(reprintExec.job.reprint_info?.requested_by === 'supervisor_hany', 'Records requesting supervisor')
  assert(
    reprintExec.payload.raw_text.includes('REPRINT') && reprintExec.payload.raw_text.includes('نسخة معاد طباعتها'),
    'Rendered text includes bold reprint banner'
  )
  assert(reprintExec.job.status === 'COMPLETED', 'Reprint job reaches COMPLETED status')

  // --- 9. Differential Change Ticket Dispatch ---
  console.log('\n--- 9. Testing Differential Change Ticket Dispatch ---')
  const diffExec = await runtime.dispatch({
    kind: 'DIFFERENTIAL',
    document: sampleDiffDoc,
    workflow: 'delivery',
    modification_number: 1,
  })

  assert(diffExec.job.job_kind === 'DIFFERENTIAL', 'Job has kind DIFFERENTIAL')
  assert(diffExec.job.target_station === 'KITCHEN_80MM', 'Routed to KITCHEN_80MM')
  assert(diffExec.payload.raw_text.includes('طحينة إضافية'), 'Contains added item in delta')
  assert(diffExec.job.status === 'COMPLETED', 'Differential ticket completed successfully')

  // --- 10. Cancellation Safety ---
  console.log('\n--- 10. Testing Job Cancellation Safety ---')
  const cancelDoc: CustomerReceiptPayload = {
    ...sampleCustomerReceipt,
    order_id: 'ord-5006',
    order_number: 2006,
  }
  const unexecutedJob = testRegistry.registerJob({
    job_id: 'job-cancel-test',
    parent_job_id: null,
    job_kind: 'ORIGINAL',
    idempotency_key: 'print:order:ord-5006:doc:CUSTOMER_RECEIPT:ORIGINAL',
    order_id: 'ord-5006',
    order_number: 2006,
    document_type: 'CUSTOMER_RECEIPT',
    workflow: 'takeaway',
    target_station: 'CASHIER_80MM',
    status: 'PRINT_REQUESTED',
    attempts: 0,
    max_attempts: 3,
    last_error: null,
    payload: cancelDoc,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null,
  })

  const cancelledJob = runtime.cancelJob(unexecutedJob.job_id, 'Customer cancelled before counter dispatch')
  assert(cancelledJob.status === 'CANCELLED', 'Job cancelled successfully')
  assert(cancelledJob.last_error === 'Customer cancelled before counter dispatch', 'Records cancellation reason')

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
