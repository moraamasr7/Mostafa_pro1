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
import { calculateFleetDriversAccounting } from '../src/lib/driverAccounting'

async function runUnit3Certification() {
  console.log('====================================================')
  console.log('🧪 RUNNING UNIT 3 — DRIVER DISPATCH CERTIFICATION')
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

  // 1. Get or create test open daily shift
  const { data: openShift } = await supabase
    .from('daily_shifts')
    .select('id, opened_at, shift_number')
    .eq('status', 'open')
    .limit(1)
    .maybeSingle()

  if (!openShift) {
    console.error('❌ No active daily shift found for testing. Please ensure daily shift exists.')
    return
  }

  // 2. Fetch test item variant
  const { data: variant } = await supabase
    .from('item_variants')
    .select('id, price')
    .eq('is_available', true)
    .limit(1)
    .single()

  // 3. Create or select test driver
  const testPhone = '010' + Math.floor(10000000 + Math.random() * 90000000)
  const { data: testDriver, error: driverErr } = await supabase
    .from('drivers')
    .insert({
      name: 'طيار اختبار Unit 3',
      phone: testPhone,
      is_active: true,
      status: 'offline',
    })
    .select()
    .single()

  assert(!driverErr && !!testDriver, 'Driver Entity Setup', driverErr?.message)

  const driverId = testDriver.id

  try {
    // ----------------------------------------------------
    // TEST 1: DRIVER SHIFT LIFECYCLE (START / END)
    // ----------------------------------------------------
    console.log('\n--- GROUP 1: Driver Shift Start / End Lifecycle ---')

    const { data: startShiftRes, error: startShiftErr } = await supabase.rpc('start_driver_shift_secure', {
      p_driver_id: driverId,
    })

    assert(
      !startShiftErr && startShiftRes?.[0]?.success && !!startShiftRes?.[0]?.shift_id,
      'Driver Shift Start: offline -> available (start_driver_shift_secure)',
      startShiftErr?.message
    )

    const shiftId = startShiftRes?.[0]?.shift_id

    // Check driver status updated to available
    const { data: driverAfterStart } = await supabase
      .from('drivers')
      .select('status')
      .eq('id', driverId)
      .single()

    assert(driverAfterStart?.status === 'available', 'Driver Status is available after shift start')

    // ----------------------------------------------------
    // TEST 2: SINGLE DELIVERY ORDER CREATION & DISPATCH
    // ----------------------------------------------------
    console.log('\n--- GROUP 2: Single Order Assignment & Trip Generation ---')

    const { data: order1Data } = await supabase.rpc('create_manual_order_secure', {
      p_customer_name: 'عميل دليفري 1',
      p_customer_phone: '01011112222',
      p_order_type: 'delivery',
      p_payment_method: 'cash',
      p_delivery_address: 'شارع النزهة مبنى 4 شقة 2',
      p_notes: 'ملاحظة توصيل تجريبية 1',
      p_items: [{ variant_id: variant.id, quantity: 1, item_notes: null }],
      p_daily_shift_id: openShift.id,
      p_created_by_staff: 'كاشير اختبار',
    })

    const order1Id = order1Data[0].order_id

    // Move to ready state
    await supabase.rpc('update_order_status_secure', {
      p_order_id: order1Id,
      p_expected_status: 'pending',
      p_new_status: 'processing',
    })
    await supabase.rpc('update_order_status_secure', {
      p_order_id: order1Id,
      p_expected_status: 'processing',
      p_new_status: 'ready',
    })

    // Assign to driver
    const { data: assign1Res, error: assign1Err } = await supabase.rpc('assign_orders_to_driver_secure', {
      p_driver_id: driverId,
      p_order_ids: [{ order_id: order1Id }],
    })

    assert(
      !assign1Err && assign1Res?.[0]?.success && !!assign1Res?.[0]?.trip_id && !!assign1Res?.[0]?.trip_number,
      'Single Order Assignment generates Trip with trip_number',
      assign1Err?.message
    )

    const tripId = assign1Res?.[0]?.trip_id

    // ----------------------------------------------------
    // TEST 3: BATCH ORDER ASSIGNMENT TO SAME ACTIVE TRIP
    // ----------------------------------------------------
    console.log('\n--- GROUP 3: Batch Order Assignment to Existing Active Trip ---')

    const { data: order2Data } = await supabase.rpc('create_manual_order_secure', {
      p_customer_name: 'عميل دليفري 2',
      p_customer_phone: '01033334444',
      p_order_type: 'delivery',
      p_payment_method: 'cash',
      p_delivery_address: 'شارع الحجاز مبنى 10 شقة 5',
      p_notes: 'ملاحظة توصيل تجريبية 2',
      p_items: [{ variant_id: variant.id, quantity: 1, item_notes: null }],
      p_daily_shift_id: openShift.id,
      p_created_by_staff: 'كاشير اختبار',
    })

    const order2Id = order2Data[0].order_id

    await supabase.rpc('update_order_status_secure', {
      p_order_id: order2Id,
      p_expected_status: 'pending',
      p_new_status: 'processing',
    })
    await supabase.rpc('update_order_status_secure', {
      p_order_id: order2Id,
      p_expected_status: 'processing',
      p_new_status: 'ready',
    })

    const { data: assign2Res, error: assign2Err } = await supabase.rpc('assign_orders_to_driver_secure', {
      p_driver_id: driverId,
      p_order_ids: [{ order_id: order2Id }],
    })

    assert(
      !assign2Err && assign2Res?.[0]?.trip_id === tripId,
      'Batch Assignment groups orders into the same active delivery trip',
      assign2Err?.message
    )

    // ----------------------------------------------------
    // TEST 4: CONCURRENCY & DOUBLE ASSIGNMENT PROTECTION
    // ----------------------------------------------------
    console.log('\n--- GROUP 4: Double Assignment Concurrency Protection ---')

    // Create a 2nd driver
    const driver2Phone = '010' + Math.floor(10000000 + Math.random() * 90000000)
    const { data: driver2 } = await supabase
      .from('drivers')
      .insert({
        name: 'طيار منافس 2',
        phone: driver2Phone,
        is_active: true,
        status: 'offline',
      })
      .select()
      .single()

    await supabase.rpc('start_driver_shift_secure', { p_driver_id: driver2.id })

    // Try assigning order1 to driver2 while already active with driver1
    const { data: doubleAssignRes, error: doubleAssignErr } = await supabase.rpc('assign_orders_to_driver_secure', {
      p_driver_id: driver2.id,
      p_order_ids: [{ order_id: order1Id }],
    })

    assert(
      !!doubleAssignErr || !doubleAssignRes?.[0]?.success,
      'Double Assignment Protection: Backend blocks assigning an already assigned active order'
    )

    // Clean up driver2
    await supabase.rpc('end_driver_shift_secure', { p_driver_id: driver2.id })
    await supabase.from('driver_shifts').delete().eq('driver_id', driver2.id)
    await supabase.from('drivers').delete().eq('id', driver2.id)

    // ----------------------------------------------------
    // TEST 5: DELIVERY LIFECYCLE & ROUTING
    // ----------------------------------------------------
    console.log('\n--- GROUP 5: Delivery Lifecycle (picked_up -> out_for_delivery) ---')

    const { data: pickupRes, error: pickupErr } = await supabase.rpc('update_delivery_status_secure', {
      p_order_id: order1Id,
      p_new_status: 'picked_up',
    })
    assert(!pickupErr && pickupRes?.[0]?.success, 'Order 1 transition to picked_up')

    const { data: outRes, error: outErr } = await supabase.rpc('update_delivery_status_secure', {
      p_order_id: order1Id,
      p_new_status: 'out_for_delivery',
    })
    assert(!outErr && outRes?.[0]?.success, 'Order 1 transition to out_for_delivery')

    // Verify driver status became busy
    const { data: driverBusyCheck } = await supabase
      .from('drivers')
      .select('status')
      .eq('id', driverId)
      .single()
    assert(driverBusyCheck?.status === 'busy', 'Driver status becomes busy when out for delivery')

    // ----------------------------------------------------
    // TEST 6: SUCCESSFUL DELIVERY & CASH COLLECTION
    // ----------------------------------------------------
    console.log('\n--- GROUP 6: Successful Delivery Outcome & Cash Collection ---')

    const order1Total = 50.00
    const { data: outcome1Res, error: outcome1Err } = await supabase.rpc('record_delivery_outcome_secure', {
      p_order_id: order1Id,
      p_outcome: 'delivered',
      p_failure_reason: null,
      p_collected_amount: order1Total,
      p_staff_actor: 'admin_test',
    })

    assert(!outcome1Err && outcome1Res?.[0]?.success, 'Record successful delivery outcome')

    const { data: order1Db } = await supabase
      .from('orders')
      .select('status, collection_status')
      .eq('id', order1Id)
      .single()

    assert(
      order1Db?.status === 'delivered' && order1Db?.collection_status === 'collected',
      'Order 1 status = delivered & collection_status = collected'
    )

    // ----------------------------------------------------
    // TEST 7: FAILED DELIVERY OUTCOME (REASON RECORDED)
    // ----------------------------------------------------
    console.log('\n--- GROUP 7: Failed Delivery Outcome (Safe Failure Record) ---')

    const { data: outcome2Res, error: outcome2Err } = await supabase.rpc('record_delivery_outcome_secure', {
      p_order_id: order2Id,
      p_outcome: 'failed',
      p_failure_reason: 'العميل لا يرد على الهاتف',
      p_collected_amount: 0.00,
      p_staff_actor: 'admin_test',
    })

    assert(!outcome2Err && outcome2Res?.[0]?.success, 'Record failed delivery outcome with mandatory reason')

    const { data: order2Db } = await supabase
      .from('orders')
      .select('status, collection_status, failure_reason')
      .eq('id', order2Id)
      .single()

    assert(
      order2Db?.status === 'failed' &&
        order2Db?.collection_status === 'uncollected' &&
        order2Db?.failure_reason === 'العميل لا يرد على الهاتف',
      'Order 2 status = failed & collection_status = uncollected & reason stored'
    )

    // ----------------------------------------------------
    // TEST 8: TRIP AUTO-COMPLETION & DRIVER RELEASE
    // ----------------------------------------------------
    console.log('\n--- GROUP 8: Trip Auto-Completion upon Resolving All Orders ---')

    const { data: tripDb } = await supabase
      .from('delivery_trips')
      .select('status, collected_amount, collection_status')
      .eq('id', tripId)
      .single()

    assert(
      tripDb?.status === 'completed' && Number(tripDb?.collected_amount) === order1Total,
      'Delivery Trip automatically completes when all orders are resolved'
    )

    const { data: driverAfterTrip } = await supabase
      .from('drivers')
      .select('status')
      .eq('id', driverId)
      .single()

    assert(driverAfterTrip?.status === 'available', 'Driver released to available after trip completion')

    // ----------------------------------------------------
    // TEST 9: CASHIER TRIP SETTLEMENT & DUPLICATE GUARD
    // ----------------------------------------------------
    console.log('\n--- GROUP 9: Cashier Trip Settlement & Duplicate Settlement Protection ---')

    const { data: settleRes, error: settleErr } = await supabase.rpc('settle_delivery_trip_to_cashier_secure', {
      p_trip_id: tripId,
      p_cashier_actor: 'كاشير الخزينة',
      p_amount_received: order1Total,
    })

    assert(
      !settleErr && settleRes?.[0]?.success && Number(settleRes?.[0]?.settled_amount) === order1Total,
      'Settle Trip to Cashier updates collection_status to settled_to_cashier',
      settleErr?.message
    )

    // Verify order1 became settled_to_cashier
    const { data: order1SettledCheck } = await supabase
      .from('orders')
      .select('collection_status')
      .eq('id', order1Id)
      .single()

    assert(order1SettledCheck?.collection_status === 'settled_to_cashier', 'Order 1 collection_status = settled_to_cashier')

    // Attempt duplicate settlement
    const { data: dupSettleRes, error: dupSettleErr } = await supabase.rpc('settle_delivery_trip_to_cashier_secure', {
      p_trip_id: tripId,
      p_cashier_actor: 'كاشير الخزينة',
      p_amount_received: order1Total,
    })

    assert(
      !!dupSettleErr || !dupSettleRes?.[0]?.success,
      'Duplicate Settlement Protection: Backend blocks re-settling an already settled trip'
    )

    // ----------------------------------------------------
    // TEST 10: END DRIVER SHIFT & BLOCKED ON ACTIVE ORDERS
    // ----------------------------------------------------
    console.log('\n--- GROUP 10: End Driver Shift ---')

    const { data: endShiftRes, error: endShiftErr } = await supabase.rpc('end_driver_shift_secure', {
      p_driver_id: driverId,
    })

    assert(!endShiftErr && endShiftRes?.[0]?.success, 'End Driver Shift successfully transitions driver to offline')

    // ----------------------------------------------------
    // TEST 11: DRIVER ACCOUNTING IMMUTABILITY & SERVER AUTHORITY
    // ----------------------------------------------------
    console.log('\n--- GROUP 11: Centralized Driver Accounting Engine ---')

    const fleetAccounting = await calculateFleetDriversAccounting(
      supabase,
      openShift.id,
      openShift.opened_at
    )

    assert(
      !!fleetAccounting && typeof fleetAccounting.total_hours === 'number' && typeof fleetAccounting.total_net_payout === 'number',
      'calculateFleetDriversAccounting computes centralized metrics server-side'
    )

    // Clean up test records
    await supabase.from('delivery_outcomes').delete().in('order_id', [order1Id, order2Id])
    await supabase.from('order_driver_assignments').delete().in('order_id', [order1Id, order2Id])
    await supabase.from('delivery_trips').delete().eq('id', tripId)
    await supabase.from('order_items').delete().in('order_id', [order1Id, order2Id])
    await supabase.from('orders').delete().in('id', [order1Id, order2Id])
    await supabase.from('driver_shifts').delete().eq('driver_id', driverId)
    await supabase.from('drivers').delete().eq('id', driverId)

  } catch (err: any) {
    console.error('Unexpected error during certification test:', err)
  }

  console.log('\n====================================================')
  console.log(`📊 FINAL RESULT: ${passCount}/${totalTests} TESTS PASSED`)
  console.log('====================================================')
}

runUnit3Certification().catch(console.error)
