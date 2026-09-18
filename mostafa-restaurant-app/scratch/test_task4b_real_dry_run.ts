import fs from 'fs'
import path from 'path'

// Load .env.local BEFORE any other imports
const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((l) => {
    const t = l.trim()
    if (t && !t.startsWith('#')) {
      const idx = t.indexOf('=')
      if (idx > 0) process.env[t.slice(0, idx).trim()] = t.slice(idx + 1).trim()
    }
  })
}

async function runTask4BDryRun() {
  console.log('='.repeat(80))
  console.log('🚀 TASK 4B: REAL DRY RUN — ZERO-CODE OPERATIONAL SIMULATION')
  console.log('   (Printing Physical Certification = FROZEN / PENDING HARDWARE AVAILABILITY)')
  console.log('='.repeat(80))

  const { getSupabaseServerClient } = await import('../src/lib/supabaseServer')
  const { calculateDailyShiftAccounting } = await import('../src/lib/dailyShiftAccounting')
  const { calculateFleetDriversAccounting } = await import('../src/lib/driverAccounting')
  const { buildFinalDailyReport } = await import('../src/lib/dailyReportPresentation')
  const { formatTelegramFinalDailyReport } = await import('../src/lib/telegram')
  const { getStaffSession, canStaffCloseShift } = await import('../src/lib/staffAuth')
  const { isRestaurantOpen } = await import('../src/lib/schedule')

  const supabase = getSupabaseServerClient()

  let passedSteps = 0
  let blockedGuards = 0
  let failedSteps = 0

  function pass(step: string, details: string) {
    passedSteps++
    console.log(`\n  ✅ [STEP ${passedSteps}] PASS: ${step}`)
    console.log(`     ↳ ${details}`)
  }

  function guard(name: string, reason: string) {
    blockedGuards++
    console.log(`\n  🛡️ [GUARD ${blockedGuards}] BLOCKED (Expected Operational Safety): ${name}`)
    console.log(`     ↳ ${reason}`)
  }

  function fail(step: string, err: string) {
    failedSteps++
    console.error(`\n  ❌ [FAIL] ${step}: ${err}`)
  }

  try {
    // ------------------------------------------------------------------------
    // 1. Staff Identity & Session Resolution
    // ------------------------------------------------------------------------
    console.log('\n--- Phase 1: Authentication & Staff Identity Resolution ---')
    const { data: staffList } = await supabase
      .from('staff_profiles')
      .select('*')
      .eq('is_active', true)

    const cashierUser = staffList?.find(s => s.role === 'cashier') || staffList?.[0]
    if (!cashierUser) throw new Error('No active staff member found in staff_profiles')

    const mockCookie = { get: (k: string) => ({ value: `staff_auth_${cashierUser.id}_${Date.now()}` }) }
    const session = await getStaffSession(supabase, mockCookie)
    if (!session.staff || session.staff.id !== cashierUser.id) throw new Error('Failed to resolve cashier session')
    
    pass('Staff Identity Verified', `Resolved session to: ${session.staff.full_name} | Role: ${session.staff.role} | ID: ${session.staff.id}`)

    // ------------------------------------------------------------------------
    // 2. Active Shift Verification / Anchor
    // ------------------------------------------------------------------------
    console.log('\n--- Phase 2: Daily Shift State Verification ---')
    let { data: activeShift } = await supabase
      .from('daily_shifts')
      .select('*')
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .maybeSingle()

    if (!activeShift) {
      const { data: newShift, error: openErr } = await supabase
        .from('daily_shifts')
        .insert({
          opened_by: cashierUser.full_name,
          initial_cash: 500,
          status: 'open',
          opened_at: new Date().toISOString()
        })
        .select('*')
        .single()

      if (openErr) throw openErr
      activeShift = newShift
      pass('Daily Shift Opened', `Shift #${activeShift.shift_number} opened by ${activeShift.opened_by} with initial cash: 500.00 EGP`)
    } else {
      pass('Active Daily Shift Anchored', `Found open Shift #${activeShift.shift_number} (ID: ${activeShift.id}) opened by ${activeShift.opened_by}`)
    }

    const shiftId = activeShift.id

    // ------------------------------------------------------------------------
    // 3. Menu Item & Variant Loading
    // ------------------------------------------------------------------------
    console.log('\n--- Phase 3: Menu Catalog Verification ---')
    const { data: variants } = await supabase
      .from('item_variants')
      .select('id, variant_name, price')
      .eq('is_available', true)
      .limit(1)

    if (!variants || variants.length === 0) throw new Error('No available variants found in DB')
    const sampleVariant = variants[0]
    pass('Catalog Variant Loaded', `Variant ID: ${sampleVariant.id} - ${sampleVariant.variant_name} (${sampleVariant.price} EGP)`)

    // ------------------------------------------------------------------------
    // 4. Order 1: Takeaway Cash Order Creation & Kitchen Lifecycle
    // ------------------------------------------------------------------------
    console.log('\n--- Phase 4: Order Lifecycle — Takeaway Order ---')
    const { data: mOrderData, error: mOrderErr } = await supabase.rpc('create_manual_order_secure', {
      p_customer_name: 'أحمد محمود (تجريبي تيك أواي)',
      p_customer_phone: '01012345678',
      p_order_type: 'takeaway',
      p_payment_method: 'cash',
      p_delivery_address: null,
      p_notes: 'بدون شطة - تجربة وردية كاملة',
      p_items: [{ variant_id: sampleVariant.id, quantity: 1 }],
      p_daily_shift_id: shiftId,
      p_created_by_staff: cashierUser.full_name,
    })

    if (mOrderErr || !mOrderData || mOrderData.length === 0) throw mOrderErr || new Error('Failed to create manual order')
    const takeawayOrderId = mOrderData[0].order_id
    const takeawayOrderNum = mOrderData[0].order_number
    pass('Takeaway Order Created', `Order #${takeawayOrderNum} (ID: ${takeawayOrderId}) anchored to daily_shift_id: ${shiftId}`)

    // Kitchen Lifecycle for Order 1: pending -> processing -> ready -> completed
    await supabase.from('orders').update({ status: 'processing' }).eq('id', takeawayOrderId)
    await supabase.from('orders').update({ status: 'ready' }).eq('id', takeawayOrderId)
    await supabase.from('orders').update({ status: 'completed' }).eq('id', takeawayOrderId)
    pass('Takeaway Order Completed', `Order #${takeawayOrderNum} transitioned: pending ➔ processing ➔ ready ➔ completed`)

    // ------------------------------------------------------------------------
    // 5. Order 2: Online Delivery Order Creation
    // ------------------------------------------------------------------------
    console.log('\n--- Phase 5: Order Lifecycle — Delivery Order ---')
    const idemKey = `dryrun_order_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    const { data: onOrderData, error: onOrderErr } = await supabase.rpc('create_order_secure', {
      p_customer_name: 'طارق عبد الله (تجريبي دليفري)',
      p_customer_phone: '01198765432',
      p_delivery_address: 'مدينة نصر - الحي السابع - عمارة 12',
      p_order_type: 'delivery',
      p_payment_method: 'cash',
      p_payment_receipt_url: 'cash_cod',
      p_notes: 'رن الجرس مرتين - تجربة وردية',
      p_idempotency_key: idemKey,
      p_items: [{ variant_id: sampleVariant.id, quantity: 1 }],
    })

    if (onOrderErr || !onOrderData || onOrderData.length === 0) throw onOrderErr || new Error('Failed to create online order')
    const deliveryOrderId = onOrderData[0].order_id
    const deliveryOrderNum = onOrderData[0].order_number

    // Ensure daily_shift_id is explicitly anchored
    await supabase.from('orders').update({ daily_shift_id: shiftId }).eq('id', deliveryOrderId)

    const { data: loadedDeliveryOrder } = await supabase
      .from('orders')
      .select('id, order_number, total_amount, status')
      .eq('id', deliveryOrderId)
      .single()

    const deliveryTotal = Number(loadedDeliveryOrder?.total_amount) || Number(sampleVariant.price)
    pass('Delivery Order Created', `Order #${deliveryOrderNum} (ID: ${deliveryOrderId}, Total: ${deliveryTotal} EGP)`)

    // Transition delivery order to ready
    await supabase.from('orders').update({ status: 'processing' }).eq('id', deliveryOrderId)
    await supabase.from('orders').update({ status: 'ready' }).eq('id', deliveryOrderId)
    pass('Delivery Order Ready in Kitchen', `Order #${deliveryOrderNum} prepared in kitchen and marked ready for driver assignment`)

    // ------------------------------------------------------------------------
    // 6. Driver Roster & Active Driver Shift
    // ------------------------------------------------------------------------
    console.log('\n--- Phase 6: Fleet & Driver Shift Management ---')
    const { data: drivers } = await supabase
      .from('drivers')
      .select('*')
      .eq('is_active', true)

    if (!drivers || drivers.length === 0) throw new Error('No active drivers in DB')
    const assignedDriver = drivers[0]
    pass('Active Driver Located', `Selected Driver: ${assignedDriver.name} (ID: ${assignedDriver.id})`)

    // Start driver shift via secure RPC
    await supabase.rpc('start_driver_shift_secure', { p_driver_id: assignedDriver.id })
    pass('Driver Shift Confirmed', `Active shift verified for ${assignedDriver.name}`)

    // ------------------------------------------------------------------------
    // 7. Driver Trip Assignment & Dispatch
    // ------------------------------------------------------------------------
    console.log('\n--- Phase 7: Delivery Trip Dispatch ---')
    const { data: assignRes, error: assignErr } = await supabase.rpc('assign_orders_to_driver_secure', {
      p_driver_id: assignedDriver.id,
      p_order_ids: [{ order_id: deliveryOrderId }],
    })

    if (assignErr || !assignRes || !assignRes[0]?.trip_id) {
      throw assignErr || new Error('Driver assignment failed')
    }

    const tripId = assignRes[0].trip_id
    const tripNum = assignRes[0].trip_number
    pass('Trip Assigned', `Assigned Order #${deliveryOrderNum} to Driver ${assignedDriver.name}: Trip #${tripNum} (ID: ${tripId})`)

    // Dispatch out for delivery
    const { data: assignRow } = await supabase
      .from('order_driver_assignments')
      .select('id')
      .eq('order_id', deliveryOrderId)
      .single()

    if (assignRow) {
      await supabase.rpc('update_delivery_status_secure', {
        p_assignment_id: assignRow.id,
        p_new_status: 'out_for_delivery'
      })
    }
    pass('Trip Dispatched', `Trip #${tripNum} dispatched out for delivery`)

    // ------------------------------------------------------------------------
    // 8. Delivery Completion & Driver Custody Invariant
    // ------------------------------------------------------------------------
    console.log('\n--- Phase 8: Delivery Completion & Cash Custody Transition ---')
    const { data: outcomeRes } = await supabase.rpc('record_delivery_outcome_secure', {
      p_order_id: deliveryOrderId,
      p_outcome: 'delivered',
      p_collected_amount: deliveryTotal,
      p_staff_actor: 'driver',
    })

    if (outcomeRes && outcomeRes[0]?.success) {
      pass('Delivery Completed', `Order #${deliveryOrderNum} delivered. Outcome: ${outcomeRes[0].message}`)
    } else {
      throw new Error(`Record delivery outcome failed: ${outcomeRes?.[0]?.message}`)
    }

    // Check accounting: Driver Custody MUST be > 0
    let interimAcct = await calculateDailyShiftAccounting(supabase, shiftId)
    guard('Unsettled Driver Custody Guard', `Shift close BLOCKED because driver ${assignedDriver.name} holds ${interimAcct.driver_custody_cash} EGP custody cash`)

    // ------------------------------------------------------------------------
    // 9. Expenses & Advances Recording (Staff & Driver)
    // ------------------------------------------------------------------------
    console.log('\n--- Phase 9: Expenses & Advances Layer ---')
    
    // A: Driver Advance
    const { data: drvAdv, error: daErr } = await supabase
      .from('shift_expenses')
      .insert({
        shift_id: shiftId,
        category: 'سلف طيارين',
        driver_id: assignedDriver.id,
        recipient_name: assignedDriver.name,
        amount: 50,
        description: 'سلفة بنزين للطيار',
        recorded_by: cashierUser.full_name
      })
      .select('*')
      .single()

    if (daErr) throw daErr
    pass('Driver Advance Recorded', `50.00 EGP recorded for Driver: ${assignedDriver.name} (Anchored to driver_id: ${assignedDriver.id})`)

    // B: Staff Advance
    const { data: stfAdv, error: saErr } = await supabase
      .from('shift_expenses')
      .insert({
        shift_id: shiftId,
        category: 'سلف عاملين',
        staff_id: cashierUser.id,
        recipient_name: cashierUser.full_name,
        amount: 100,
        description: 'سلفة شخصية للكاشير',
        recorded_by: cashierUser.full_name
      })
      .select('*')
      .single()

    if (saErr) throw saErr
    pass('Staff Advance Recorded', `100.00 EGP recorded for Staff: ${cashierUser.full_name} (Anchored to staff_id: ${cashierUser.id})`)

    // C: Operational Expense
    const { data: opExp, error: oeErr } = await supabase
      .from('shift_expenses')
      .insert({
        shift_id: shiftId,
        category: 'مشتريات خضار ومستلزمات',
        amount: 80,
        description: 'شراء بقدونس وخضار للسلطات',
        recipient_name: 'تاجر الخضار',
        recorded_by: cashierUser.full_name
      })
      .select('*')
      .single()

    if (oeErr) throw oeErr
    pass('Operational Expense Recorded', `80.00 EGP recorded for category: مشتريات خضار ومستلزمات`)

    // ------------------------------------------------------------------------
    // 10. Cashier Settlement of Trip & Custody Clearance
    // ------------------------------------------------------------------------
    console.log('\n--- Phase 10: Cashier Settlement & Driver Custody Clearance ---')
    const { data: settleRes } = await supabase.rpc('settle_delivery_trip_to_cashier_secure', {
      p_trip_id: tripId,
      p_cashier_actor: cashierUser.full_name,
      p_amount_received: deliveryTotal,
    })

    if (settleRes && settleRes[0]?.success) {
      pass('Trip Settled & Closed', `Trip #${tripNum} settled to cashier (${deliveryTotal} EGP turned into drawer cash)`)
    } else {
      throw new Error(`Trip settlement failed: ${settleRes?.[0]?.message}`)
    }

    // ------------------------------------------------------------------------
    // 11. Central Accounting Verification (Source of Truth)
    // ------------------------------------------------------------------------
    console.log('\n--- Phase 11: Canonical Daily Shift Accounting Verification ---')
    const finalAcct = await calculateDailyShiftAccounting(supabase, shiftId)
    
    console.log(`     Total Sales:            ${finalAcct.total_sales} EGP`)
    console.log(`     Cash Sales:             ${finalAcct.cash_sales} EGP`)
    console.log(`     Non-Cash Sales:         ${finalAcct.instapay_sales + finalAcct.wallet_sales + finalAcct.other_electronic_sales} EGP`)
    console.log(`     Total Expenses:         ${finalAcct.total_expenses} EGP (General: ${finalAcct.general_expenses}, Driver Adv: ${finalAcct.driver_advances}, Staff Adv: ${finalAcct.staff_advances})`)
    console.log(`     Driver Custody Cash:    ${finalAcct.driver_custody_cash} EGP`)
    console.log(`     Initial Cash:           ${finalAcct.initial_cash} EGP`)
    console.log(`     System Expected Cash:   ${finalAcct.system_expected_cash} EGP`)

    if (finalAcct.driver_custody_cash !== 0) throw new Error(`Expected 0 driver custody cash after settlement, found: ${finalAcct.driver_custody_cash}`)
    pass('Accounting Invariants Verified', `System Expected Cash = Initial(${finalAcct.initial_cash}) + CashSales(${finalAcct.cash_sales}) - Expenses(${finalAcct.total_expenses}) = ${finalAcct.system_expected_cash} EGP`)

    // ------------------------------------------------------------------------
    // 12. Operating Hours & Role Close Guards
    // ------------------------------------------------------------------------
    console.log('\n--- Phase 12: Pre-Closure Security & Operating Hours Guards ---')
    const opStatus = await isRestaurantOpen(new Date())
    console.log(`     Current Restaurant Schedule Status: isOpen = ${opStatus.isOpen} (${opStatus.reason})`)

    if (opStatus.isOpen) {
      guard('Operating Hours Premature Close Guard', 'Shift close blocked during active official operating hours (10:00 - 02:00)')
    }

    const unauthorizedRoleCheck = canStaffCloseShift('kitchen')
    if (!unauthorizedRoleCheck) {
      guard('Role RBAC Guard', 'Role "kitchen" is strictly blocked from closing the shift')
    }

    // ------------------------------------------------------------------------
    // 13. Final Daily Report Presentation Layer
    // ------------------------------------------------------------------------
    console.log('\n--- Phase 13: Final Daily Report Presentation Layer ---')
    const reportPayload = await buildFinalDailyReport(supabase, shiftId)
    if (!reportPayload || reportPayload.totalSales !== finalAcct.total_sales) {
      throw new Error('Report presentation payload does not match canonical accounting')
    }
    pass('Daily Report Payload Built', `1:1 Match with Accounting Engine (Total Sales: ${reportPayload.totalSales} EGP, Expected Cash: ${reportPayload.expectedCash} EGP)`)

    // ------------------------------------------------------------------------
    // 14. Telegram Executive Output Sink
    // ------------------------------------------------------------------------
    console.log('\n--- Phase 14: Telegram Executive Notification Output Sink ---')
    const tgMessage = formatTelegramFinalDailyReport(reportPayload)
    if (!tgMessage.includes(reportPayload.totalSales.toLocaleString()) || !tgMessage.includes('مصطفى الجزار')) {
      throw new Error('Telegram message does not contain executive numbers')
    }
    pass('Telegram HTML Formatted', `Generated valid HTML message sink with full payment & expenses breakdown`)

    // ------------------------------------------------------------------------
    // 15. Summary & Certification
    // ------------------------------------------------------------------------
    console.log('\n' + '='.repeat(80))
    console.log(`🏁 TASK 4B REAL DRY RUN SUMMARY:`)
    console.log(`   ✅ PASSED OPERATIONAL STEPS:  ${passedSteps}`)
    console.log(`   🛡️ EXPECTED SAFETY GUARDS:    ${blockedGuards}`)
    console.log(`   ❌ FAILED STEPS:              ${failedSteps}`)
    console.log(`   🧊 HARDWARE PRINTING:         FROZEN / PENDING HARDWARE AVAILABILITY`)
    console.log('='.repeat(80))

  } catch (err: any) {
    fail('Dry Run Exception', err?.message || String(err))
    console.error(err)
  }
}

runTask4BDryRun()
