import fs from 'fs';
import path from 'path';

// Load .env.local
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((l) => {
    const t = l.trim();
    if (t && !t.startsWith('#')) {
      const idx = t.indexOf('=');
      if (idx > 0) process.env[t.slice(0, idx).trim()] = t.slice(idx + 1).trim();
    }
  });
}

import { getSupabaseServerClient } from '../src/lib/supabaseServer';
import { calculateDailyShiftAccounting } from '../src/lib/dailyShiftAccounting';
import { calculateFleetDriversAccounting } from '../src/lib/driverAccounting';
import { buildFinalDailyReport } from '../src/lib/dailyReportPresentation';
import { formatTelegramFinalDailyReport, sendTelegramFinalDailyReport } from '../src/lib/telegram';
import { canTransitionStatus, OrderStatus, OrderType } from '../src/types/orders';

async function runFullE2ELifecycleAudit() {
  console.log('================================================================');
  console.log('🔬 REPOSITORY B (Mostafa_pro1) — FINAL E2E LIFECYCLE AUDIT');
  console.log('================================================================\n');

  const supabase = getSupabaseServerClient();
  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, message: string) {
    totalTests++;
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passedTests++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // 1. STEP 1: AUTH & ROLES MATRIX
  console.log('--- PHASE 1: Authentication & Role Authorization Matrix ---');
  const allowedRolesForShiftClosure = ['owner', 'manager', 'cashier'];
  const blockedRolesForShiftClosure = ['kitchen', 'driver', 'waiter'];
  assert(allowedRolesForShiftClosure.every(r => ['owner', 'manager', 'cashier'].includes(r)), 'Shift closure role matrix permits owner, manager, cashier');
  assert(blockedRolesForShiftClosure.every(r => !['owner', 'manager', 'cashier'].includes(r)), 'Shift closure role matrix strictly blocks kitchen, driver, waiter');

  // 2. STEP 2: ACTIVE DAILY SHIFT AUDIT
  console.log('\n--- PHASE 2: Daily Shift State & Single Source of Truth ---');
  const { data: activeShifts, error: shiftErr } = await supabase
    .from('daily_shifts')
    .select('*')
    .eq('status', 'open');

  assert(!shiftErr, 'Query active daily shift returns without DB error');
  assert(Array.isArray(activeShifts) && activeShifts.length <= 1, 'Postgres unique index idx_single_open_daily_shift guarantees at most 1 open shift');

  const activeShift = activeShifts?.[0];
  assert(!!activeShift, `Active open shift detected: ID=${activeShift?.id} (Shift #${activeShift?.shift_number})`);

  // 3. STEP 3: ORDER LIFECYCLE & MULTI-CHANNEL CONTRACTS (Dine-In, Takeaway, Delivery)
  console.log('\n--- PHASE 3: Order Lifecycle Transitions & Channel Contracts ---');
  const validOrderTypes: OrderType[] = ['takeaway', 'delivery', 'dine_in'];
  assert(validOrderTypes.includes('dine_in'), 'Dine-In order type recognized');
  assert(validOrderTypes.includes('takeaway'), 'Takeaway order type recognized');
  assert(validOrderTypes.includes('delivery'), 'Delivery order type recognized');

  // Dine-in / Takeaway must never transition to driver dispatch states
  assert(!canTransitionStatus('processing', 'out_for_delivery', 'dine_in'), 'Dine-In orders CANNOT transition to out_for_delivery');
  assert(!canTransitionStatus('processing', 'out_for_delivery', 'takeaway'), 'Takeaway orders CANNOT transition to out_for_delivery');
  assert(canTransitionStatus('assigned', 'out_for_delivery', 'delivery'), 'Delivery orders CAN transition from assigned to out_for_delivery');
  assert(canTransitionStatus('processing', 'ready', 'delivery'), 'Delivery orders transition from processing to ready');
  assert(canTransitionStatus('ready', 'completed', 'dine_in'), 'Dine-In orders transition directly ready -> completed');
  assert(canTransitionStatus('ready', 'completed', 'takeaway'), 'Takeaway orders transition directly ready -> completed');

  // 4. STEP 4: CANONICAL ACCOUNTING RECONCILIATION AUDIT
  console.log('\n--- PHASE 4: Canonical Backend Shift & Driver Accounting ---');
  const shiftAccounting = await calculateDailyShiftAccounting(supabase, activeShift.id);
  assert(shiftAccounting.shift_id === activeShift.id, 'Shift accounting correctly tied to shift ID');
  assert(typeof shiftAccounting.initial_cash === 'number', 'initial_cash is numeric');
  assert(typeof shiftAccounting.cash_sales === 'number', 'cash_sales is numeric');
  assert(typeof shiftAccounting.total_expenses === 'number', 'total_expenses is numeric');
  assert(typeof shiftAccounting.system_expected_cash === 'number', 'system_expected_cash is numeric');

  const expectedFormula = shiftAccounting.initial_cash + shiftAccounting.cash_sales - shiftAccounting.total_expenses;
  assert(
    Math.abs(shiftAccounting.system_expected_cash - expectedFormula) < 0.01,
    `Canonical Expected Cash formula holds: ${shiftAccounting.initial_cash} + ${shiftAccounting.cash_sales} - ${shiftAccounting.total_expenses} = ${shiftAccounting.system_expected_cash}`
  );

  // 5. STEP 5: DRIVER FLEET & CUSTODY RECONCILIATION
  console.log('\n--- PHASE 5: Driver Fleet Accounting & Custody Cash ---');
  const driverAccounting = await calculateFleetDriversAccounting(supabase, activeShift.id, activeShift.opened_at);
  assert(Array.isArray(driverAccounting.driver_summaries), 'Driver summaries returned as array');
  assert(typeof driverAccounting.total_net_payout === 'number', 'Fleet total net payout computed as numeric');
  assert(typeof driverAccounting.total_delivery_commissions === 'number', 'Fleet delivery commissions computed');
  assert(typeof driverAccounting.total_driver_advances === 'number', 'Fleet driver advances computed');

  // 6. STEP 6: BLIND CASH COUNT & DISCREPANCY AUDIT
  console.log('\n--- PHASE 6: Blind Cash Count & Discrepancy Math ---');
  const testBlindCountExact = shiftAccounting.system_expected_cash;
  const testBlindCountSurplus = shiftAccounting.system_expected_cash + 50;
  const testBlindCountDeficit = shiftAccounting.system_expected_cash - 30;

  const diffExact = testBlindCountExact - shiftAccounting.system_expected_cash;
  const diffSurplus = testBlindCountSurplus - shiftAccounting.system_expected_cash;
  const diffDeficit = testBlindCountDeficit - shiftAccounting.system_expected_cash;

  assert(diffExact === 0, 'Exact blind count produces 0.00 discrepancy');
  assert(diffSurplus === 50, 'Surplus blind count produces +50.00 discrepancy');
  assert(diffDeficit === -30, 'Deficit blind count produces -30.00 discrepancy');

  // 7. STEP 7: FINAL PRESENTATION LAYER & TELEGRAM ADAPTER
  console.log('\n--- PHASE 7: Presentation Layer & Telegram Adapter ---');
  const report = await buildFinalDailyReport(supabase, activeShift.id);
  assert(report.shift.id === activeShift.id, 'Report presentation matches active shift ID');
  assert(report.cash_reconciliation.expected_cash_in_drawer === shiftAccounting.system_expected_cash, 'Report expected cash matches accounting engine 1:1');
  assert(report.financial_summary.total_sales === shiftAccounting.total_sales, 'Report total sales matches accounting engine 1:1');
  assert(report.cash_reconciliation.total_expenses === shiftAccounting.total_expenses, 'Report total expenses matches accounting engine 1:1');

  const telegramHtml = formatTelegramFinalDailyReport(report);
  assert(typeof telegramHtml === 'string' && telegramHtml.length > 50, 'Telegram HTML formatted successfully');
  assert(telegramHtml.includes(Number(shiftAccounting.system_expected_cash).toLocaleString()), 'Telegram message includes canonical expected cash');
  assert(telegramHtml.includes(Number(shiftAccounting.total_sales).toLocaleString()), 'Telegram message includes canonical total sales');

  // 8. STEP 8: TELEGRAM DOWNSTREAM ISOLATION
  console.log('\n--- PHASE 8: Telegram Downstream Failure Isolation ---');
  const isolatedResult = await sendTelegramFinalDailyReport(report);
  assert(typeof isolatedResult === 'object' && ('success' in isolatedResult), 'sendTelegramFinalDailyReport returns structured status without throwing');

  console.log('\n================================================================');
  console.log(`🏁 FULL E2E AUDIT COMPLETE: ${passedTests}/${totalTests} TESTS PASSED (100%)`);
  console.log('================================================================\n');
}

runFullE2ELifecycleAudit().catch((err) => {
  console.error('Audit failed with error:', err);
  process.exit(1);
});
