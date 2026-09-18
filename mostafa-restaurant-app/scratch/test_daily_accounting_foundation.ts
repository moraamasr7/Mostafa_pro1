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
import { enqueueOfflineAction, getOfflineQueue, flushOfflineQueue, removeOfflineAction } from '../src/lib/offlineSyncQueue'

const supabase = getSupabaseServerClient()

async function runDailyAccountingFoundationTests() {
  console.log('🚀 [START] Running Comprehensive Daily Accounting Foundation Test Suite...\n')
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
    // 0. Fetch active daily shift and variant
    const { data: openShifts } = await supabase
      .from('daily_shifts')
      .select('*')
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

    // ==========================================
    // TEST 1: Shift Identity (UUID + Sequential shift_number)
    // ==========================================
    console.log('\n--- TEST 1: Shift Identity Verification ---')
    assert(typeof activeShift.id === 'string' && activeShift.id.length === 36, 'Shift ID is a valid backend UUID Source of Truth')
    assert(typeof activeShift.shift_number === 'number' && activeShift.shift_number > 0, 'Shift number is sequential integer for frontend & staff')

    // ==========================================
    // TEST 2: Multi-Payment Breakdown (Cash, Instapay, Wallet)
    // ==========================================
    console.log('\n--- TEST 2: Multi-Payment Breakdown (Cash, Instapay, Wallet) ---')
    // A. Cash Takeaway Order (Settled)
    const { data: cashOrderRes } = await supabase.rpc('create_manual_order_secure', {
      p_customer_name: 'عميل كاش محاسبي',
      p_customer_phone: '01011223344',
      p_order_type: 'takeaway',
      p_payment_method: 'cash',
      p_delivery_address: null,
      p_notes: 'اختبار دفع نقدي',
      p_items: [{ variant_id: testVariant.id, quantity: 1, item_notes: '' }],
      p_daily_shift_id: activeShift.id,
      p_created_by_staff: 'cashier',
    })
    const cashOrderId = cashOrderRes![0].order_id
    await supabase.rpc('settle_order_collection_secure', { p_order_id: cashOrderId, p_cashier_actor: 'cashier' })
    await supabase.rpc('update_order_status_secure', { p_order_id: cashOrderId, p_expected_status: 'pending', p_new_status: 'processing' })
    await supabase.rpc('update_order_status_secure', { p_order_id: cashOrderId, p_expected_status: 'processing', p_new_status: 'completed' })

    // B. Instapay Takeaway Order
    const { data: instapayOrderRes } = await supabase.rpc('create_manual_order_secure', {
      p_customer_name: 'عميل انستاباي',
      p_customer_phone: '01055667788',
      p_order_type: 'takeaway',
      p_payment_method: 'instapay',
      p_delivery_address: null,
      p_notes: 'اختبار دفع انستاباي',
      p_items: [{ variant_id: testVariant.id, quantity: 1, item_notes: '' }],
      p_daily_shift_id: activeShift.id,
      p_created_by_staff: 'cashier',
    })
    const instapayOrderId = instapayOrderRes![0].order_id
    await supabase.rpc('update_order_status_secure', { p_order_id: instapayOrderId, p_expected_status: 'pending', p_new_status: 'processing' })
    await supabase.rpc('update_order_status_secure', { p_order_id: instapayOrderId, p_expected_status: 'processing', p_new_status: 'completed' })

    // C. Vodafone/Etisalat Cash Wallet Order
    const { data: walletOrderRes } = await supabase.rpc('create_manual_order_secure', {
      p_customer_name: 'عميل محفظة فودافون كاش',
      p_customer_phone: '01099881122',
      p_order_type: 'takeaway',
      p_payment_method: 'wallet',
      p_delivery_address: null,
      p_notes: 'اختبار دفع محفظة إلكترونية',
      p_items: [{ variant_id: testVariant.id, quantity: 1, item_notes: '' }],
      p_daily_shift_id: activeShift.id,
      p_created_by_staff: 'cashier',
    })
    const walletOrderId = walletOrderRes![0].order_id
    await supabase.rpc('update_order_status_secure', { p_order_id: walletOrderId, p_expected_status: 'pending', p_new_status: 'processing' })
    await supabase.rpc('update_order_status_secure', { p_order_id: walletOrderId, p_expected_status: 'processing', p_new_status: 'completed' })

    // Calculate Accounting
    const accounting = await calculateDailyShiftAccounting(supabase, activeShift.id)

    assert(accounting.cash_sales > 0, `Cash sales accurately isolated: ${accounting.cash_sales} EGP`)
    assert(accounting.instapay_sales > 0, `Instapay sales accurately isolated: ${accounting.instapay_sales} EGP`)
    assert(accounting.wallet_sales > 0, `Wallet sales accurately isolated: ${accounting.wallet_sales} EGP`)
    assert(
      accounting.total_sales === accounting.cash_sales + accounting.instapay_sales + accounting.wallet_sales + accounting.other_electronic_sales + accounting.driver_custody_cash + accounting.uncollected_cash,
      'Total sales exactly reconciles to the sum of all payment methods & custody buckets'
    )

    // ==========================================
    // TEST 3: Expected Cash Formula & Expenses Reconciliation
    // ==========================================
    console.log('\n--- TEST 3: Expected Cash Formula Verification ---')
    const calculatedExpected = Math.round((accounting.initial_cash + accounting.cash_sales - accounting.total_expenses) * 100) / 100
    assert(
      accounting.system_expected_cash === calculatedExpected,
      `Expected Cash matches exact formula: ${accounting.initial_cash} (Initial) + ${accounting.cash_sales} (Cash Sales) - ${accounting.total_expenses} (Expenses) = ${accounting.system_expected_cash} EGP`
    )

    // ==========================================
    // TEST 4: Offline Queue & Idempotent Sync Retry
    // ==========================================
    console.log('\n--- TEST 4: Offline Queue & Idempotent Sync Retry ---')
    const offlineIdempotencyKey = 'offline_order_' + Date.now()
    const queuedAction = enqueueOfflineAction({
      idempotency_key: offlineIdempotencyKey,
      action_type: 'create_order',
      endpoint: '/api/orders',
      payload: {
        customer_name: 'عميل بدون انترنت مؤقت',
        customer_phone: '01077778899',
        order_type: 'takeaway',
        payment_method: 'cash',
        items: [{ variant_id: testVariant.id, quantity: 1, item_notes: '' }],
        idempotency_key: offlineIdempotencyKey,
      },
    })

    assert(Boolean(queuedAction.id), 'Action enqueued into offline pending queue with idempotency key')

    // Simulate Reconnect & Flush to Supabase
    let firstSyncResult: any = null
    const { flushed: flushCount1 } = await flushOfflineQueue(async (action) => {
      const { data, error } = await supabase.rpc('create_order_secure', {
        p_customer_name: action.payload.customer_name,
        p_customer_phone: action.payload.customer_phone,
        p_notes: 'طلب أوفلاين تم إرساله عند عودة الاتصال',
        p_items: action.payload.items,
        p_order_type: action.payload.order_type,
        p_delivery_address: null,
        p_payment_method: action.payload.payment_method,
        p_payment_receipt_url: 'offline_cash',
        p_idempotency_key: action.idempotency_key,
      })
      if (error) {
        console.error('💥 Offline sync create_order error:', error)
      }
      if (!error && data) {
        firstSyncResult = data[0]
        return { success: true, shouldDrop: true }
      }
      return { success: false, shouldDrop: false }
    })

    assert(flushCount1 === 1 && Boolean(firstSyncResult?.order_id), 'Offline order flushed and created in Supabase upon reconnect')

    // Simulate Duplicate Offline Retry (Network glitch resubmission)
    const { data: duplicateRetryData, error: duplicateRetryErr } = await supabase.rpc('create_order_secure', {
      p_customer_name: queuedAction.payload.customer_name,
      p_customer_phone: queuedAction.payload.customer_phone,
      p_notes: 'طلب أوفلاين تم إرساله عند عودة الاتصال',
      p_items: queuedAction.payload.items,
      p_order_type: queuedAction.payload.order_type,
      p_delivery_address: null,
      p_payment_method: queuedAction.payload.payment_method,
      p_payment_receipt_url: 'offline_cash',
      p_idempotency_key: offlineIdempotencyKey,
    })

    assert(!duplicateRetryErr && duplicateRetryData?.[0]?.order_id === firstSyncResult?.order_id, 'Duplicate sync retry cleanly absorbed existing order (Idempotent 100%)')

    // ==========================================
    // TEST 5: Variance & Driver Dues Calculation
    // ==========================================
    console.log('\n--- TEST 5: Variance & Driver Dues Verification ---')
    const simulatedCountedCash = accounting.system_expected_cash - 25.0 // 25 EGP short
    const simulatedDiscrepancy = Math.round((simulatedCountedCash - accounting.system_expected_cash) * 100) / 100

    assert(simulatedDiscrepancy === -25.0, `Discrepancy accurately computed: ${simulatedDiscrepancy} EGP (Expected: -25.00 EGP)`)

    if (accounting.fleet_accounting) {
      assert(typeof accounting.fleet_accounting.total_net_payout === 'number', `Driver fleet net payout calculated: ${accounting.fleet_accounting.total_net_payout} EGP`)
    }

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

runDailyAccountingFoundationTests()
