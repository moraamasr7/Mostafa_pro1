/**
 * ======================================================================================
 * PHASE 5 — STEP 8: DIFFERENTIAL CHANGE TICKETS & MODIFICATION TEST SUITE
 * Mostafa Elgazar Restaurant Operations System
 * 
 * Verifies:
 * 1. Modification BEFORE first Kitchen Print -> Zero Differential Ticket (Absorbed).
 * 2. ADD Item -> DIFFERENTIAL [+] with newly added items.
 * 3. REMOVE Item -> DIFFERENTIAL [-] with removed items.
 * 4. CHANGE Quantity -> DIFFERENTIAL [=] with old and new quantity.
 * 5. CHANGE Item Note -> DIFFERENTIAL [=] with old and new notes.
 * 6. Multi-change in single operation (Add + Remove + Update).
 * 7. 10x Modification Replay -> Exactly ONE Differential PrintJob.
 * 8. Two Consecutive Modifications (V1 then V2):
 *    - Each differential represents only the incremental delta since previous print.
 *    - V2 does not repeat or re-send V1 history.
 * ======================================================================================
 */

import {
  OrderModificationPrintManager,
  computeKitchenDelta,
  OrderKitchenSnapshot,
  OrderModifiedEvent,
} from '../src/lib/printing/differential'
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

// Helper baseline snapshot
const snapshotBase: OrderKitchenSnapshot = {
  version: 1,
  order_id: 'ord-mod-101',
  order_number: 5001,
  captured_at: '2026-09-11T16:00:00Z',
  order_notes: 'بدون شطة',
  items: [
    { item_key: 'طاجن لحمة:::كبير', name: 'طاجن لحمة', variant_name: 'كبير', quantity: 2, item_notes: 'مستوي جيداً' },
    { item_key: 'أرز أبيض:::وسط', name: 'أرز أبيض', variant_name: 'وسط', quantity: 2 },
  ],
}

