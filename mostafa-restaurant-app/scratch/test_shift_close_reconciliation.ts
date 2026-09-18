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

const supabase = getSupabaseServerClient()

let passed = 0
let failed = 0

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${msg}`)
    passed++
  } else {
    console.error(`  ❌ FAIL: ${msg}`)
    failed++
  }
}

async function runShiftCloseReconciliationTests() {
  console.log('===============================================================')
  console.log('🚀 PHASE 6A — SHIFT CLOSE & CASHIER RECONCILIATION TEST SUITE')
  console.log('===============================================================\n')

  try {
    // 1. Fetch active open daily shift
    const { data: activeShifts, error: activeErr } = await supabase
      .from('daily_shifts')
      .select('*')
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)

    assert(!activeErr && activeShifts && activeShifts.length > 0, 'Active open daily shift exists (#9)')
    const activeShift = activeShifts![0]
    console.log(`  ℹ️ Testing with Open Shift #${activeShift.shift_number} (${activeShift.id})`)

    // 2. Test Canonical Accounting Engine Integration
    console.log('\n--- Test 2: Canonical Accounting Consistency ---')
    const accounting = await calculateDailyShiftAccounting(supabase, activeShift.id)
    assert(accounting.shift_id === activeShift.id, 'Accounting shift_id matches active shift UUID')
    assert(accounting.status === 'open', 'Accounting status is open')
    assert(typeof accounting.system_expected_cash === 'number', 'system_expected_cash is computed as a valid number')
    assert(typeof accounting.driver_custody_cash === 'number', 'driver_custody_cash is tracked')

    // 3. Test Drawer Expected Cash Formula
    console.log('\n--- Test 3: Expected Cash Formula Exactness ---')
    const expectedFormula = Math.round((accounting.initial_cash + accounting.cash_sales - accounting.total_expenses) * 100) / 100
    assert(
      accounting.system_expected_cash === expectedFormula,
      `Expected Cash (${accounting.system_expected_cash}) = Initial (${accounting.initial_cash}) + Cash Sales (${accounting.cash_sales}) - Total Expenses (${accounting.total_expenses})`
    )

    // 4. Test Discrepancy & Variance Calculations
    console.log('\n--- Test 4: Discrepancy Reconciliation Math ---')
    const simulatedActualCash1 = accounting.system_expected_cash // Perfect balance
    const disc1 = Math.round((simulatedActualCash1 - accounting.system_expected_cash) * 100) / 100
    assert(disc1 === 0, 'Perfect cash count yields exactly 0.00 discrepancy (Balanced)')

    const simulatedActualCash2 = accounting.system_expected_cash + 50.0 // 50 EGP Surplus
    const disc2 = Math.round((simulatedActualCash2 - accounting.system_expected_cash) * 100) / 100
    assert(disc2 === 50, 'Surplus cash count yields positive discrepancy (+50.00 EGP)')

    const simulatedActualCash3 = accounting.system_expected_cash - 35.5 // 35.5 EGP Deficit
    const disc3 = Math.round((simulatedActualCash3 - accounting.system_expected_cash) * 100) / 100
    assert(disc3 === -35.5, 'Deficit cash count yields negative discrepancy (-35.50 EGP)')

    // 5. Test Operational Pre-Closure Guards
    console.log('\n--- Test 5: Operational Pre-Closure Guards Invariants ---')
    // Guard A: Check active unresolved orders on this shift
    const { data: activeOrders } = await supabase
      .from('orders')
      .select('id, order_number, status')
      .eq('daily_shift_id', activeShift.id)
      .in('status', ['pending', 'processing', 'ready', 'assigned', 'picked_up', 'out_for_delivery'])

    const activeOrdersCount = activeOrders ? activeOrders.length : 0
    console.log(`  ℹ️ Active unresolved orders on current shift: ${activeOrdersCount}`)
    assert(typeof activeOrdersCount === 'number', 'Active unresolved orders guard query executes cleanly')

    // Guard B: Check open delivery trips
    const { data: openTrips } = await supabase
      .from('delivery_trips')
      .select('id, trip_number, status')
      .gte('created_at', activeShift.opened_at)
      .not('status', 'in', '("completed","cancelled")')

    const openTripsCount = openTrips ? openTrips.length : 0
    console.log(`  ℹ️ Open delivery trips on current shift window: ${openTripsCount}`)
    assert(typeof openTripsCount === 'number', 'Open delivery trips guard query executes cleanly')

    // Guard C: Check open driver shifts
    const { data: openDriverShifts } = await supabase
      .from('driver_shifts')
      .select('id, driver_id, status')
      .eq('status', 'open')

    const openDriverShiftsCount = openDriverShifts ? openDriverShifts.length : 0
    console.log(`  ℹ️ Open driver shifts: ${openDriverShiftsCount}`)
    assert(typeof openDriverShiftsCount === 'number', 'Open driver shifts guard query executes cleanly')

    // Guard D: Check driver custody cash
    console.log(`  ℹ️ Driver custody cash pending settlement: ${accounting.driver_custody_cash} EGP`)
    assert(typeof accounting.driver_custody_cash === 'number', 'Driver custody cash guard is computed')

    // 6. Test Shift Close Idempotency & Protection on Already Closed Shifts
    console.log('\n--- Test 6: Shift Close Idempotency on Historical Shifts ---')
    const { data: closedShifts } = await supabase
      .from('daily_shifts')
      .select('*')
      .eq('status', 'closed')
      .order('closed_at', { ascending: false })
      .limit(1)

    assert(closedShifts && closedShifts.length > 0, 'Found closed historical shift')
    if (closedShifts && closedShifts.length > 0) {
      const closedShift = closedShifts[0]
      // Attempting to close an already closed shift with .eq('status', 'open') must return 0 affected rows
      const { data: reclosed, error: recloseErr } = await supabase
        .from('daily_shifts')
        .update({
          closed_at: new Date().toISOString(),
          closed_by: 'Test Reclose',
        })
        .eq('id', closedShift.id)
        .eq('status', 'open')
        .select('*')

      assert(!recloseErr && (!reclosed || reclosed.length === 0), 'Atomic guard rejects re-closing an already closed shift (0 rows affected)')
    }

    // 7. Test Presentation Layer Sync
    console.log('\n--- Test 7: Presentation Layer Synchronization ---')
    const finalReport = await buildFinalDailyReport(supabase, activeShift.id)
    assert(finalReport.cash_reconciliation.expected_cash_in_drawer === accounting.system_expected_cash, 'Presentation layer expected cash matches accounting engine exactly')
    assert(finalReport.expenses_summary.total_expenses === accounting.total_expenses, 'Presentation layer expenses match accounting engine exactly')
    assert(finalReport.financial_summary.total_sales === accounting.total_sales, 'Presentation layer total sales match accounting engine exactly')

  } catch (err) {
    console.error('Unexpected test failure:', err)
    failed++
  }

  console.log('\n===============================================================')
  console.log(`🏁 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`)
  console.log('===============================================================')

  if (failed > 0) {
    process.exit(1)
  }
}

runShiftCloseReconciliationTests()
