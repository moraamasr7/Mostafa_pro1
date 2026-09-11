/**
 * ======================================================================================
 * PHASE 5 — STEP 4: PRINTER DRIVERS & ADAPTERS VERIFICATION TEST SUITE
 * Mostafa Elgazar Restaurant Operations System
 * 
 * Verifies:
 * 1. PrintAdapter Contract Compliance (success, timeout, disconnect, device error).
 * 2. Strict distinction: SENT (dispatched to adapter) vs COMPLETED (confirmed by adapter).
 * 3. Typed error hierarchy: retryable vs non-retryable, category classification.
 * 4. Mock Adapter behavior across all modes (success, timeout, disconnect, paper_out, unsupported).
 * 5. Environment checks and graceful degradation for Browser, Network, WebSerial, RawBT adapters.
 * 6. Adapter Registry resolution.
 * 7. Duplicate Send prevention coordination with PrintJob layer.
 * ======================================================================================
 */

import {
  MockPrintAdapter,
  BrowserPrintAdapter,
  NetworkTcpAdapter,
  WebSerialAdapter,
  RawBtIntentAdapter,
  PrintAdapterRegistry,
  PrintPayload,
  PrinterConnection,
  createConnectionError,
  createTimeoutError,
  createDeviceError,
  createUnsupportedError,
  createFatalError,
} from '../src/lib/printing/adapters'
import {
  createOriginalPrintJob,
  RuntimePrintJobRegistry,
  DuplicatePrintJobError,
} from '../src/lib/printing/jobs'
import { DriverControlCopyPayload } from '../src/types/printing'

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

const sampleDriverPayload: DriverControlCopyPayload = {
  document_type: 'DRIVER_CONTROL_COPY',
  order_id: 'ord-900',
  order_number: 1099,
  shift_number: 14,
  trip_number: 7,
  driver_name: 'كابتن ياسر',
  customer_name: 'محمد علي',
  customer_phone: '01122334455',
  delivery_address: 'العجوزة',
  amount_to_collect: 250,
  payment_method: 'cash',
  created_by_staff: 'cashier_1',
  dispatched_at: '2026-09-11T12:00:00Z',
  print_nature: 'ORIGINAL',
}

const samplePrintPayload: PrintPayload = {
  job_id: 'job-uuid-1',
  order_id: 'ord-900',
  order_number: 1099,
  document_type: 'DRIVER_CONTROL_COPY',
  station: 'CASHIER_80MM',
  print_nature: 'ORIGINAL',
  raw_text: '========================================\n كعب استلام سائق\n كابتن ياسر\n 250.00 EGP\n========================================',
  html: '<div class="ticket"> كعب استلام سائق: 250.00 EGP</div>',
  prepared_at: '2026-09-11T12:00:00Z',
}

const mockConnection: PrinterConnection = {
  adapter_type: 'mock',
  station: 'CASHIER_80MM',
  host: '192.168.1.100',
  port: 9100,
  timeout_ms: 2000,
}

