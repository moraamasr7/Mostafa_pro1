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

async function runFinalDailyReportTestSuite() {
  console.log('===============================================================')
  console.log('🚀 FINAL DAILY REPORT (PRESENTATION LAYER) TEST SUITE')
  console.log('===============================================================\n')

  try {
    // 1. Fetch current active daily shift
    const { data: activeShifts, error: activeErr } = await supabase
      .from('daily_shifts')
      .select('*')
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)

    assert(!activeErr && activeShifts && activeShifts.length > 0, 'Step 1: Active open daily shift exists (#9)')
    const activeShift = activeShifts![0]
    console.log(`  ℹ️ Testing with Open Shift #${activeShift.shift_number} (${activeShift.id})`)

    // 2. Build Final Daily Report for Open Shift
    console.log('\n--- Test 2: Build Report for Open Shift ---')
    const openReport = await buildFinalDailyReport(supabase, activeShift.id)
    assert(openReport.metadata.layer_type === 'Presentation / Reporting Layer', 'Report layer_type is Presentation / Reporting Layer')
    assert(openReport.metadata.is_financial_source_of_truth === false, 'is_financial_source_of_truth is explicitly false')
    assert(openReport.shift.id === activeShift.id, 'Shift ID matches canonical UUID')
    assert(openReport.shift.shift_number === Number(activeShift.shift_number), 'Shift Number matches human-friendly ID')
    assert(openReport.shift.status === 'open', 'Shift status is open')
    assert(openReport.cash_reconciliation.reconciliation_status === 'pending_shift_close', 'Cash reconciliation is pending_shift_close for open shift')

    // 3. Verify Payment Breakdown Isolation in Open Report
    console.log('\n--- Test 3: Payment Breakdown Isolation ---')
    assert(
      openReport.financial_summary.non_cash_sales === Math.round((openReport.financial_summary.instapay_sales + openReport.financial_summary.wallet_sales + openReport.financial_summary.other_electronic_sales) * 100) / 100,
      'Non-cash sales correctly aggregates Instapay, Wallet, and Other Electronic'
    )
    console.log(`  ℹ️ Sales Breakdown: Total=${openReport.financial_summary.total_sales}, Cash=${openReport.financial_summary.cash_sales}, Instapay=${openReport.financial_summary.instapay_sales}, Wallet=${openReport.financial_summary.wallet_sales}, Non-cash=${openReport.financial_summary.non_cash_sales}`)

    // 4. Verify Cash Reconciliation Formula
    console.log('\n--- Test 4: Expected Cash Formula & Direct Traceability ---')
    const expectedFormula = Math.round((
      openReport.cash_reconciliation.initial_cash +
      openReport.cash_reconciliation.cash_sales_settled -
      openReport.cash_reconciliation.total_expenses
    ) * 100) / 100

    assert(
      openReport.cash_reconciliation.expected_cash_in_drawer === expectedFormula,
      `Expected Cash (${openReport.cash_reconciliation.expected_cash_in_drawer}) exactly equals Initial (${openReport.cash_reconciliation.initial_cash}) + Cash Sales (${openReport.cash_reconciliation.cash_sales_settled}) - Expenses (${openReport.cash_reconciliation.total_expenses})`
    )

    // 5. Verify Cash Custody Breakdown
    console.log('\n--- Test 5: Cash Custody Isolation ---')
    assert(typeof openReport.cash_custody.settled_to_cashier === 'number', 'settled_to_cashier is tracked as number')
    assert(typeof openReport.cash_custody.driver_custody_cash === 'number', 'driver_custody_cash is tracked as number')
    assert(typeof openReport.cash_custody.uncollected_cash === 'number', 'uncollected_cash is tracked as number')
    console.log(`  ℹ️ Cash Custody: Settled=${openReport.cash_custody.settled_to_cashier}, Driver Custody=${openReport.cash_custody.driver_custody_cash}, Uncollected=${openReport.cash_custody.uncollected_cash}`)

    // 6. Verify Expenses & Advances Breakdown
    console.log('\n--- Test 6: Expenses & Advances Separation ---')
    const expTotal = Math.round((
      openReport.expenses_summary.general_expenses +
      openReport.expenses_summary.driver_advances +
      openReport.expenses_summary.staff_advances
    ) * 100) / 100
    assert(openReport.expenses_summary.total_expenses === expTotal, 'Total expenses strictly equals general + driver advances + staff advances')

    // 7. Verify Closed Shift Report & Discrepancy Reconciliation
    console.log('\n--- Test 7: Closed Shift Report & Discrepancy Reconciliation ---')
    const { data: closedShifts, error: closedErr } = await supabase
      .from('daily_shifts')
      .select('*')
      .eq('status', 'closed')
      .order('closed_at', { ascending: false })
      .limit(1)

    assert(!closedErr && closedShifts && closedShifts.length > 0, 'Closed historical shift exists')
    if (closedShifts && closedShifts.length > 0) {
      const closedShift = closedShifts[0]
      const closedReport = await buildFinalDailyReport(supabase, closedShift.id)
      assert(closedReport.shift.status === 'closed', 'Closed shift report status is closed')
      assert(closedReport.shift.closed_at !== null, 'Closed shift report has closed_at')
      assert(
        ['balanced', 'surplus', 'deficit', 'closed_without_cash_count'].includes(closedReport.cash_reconciliation.reconciliation_status),
        `Closed shift reconciliation status is recognized (${closedReport.cash_reconciliation.reconciliation_status})`
      )
      console.log(`  ℹ️ Closed Shift #${closedShift.shift_number}: Expected=${closedReport.cash_reconciliation.expected_cash_in_drawer}, Actual=${closedReport.cash_reconciliation.actual_cash_in_drawer}, Discrepancy=${closedReport.cash_reconciliation.discrepancy}, Status=${closedReport.cash_reconciliation.reconciliation_status}`)
    }

    // 8. Verify Fleet Driver Summary & Details
    console.log('\n--- Test 8: Fleet Driver Summary & Per-Driver Details ---')
    assert(typeof openReport.fleet_summary.active_drivers_count === 'number', 'active_drivers_count is a valid number')
    assert(Array.isArray(openReport.fleet_summary.driver_details), 'driver_details is an array')
    if (openReport.fleet_summary.driver_details.length > 0) {
      const firstDriver = openReport.fleet_summary.driver_details[0]
      assert(typeof firstDriver.driver_id === 'string' && firstDriver.driver_id.length > 0, 'Driver detail has immutable driver_id UUID')
      assert(typeof firstDriver.driver_name === 'string', 'Driver detail has driver_name')
      assert(typeof firstDriver.net_payout === 'number', 'Driver detail has net_payout')
      console.log(`  ℹ️ Sample Driver Detail: ${firstDriver.driver_name} (UUID: ${firstDriver.driver_id}) - Net Payout: ${firstDriver.net_payout} EGP`)
    }

    // 9. Verify Traceability: Output equals canonical accounting engine output
    console.log('\n--- Test 9: Strict Traceability & 0 Calculation Drift ---')
    const canonicalAccounting = await calculateDailyShiftAccounting(supabase, activeShift.id)
    assert(openReport.financial_summary.total_sales === canonicalAccounting.total_sales, 'total_sales perfectly mirrors canonical accounting')
    assert(openReport.financial_summary.cash_sales === canonicalAccounting.cash_sales, 'cash_sales perfectly mirrors canonical accounting')
    assert(openReport.financial_summary.instapay_sales === canonicalAccounting.instapay_sales, 'instapay_sales perfectly mirrors canonical accounting')
    assert(openReport.financial_summary.wallet_sales === canonicalAccounting.wallet_sales, 'wallet_sales perfectly mirrors canonical accounting')
    assert(openReport.cash_reconciliation.expected_cash_in_drawer === canonicalAccounting.system_expected_cash, 'expected_cash perfectly mirrors canonical accounting')
    assert(openReport.expenses_summary.total_expenses === canonicalAccounting.total_expenses, 'total_expenses perfectly mirrors canonical accounting')

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

runFinalDailyReportTestSuite()
