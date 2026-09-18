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
import { buildFinalDailyReport, FinalDailyReportPayload } from '../src/lib/dailyReportPresentation'
import {
  formatTelegramFinalDailyReport,
  sendTelegramFinalDailyReport,
  notifyShiftOpened,
  notifyExpenseRecorded,
  notifyOrderCancelled,
  notifyNewOrder,
  sendExecutiveDailyReport,
  notifyShiftClosed
} from '../src/lib/telegram'

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

async function runTelegramExecutiveReportingTests() {
  console.log('===============================================================')
  console.log('🚀 PHASE 6B — TELEGRAM EXECUTIVE REPORTING TEST SUITE')
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

    // 2. Build Final Daily Report Payload
    const report: FinalDailyReportPayload = await buildFinalDailyReport(supabase, activeShift.id)
    assert(report.shift.id === activeShift.id, 'FinalDailyReport built successfully')

    // 3. Test formatTelegramFinalDailyReport 1:1 Number Reconciliation
    console.log('\n--- Test 3: 1:1 Number Reconciliation with Telegram Output ---')
    const telegramMessage = formatTelegramFinalDailyReport(report)
    assert(typeof telegramMessage === 'string' && telegramMessage.length > 100, 'Telegram message formatted as HTML string')

    // Check shift metadata
    assert(telegramMessage.includes(`#${report.shift.shift_number}`), 'Telegram message includes exact shift number')
    assert(telegramMessage.includes(report.shift.opened_by), 'Telegram message includes opened_by name')

    // Check sales breakdown
    assert(telegramMessage.includes(Number(report.financial_summary.total_sales).toLocaleString()), 'Telegram message contains exact total sales')
    assert(telegramMessage.includes(Number(report.financial_summary.cash_sales).toLocaleString()), 'Telegram message contains exact cash sales')
    assert(telegramMessage.includes(Number(report.financial_summary.instapay_sales).toLocaleString()), 'Telegram message contains exact instapay sales')
    assert(telegramMessage.includes(Number(report.financial_summary.wallet_sales).toLocaleString()), 'Telegram message contains exact wallet sales')
    assert(telegramMessage.includes(Number(report.financial_summary.non_cash_sales).toLocaleString()), 'Telegram message contains exact non-cash sales')

    // Check reconciliation and drawer
    assert(telegramMessage.includes(Number(report.cash_reconciliation.initial_cash).toLocaleString()), 'Telegram message contains exact initial cash')
    assert(telegramMessage.includes(Number(report.cash_reconciliation.expected_cash_in_drawer).toLocaleString()), 'Telegram message contains exact expected cash in drawer')
    assert(telegramMessage.includes(Number(report.expenses_summary.total_expenses).toLocaleString()), 'Telegram message contains exact total expenses')

    // Check custody buckets
    assert(telegramMessage.includes(Number(report.cash_custody.settled_to_cashier).toLocaleString()), 'Telegram message contains exact settled cash')
    assert(telegramMessage.includes(Number(report.cash_custody.driver_custody_cash).toLocaleString()), 'Telegram message contains exact driver custody cash')
    assert(telegramMessage.includes(Number(report.cash_custody.uncollected_cash).toLocaleString()), 'Telegram message contains exact uncollected cash')

    // Check fleet net payout
    assert(telegramMessage.includes(Number(report.fleet_summary.total_net_payout).toLocaleString()), 'Telegram message contains exact fleet net payout')

    // 4. Test Reconciliation Badges on Different Simulated Statuses
    console.log('\n--- Test 4: Reconciliation Badges Presentation ---')
    // A: Balanced
    const balancedReport: FinalDailyReportPayload = {
      ...report,
      cash_reconciliation: {
        ...report.cash_reconciliation,
        reconciliation_status: 'balanced',
        discrepancy: 0,
        actual_cash_in_drawer: report.cash_reconciliation.expected_cash_in_drawer,
      }
    }
    const balancedMsg = formatTelegramFinalDailyReport(balancedReport)
    assert(balancedMsg.includes('✅ الدرج مطابق تماماً (0 ج.م)'), 'Balanced status formats green badge')

    // B: Surplus
    const surplusReport: FinalDailyReportPayload = {
      ...report,
      cash_reconciliation: {
        ...report.cash_reconciliation,
        reconciliation_status: 'surplus',
        discrepancy: 150,
        actual_cash_in_drawer: report.cash_reconciliation.expected_cash_in_drawer + 150,
      }
    }
    const surplusMsg = formatTelegramFinalDailyReport(surplusReport)
    assert(surplusMsg.includes('⚠️ زيادة بالدرج (+150 ج.م)'), 'Surplus status formats warning badge with positive discrepancy')

    // C: Deficit
    const deficitReport: FinalDailyReportPayload = {
      ...report,
      cash_reconciliation: {
        ...report.cash_reconciliation,
        reconciliation_status: 'deficit',
        discrepancy: -85,
        actual_cash_in_drawer: report.cash_reconciliation.expected_cash_in_drawer - 85,
      }
    }
    const deficitMsg = formatTelegramFinalDailyReport(deficitReport)
    assert(deficitMsg.includes('🚨 عجز بالدرج (-85 ج.م)'), 'Deficit status formats alert badge with negative discrepancy')

    // D: Pending Close
    const pendingReport: FinalDailyReportPayload = {
      ...report,
      cash_reconciliation: {
        ...report.cash_reconciliation,
        reconciliation_status: 'pending_shift_close',
      }
    }
    const pendingMsg = formatTelegramFinalDailyReport(pendingReport)
    assert(pendingMsg.includes('⏳ في انتظار إغلاق الوردية وجرد الدرج'), 'Pending close status formats in-progress badge')

    // E: Closed without Cash Count
    const closedWithoutCountReport: FinalDailyReportPayload = {
      ...report,
      cash_reconciliation: {
        ...report.cash_reconciliation,
        reconciliation_status: 'closed_without_cash_count',
      }
    }
    const closedWithoutCountMsg = formatTelegramFinalDailyReport(closedWithoutCountReport)
    assert(closedWithoutCountMsg.includes('⚠️ تم الإغلاق بدون تسجيل جرد نقدي'), 'Closed without count status formats notice badge')

    // 5. Test Failure Isolation & Non-blocking Resilience
    console.log('\n--- Test 5: Failure Isolation & Resilience ---')
    // Save original fetch
    const originalFetch = global.fetch
    try {
      // Simulate network outage / timeout on Telegram API
      global.fetch = async () => {
        throw new Error('Telegram network connection timeout')
      }

      const failedResult = await sendTelegramFinalDailyReport(report)
      assert(failedResult.success === false, 'Telegram network failure returns { success: false }')
      assert(typeof failedResult.error === 'string' && failedResult.error.includes('Telegram network connection timeout'), 'Error string cleanly captured without throwing unhandled exception')
    } finally {
      // Restore original fetch
      global.fetch = originalFetch
    }

    // 6. Test Backward Compatibility of Existing Notification Helpers
    console.log('\n--- Test 6: Backward Compatibility of Notification Helpers ---')
    assert(typeof notifyShiftOpened === 'function', 'notifyShiftOpened is exported and callable')
    assert(typeof notifyExpenseRecorded === 'function', 'notifyExpenseRecorded is exported and callable')
    assert(typeof notifyOrderCancelled === 'function', 'notifyOrderCancelled is exported and callable')
    assert(typeof notifyNewOrder === 'function', 'notifyNewOrder is exported and callable')
    assert(typeof sendExecutiveDailyReport === 'function', 'sendExecutiveDailyReport is exported and callable')
    assert(typeof notifyShiftClosed === 'function', 'notifyShiftClosed is exported and callable')

    // 7. Verify Zero Financial Calculations Inside telegram.ts
    console.log('\n--- Test 7: Zero Financial Calculations Invariant ---')
    const telegramFileContent = fs.readFileSync(path.resolve(__dirname, '../src/lib/telegram.ts'), 'utf8')
    assert(!telegramFileContent.includes('total_sales ='), 'telegram.ts does not compute total_sales')
    assert(!telegramFileContent.includes('expected_cash ='), 'telegram.ts does not compute expected_cash')
    assert(!telegramFileContent.includes('net_payout ='), 'telegram.ts does not compute net_payout')
    assert(!telegramFileContent.includes('discrepancy = actual'), 'telegram.ts does not compute discrepancy math')

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

runTelegramExecutiveReportingTests()