async function runTests() {
  console.log('🧪 ========================================================')
  console.log('🧪 PHASE 5 — STEP 8: DIFFERENTIAL CHANGE TICKETS VERIFICATION')
  console.log('🧪 ========================================================\n')

  const registry = new RuntimePrintJobRegistry()
  const adapterRegistry = new PrintAdapterRegistry()
  const mockAdapter = new MockPrintAdapter({ mode: 'success', simulateDeviceAck: true })
  adapterRegistry.register(mockAdapter)

  const stationConfig = new StationConfigManager({
    KITCHEN_80MM: { adapter_type: 'mock', station: 'KITCHEN_80MM' },
    CASHIER_80MM: { adapter_type: 'mock', station: 'CASHIER_80MM' },
  })

  const runtime = new PrintExecutionRuntime(registry, adapterRegistry, stationConfig)
  const modManager = new OrderModificationPrintManager(runtime, registry)

  // --- 1. GATE: Modification BEFORE First Kitchen Print ---
  console.log('--- 1. Testing Modification BEFORE First Kitchen Print ---')
  const snapshotBeforeFirstPrint: OrderKitchenSnapshot = {
    ...snapshotBase,
    order_id: 'ord-unprinted-999',
    order_number: 5999,
  }

  const snapshotModifiedBeforePrint: OrderKitchenSnapshot = {
    ...snapshotBeforeFirstPrint,
    items: [
      ...snapshotBeforeFirstPrint.items,
      { item_key: 'شوربة كوارع:::كبير', name: 'شوربة كوارع', variant_name: 'كبير', quantity: 1 },
    ],
  }

  const earlyModEvent: OrderModifiedEvent = {
    order_id: 'ord-unprinted-999',
    order_number: 5999,
    workflow: 'delivery',
    shift_sequence_display: 'توصيل #5999',
    modification_number: 1,
    modified_by_staff: 'cashier_mona',
    modified_at: '2026-09-11T16:05:00Z',
    previous_snapshot: snapshotBeforeFirstPrint,
    new_snapshot: snapshotModifiedBeforePrint,
  }

  const earlyResult = await modManager.handleOrderModification(earlyModEvent)
  assert(earlyResult.emitted === false, 'CRITICAL GATE: No Differential Ticket emitted before first kitchen print')
  assert(
    earlyResult.reason.includes('has not been printed yet'),
    'Reason confirms changes absorbed into pending order'
  )

  // --- 2. Baseline Kitchen Ticket Printed ---
  console.log('\n--- 2. Registering Baseline Kitchen Print for ord-mod-101 ---')
  // Mark kitchen as officially printed
  modManager.registerKitchenPrinted('ord-mod-101', snapshotBase)
  assert(modManager.isKitchenPrinted('ord-mod-101') === true, 'Order confirmed as kitchen printed')

  // --- 3. Scenario A: ADD Item -> DIFFERENTIAL [+] ---
  console.log('\n--- 3. Testing Scenario A: ADD Item -> DIFFERENTIAL [+] ---')
  const snapshotAfterAdd: OrderKitchenSnapshot = {
    ...snapshotBase,
    version: 2,
    items: [
      ...snapshotBase.items,
      { item_key: 'سلطة طحينة:::وسط', name: 'سلطة طحينة', variant_name: 'وسط', quantity: 3, item_notes: 'كمون زيادة' },
    ],
  }

  const addEvent: OrderModifiedEvent = {
    order_id: 'ord-mod-101',
    order_number: 5001,
    workflow: 'delivery',
    shift_sequence_display: 'توصيل #5001',
    modification_number: 1,
    modified_by_staff: 'cashier_mona',
    modified_at: '2026-09-11T16:10:00Z',
    previous_snapshot: snapshotBase,
    new_snapshot: snapshotAfterAdd,
  }

  const addResult = await modManager.handleOrderModification(addEvent)
  assert(addResult.emitted === true, 'Emits Differential Ticket for added item')
  assert(addResult.delta?.added_items.length === 1, 'Delta contains exactly 1 added item')
  assert(addResult.delta?.added_items[0].name === 'سلطة طحينة', 'Added item name is سلطة طحينة')
  assert(addResult.delta?.added_items[0].quantity === 3, 'Added item quantity is 3')
  assert(addResult.delta?.removed_items.length === 0, 'No removed items in add delta')
  assert(
    addResult.dispatch_result?.payload.raw_text.includes('[+]') &&
    addResult.dispatch_result?.payload.raw_text.includes('أصناف جديدة'),
    'Raw text contains [+] ADDED section'
  )
  assert(addResult.dispatch_result?.payload.raw_text.includes('سلطة طحينة'), 'Raw text lists added item')

  // --- 4. Scenario B: REMOVE Item -> DIFFERENTIAL [-] ---
  console.log('\n--- 4. Testing Scenario B: REMOVE Item -> DIFFERENTIAL [-] ---')
  // From snapshotAfterAdd, remove 'أرز أبيض'
  const snapshotAfterRemove: OrderKitchenSnapshot = {
    ...snapshotAfterAdd,
    version: 3,
    items: snapshotAfterAdd.items.filter((i) => i.name !== 'أرز أبيض'),
  }

  const removeEvent: OrderModifiedEvent = {
    order_id: 'ord-mod-101',
    order_number: 5001,
    workflow: 'delivery',
    shift_sequence_display: 'توصيل #5001',
    modification_number: 2,
    modified_by_staff: 'cashier_mona',
    modified_at: '2026-09-11T16:15:00Z',
    previous_snapshot: snapshotAfterAdd,
    new_snapshot: snapshotAfterRemove,
  }

  const removeResult = await modManager.handleOrderModification(removeEvent)
  assert(removeResult.emitted === true, 'Emits Differential Ticket for removed item')
  assert(removeResult.delta?.removed_items.length === 1, 'Delta contains exactly 1 removed item')
  assert(removeResult.delta?.removed_items[0].name === 'أرز أبيض', 'Removed item is أرز أبيض')
  assert(
    removeResult.dispatch_result?.payload.raw_text.includes('[-]') &&
    removeResult.dispatch_result?.payload.raw_text.includes('أصناف ملغاة'),
    'Raw text contains [-] CANCELLED section'
  )
  assert(removeResult.dispatch_result?.payload.raw_text.includes('أرز أبيض'), 'Raw text lists cancelled item')

  // --- 5. Scenario C: CHANGE Quantity -> DIFFERENTIAL [=] ---
  console.log('\n--- 5. Testing Scenario C: CHANGE Quantity -> DIFFERENTIAL [=] ---')
  // From snapshotAfterRemove, change 'طاجن لحمة' quantity from 2 to 5
  const snapshotAfterQtyChange: OrderKitchenSnapshot = {
    ...snapshotAfterRemove,
    version: 4,
    items: snapshotAfterRemove.items.map((i) =>
      i.name === 'طاجن لحمة' ? { ...i, quantity: 5 } : i
    ),
  }

  const qtyChangeEvent: OrderModifiedEvent = {
    order_id: 'ord-mod-101',
    order_number: 5001,
    workflow: 'delivery',
    shift_sequence_display: 'توصيل #5001',
    modification_number: 3,
    modified_by_staff: 'cashier_mona',
    modified_at: '2026-09-11T16:20:00Z',
    previous_snapshot: snapshotAfterRemove,
    new_snapshot: snapshotAfterQtyChange,
  }

  const qtyResult = await modManager.handleOrderModification(qtyChangeEvent)
  assert(qtyResult.emitted === true, 'Emits Differential Ticket for quantity change')
  assert(qtyResult.delta?.updated_items.length === 1, 'Delta contains 1 updated item')
  assert(qtyResult.delta?.updated_items[0].old_quantity === 2, 'Old quantity was 2')
  assert(qtyResult.delta?.updated_items[0].new_quantity === 5, 'New quantity is 5')
  assert(
    qtyResult.dispatch_result?.payload.raw_text.includes('[=]') &&
    qtyResult.dispatch_result?.payload.raw_text.includes('تعديل في الكميات'),
    'Raw text contains [=] MODIFIED section'
  )
  assert(
    qtyResult.dispatch_result?.payload.raw_text.includes('الكمية السابقة: 2') &&
    qtyResult.dispatch_result?.payload.raw_text.includes('الجديدة: [ 5 ]'),
    'Raw text shows previous 2 and new 5'
  )

  // --- 6. Scenario D: CHANGE Note -> DIFFERENTIAL [=] ---
  console.log('\n--- 6. Testing Scenario D: CHANGE Note -> DIFFERENTIAL [=] ---')
  // Change item note on 'سلطة طحينة' from 'كمون زيادة' to 'بدون ليمون نهائياً'
  const snapshotAfterNoteChange: OrderKitchenSnapshot = {
    ...snapshotAfterQtyChange,
    version: 5,
    items: snapshotAfterQtyChange.items.map((i) =>
      i.name === 'سلطة طحينة' ? { ...i, item_notes: 'بدون ليمون نهائياً' } : i
    ),
  }

  const noteChangeEvent: OrderModifiedEvent = {
    order_id: 'ord-mod-101',
    order_number: 5001,
    workflow: 'delivery',
    shift_sequence_display: 'توصيل #5001',
    modification_number: 4,
    modified_by_staff: 'cashier_mona',
    modified_at: '2026-09-11T16:25:00Z',
    previous_snapshot: snapshotAfterQtyChange,
    new_snapshot: snapshotAfterNoteChange,
  }

  const noteResult = await modManager.handleOrderModification(noteChangeEvent)
  assert(noteResult.emitted === true, 'Emits Differential Ticket for note change')
  assert(noteResult.delta?.updated_items.length === 1, 'Delta captures note update')
  assert(noteResult.delta?.updated_items[0].item_notes === 'بدون ليمون نهائياً', 'Captures new note')
  assert(noteResult.dispatch_result?.payload.raw_text.includes('بدون ليمون نهائياً'), 'Raw text displays updated note')

  // --- 7. Multi-Change in Single Modification Operation ---
  console.log('\n--- 7. Testing Multi-Change in Single Operation (Add + Remove + Update) ---')
  const multiChangeSnapshot: OrderKitchenSnapshot = {
    version: 6,
    order_id: 'ord-mod-101',
    order_number: 5001,
    captured_at: '2026-09-11T16:30:00Z',
    order_notes: 'استعجال شديد للعميل', // changed order notes
    items: [
      { item_key: 'طاجن لحمة:::كبير', name: 'طاجن لحمة', variant_name: 'كبير', quantity: 6, item_notes: 'مستوي جداً' }, // updated qty (5->6)
      // removed 'سلطة طحينة'
      { item_key: 'مشروب غازي:::كانز', name: 'مشروب غازي', variant_name: 'كانز', quantity: 2 }, // added
    ],
  }

  const multiChangeEvent: OrderModifiedEvent = {
    order_id: 'ord-mod-101',
    order_number: 5001,
    workflow: 'delivery',
    shift_sequence_display: 'توصيل #5001',
    modification_number: 5,
    modified_by_staff: 'supervisor_tarek',
    modified_at: '2026-09-11T16:30:00Z',
    previous_snapshot: snapshotAfterNoteChange,
    new_snapshot: multiChangeSnapshot,
  }

  const multiResult = await modManager.handleOrderModification(multiChangeEvent)
  assert(multiResult.emitted === true, 'Emits multi-change differential ticket')
  assert(multiResult.delta?.added_items.length === 1, 'Captures 1 added item (مشروب غازي)')
  assert(multiResult.delta?.removed_items.length === 1, 'Captures 1 removed item (سلطة طحينة)')
  assert(multiResult.delta?.updated_items.length === 1, 'Captures 1 updated item (طاجن لحمة)')
  assert(multiResult.delta?.order_notes_update === 'استعجال شديد للعميل', 'Captures updated order notes')

  // --- 8. GATE: 10x Modification Replay Idempotency ---
  console.log('\n--- 8. Testing 10x Modification Replay Idempotency ---')
  const replayResults = []
  for (let i = 1; i <= 10; i++) {
    const res = await modManager.handleOrderModification(multiChangeEvent)
    replayResults.push(res)
  }

  const suppressedCount = replayResults.filter((r) => r.emitted === false).length
  assert(suppressedCount === 10, 'CRITICAL GATE: All 10 replayed modification events were safely suppressed as idempotent')

  const diffJobs = registry
    .getJobsByOrderId('ord-mod-101')
    .filter((j) => j.idempotency_key === 'print:order:ord-mod-101:diff:5')
  assert(diffJobs.length === 1, 'Exactly ONE PrintJob exists in registry for modification #5')

  // --- 9. Two Consecutive Modifications (V1 then V2) Incremental Verification ---
  console.log('\n--- 9. Testing Incremental Delta Across Consecutive Modifications ---')
  // New order for clean consecutive test
  const testOrderSnapshotV0: OrderKitchenSnapshot = {
    version: 0,
    order_id: 'ord-consec-202',
    order_number: 5202,
    captured_at: '2026-09-11T16:40:00Z',
    items: [{ item_key: 'كباب:::ربع', name: 'كباب', variant_name: 'ربع', quantity: 1 }],
  }

  modManager.registerKitchenPrinted('ord-consec-202', testOrderSnapshotV0)

  // Modification 1: Add Kofta
  const snapshotV1: OrderKitchenSnapshot = {
    ...testOrderSnapshotV0,
    version: 1,
    items: [
      ...testOrderSnapshotV0.items,
      { item_key: 'كفتة:::ربع', name: 'كفتة', variant_name: 'ربع', quantity: 1 },
    ],
  }

  const mod1Res = await modManager.handleOrderModification({
    order_id: 'ord-consec-202',
    order_number: 5202,
    workflow: 'delivery',
    shift_sequence_display: 'توصيل #5202',
    modification_number: 1,
    modified_by_staff: 'cashier_mona',
    modified_at: '2026-09-11T16:42:00Z',
    previous_snapshot: testOrderSnapshotV0,
    new_snapshot: snapshotV1,
  })

  assert(mod1Res.emitted === true, 'Mod 1 emitted')
  assert(mod1Res.delta?.added_items[0].name === 'كفتة', 'Mod 1 added Kofta')

  // Modification 2: Add Shish Tawook (should NOT re-emit Kofta!)
  const snapshotV2: OrderKitchenSnapshot = {
    ...snapshotV1,
    version: 2,
    items: [
      ...snapshotV1.items,
      { item_key: 'شيش طاووق:::طبق', name: 'شيش طاووق', variant_name: 'طبق', quantity: 1 },
    ],
  }

  const mod2Res = await modManager.handleOrderModification({
    order_id: 'ord-consec-202',
    order_number: 5202,
    workflow: 'delivery',
    shift_sequence_display: 'توصيل #5202',
    modification_number: 2,
    modified_by_staff: 'cashier_mona',
    modified_at: '2026-09-11T16:45:00Z',
    previous_snapshot: snapshotV1,
    new_snapshot: snapshotV2,
  })

  assert(mod2Res.emitted === true, 'Mod 2 emitted')
  assert(mod2Res.delta?.added_items.length === 1, 'Mod 2 delta contains ONLY 1 item')
  assert(mod2Res.delta?.added_items[0].name === 'شيش طاووق', 'Mod 2 added Shish Tawook')
  assert(
    !mod2Res.delta?.added_items.some((i) => i.name === 'كفتة'),
    'CRITICAL GATE: Mod 2 does NOT repeat Kofta from previous modification V1'
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
