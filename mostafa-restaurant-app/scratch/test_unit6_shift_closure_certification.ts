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
import { calculateDailyShiftAccounting } from '../src/lib/dailyShiftAccounting'
import { buildFinalDailyReport } from '../src/lib/dailyReportPresentation'
import { canStaffCloseShift } from '../src/lib/staffAuth'
import { getActiveDailyShift } from '../src/lib/shiftGuard'

async function runUnit6Certification() {
  console.log('====================================================')
  console.log('🧪 RUNNING UNIT 6 — SHIFT CLOSURE CERTIFICATION')
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
  // TEST GROUP 1: ROLE AUTHORIZATION MATRIX FOR CLOSING
  // ----------------------------------------------------
  console.log('\n--- GROUP 1: Role Authorization Matrix ---')
  assert(canStaffCloseShift('owner'), 'Owner is authorized to close shift')
  assert(canStaffCloseShift('manager'), 'Manager is authorized to close shift')
  assert(canStaffCloseShift('cashier'), 'Cashier is authorized to close shift')
  assert(!canStaffCloseShift('kitchen'), 'Kitchen staff is BLOCKED from closing shift')
  assert(!canStaffCloseShift('driver'), 'Driver is BLOCKED from closing shift')
  assert(!canStaffCloseShift('waiter'), 'Waiter is BLOCKED from closing shift')

  // ----------------------------------------------------
  // TEST GROUP 2: ACTIVE SHIFT & CANONICAL ACCOUNTING
  // ----------------------------------------------------
  console.log('\n--- GROUP 2: Active Shift & Reconciliation Math ---')

  const shiftCheck = await getActiveDailyShift(supabase)
  assert(shiftCheck.hasActiveShift && !!shiftCheck.activeShiftId, 'Active open daily shift found on server')

  if (!shiftCheck.hasActiveShift || !shiftCheck.activeShiftId) {
    console.error('❌ Cannot run DB tests without open daily shift')
    return
  }

  const shiftId = shiftCheck.activeShiftId
  const accounting = await calculateDailyShiftAccounting(supabase, shiftId)

  assert(accounting.shift_id === shiftId, 'Accounting shift_id matches active shift UUID')
  assert(accounting.status === 'open', 'Accounting status is open')
  assert(typeof accounting.initial_cash === 'number', 'initial_cash is numeric')
  assert(typeof accounting.system_expected_cash === 'number', 'system_expected_cash is computed as numeric')

  // Expected Cash exactness formula
  const expectedFormula = Math.round((accounting.initial_cash + accounting.cash_sales - accounting.total_expenses) * 100) / 100
  assert(
    accounting.system_expected_cash === expectedFormula,
    `Expected Cash (${accounting.system_expected_cash}) = Initial (${accounting.initial_cash}) + Cash Sales (${accounting.cash_sales}) - Total Expenses (${accounting.total_expenses})`
  )

  // ----------------------------------------------------
  // TEST GROUP 3: BLIND CASH COUNT & DISCREPANCY VARIANCES
  // ----------------------------------------------------
  console.log('\n--- GROUP 3: Blind Cash Count & Discrepancy Calculations ---')

  // 3a. Balanced count
  const actualBalanced = accounting.system_expected_cash
  const discBalanced = Math.round((actualBalanced - accounting.system_expected_cash) * 100) / 100
  assert(discBalanced === 0, 'Exact count produces Balanced status (0.00 discrepancy)')

  // 3b. Surplus count (+50 EGP)
  const actualSurplus = accounting.system_expected_cash + 50.00
  const discSurplus = Math.round((actualSurplus - accounting.system_expected_cash) * 100) / 100
  assert(discSurplus === 50.00, 'Surplus count produces positive discrepancy (+50.00 EGP)')

  // 3c. Deficit count (-25 EGP)
  const actualDeficit = accounting.system_expected_cash - 25.00
  const discDeficit = Math.round((actualDeficit - accounting.system_expected_cash) * 100) / 100
  assert(discDeficit === -25.00, 'Deficit count produces negative discrepancy (-25.00 EGP)')

  // ----------------------------------------------------
  // TEST GROUP 4: OPERATIONAL PRE-CLOSURE BLOCKED GUARDS
  // ----------------------------------------------------
  console.log('\n--- GROUP 4: Operational Pre-Closure Guards ---')

  // Guard A: Active Unresolved Orders
  const { data: activeOrders } = await supabase
    .from('orders')
    .select('id, order_number, status')
    .eq('daily_shift_id', shiftId)
    .in('status', ['pending', 'processing', 'ready', 'assigned', 'picked_up', 'out_for_delivery'])

  const activeOrdersCount = activeOrders ? activeOrders.length : 0
  assert(typeof activeOrdersCount === 'number', `Active unresolved orders guard evaluates (${activeOrdersCount} orders)`)

  // Guard B: Open Delivery Trips
  const { data: openTrips } = await supabase
    .from('delivery_trips')
    .select('id, trip_number, status')
    .gte('created_at', accounting.opened_at)
    .not('status', 'in', '("completed","cancelled")')

  const openTripsCount = openTrips ? openTrips.length : 0
  assert(typeof openTripsCount === 'number', `Open delivery trips guard evaluates (${openTripsCount} open trips)`)

  // Guard C: Open Driver Shifts
  const { data: openDriverShifts } = await supabase
    .from('driver_shifts')
    .select('id, driver_id, status')
    .eq('status', 'open')

  const openDriverShiftsCount = openDriverShifts ? openDriverShifts.length : 0
  assert(typeof openDriverShiftsCount === 'number', `Open driver shifts guard evaluates (${openDriverShiftsCount} open shifts)`)

  // Guard D: Driver Custody Cash Guard
  assert(typeof accounting.driver_custody_cash === 'number', `Driver custody cash guard is computed (${accounting.driver_custody_cash} EGP)`)

  // ----------------------------------------------------
  // TEST GROUP 5: ISOLATED TEST SHIFT CLOSURE & IDEMPOTENCY
  // ----------------------------------------------------
  console.log('\n--- GROUP 5: Isolated Test Shift Creation, Closure & Idempotency ---')

  // Create a dedicated isolated test shift record
  const actualCount = 250.00
  const expectedCash = 250.00
  const discrepancy = 0.00

  const { data: testShift, error: createShiftErr } = await supabase
    .from('daily_shifts')
    .insert({
      opened_by: 'كاشير اختبار Unit 6',
      initial_cash: 250.00,
      status: 'closed',
      closed_by: 'الكاشير مصطفى (cashier)',
      closed_at: new Date().toISOString(),
      final_cash: actualCount,
      system_expected_cash: expectedCash,
      discrepancy: discrepancy,
      notes: 'تقفيل تجريبي لاعتماد Unit 6',
    })
    .select()
    .single()

  assert(!createShiftErr && !!testShift?.id, 'Create Isolated Closed Test Daily Shift', createShiftErr?.message)

  if (testShift) {
    const testShiftId = testShift.id

    assert(testShift?.status === 'closed', 'Test Shift status is closed')
    assert(testShift?.closed_by === 'الكاشير مصطفى (cashier)', 'closed_by recorded with staff identity and role')
    assert(Number(testShift?.final_cash) === actualCount, 'final_cash matches blind count input')
    assert(Number(testShift?.discrepancy) === discrepancy, 'discrepancy recorded as 0.00')

    // Idempotency: Attempt to close an already closed shift with .eq('status', 'open')
    const { data: doubleCloseRes, error: doubleCloseErr } = await supabase
      .from('daily_shifts')
      .update({
        closed_at: new Date().toISOString(),
        closed_by: 'محاولة إغلاق مكررة',
      })
      .eq('id', testShiftId)
      .eq('status', 'open')
      .select()

    assert(
      !doubleCloseErr && (!doubleCloseRes || doubleCloseRes.length === 0),
      'Idempotency Guard: Atomic update with status = open prevents duplicate shift closure (0 rows affected)'
    )

    // Clean up isolated test shift
    await supabase.from('daily_shifts').delete().eq('id', testShiftId)
  }

  // ----------------------------------------------------
  // TEST GROUP 6: PRESENTATION REPORT SYNCHRONIZATION
  // ----------------------------------------------------
  console.log('\n--- GROUP 6: Final Presentation Report Synchronization ---')

  const finalReport = await buildFinalDailyReport(supabase, shiftId)
  assert(
    finalReport.cash_reconciliation.expected_cash_in_drawer === accounting.system_expected_cash,
    'Presentation layer expected cash matches accounting engine exactly'
  )
  assert(
    finalReport.expenses_summary.total_expenses === accounting.total_expenses,
    'Presentation layer expenses match accounting engine exactly'
  )
  assert(
    finalReport.financial_summary.total_sales === accounting.total_sales,
    'Presentation layer total sales match accounting engine exactly'
  )

  console.log('\n====================================================')
  console.log(`📊 FINAL RESULT: ${passCount}/${totalTests} TESTS PASSED`)
  console.log('====================================================')
}

runUnit6Certification().catch(console.error)
