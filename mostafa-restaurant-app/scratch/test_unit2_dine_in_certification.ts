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
import { canTransitionReservation, ReservationStatus } from '../src/types/reservations'
import { canTransitionStatus, OrderStatus } from '../src/types/orders'

async function runUnit2Certification() {
  console.log('====================================================')
  console.log('🧪 RUNNING UNIT 2 — DINE-IN OPERATIONAL CERTIFICATION')
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
  // TEST GROUP 1: RESERVATION TRANSITIONS (TYPES & RULES)
  // ----------------------------------------------------
  console.log('\n--- GROUP 1: Reservation Status Transitions ---')
  
  // Pending
  assert(canTransitionReservation('pending', 'confirmed'), 'pending -> confirmed is allowed')
  assert(canTransitionReservation('pending', 'cancelled'), 'pending -> cancelled is allowed')
  assert(!canTransitionReservation('pending', 'completed'), 'pending -> completed is NOT allowed directly')
  assert(!canTransitionReservation('pending', 'no_show'), 'pending -> no_show is NOT allowed directly')

  // Confirmed
  assert(canTransitionReservation('confirmed', 'completed'), 'confirmed -> completed is allowed')
  assert(canTransitionReservation('confirmed', 'no_show'), 'confirmed -> no_show is allowed')
  assert(canTransitionReservation('confirmed', 'cancelled'), 'confirmed -> cancelled is allowed')
  assert(!canTransitionReservation('confirmed', 'pending'), 'confirmed -> pending is NOT allowed')

  // Terminal States
  assert(!canTransitionReservation('completed', 'pending'), 'completed -> pending is blocked')
  assert(!canTransitionReservation('completed', 'confirmed'), 'completed -> confirmed is blocked')
  assert(!canTransitionReservation('completed', 'cancelled'), 'completed -> cancelled is blocked')
  assert(!canTransitionReservation('cancelled', 'confirmed'), 'cancelled -> confirmed is blocked')
  assert(!canTransitionReservation('no_show', 'confirmed'), 'no_show -> confirmed is blocked')

  // ----------------------------------------------------
  // TEST GROUP 2: DINE-IN ORDER TRANSITIONS & DRIVER GUARD
  // ----------------------------------------------------
  console.log('\n--- GROUP 2: Dine-In Order Lifecycle Transitions ---')
  assert(canTransitionStatus('pending', 'processing', 'dine_in'), 'Dine-In pending -> processing allowed')
  assert(canTransitionStatus('processing', 'ready', 'dine_in'), 'Dine-In processing -> ready allowed')
  assert(canTransitionStatus('ready', 'completed', 'dine_in'), 'Dine-In ready -> completed allowed')
  assert(canTransitionStatus('pending', 'cancelled', 'dine_in'), 'Dine-In pending -> cancelled allowed')

  // Driver states must not be applied to Dine-In
  const driverStateTransitions: OrderStatus[] = ['assigned', 'picked_up', 'out_for_delivery', 'delivered']
  for (const st of driverStateTransitions) {
    assert(!canTransitionStatus('ready', st, 'takeaway'), `Takeaway/Dine-In ready -> ${st} is guarded`)
  }

  // ----------------------------------------------------
  // TEST GROUP 3: DATABASE RESERVATION CREATION & PATCHING
  // ----------------------------------------------------
  console.log('\n--- GROUP 3: Live Database Reservation Lifecycle ---')
  
  // Create a test reservation directly
  const testPhone = '01099112233'
  const todayStr = new Date().toISOString().split('T')[0]

  const { data: newRes, error: resErr } = await supabase
    .from('reservations')
    .insert({
      customer_name: 'عميل اختبار Unit 2',
      customer_phone: testPhone,
      reservation_date: todayStr,
      reservation_time: '20:00:00',
      guest_count: 4,
      status: 'pending',
      notes: 'حجز تجريبي لاختبار الاعتماد',
    })
    .select()
    .single()

  assert(!resErr && !!newRes, 'Live Reservation Creation in DB', resErr?.message)

  if (newRes) {
    const resId = newRes.id

    // 3a. Update with table number and confirm
    const { data: confirmedRes, error: confErr } = await supabase
      .from('reservations')
      .update({
        status: 'confirmed',
        table_number: 'T-05',
        updated_at: new Date().toISOString(),
      })
      .eq('id', resId)
      .select()
      .single()

    assert(
      !confErr && confirmedRes?.status === 'confirmed' && confirmedRes?.table_number === 'T-05',
      'Confirm Reservation & Assign Logical Table T-05',
      confErr?.message
    )

    // 3b. Complete reservation
    const { data: completedRes, error: compErr } = await supabase
      .from('reservations')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', resId)
      .select()
      .single()

    assert(
      !compErr && completedRes?.status === 'completed',
      'Complete Reservation upon Seating',
      compErr?.message
    )

    // Clean up test reservation
    await supabase.from('reservations').delete().eq('id', resId)
  }

  // ----------------------------------------------------
  // TEST GROUP 4: DINE-IN MANUAL ORDER CREATION & NOTES FORMAT
  // ----------------------------------------------------
  console.log('\n--- GROUP 4: Live Dine-In Manual Order Creation ---')

  // Find active open shift
  const { data: openShift } = await supabase
    .from('daily_shifts')
    .select('id, shift_number')
    .eq('status', 'open')
    .limit(1)
    .maybeSingle()

  // Find an available item variant
  const { data: variant } = await supabase
    .from('item_variants')
    .select('id, price, menu_items!inner(name, is_available)')
    .eq('is_available', true)
    .limit(1)
    .maybeSingle()

  if (openShift && variant) {
    const tableNo = 'T-05'
    const userNotes = 'بدون شطة مع إضافة طحينة'
    const formattedNotes = `[طاولة: ${tableNo}] ${userNotes}`

    const { data: orderData, error: orderErr } = await supabase.rpc('create_manual_order_secure', {
      p_customer_name: 'عميل صالة تجريبي',
      p_customer_phone: '01012345678',
      p_order_type: 'dine_in',
      p_payment_method: 'cash',
      p_delivery_address: null,
      p_notes: formattedNotes,
      p_items: [{ variant_id: variant.id, quantity: 2, item_notes: 'تحمير جيد' }],
      p_daily_shift_id: openShift.id,
      p_created_by_staff: 'الكاشير مصطفى',
    })

    assert(!orderErr && !!orderData && orderData.length > 0, 'Create Dine-In Order with Table Note Format', orderErr?.message)

    if (orderData && orderData.length > 0) {
      const createdOrd = orderData[0]
      const orderId = createdOrd.order_id

      // Verify stored order fields
      const { data: dbOrd } = await supabase
        .from('orders')
        .select('id, order_type, notes, status, collection_status, total_amount')
        .eq('id', orderId)
        .single()

      assert(dbOrd?.order_type === 'dine_in', 'Order stored with order_type = dine_in')
      assert(dbOrd?.notes?.startsWith('[طاولة: T-05]'), 'Order notes correctly formatted with [طاولة: T-05]')
      assert(dbOrd?.status === 'pending', 'Dine-In order initial status is pending')

      // Progress order: pending -> processing
      const { data: procRes, error: procErr } = await supabase.rpc('update_order_status_secure', {
        p_order_id: orderId,
        p_expected_status: 'pending',
        p_new_status: 'processing',
      })
      assert(!procErr && procRes?.[0]?.success, 'Dine-In transition pending -> processing')

      // Progress order: processing -> ready
      const { data: readyRes, error: readyErr } = await supabase.rpc('update_order_status_secure', {
        p_order_id: orderId,
        p_expected_status: 'processing',
        p_new_status: 'ready',
      })
      assert(!readyErr && readyRes?.[0]?.success, 'Dine-In transition processing -> ready')

      // Progress order: ready -> completed
      const { data: compRes, error: compOrdErr } = await supabase.rpc('update_order_status_secure', {
        p_order_id: orderId,
        p_expected_status: 'ready',
        p_new_status: 'completed',
      })
      assert(!compOrdErr && compRes?.[0]?.success, 'Dine-In transition ready -> completed')

      // Settle Dine-In Collection
      const { data: settleRes, error: settleErr } = await supabase.rpc('settle_order_collection_secure', {
        p_order_id: orderId,
        p_cashier_actor: 'الكاشير مصطفى',
      })
      assert(!settleErr && settleRes?.[0]?.success && settleRes?.[0]?.collection_status === 'settled_to_cashier', 'Dine-In Cash Collection Settled to Cashier')

      // Clean up test order items and order
      await supabase.from('order_items').delete().eq('order_id', orderId)
      await supabase.from('orders').delete().eq('id', orderId)
    }
  } else {
    console.log('  ⚠️ Open shift or menu variant not found for live order test, skipping DB insertion test')
  }

  console.log('\n====================================================')
  console.log(`📊 FINAL RESULT: ${passCount}/${totalTests} TESTS PASSED`)
  console.log('====================================================')
}

runUnit2Certification().catch(console.error)
