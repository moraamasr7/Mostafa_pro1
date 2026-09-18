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

const supabase = getSupabaseServerClient()

async function runCollectionStateTests() {
  console.log('🚀 [START] Running Comprehensive Collection State & Cash Custody Test Suite...\n')
  let passedCount = 0
  let failedCount = 0

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`)
      passedCount++
    } else {
      console.error(`  ❌ FAIL: ${message}`)
      failedCount++
    }
  }

  try {
    // 0. Fetch active daily shift, available variant, and test driver
    const { data: openShifts } = await supabase
      .from('daily_shifts')
      .select('id, shift_number')
      .eq('status', 'open')
      .limit(1)

    assert(Boolean(openShifts && openShifts.length > 0), `Found active open daily shift #${openShifts?.[0]?.shift_number}`)
    const activeShift = openShifts![0]

    const { data: variants } = await supabase
      .from('item_variants')
      .select('id, price')
      .eq('is_available', true)
      .limit(1)

    assert(Boolean(variants && variants.length > 0), 'Found available menu variant')
    const testVariant = variants![0]

    const { data: drivers } = await supabase
      .from('drivers')
      .select('id, name')
      .eq('is_active', true)
      .limit(1)

    assert(Boolean(drivers && drivers.length > 0), `Found active delivery driver (${drivers?.[0]?.name})`)
    const testDriver = drivers![0]

    // Ensure driver shift is started
    await supabase.rpc('start_driver_shift_secure', { p_driver_id: testDriver.id })

    // ==========================================
    // TEST 1: Takeaway Direct Collection Lifecycle
    // ==========================================
    console.log('\n--- TEST 1: Takeaway Direct Collection Lifecycle ---')
    const { data: takeawayOrder, error: takeawayErr } = await supabase.rpc('create_manual_order_secure', {
      p_customer_name: 'عميل صالة تحصيل فوري',
      p_customer_phone: '01011112233',
      p_order_type: 'takeaway',
      p_payment_method: 'cash',
      p_delivery_address: null,
      p_notes: 'تجربة التحصيل المباشر بالخزينة',
      p_items: [{ variant_id: testVariant.id, quantity: 1, item_notes: '' }],
      p_daily_shift_id: activeShift.id,
      p_created_by_staff: 'cashier',
    })

    if (takeawayErr) {
      console.error('Takeaway order error:', takeawayErr)
    }
    assert(!takeawayErr && Boolean(takeawayOrder?.[0]?.order_id), 'Takeaway order created via RPC')
    const takeawayId = takeawayOrder![0].order_id

    // Check initial collection status
    const { data: initialTakeaway } = await supabase
      .from('orders')
      .select('id, order_type, status, collection_status, total_amount')
      .eq('id', takeawayId)
      .single()

    assert(initialTakeaway?.collection_status === 'uncollected', 'Initial Takeaway collection_status is "uncollected"')

    // Settle takeaway order to cashier
    const { data: settleTakeawayRes, error: settleTakeawayErr } = await supabase.rpc('settle_order_collection_secure', {
      p_order_id: takeawayId,
      p_cashier_actor: 'cashier_mostafa',
    })

    if (settleTakeawayErr) {
      console.error('💥 settleTakeawayErr:', settleTakeawayErr)
    }

    assert(!settleTakeawayErr && settleTakeawayRes?.[0]?.success === true, 'settle_order_collection_secure returned success')
    
    const { data: settledTakeaway } = await supabase
      .from('orders')
      .select('collection_status')
      .eq('id', takeawayId)
      .single()

    assert(settledTakeaway?.collection_status === 'settled_to_cashier', 'Takeaway collection_status transitioned to "settled_to_cashier"')

    // Test idempotent re-settlement of takeaway order
    const { data: reSettleTakeawayRes, error: reSettleTakeawayErr } = await supabase.rpc('settle_order_collection_secure', {
      p_order_id: takeawayId,
      p_cashier_actor: 'cashier_mostafa',
    })
    if (reSettleTakeawayErr) {
      console.error('💥 reSettleTakeawayErr:', reSettleTakeawayErr)
    }
    assert(!reSettleTakeawayErr && reSettleTakeawayRes?.[0]?.success === true, 'Re-settling takeaway is idempotent and safe')

    // ==========================================
    // TEST 2: Delivery Order Lifecycle (uncollected -> collected -> settled_to_cashier)
    // ==========================================
    console.log('\n--- TEST 2: Delivery Order Lifecycle (uncollected -> collected -> settled_to_cashier) ---')
    const { data: delivOrder, error: delivErr } = await supabase.rpc('create_manual_order_secure', {
      p_customer_name: 'عميل دليفري تحصيل مرحلي',
      p_customer_phone: '01022223344',
      p_order_type: 'delivery',
      p_payment_method: 'cash',
      p_delivery_address: 'شارع الهرم الرئيسي أمام السينما',
      p_notes: 'تجربة حيازة النقدية مع الطيار',
      p_items: [{ variant_id: testVariant.id, quantity: 2, item_notes: '' }],
      p_daily_shift_id: activeShift.id,
      p_created_by_staff: 'operator',
    })

    assert(!delivErr && Boolean(delivOrder?.[0]?.order_id), 'Delivery order created via RPC')
    const delivId = delivOrder![0].order_id
    const expectedDelivAmount = Number(delivOrder![0].total_amount)

    // Advance to ready
    await supabase.rpc('update_order_status_secure', { p_order_id: delivId, p_expected_status: 'pending', p_new_status: 'processing' })
    await supabase.rpc('update_order_status_secure', { p_order_id: delivId, p_expected_status: 'processing', p_new_status: 'ready' })

    // Assign to driver
    const { data: assignRes, error: assignErr } = await supabase.rpc('assign_orders_to_driver_secure', {
      p_driver_id: testDriver.id,
      p_order_ids: [{ order_id: delivId }],
    })
    if (assignErr) {
      console.error('💥 assignErr:', assignErr)
    }

    assert(!assignErr && Boolean(assignRes?.[0]?.trip_id), 'Assigned delivery order to driver and created trip')
    const tripId = assignRes![0].trip_id

    // Check trip & order initial collection status
    const { data: initialTrip } = await supabase.from('delivery_trips').select('collection_status, expected_amount').eq('id', tripId).single()
    const { data: initialDelivOrd } = await supabase.from('orders').select('collection_status').eq('id', delivId).single()

    assert(initialTrip?.collection_status === 'uncollected', 'Trip initial collection_status is "uncollected"')
    assert(initialDelivOrd?.collection_status === 'uncollected', 'Order initial collection_status is "uncollected"')

    // Dispatch driver
    const { data: assignRow } = await supabase.from('order_driver_assignments').select('id').eq('order_id', delivId).single()
    await supabase.rpc('update_delivery_status_secure', { p_assignment_id: assignRow!.id, p_new_status: 'out_for_delivery' })

    // Driver delivers to customer: record_delivery_outcome_secure
    const { data: outcomeRes, error: outcomeErr } = await supabase.rpc('record_delivery_outcome_secure', {
      p_order_id: delivId,
      p_outcome: 'delivered',
      p_collected_amount: expectedDelivAmount,
      p_staff_actor: 'driver_app',
    })

    assert(!outcomeErr && outcomeRes?.[0]?.success === true, 'Recorded delivery outcome as "delivered"')

    // Verify order is now 'collected' (in driver custody)
    const { data: deliveredOrd } = await supabase.from('orders').select('collection_status, status').eq('id', delivId).single()
    const { data: deliveredTrip } = await supabase.from('delivery_trips').select('collection_status, collected_amount').eq('id', tripId).single()

    assert(deliveredOrd?.collection_status === 'collected', 'Order collection_status transitioned to "collected" (Driver Custody)')
    assert(deliveredTrip?.collection_status === 'collected', 'Trip collection_status transitioned to "collected"')
    assert(Number(deliveredTrip?.collected_amount) >= expectedDelivAmount, 'Trip collected_amount accurately recorded')

    // Settle trip to cashier
    const { data: settleTripRes, error: settleTripErr } = await supabase.rpc('settle_delivery_trip_to_cashier_secure', {
      p_trip_id: tripId,
      p_cashier_actor: 'cashier_mostafa',
      p_amount_received: expectedDelivAmount,
    })

    assert(!settleTripErr && settleTripRes?.[0]?.success === true, 'settle_delivery_trip_to_cashier_secure succeeded')

    // Verify trip and order are now 'settled_to_cashier'
    const { data: settledTrip } = await supabase.from('delivery_trips').select('collection_status').eq('id', tripId).single()
    const { data: settledDelivOrd } = await supabase.from('orders').select('collection_status').eq('id', delivId).single()

    assert(settledTrip?.collection_status === 'settled_to_cashier', 'Trip collection_status transitioned to "settled_to_cashier"')
    assert(settledDelivOrd?.collection_status === 'settled_to_cashier', 'Order collection_status transitioned to "settled_to_cashier"')

    // ==========================================
    // TEST 3: Duplicate Trip Settlement Prevention
    // ==========================================
    console.log('\n--- TEST 3: Duplicate Trip Settlement Prevention ---')
    const { data: dupSettleRes, error: dupSettleErr } = await supabase.rpc('settle_delivery_trip_to_cashier_secure', {
      p_trip_id: tripId,
      p_cashier_actor: 'cashier_mostafa',
      p_amount_received: expectedDelivAmount,
    })

    assert(Boolean(dupSettleErr), 'Duplicate settlement on already settled trip is atomically rejected')
    assert(dupSettleErr?.message?.includes('تمت تسويته') || dupSettleErr?.message?.includes('مسبقاً'), 'Correct Arabic duplicate settlement error message returned')

    // ==========================================
    // TEST 4: In-Transit Settlement Guard
    // ==========================================
    console.log('\n--- TEST 4: In-Transit Settlement Guard ---')
    const { data: inTransitOrd } = await supabase.rpc('create_manual_order_secure', {
      p_customer_name: 'عميل في الطريق لا يمكن تسويته',
      p_customer_phone: '01033334455',
      p_order_type: 'delivery',
      p_payment_method: 'cash',
      p_delivery_address: 'شارع فيصل الرئيسي محطة حسن محمد',
      p_notes: 'اختبار حظر تسوية رحلة غير مكتملة',
      p_items: [{ variant_id: testVariant.id, quantity: 1, item_notes: '' }],
      p_daily_shift_id: activeShift.id,
      p_created_by_staff: 'operator',
    })
    const inTransitId = inTransitOrd![0].order_id
    const inTransitAmount = Number(inTransitOrd![0].total_amount)
    await supabase.rpc('update_order_status_secure', { p_order_id: inTransitId, p_expected_status: 'pending', p_new_status: 'processing' })
    await supabase.rpc('update_order_status_secure', { p_order_id: inTransitId, p_expected_status: 'processing', p_new_status: 'ready' })
    const { data: assignInTransit } = await supabase.rpc('assign_orders_to_driver_secure', {
      p_driver_id: testDriver.id,
      p_order_ids: [{ order_id: inTransitId }],
    })
    const inTransitTripId = assignInTransit![0].trip_id

    // Attempt to settle while order is still assigned / out for delivery
    const { data: prematureSettleRes, error: prematureSettleErr } = await supabase.rpc('settle_delivery_trip_to_cashier_secure', {
      p_trip_id: inTransitTripId,
      p_cashier_actor: 'cashier_mostafa',
    })

    assert(Boolean(prematureSettleErr), 'Attempting to settle trip with unresolved in-transit orders is rejected')
    assert(prematureSettleErr?.message?.includes('طلبات معلقة') || prematureSettleErr?.message?.includes('أمان العمليات'), 'Correct unresolved orders error message returned')

    // Clean up in-transit order: deliver and settle it
    await supabase.rpc('record_delivery_outcome_secure', {
      p_order_id: inTransitId,
      p_outcome: 'delivered',
      p_collected_amount: inTransitAmount,
      p_staff_actor: 'driver_app',
    })
    await supabase.rpc('settle_delivery_trip_to_cashier_secure', { p_trip_id: inTransitTripId, p_cashier_actor: 'cashier_mostafa' })

    // ==========================================
    // TEST 5: Failed Delivery Outcome Collection Safety
    // ==========================================
    console.log('\n--- TEST 5: Failed Delivery Outcome Collection Safety ---')
    const { data: failedDelivOrd } = await supabase.rpc('create_manual_order_secure', {
      p_customer_name: 'عميل تعذر توصيله',
      p_customer_phone: '01044445566',
      p_order_type: 'delivery',
      p_payment_method: 'cash',
      p_delivery_address: 'العنوان المغلق شارع العريش',
      p_notes: 'اختبار عدم تحصيل نقدية عند فشل التوصيل',
      p_items: [{ variant_id: testVariant.id, quantity: 1, item_notes: '' }],
      p_daily_shift_id: activeShift.id,
      p_created_by_staff: 'operator',
    })
    const failedOrdId = failedDelivOrd![0].order_id
    await supabase.rpc('update_order_status_secure', { p_order_id: failedOrdId, p_expected_status: 'pending', p_new_status: 'processing' })
    await supabase.rpc('update_order_status_secure', { p_order_id: failedOrdId, p_expected_status: 'processing', p_new_status: 'ready' })
    const { data: assignFailed } = await supabase.rpc('assign_orders_to_driver_secure', {
      p_driver_id: testDriver.id,
      p_order_ids: [{ order_id: failedOrdId }],
    })
    const failedTripId = assignFailed![0].trip_id

    // Record failure
    const { data: failOutcomeRes, error: failOutcomeErr } = await supabase.rpc('record_delivery_outcome_secure', {
      p_order_id: failedOrdId,
      p_outcome: 'failed',
      p_failure_reason: 'العميل لا يرد على الهاتف والعنوان مغلق',
      p_collected_amount: 0.0,
      p_staff_actor: 'driver_app',
    })

    assert(!failOutcomeErr && failOutcomeRes?.[0]?.success === true, 'Recorded delivery failure outcome')

    const { data: failedOrdDb } = await supabase.from('orders').select('collection_status, status').eq('id', failedOrdId).single()
    const { data: failedOutcomeDb } = await supabase.from('delivery_outcomes').select('collected_amount, outcome').eq('order_id', failedOrdId).single()

    assert(failedOrdDb?.collection_status === 'uncollected', 'Failed delivery order collection_status remains "uncollected"')
    assert(failedOrdDb?.status === 'failed', 'Order business status transitioned to "failed"')
    assert(Number(failedOutcomeDb?.collected_amount) === 0, 'Collected amount for failed delivery is 0.00')

    // Settle failed trip (0 amount collected)
    const { data: settleFailedTripRes, error: settleFailedTripErr } = await supabase.rpc('settle_delivery_trip_to_cashier_secure', {
      p_trip_id: failedTripId,
      p_cashier_actor: 'cashier_mostafa',
      p_amount_received: 0.0,
    })

    assert(!settleFailedTripErr && settleFailedTripRes?.[0]?.success === true, 'Settling failed trip with 0 collected amount succeeds')

    // ==========================================
    // TEST 6: Trigger Guard against Illegal Backwards Transition
    // ==========================================
    console.log('\n--- TEST 6: Trigger Guard against Illegal Backwards Transition ---')
    const { error: illegalOrderUpdateErr } = await supabase
      .from('orders')
      .update({ collection_status: 'uncollected' })
      .eq('id', delivId) // already settled_to_cashier

    assert(Boolean(illegalOrderUpdateErr), 'Direct database downgrade of settled order to uncollected is blocked by trigger')

    const { error: illegalTripUpdateErr } = await supabase
      .from('delivery_trips')
      .update({ collection_status: 'uncollected' })
      .eq('id', tripId) // already settled_to_cashier

    assert(Boolean(illegalTripUpdateErr), 'Direct database downgrade of settled trip to uncollected is blocked by trigger')

    // ==========================================
    // TEST 7: Clean Shift End after All Trips Settled
    // ==========================================
    console.log('\n--- TEST 7: Clean Shift End after All Trips Settled ---')
    const { data: endShiftRes, error: endShiftErr } = await supabase.rpc('end_driver_shift_secure', {
      p_driver_id: testDriver.id,
    })

    assert(!endShiftErr && endShiftRes?.[0]?.success === true, 'Driver shift ended cleanly after all trips resolved and settled')

  } catch (err: any) {
    console.error('💥 Unhandled Exception in Test Suite:', err)
    failedCount++
  }

  console.log('\n==========================================')
  console.log(`🏁 [SUMMARY] Total Passed: ${passedCount} | Total Failed: ${failedCount}`)
  console.log('==========================================\n')

  if (failedCount > 0) {
    process.exit(1)
  }
}

runCollectionStateTests()
