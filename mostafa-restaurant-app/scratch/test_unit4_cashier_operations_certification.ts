import fs from 'fs'
import path from 'path'

// Load .env.local
const envPath = path.resolve(__dirname, '../.env.local')
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((l) => {
    const t = l.trim()
    if (t && !t.startsWith('#')) {
      const idx = t.indexOf('=')
      if (idx > 0) process.env[t.slice(0, idx).trim()] = t.slice(idx + 1).trim()
    }
  })
}

import { getSupabaseServerClient } from '../src/lib/supabaseServer'
import { canTransitionStatus, OrderStatus, OrderType } from '../src/types/orders'
import { getActiveDailyShift } from '../src/lib/shiftGuard'

async function runUnit4Certification() {
  console.log('====================================================')
  console.log('🧪 RUNNING UNIT 4 — CASHIER OPERATIONS CERTIFICATION')
  console.log('====================================================\n')

  const supabase = getSupabaseServerClient()
  let passCount = 0
  let totalTests = 0

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++
    if (condition) {
      passCount++
      console.log(`  ✅ [PASS] ${testName}`)
    } else {
      console.error(`  ❌ [FAIL] ${testName}${detail ? ' -> ' + detail : ''}`)
    }
  }

  // ----------------------------------------------------
  // TEST GROUP 1: CASHIER TRANSITION STATE MATRIX
  // ----------------------------------------------------
  console.log('\n--- GROUP 1: Cashier Transition State Matrix ---')

  // Takeaway transitions
  assert(canTransitionStatus('pending', 'processing', 'takeaway'), 'Takeaway: pending -> processing allowed')
  assert(canTransitionStatus('processing', 'ready', 'takeaway'), 'Takeaway: processing -> ready allowed')
  assert(canTransitionStatus('ready', 'completed', 'takeaway'), 'Takeaway: ready -> completed allowed')
  assert(canTransitionStatus('pending', 'cancelled', 'takeaway'), 'Takeaway: pending -> cancelled allowed')
  assert(!canTransitionStatus('ready', 'assigned', 'takeaway'), 'Takeaway: ready -> assigned blocked')
  assert(!canTransitionStatus('ready', 'out_for_delivery', 'takeaway'), 'Takeaway: ready -> out_for_delivery blocked')

  // Dine-In transitions
  assert(canTransitionStatus('pending', 'processing', 'dine_in'), 'Dine-In: pending -> processing allowed')
  assert(canTransitionStatus('processing', 'ready', 'dine_in'), 'Dine-In: processing -> ready allowed')
  assert(canTransitionStatus('ready', 'completed', 'dine_in'), 'Dine-In: ready -> completed allowed')
  assert(canTransitionStatus('pending', 'cancelled', 'dine_in'), 'Dine-In: pending -> cancelled allowed')
  assert(!canTransitionStatus('ready', 'assigned', 'dine_in'), 'Dine-In: ready -> assigned blocked')

  // Delivery transitions
  assert(canTransitionStatus('pending', 'processing', 'delivery'), 'Delivery: pending -> processing allowed')
  assert(canTransitionStatus('processing', 'ready', 'delivery'), 'Delivery: processing -> ready allowed')
  assert(canTransitionStatus('ready', 'assigned', 'delivery'), 'Delivery: ready -> assigned allowed')
  assert(canTransitionStatus('assigned', 'picked_up', 'delivery'), 'Delivery: assigned -> picked_up allowed')
  assert(canTransitionStatus('picked_up', 'out_for_delivery', 'delivery'), 'Delivery: picked_up -> out_for_delivery allowed')
  assert(canTransitionStatus('out_for_delivery', 'delivered', 'delivery'), 'Delivery: out_for_delivery -> delivered allowed')
  assert(canTransitionStatus('out_for_delivery', 'failed', 'delivery'), 'Delivery: out_for_delivery -> failed allowed')
  assert(!canTransitionStatus('ready', 'completed', 'delivery'), 'Delivery: ready -> completed blocked (must be delivered via driver)')

  // Terminal states are blocked
  assert(!canTransitionStatus('completed', 'processing', 'takeaway'), 'Terminal: completed -> processing blocked')
  assert(!canTransitionStatus('cancelled', 'ready', 'delivery'), 'Terminal: cancelled -> ready blocked')

  // ----------------------------------------------------
  // TEST GROUP 2: ACTIVE SHIFT & MENU VARIANT DISCOVERY
  // ----------------------------------------------------
  console.log('\n--- GROUP 2: Active Shift & Menu Variant Setup ---')

  const shiftCheck = await getActiveDailyShift(supabase)
  assert(shiftCheck.hasActiveShift && !!shiftCheck.activeShiftId, 'Active Daily Shift exists on server')

  if (!shiftCheck.hasActiveShift || !shiftCheck.activeShiftId) {
    console.error('❌ Cannot run DB tests without open daily shift')
    return
  }

  const shiftId = shiftCheck.activeShiftId

  const { data: variant } = await supabase
    .from('item_variants')
    .select('id, price, menu_items!inner(name, is_available)')
    .eq('is_available', true)
    .limit(1)
    .maybeSingle()

  assert(!!variant && !!variant.id, 'Available Menu Variant found for testing')
  if (!variant) return

  const createdOrderIds: string[] = []

  try {
    // ----------------------------------------------------
    // TEST GROUP 3: DINE-IN CASHIER WORKFLOW & SETTLEMENT
    // ----------------------------------------------------
    console.log('\n--- GROUP 3: Dine-In Order Lifecycle & Cashier Settlement ---')

    const { data: dineInData, error: dineInErr } = await supabase.rpc('create_manual_order_secure', {
      p_customer_name: 'عميل صالة 1',
      p_customer_phone: '01012345678',
      p_order_type: 'dine_in',
      p_payment_method: 'cash',
      p_delivery_address: null,
      p_notes: '[طاولة: T-01] طلب صالة كاشير',
      p_items: [{ variant_id: variant.id, quantity: 1, item_notes: null }],
      p_daily_shift_id: shiftId,
      p_created_by_staff: 'كاشير الصالة',
    })

    assert(!dineInErr && !!dineInData?.[0]?.order_id, 'Create Dine-In Manual Order', dineInErr?.message)
    const dineInOrderId = dineInData[0].order_id
    createdOrderIds.push(dineInOrderId)

    // Move pending -> processing -> ready -> completed
    const { data: dProc } = await supabase.rpc('update_order_status_secure', {
      p_order_id: dineInOrderId,
      p_expected_status: 'pending',
      p_new_status: 'processing',
    })
    assert(dProc?.[0]?.success, 'Dine-In pending -> processing')

    const { data: dReady } = await supabase.rpc('update_order_status_secure', {
      p_order_id: dineInOrderId,
      p_expected_status: 'processing',
      p_new_status: 'ready',
    })
    assert(dReady?.[0]?.success, 'Dine-In processing -> ready')

    const { data: dComp } = await supabase.rpc('update_order_status_secure', {
      p_order_id: dineInOrderId,
      p_expected_status: 'ready',
      p_new_status: 'completed',
    })
    assert(dComp?.[0]?.success, 'Dine-In ready -> completed')

    // Settle collection
    const { data: dSettle } = await supabase.rpc('settle_order_collection_secure', {
      p_order_id: dineInOrderId,
      p_cashier_actor: 'كاشير الصالة',
    })
    assert(dSettle?.[0]?.success && dSettle?.[0]?.collection_status === 'settled_to_cashier', 'Dine-In Cash Settlement to Cashier')

    // ----------------------------------------------------
    // TEST GROUP 4: TAKEAWAY MULTI-PAYMENT WORKFLOW
    // ----------------------------------------------------
    console.log('\n--- GROUP 4: Takeaway Order Lifecycle & Payment Methods ---')

    for (const pMethod of ['cash', 'card', 'instapay', 'wallet']) {
      const { data: tkData, error: tkErr } = await supabase.rpc('create_manual_order_secure', {
        p_customer_name: `عميل استلام ${pMethod}`,
        p_customer_phone: '01022223333',
        p_order_type: 'takeaway',
        p_payment_method: pMethod,
        p_delivery_address: null,
        p_notes: `طلب استلام مدفوع ${pMethod}`,
        p_items: [{ variant_id: variant.id, quantity: 1 }],
        p_daily_shift_id: shiftId,
        p_created_by_staff: 'كاشير الاستلام',
      })

      assert(!tkErr && !!tkData?.[0]?.order_id, `Create Takeaway Order (${pMethod})`, tkErr?.message)
      const tkOrderId = tkData[0].order_id
      createdOrderIds.push(tkOrderId)

      // Complete takeaway
      await supabase.rpc('update_order_status_secure', { p_order_id: tkOrderId, p_expected_status: 'pending', p_new_status: 'processing' })
      await supabase.rpc('update_order_status_secure', { p_order_id: tkOrderId, p_expected_status: 'processing', p_new_status: 'ready' })
      const { data: tkComp } = await supabase.rpc('update_order_status_secure', {
        p_order_id: tkOrderId,
        p_expected_status: 'ready',
        p_new_status: 'completed',
      })
      assert(tkComp?.[0]?.success, `Complete Takeaway Order (${pMethod})`)
    }

    // ----------------------------------------------------
    // TEST GROUP 5: ORDER CANCELLATION FLOW WITH REASON
    // ----------------------------------------------------
    console.log('\n--- GROUP 5: Order Cancellation Flow with Audit Reason ---')

    const { data: cancelOrdData } = await supabase.rpc('create_manual_order_secure', {
      p_customer_name: 'عميل ملغي',
      p_customer_phone: '01099998888',
      p_order_type: 'takeaway',
      p_payment_method: 'cash',
      p_delivery_address: null,
      p_notes: 'طلب تجريبي للإلغاء',
      p_items: [{ variant_id: variant.id, quantity: 1 }],
      p_daily_shift_id: shiftId,
      p_created_by_staff: 'كاشير الإلغاء',
    })

    const cancelOrderId = cancelOrdData[0].order_id
    createdOrderIds.push(cancelOrderId)

    const cancelReason = 'طلب العميل إلغاء الطلب لتأخر الحضور'
    const { data: cancelRes } = await supabase.rpc('update_order_status_secure', {
      p_order_id: cancelOrderId,
      p_expected_status: 'pending',
      p_new_status: 'cancelled',
      p_reason: cancelReason,
    })

    assert(cancelRes?.[0]?.success, 'Cancel Order transitions to cancelled')

    const { data: cancelledDb } = await supabase
      .from('orders')
      .select('status, cancellation_reason')
      .eq('id', cancelOrderId)
      .single()

    assert(
      cancelledDb?.status === 'cancelled' && cancelledDb?.cancellation_reason === cancelReason,
      'Cancellation reason recorded in DB audit trail'
    )

    // ----------------------------------------------------
    // TEST GROUP 6: BLOCKED & INVALID CASHIER ACTIONS
    // ----------------------------------------------------
    console.log('\n--- GROUP 6: Blocked & Invalid Operations Protection ---')

    // 6a. Mismatched expected status guard
    const { data: badExpectedRes } = await supabase.rpc('update_order_status_secure', {
      p_order_id: cancelOrderId,
      p_expected_status: 'ready', // actual is cancelled
      p_new_status: 'completed',
    })
    assert(!badExpectedRes?.[0]?.success, 'Mismatched expected_status is blocked (Concurrency Guard)')

    // 6b. Non-existent order
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const { data: nonExistentRes } = await supabase.rpc('update_order_status_secure', {
      p_order_id: fakeId,
      p_expected_status: null,
      p_new_status: 'processing',
    })
    assert(!nonExistentRes?.[0]?.success, 'Non-existent order status change is blocked')

    // 6c. Invalid shift creation guard
    const { error: invalidShiftErr } = await supabase.rpc('create_manual_order_secure', {
      p_customer_name: 'عميل خطأ وردية',
      p_customer_phone: '01011112222',
      p_order_type: 'takeaway',
      p_payment_method: 'cash',
      p_delivery_address: null,
      p_notes: 'اختبار وردية مغلقة',
      p_items: [{ variant_id: variant.id, quantity: 1 }],
      p_daily_shift_id: fakeId,
      p_created_by_staff: 'كاشير التجربة',
    })
    assert(!!invalidShiftErr, 'Invalid / Closed Shift Order Creation is rejected by DB Guard')

  } finally {
    // Clean up test orders
    if (createdOrderIds.length > 0) {
      await supabase.from('order_items').delete().in('order_id', createdOrderIds)
      await supabase.from('orders').delete().in('id', createdOrderIds)
    }
  }

  console.log('\n====================================================')
  console.log(`📊 FINAL RESULT: ${passCount}/${totalTests} TESTS PASSED`)
  console.log('====================================================')
}

runUnit4Certification().catch(console.error)