async function runTests() {
  console.log('🧪 ========================================================')
  console.log('🧪 PHASE 5 — STEP 4: PRINTER ADAPTERS & DRIVERS VERIFICATION')
  console.log('🧪 ========================================================\n')

  // --- 1. Typed Error Hierarchy Tests ---
  console.log('--- 1. Testing Typed Error Hierarchy & Classification ---')
  const connErr = createConnectionError('network_tcp', 'Host unreachable')
  assert(connErr.category === 'connection', 'Connection error has category connection')
  assert(connErr.retryable === true, 'Connection error is classified as retryable')

  const timeErr = createTimeoutError('mock', 2500)
  assert(timeErr.category === 'timeout', 'Timeout error has category timeout')
  assert(timeErr.retryable === true, 'Timeout error is classified as retryable')
  assert(timeErr.code === 'TIMEOUT', 'Timeout error code is TIMEOUT')

  const devErr = createDeviceError('mock', 'PAPER_OUT', 'Roll empty')
  assert(devErr.category === 'device', 'Device error has category device')
  assert(devErr.retryable === true, 'Device error (paper out) is classified as retryable after reload')
  assert(devErr.code === 'PAPER_OUT', 'Device error code is PAPER_OUT')

  const unsuppErr = createUnsupportedError('browser', 'No window.print')
  assert(unsuppErr.category === 'unsupported', 'Unsupported error has category unsupported')
  assert(unsuppErr.retryable === false, 'Unsupported error is classified as non-retryable')

  const fatalErr = createFatalError('network_tcp', 'Corrupt buffer')
  assert(fatalErr.category === 'fatal', 'Fatal error has category fatal')
  assert(fatalErr.retryable === false, 'Fatal error is classified as non-retryable')

  // --- 2. Mock Adapter Success & Hardware ACK ---
  console.log('\n--- 2. Testing Mock Adapter Success & Execution ---')
  const mockAdapter = new MockPrintAdapter({ mode: 'success', simulateDeviceAck: true })
  assert(mockAdapter.isSupported() === true, 'Mock adapter is supported')

  const successResult = await mockAdapter.print(samplePrintPayload, mockConnection)
  assert(successResult.success === true, 'Mock print succeeds in success mode')
  assert(successResult.adapter_type === 'mock', 'Result identifies mock adapter')
  assert(successResult.device_ack_received === true, 'Returns hardware ACK when simulated')
  assert((successResult.bytes_sent || 0) > 0, 'Reports non-zero bytes sent')
  assert(successResult.error === null, 'Error is null on success')
  assert(mockAdapter.history.length === 1, 'Records print in adapter history')

  // --- 3. Mock Adapter Failure Modes (Timeout, Disconnect, Paper Out) ---
  console.log('\n--- 3. Testing Mock Adapter Failure Modes ---')
  // Timeout
  mockAdapter.setMode('timeout')
  const timeoutResult = await mockAdapter.print(samplePrintPayload, mockConnection)
  assert(timeoutResult.success === false, 'Fails on timeout mode')
  assert(timeoutResult.error?.category === 'timeout', 'Timeout error returned with correct category')
  assert(timeoutResult.error?.retryable === true, 'Timeout is flagged as retryable')

  // Disconnect
  mockAdapter.setMode('disconnect')
  const discResult = await mockAdapter.print(samplePrintPayload, mockConnection)
  assert(discResult.success === false, 'Fails on disconnect mode')
  assert(discResult.error?.category === 'connection', 'Connection error returned on disconnect')
  assert(discResult.error?.retryable === true, 'Disconnect is flagged as retryable')

  // Paper Out (Hardware Error)
  mockAdapter.setMode('paper_out')
  const paperOutResult = await mockAdapter.print(samplePrintPayload, mockConnection)
  assert(paperOutResult.success === false, 'Fails on paper_out mode')
  assert(paperOutResult.error?.code === 'PAPER_OUT', 'Paper out error code returned')
  assert(paperOutResult.error?.category === 'device', 'Paper out has device category')

  // Unsupported Mode
  mockAdapter.setMode('unsupported')
  const unsuppResult = await mockAdapter.print(samplePrintPayload, mockConnection)
  assert(unsuppResult.success === false, 'Fails on unsupported mode')
  assert(unsuppResult.error?.retryable === false, 'Unsupported adapter mode is NOT retryable')

  // --- 4. SENT vs COMPLETED Protocol Separation ---
  console.log('\n--- 4. Testing Strict Protocol Separation (SENT vs COMPLETED) ---')
  const jobRegistry = new RuntimePrintJobRegistry()
  const printJob = createOriginalPrintJob({
    order_id: 'ord-900',
    order_number: 1099,
    workflow: 'delivery',
    document_type: 'DRIVER_CONTROL_COPY',
    payload: sampleDriverPayload,
  })
  jobRegistry.registerJob(printJob)
  jobRegistry.markQueued(printJob.job_id)

  // Step A: Handoff to Adapter Transport -> SENT
  const sentJob = jobRegistry.markSent(printJob.job_id)
  assert(sentJob.status === 'SENT', 'Job is in SENT status after transport handoff')
  assert(sentJob.completed_at === null, 'Job in SENT status is NOT completed')

  // Step B: Adapter Executes and Returns Result
  mockAdapter.setMode('success')
  const adapterResult = await mockAdapter.print(samplePrintPayload, mockConnection)
  assert(adapterResult.success === true, 'Adapter confirms execution success')

  // Step C: Job transitions to COMPLETED strictly upon confirmed result
  const completedJob = jobRegistry.markCompleted(printJob.job_id)
  assert(completedJob.status === 'COMPLETED', 'Job transitions to COMPLETED only after adapter confirmation')
  assert(completedJob.completed_at !== null, 'completed_at is populated')

  // --- 5. Failure Protocol (SENT -> PRINT_FAILED when adapter reports failure) ---
  console.log('\n--- 5. Testing Failure Protocol (SENT -> PRINT_FAILED) ---')
  const failJob = createOriginalPrintJob({
    order_id: 'ord-901',
    order_number: 1100,
    workflow: 'delivery',
    document_type: 'DRIVER_CONTROL_COPY',
    payload: { ...sampleDriverPayload, order_id: 'ord-901', order_number: 1100 },
  })
  jobRegistry.registerJob(failJob)
  jobRegistry.markQueued(failJob.job_id)
  jobRegistry.markSent(failJob.job_id)

  mockAdapter.setMode('disconnect')
  const failAdapterResult = await mockAdapter.print(samplePrintPayload, mockConnection)
  assert(failAdapterResult.success === false, 'Adapter reports failure')

  // Job does NOT become COMPLETED; transitions to failed/retrying
  const markedFailedJob = jobRegistry.markFailed(failJob.job_id, failAdapterResult.error?.message || 'Print failed')
  assert(markedFailedJob.status === 'PRINT_FAILED', 'Job transitions to PRINT_FAILED on adapter error')
  assert(markedFailedJob.completed_at === null, 'Failed job has null completed_at')

  // --- 6. Duplicate Send & Idempotency Coordination ---
  console.log('\n--- 6. Testing Duplicate Send Prevention ---')
  const duplicateAttempt = createOriginalPrintJob({
    order_id: 'ord-900',
    order_number: 1099,
    workflow: 'delivery',
    document_type: 'DRIVER_CONTROL_COPY',
    payload: sampleDriverPayload,
  })

  let duplicateBlocked = false
  try {
    jobRegistry.registerJob(duplicateAttempt)
  } catch (err: any) {
    if (err instanceof DuplicatePrintJobError) {
      duplicateBlocked = true
    }
  }
  assert(duplicateBlocked, 'Registry prevents duplicate job creation before sending to adapter')

  // --- 7. Concrete Adapters Environment Verification ---
  console.log('\n--- 7. Testing Concrete Adapters (Isomorphic Safety) ---')
  // Browser Print Adapter in Node runtime
  const browserAdapter = new BrowserPrintAdapter()
  assert(browserAdapter.type === 'browser', 'Browser adapter has type browser')
  assert(browserAdapter.isSupported() === false, 'Browser adapter reports false in server Node environment')
  const browserRes = await browserAdapter.print(samplePrintPayload, { adapter_type: 'browser', station: 'CASHIER_80MM' })
  assert(browserRes.success === false, 'Browser adapter gracefully rejects print in unsupported Node environment')
  assert(browserRes.error?.category === 'unsupported', 'Browser error is classified as unsupported')

  // Network TCP Adapter
  const tcpAdapter = new NetworkTcpAdapter()
  assert(tcpAdapter.type === 'network_tcp', 'Network adapter has type network_tcp')
  assert(tcpAdapter.isSupported() === true, 'Network TCP adapter is supported in Node environment')

  // Web Serial Adapter in Node runtime
  const serialAdapter = new WebSerialAdapter()
  assert(serialAdapter.type === 'web_serial', 'WebSerial adapter has type web_serial')
  assert(serialAdapter.isSupported() === false, 'WebSerial reports false in server Node environment')
  const serialRes = await serialAdapter.print(samplePrintPayload, { adapter_type: 'web_serial', station: 'CASHIER_80MM' })
  assert(serialRes.success === false, 'WebSerial gracefully rejects print in unsupported environment')

  // RawBT Adapter in Node runtime
  const rawBtAdapter = new RawBtIntentAdapter()
  assert(rawBtAdapter.type === 'rawbt', 'RawBT adapter has type rawbt')
  assert(rawBtAdapter.isSupported() === false, 'RawBT reports false outside Android browser')
  const rawBtUrl = rawBtAdapter.buildIntentUrl(samplePrintPayload, { adapter_type: 'rawbt', station: 'CASHIER_80MM', bluetooth_mac: '00:11:22:33:44:55' })
  assert(rawBtUrl.startsWith('rawbt:data:text/plain;base64,'), 'RawBT formats valid intent URL scheme')
  assert(rawBtUrl.includes('00%3A11%3A22%3A33%3A44%3A55'), 'RawBT URL includes encoded MAC address')

  // --- 8. Adapter Registry Resolution ---
  console.log('\n--- 8. Testing Adapter Registry Resolution ---')
  const registry = new PrintAdapterRegistry()
  assert(registry.get('mock') !== undefined, 'Registry resolves mock adapter')
  assert(registry.get('browser') !== undefined, 'Registry resolves browser adapter')
  assert(registry.get('network_tcp') !== undefined, 'Registry resolves network_tcp adapter')
  assert(registry.get('web_serial') !== undefined, 'Registry resolves web_serial adapter')
  assert(registry.get('rawbt') !== undefined, 'Registry resolves rawbt adapter')

  const resolved = registry.resolve({ adapter_type: 'network_tcp', station: 'KITCHEN_80MM', host: '192.168.1.50' })
  assert(resolved.type === 'network_tcp', 'Successfully resolved network_tcp adapter from connection params')

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
