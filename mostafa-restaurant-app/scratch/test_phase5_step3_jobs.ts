/**
 * ======================================================================================
 * PHASE 5 — STEP 3: PRINT JOB ORCHESTRATION LAYER VERIFICATION TEST SUITE
 * Mostafa Elgazar Restaurant Operations System
 * 
 * Verifies:
 * 1. State Machine transitions and invalid transition rejections.
 * 2. Distinction that SENT is dispatch-only, while COMPLETED requires explicit adapter confirmation.
 * 3. Router mapping for all 3 workflows (delivery, takeaway, dine_in) to physical stations.
 * 4. Router rejection of disallowed documents per workflow.
 * 5. Deterministic Idempotency on ORIGINAL and DIFFERENTIAL jobs (preventing duplicate prints).
 * 6. Independent Job Identity and parent linking on REPRINT jobs.
 * 7. Mandatory audit metadata for reprints (reason, staff, custom notes).
 * ======================================================================================
 */

import {
  createOriginalPrintJob,
  createReprintPrintJob,
  createDifferentialPrintJob,
  resolvePrintStation,
  validateWorkflowDocument,
  isDocumentAllowedForWorkflow,
  PrintRoutingError,
  RuntimePrintJobRegistry,
  DuplicatePrintJobError,
  InvalidStateTransitionError,
  PrintJobValidationError,
} from '../src/lib/printing/jobs'
import {
  KitchenTicketPayload,
  CustomerReceiptPayload,
  DriverControlCopyPayload,
  DineInCustomerTicketPayload,
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

function assertThrows(fn: () => void, expectedErrorName: string, testName: string) {
  try {
    fn()
    console.error(`  ❌ FAIL: ${testName} (Expected exception ${expectedErrorName}, but none was thrown)`)
    failedTests++
  } catch (err: any) {
    if (err.name === expectedErrorName) {
      console.log(`  ✅ PASS: ${testName}`)
      passedTests++
    } else {
      console.error(`  ❌ FAIL: ${testName} (Expected ${expectedErrorName}, but got ${err.name}: ${err.message})`)
      failedTests++
    }
  }
}

// Sample canonical payloads
const sampleKitchenPayload: KitchenTicketPayload = {
  document_type: 'KITCHEN_TICKET',
  order_id: 'ord-100',
  order_number: 1001,
  shift_number: 14,
  order_type: 'delivery',
  shift_sequence_display: 'توصيل #1001',
  items: [{ name: 'طاجن لحمة', variant_name: 'كبير', quantity: 2, item_notes: 'بدون شطة' }],
  dispatched_at: '2026-09-11T12:00:00Z',
  print_nature: 'ORIGINAL',
}

const sampleReceiptPayload: CustomerReceiptPayload = {
  document_type: 'CUSTOMER_RECEIPT',
  order_id: 'ord-100',
  order_number: 1001,
  shift_number: 14,
  order_type: 'delivery',
  shift_sequence_display: 'توصيل #1001',
  customer_name: 'أحمد محمود',
  customer_phone: '01012345678',
  delivery_address: 'شارع الهرم',
  items: [{ name: 'طاجن لحمة', variant_name: 'كبير', quantity: 2, unit_price: 150, subtotal: 300 }],
  subtotal_amount: 300,
  delivery_fee: 25,
  total_amount: 325,
  payment_method: 'cash',
  created_by_staff: 'cashier_1',
  created_at: '2026-09-11T12:00:00Z',
  print_nature: 'ORIGINAL',
}

const sampleDriverPayload: DriverControlCopyPayload = {
  document_type: 'DRIVER_CONTROL_COPY',
  order_id: 'ord-100',
  order_number: 1001,
  shift_number: 14,
  trip_number: 3,
  driver_name: 'كابتن حسام',
  customer_name: 'أحمد محمود',
  customer_phone: '01012345678',
  delivery_address: 'شارع الهرم',
  amount_to_collect: 325,
  payment_method: 'cash',
  created_by_staff: 'cashier_1',
  dispatched_at: '2026-09-11T12:00:00Z',
  print_nature: 'ORIGINAL',
}

const sampleDineInPayload: DineInCustomerTicketPayload = {
  document_type: 'DINE_IN_CUSTOMER_TICKET',
  order_id: 'ord-200',
  order_number: 1002,
  shift_number: 14,
  turn_number: 5,
  turn_display: 'TURN #005',
  customer_name: 'عميل صالة 1',
  party_size: 4,
  items: [{ name: 'شواية مشكل', variant_name: 'عائلي', quantity: 1, unit_price: 450, subtotal: 450 }],
  total_amount: 450,
  payment_method: 'card',
  created_by_staff: 'waiter_2',
  created_at: '2026-09-11T12:10:00Z',
  print_nature: 'ORIGINAL',
}

const sampleDiffPayload: DifferentialChangeTicketPayload = {
  document_type: 'DIFFERENTIAL_CHANGE_TICKET',
  order_id: 'ord-100',
  order_number: 1001,
  shift_sequence_display: 'توصيل #1001',
  modification_number: 1,
  modified_at: '2026-09-11T12:15:00Z',
  modified_by_staff: 'cashier_1',
  added_items: [{ name: 'سلطة خضراء', variant_name: 'عادي', quantity: 1 }],
  removed_items: [],
  updated_items: [],
}

async function runTests() {
  console.log('🧪 ========================================================')
  console.log('🧪 PHASE 5 — STEP 3: PRINT JOB ORCHESTRATION VERIFICATION')
  console.log('🧪 ========================================================\n')

  // --- 1. Router & Workflow Mapping Tests ---
  console.log('--- 1. Testing Station Router & Workflow Matrix ---')
  assert(
    resolvePrintStation('delivery', 'KITCHEN_TICKET') === 'KITCHEN_80MM',
    'Delivery KITCHEN_TICKET routes to KITCHEN_80MM'
  )
  assert(
    resolvePrintStation('delivery', 'DRIVER_CONTROL_COPY') === 'CASHIER_80MM',
    'Delivery DRIVER_CONTROL_COPY routes to CASHIER_80MM'
  )
  assert(
    resolvePrintStation('delivery', 'CUSTOMER_RECEIPT') === 'CASHIER_80MM',
    'Delivery CUSTOMER_RECEIPT routes to CASHIER_80MM'
  )
  assert(
    resolvePrintStation('takeaway', 'KITCHEN_TICKET') === 'KITCHEN_80MM',
    'Takeaway KITCHEN_TICKET routes to KITCHEN_80MM'
  )
  assert(
    resolvePrintStation('takeaway', 'CUSTOMER_RECEIPT') === 'CASHIER_80MM',
    'Takeaway CUSTOMER_RECEIPT routes to CASHIER_80MM'
  )
  assert(
    resolvePrintStation('dine_in', 'KITCHEN_TICKET') === 'KITCHEN_80MM',
    'Dine-In KITCHEN_TICKET routes to KITCHEN_80MM'
  )
  assert(
    resolvePrintStation('dine_in', 'DINE_IN_CUSTOMER_TICKET') === 'CASHIER_80MM',
    'Dine-In DINE_IN_CUSTOMER_TICKET routes to CASHIER_80MM'
  )
  assert(
    resolvePrintStation('delivery', 'DIFFERENTIAL_CHANGE_TICKET') === 'KITCHEN_80MM',
    'DIFFERENTIAL_CHANGE_TICKET routes to KITCHEN_80MM'
  )

  // Disallowed Documents per Workflow
  console.log('\n--- 2. Testing Disallowed Documents Rejection ---')
  assertThrows(
    () => resolvePrintStation('takeaway', 'DRIVER_CONTROL_COPY'),
    'PrintRoutingError',
    'Rejects DRIVER_CONTROL_COPY for Takeaway'
  )
  assertThrows(
    () => resolvePrintStation('takeaway', 'DINE_IN_CUSTOMER_TICKET'),
    'PrintRoutingError',
    'Rejects DINE_IN_CUSTOMER_TICKET for Takeaway'
  )
  assertThrows(
    () => resolvePrintStation('dine_in', 'DRIVER_CONTROL_COPY'),
    'PrintRoutingError',
    'Rejects DRIVER_CONTROL_COPY for Dine-In'
  )
  assertThrows(
    () => resolvePrintStation('dine_in', 'CUSTOMER_RECEIPT'),
    'PrintRoutingError',
    'Rejects CUSTOMER_RECEIPT for Dine-In'
  )
  assertThrows(
    () => resolvePrintStation('delivery', 'DINE_IN_CUSTOMER_TICKET'),
    'PrintRoutingError',
    'Rejects DINE_IN_CUSTOMER_TICKET for Delivery'
  )
  assert(!isDocumentAllowedForWorkflow('takeaway', 'DRIVER_CONTROL_COPY'), 'isDocumentAllowedForWorkflow returns false for disallowed doc')

  // --- 3. Job Factory Tests ---
  console.log('\n--- 3. Testing Job Factory (ORIGINAL, REPRINT, DIFFERENTIAL) ---')
  const origJob = createOriginalPrintJob({
    order_id: 'ord-100',
    order_number: 1001,
    workflow: 'delivery',
    document_type: 'DRIVER_CONTROL_COPY',
    payload: sampleDriverPayload,
  })
  assert(origJob.job_kind === 'ORIGINAL', 'Original job has kind ORIGINAL')
  assert(origJob.parent_job_id === null, 'Original job has null parent_job_id')
  assert(origJob.status === 'PRINT_REQUESTED', 'Original job initializes with PRINT_REQUESTED')
  assert(
    origJob.idempotency_key === 'print:order:ord-100:doc:DRIVER_CONTROL_COPY:ORIGINAL',
    'Original job has deterministic idempotency key'
  )
  assert(origJob.target_station === 'CASHIER_80MM', 'Original job resolved target station CASHIER_80MM')

  // Differential Job Factory
  const diffJob = createDifferentialPrintJob({
    order_id: 'ord-100',
    order_number: 1001,
    workflow: 'delivery',
    modification_number: 1,
    payload: sampleDiffPayload,
  })
  assert(diffJob.job_kind === 'DIFFERENTIAL', 'Differential job has kind DIFFERENTIAL')
  assert(
    diffJob.idempotency_key === 'print:order:ord-100:diff:1',
    'Differential job has deterministic key with modification number'
  )

  // Reprint Job Factory
  const reprintJob = createReprintPrintJob(
    {
      original_job: origJob,
      reason: 'damaged_ticket',
      requested_by: 'supervisor_salem',
      payload: { ...sampleDriverPayload, print_nature: 'REPRINT', reprint_count: 1 },
    },
    1
  )
  assert(reprintJob.job_kind === 'REPRINT', 'Reprint job has kind REPRINT')
  assert(reprintJob.parent_job_id === origJob.job_id, 'Reprint job explicitly links to parent original job_id')
  assert(reprintJob.job_id !== origJob.job_id, 'Reprint job has independent distinct job_id')
  assert(reprintJob.reprint_info?.reprint_number === 1, 'Reprint job carries sequential reprint number 1')
  assert(reprintJob.reprint_info?.requested_by === 'supervisor_salem', 'Reprint job records requesting staff')

  // Reprint Audit Validation Tests
  assertThrows(
    () =>
      createReprintPrintJob({
        original_job: origJob,
        reason: 'other',
        custom_reason_text: '', // Empty custom text when reason is other
        requested_by: 'cashier_1',
        payload: sampleDriverPayload,
      }),
    'PrintJobValidationError',
    'Rejects reprint with reason other and empty custom note'
  )
  assertThrows(
    () =>
      createReprintPrintJob({
        original_job: origJob,
        reason: 'paper_jam',
        requested_by: '', // Empty staff name
        payload: sampleDriverPayload,
      }),
    'PrintJobValidationError',
    'Rejects reprint with empty staff identity'
  )

  // --- 4. State Machine & Transition Tests ---
  console.log('\n--- 4. Testing State Machine Transitions & Adapter Confirmation ---')
  const registry = new RuntimePrintJobRegistry()
  registry.registerJob(origJob)

  // Transition: PRINT_REQUESTED -> QUEUED
  const queuedJob = registry.markQueued(origJob.job_id)
  assert(queuedJob.status === 'QUEUED', 'Transitions to QUEUED')

  // Transition: QUEUED -> SENT (Adapter dispatch, NOT completed yet!)
  const sentJob = registry.markSent(origJob.job_id)
  assert(sentJob.status === 'SENT', "Transitions to SENT upon adapter dispatch")
  assert(sentJob.attempts === 1, 'Increments attempts to 1 upon SENT')
  assert(sentJob.completed_at === null, 'SENT does NOT set completed_at (not yet completed)')

  // Transition: SENT -> COMPLETED (Explicit confirmation by adapter)
  const completedJob = registry.markCompleted(origJob.job_id)
  assert(completedJob.status === 'COMPLETED', 'Transitions to COMPLETED only after adapter confirmation')
  assert(completedJob.completed_at !== null, 'COMPLETED sets completed_at timestamp')

  // Invalid Transition from COMPLETED (Terminal State)
  assertThrows(
    () => registry.markSent(origJob.job_id),
    'InvalidStateTransitionError',
    'Rejects any transition out of COMPLETED terminal state'
  )

  // --- 5. Failure & Retry Lifecycle ---
  console.log('\n--- 5. Testing Failure & Retry Lifecycle ---')
  const testJob2 = createOriginalPrintJob({
    order_id: 'ord-200',
    order_number: 1002,
    workflow: 'dine_in',
    document_type: 'DINE_IN_CUSTOMER_TICKET',
    payload: sampleDineInPayload,
    max_attempts: 2,
  })
  registry.registerJob(testJob2)
  registry.markQueued(testJob2.job_id)
  registry.markSent(testJob2.job_id) // attempt 1

  // Adapter fails: SENT -> RETRYING
  const retryingJob = registry.markRetrying(testJob2.job_id, 'Socket timeout connecting to Cashier printer')
  assert(retryingJob.status === 'RETRYING', 'Transitions to RETRYING upon recoverable error')
  assert(retryingJob.last_error?.includes('Socket timeout') === true, 'Stores last error message')

  // RETRYING -> QUEUED -> SENT (attempt 2)
  registry.markQueued(testJob2.job_id)
  registry.markSent(testJob2.job_id)

  // Second failure exceeds max_attempts (2) -> transitions directly to PRINT_FAILED
  const failedJob = registry.markRetrying(testJob2.job_id, 'Second failure: printer offline')
  assert(failedJob.status === 'PRINT_FAILED', 'Exceeding max attempts forces transition to PRINT_FAILED')
  assert(failedJob.last_error?.includes('Exhausted maximum retry attempts') === true, 'Records max retry exhaustion error')

  // Manual retry from PRINT_FAILED is allowed
  const manualRetryJob = registry.markRetrying(testJob2.job_id)
  assert(manualRetryJob.status === 'RETRYING', 'Allows manual supervisor retry from PRINT_FAILED')

  // --- 6. Deterministic Idempotency Tests ---
  console.log('\n--- 6. Testing Deterministic Idempotency Enforcement ---')
  // Try to create another ORIGINAL job for the same order and document type
  const duplicateOrigJob = createOriginalPrintJob({
    order_id: 'ord-100',
    order_number: 1001,
    workflow: 'delivery',
    document_type: 'DRIVER_CONTROL_COPY',
    payload: sampleDriverPayload,
  })
  assert(
    duplicateOrigJob.idempotency_key === origJob.idempotency_key,
    'Duplicate original job produces identical deterministic key'
  )
  assertThrows(
    () => registry.registerJob(duplicateOrigJob),
    'DuplicatePrintJobError',
    'Registry strictly prohibits registering duplicate ORIGINAL job for same order & doc'
  )

  // Registering Reprint with independent identity succeeds and links to parent
  registry.registerJob(reprintJob)
  assert(registry.getJob(reprintJob.job_id) !== undefined, 'Reprint job successfully registered')
  assert(registry.countReprints('ord-100', 'DRIVER_CONTROL_COPY') === 1, 'Registry accurately counts 1 reprint')

  // Registering second reprint for same parent
  const secondReprintJob = createReprintPrintJob(
    {
      original_job: origJob,
      reason: 'lost_ticket',
      requested_by: 'supervisor_salem',
      payload: { ...sampleDriverPayload, print_nature: 'REPRINT', reprint_count: 2 },
    },
    2
  )
  registry.registerJob(secondReprintJob)
  assert(registry.countReprints('ord-100', 'DRIVER_CONTROL_COPY') === 2, 'Registry accurately counts 2 reprints')
  assert(secondReprintJob.parent_job_id === origJob.job_id, 'Second reprint also links to same original parent')

  // --- 7. Cancellation Lifecycle ---
  console.log('\n--- 7. Testing Cancellation Lifecycle ---')
  const testJob3 = createOriginalPrintJob({
    order_id: 'ord-300',
    order_number: 1003,
    workflow: 'takeaway',
    document_type: 'CUSTOMER_RECEIPT',
    payload: sampleReceiptPayload,
  })
  registry.registerJob(testJob3)
  const cancelledJob = registry.markCancelled(testJob3.job_id, 'Customer changed order items before print')
  assert(cancelledJob.status === 'CANCELLED', 'Transitions to CANCELLED')
  assertThrows(
    () => registry.markQueued(testJob3.job_id),
    'InvalidStateTransitionError',
    'Cannot queue a CANCELLED job'
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
