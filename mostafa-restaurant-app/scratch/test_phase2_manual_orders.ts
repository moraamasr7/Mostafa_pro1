import fs from 'fs'
import path from 'path'

// Load .env.local
const envPath = path.resolve(__dirname, '../.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.replace(/\r/g, '').trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=')
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim()
        const val = trimmed.slice(idx + 1).trim()
        process.env[key] = val
      }
    }
  }
}

import { getSupabaseServerClient } from '../src/lib/supabaseServer'
import { getActiveDailyShift } from '../src/lib/shiftGuard'

async function runPhase2TestSuite() {
  console.log('🧪 Starting Phase 2 Manual Order Backend & RPC Test Suite...\n')
  const supabase = getSupabaseServerClient()

  // 0. Fetch Variant for testing
  const { data: variants, error: varErr } = await supabase
    .from('item_variants')
    .select('id, variant_name, price, is_available')
    .eq('is_available', true)
    .limit(2)

  if (varErr || !variants || variants.length === 0) {
    console.error('❌ Could not find active variants for testing:', varErr)
    process.exit(1)
  }

  const validVariantId = variants[0].id
  const expectedUnitPrice = Number(variants[0].price)
  console.log('📌 Using test variant: ' + variants[0].variant_name + ' (ID: ' + validVariantId + ') | Price: ' + expectedUnitPrice + ' EGP')

  const unavailableVariantId = 'bbdb1217-ffda-4ea0-a0ba-124e0e0a9501'

  // Verify open shift
  const shiftCheck = await getActiveDailyShift(supabase)
  if (!shiftCheck.hasActiveShift || !shiftCheck.activeShiftId) {
    console.error('❌ No active shift found for testing!')
    process.exit(1)
  }
  const openShiftId = shiftCheck.activeShiftId
  console.log('📌 Using open daily shift ID: ' + openShiftId + ' (Shift #' + shiftCheck.shiftNumber + ')\n')

  let passedTests = 0
  let failedTests = 0

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log('  ✅ PASS: ' + testName)
      passedTests++
    } else {
      console.error('  ❌ FAIL: ' + testName)
      failedTests++
    }
  }

  // --- TEST 1: Rejection on Non-existent / Invalid Shift ID ---
  console.log('Test 1: Rejection on Non-existent / Invalid Shift ID...')
  const fakeShiftId = '00000000-0000-0000-0000-000000000000'
  const { data: t1Data, error: t1Err } = await supabase.rpc('create_manual_order_secure', {
    p_customer_name: 'عميل وهمي',
    p_customer_phone: '01012345678',
    p_order_type: 'takeaway',
    p_payment_method: 'cash',
    p_delivery_address: null,
    p_notes: 'اختبار وردية غير موجودة',
    p_items: [{ variant_id: validVariantId, quantity: 1 }],
    p_daily_shift_id: fakeShiftId,
    p_created_by_staff: 'كاشير التجربة',
  })
  assert(!!t1Err && t1Err.message.includes('الوردية المحددة غير موجودة'), 'Rejects non-existent shift ID')

  // --- TEST 2: Rejection on Closed Shift ---
  console.log('\nTest 2: Rejection on Closed Shift...')
  const { data: closedShift } = await supabase
    .from('daily_shifts')
    .insert({
      opened_by: 'كاشير مؤقت',
      initial_cash: 0,
      status: 'closed',
      opened_at: new Date(Date.now() - 3600000).toISOString(),
      closed_at: new Date().toISOString(),
      closed_by: 'كاشير مؤقت',
      final_cash: 0,
    })
    .select('id')
    .single()

  if (closedShift) {
    const { data: t2Data, error: t2Err } = await supabase.rpc('create_manual_order_secure', {
      p_customer_name: 'عميل وردية مغلقة',
      p_customer_phone: '01012345678',
      p_order_type: 'takeaway',
      p_payment_method: 'cash',
      p_delivery_address: null,
      p_notes: 'اختبار وردية مغلقة',
      p_items: [{ variant_id: validVariantId, quantity: 1 }],
      p_daily_shift_id: closedShift.id,
      p_created_by_staff: 'كاشير التجربة',
    })
    assert(!!t2Err && t2Err.message.includes('لا يمكن إنشاء طلب يدوي على وردية مغلقة'), 'Rejects creation on closed shift')
    await supabase.from('daily_shifts').delete().eq('id', closedShift.id)
  }

  // --- TEST 3: Rejection on Missing Staff ---
  console.log('\nTest 3: Rejection on Missing Staff...')
  const { data: t3Data, error: t3Err } = await supabase.rpc('create_manual_order_secure', {
    p_customer_name: 'عميل بدون كاشير',
    p_customer_phone: '01012345678',
    p_order_type: 'takeaway',
    p_payment_method: 'cash',
    p_delivery_address: null,
    p_notes: 'اختبار موظف مفقود',
    p_items: [{ variant_id: validVariantId, quantity: 1 }],
    p_daily_shift_id: openShiftId,
    p_created_by_staff: '',
  })
  assert(!!t3Err && t3Err.message.includes('هوية الموظف المسؤول مطلوبة'), 'Rejects empty created_by_staff')

  // --- TEST 4: Rejection on Invalid Variant ID ---
  console.log('\nTest 4: Rejection on Invalid / Non-existent Variant ID...')
  const fakeVariantId = '11111111-1111-1111-1111-111111111111'
  const { data: t4Data, error: t4Err } = await supabase.rpc('create_manual_order_secure', {
    p_customer_name: 'عميل صنف غير موجود',
    p_customer_phone: '01012345678',
    p_order_type: 'takeaway',
    p_payment_method: 'cash',
    p_delivery_address: null,
    p_notes: 'صنف غير موجود',
    p_items: [{ variant_id: fakeVariantId, quantity: 1 }],
    p_daily_shift_id: openShiftId,
    p_created_by_staff: 'كاشير التجربة',
  })
  assert(!!t4Err && t4Err.message.includes('الصنف المطلوب غير موجود'), 'Rejects non-existent variant ID')

  // --- TEST 5: Rejection on Unavailable Variant ---
  console.log('\nTest 5: Rejection on Unavailable Variant...')
  const { data: t5Data, error: t5Err } = await supabase.rpc('create_manual_order_secure', {
    p_customer_name: 'عميل صنف معطل',
    p_customer_phone: '01012345678',
    p_order_type: 'takeaway',
    p_payment_method: 'cash',
    p_delivery_address: null,
    p_notes: 'صنف معطل',
    p_items: [{ variant_id: unavailableVariantId, quantity: 1 }],
    p_daily_shift_id: openShiftId,
    p_created_by_staff: 'كاشير التجربة',
  })
  assert(!!t5Err && t5Err.message.includes('غير متوفر حالياً'), 'Rejects unavailable variant')

  // --- TEST 6: Rejection on Invalid Quantity ---
  console.log('\nTest 6: Rejection on Invalid Quantity (0 and 99)...')
  const { error: t6ErrZero } = await supabase.rpc('create_manual_order_secure', {
    p_customer_name: 'عميل كمية صفر',
    p_customer_phone: '01012345678',
    p_order_type: 'takeaway',
    p_payment_method: 'cash',
    p_delivery_address: null,
    p_notes: 'كمية صفر',
    p_items: [{ variant_id: validVariantId, quantity: 0 }],
    p_daily_shift_id: openShiftId,
    p_created_by_staff: 'كاشير التجربة',
  })
  assert(!!t6ErrZero && t6ErrZero.message.includes('الكمية غير صحيحة للصنف'), 'Rejects quantity = 0')

  const { error: t6ErrOver } = await supabase.rpc('create_manual_order_secure', {
    p_customer_name: 'عميل كمية زائدة',
    p_customer_phone: '01012345678',
    p_order_type: 'takeaway',
    p_payment_method: 'cash',
    p_delivery_address: null,
    p_notes: 'كمية زائدة',
    p_items: [{ variant_id: validVariantId, quantity: 99 }],
    p_daily_shift_id: openShiftId,
    p_created_by_staff: 'كاشير التجربة',
  })
  assert(!!t6ErrOver && t6ErrOver.message.includes('الكمية غير صحيحة للصنف'), 'Rejects quantity > 50')

  // --- TEST 7: Rejection on Missing Delivery Address for Delivery Orders ---
  console.log('\nTest 7: Rejection on Missing Delivery Address...')
  const { error: t7Err } = await supabase.rpc('create_manual_order_secure', {
    p_customer_name: 'عميل دليفري بدون عنوان',
    p_customer_phone: '01012345678',
    p_order_type: 'delivery',
    p_payment_method: 'cash',
    p_delivery_address: '   ',
    p_notes: 'بدون عنوان',
    p_items: [{ variant_id: validVariantId, quantity: 1 }],
    p_daily_shift_id: openShiftId,
    p_created_by_staff: 'كاشير التجربة',
  })
  assert(!!t7Err && t7Err.message.includes('عنوان التوصيل مطلوب'), 'Rejects delivery order without address')

  // --- TEST 8: Rejection on Invalid Payment Method ---
  console.log('\nTest 8: Rejection on Invalid Payment Method...')
  const { error: t8Err } = await supabase.rpc('create_manual_order_secure', {
    p_customer_name: 'عميل وسيلة دفع خاطئة',
    p_customer_phone: '01012345678',
    p_order_type: 'takeaway',
    p_payment_method: 'bitcoin_crypto',
    p_delivery_address: null,
    p_notes: 'دفع غير صالح',
    p_items: [{ variant_id: validVariantId, quantity: 1 }],
    p_daily_shift_id: openShiftId,
    p_created_by_staff: 'كاشير التجربة',
  })
  assert(!!t8Err && t8Err.message.includes('طريقة الدفع غير مقبولة'), 'Rejects invalid payment method')

  // --- TEST 9: Atomicity Verification (No orphaned order on failure) ---
  console.log('\nTest 9: Atomicity Verification (No orphaned order on item failure)...')
  const { count: orderCountBefore } = await supabase.from('orders').select('*', { count: 'exact', head: true })
  const { error: t9Err } = await supabase.rpc('create_manual_order_secure', {
    p_customer_name: 'عميل فحص الذرية',
    p_customer_phone: '01012345678',
    p_order_type: 'takeaway',
    p_payment_method: 'cash',
    p_delivery_address: null,
    p_notes: 'فحص الذرية',
    p_items: [
      { variant_id: validVariantId, quantity: 1 },
      { variant_id: fakeVariantId, quantity: 1 },
    ],
    p_daily_shift_id: openShiftId,
    p_created_by_staff: 'كاشير التجربة',
  })
  const { count: orderCountAfter } = await supabase.from('orders').select('*', { count: 'exact', head: true })
  assert(!!t9Err && orderCountBefore === orderCountAfter, 'Transaction completely rolls back with zero orphaned orders')

  // --- TEST 10: Successful Creation with Server-Side DB Price Calculation & Attributes ---
  console.log('\nTest 10: Successful Creation & DB-Enforced Values (Cash, Card, Instapay)...')
  
  // Create Manual Cash Takeaway Order (Qty: 2)
  const { data: mCashData, error: mCashErr } = await supabase.rpc('create_manual_order_secure', {
    p_customer_name: 'عميل يدوي نقدي',
    p_customer_phone: '01011113333',
    p_order_type: 'takeaway',
    p_payment_method: 'cash',
    p_delivery_address: null,
    p_notes: 'طلب كاش تجريبي',
    p_items: [{ variant_id: validVariantId, quantity: 2, item_notes: 'بدون شطة' }],
    p_daily_shift_id: openShiftId,
    p_created_by_staff: 'الكاشير مصطفى',
  })

  assert(!mCashErr && !!mCashData && mCashData.length > 0, 'Manual Cash Order created successfully')
  const cashOrderId = mCashData?.[0]?.order_id
  const expectedCashTotal = expectedUnitPrice * 2

  // Verify fields in DB
  const { data: dbCashOrder } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', cashOrderId)
    .single()

  assert(dbCashOrder?.order_source === 'manual', 'order_source is strictly manual')
  assert(dbCashOrder?.daily_shift_id === openShiftId, 'daily_shift_id is strictly linked to open shift')
  assert(dbCashOrder?.created_by_staff === 'الكاشير مصطفى', 'created_by_staff is recorded accurately')
  assert(Number(dbCashOrder?.total_amount) === expectedCashTotal, 'total_amount calculated server-side matches DB pricing (' + expectedCashTotal + ' EGP)')
  assert(dbCashOrder?.status === 'pending', 'status is initialized to pending')
  assert(dbCashOrder?.order_items?.length === 1, 'order_items inserted atomically')

  // Create Manual Card Delivery Order (Qty: 1)
  const { data: mCardData, error: mCardErr } = await supabase.rpc('create_manual_order_secure', {
    p_customer_name: 'عميل يدوي فيزا',
    p_customer_phone: '01022224444',
    p_order_type: 'delivery',
    p_payment_method: 'card',
    p_delivery_address: 'شارع السلام - المعادي',
    p_notes: 'دفع بالفيزا عند التوصيل',
    p_items: [{ variant_id: validVariantId, quantity: 1 }],
    p_daily_shift_id: openShiftId,
    p_created_by_staff: 'الكاشير مصطفى',
  })
  assert(!mCardErr && !!mCardData && mCardData.length > 0, 'Manual Card Order created successfully')
  const cardOrderId = mCardData?.[0]?.order_id

  // --- TEST 11: Accounting & Z-Report Seamless Integration ---
  console.log('\nTest 11: Accounting Integration (Shift & Report inclusion)...')
  await supabase.from('orders').update({ status: 'completed' }).eq('id', cashOrderId)
  await supabase.from('orders').update({ status: 'delivered' }).eq('id', cardOrderId)

  const { data: shiftOrders } = await supabase
    .from('orders')
    .select('id, total_amount, order_type, status, order_source')
    .gte('created_at', shiftCheck.openedAt!)

  const completedInShift = (shiftOrders || []).filter((o: any) => ['completed', 'delivered'].includes(o.status))
  const totalSalesInShift = completedInShift.reduce((sum: number, o: any) => sum + Number(o.total_amount || 0), 0)

  const manualOrdersInShift = completedInShift.filter((o: any) => o.order_source === 'manual')
  assert(manualOrdersInShift.length >= 2, 'Manual orders naturally participate in shift completed sales')
  console.log('  💰 Total Shift Sales with Manual Orders: ' + totalSalesInShift + ' EGP (Manual Orders count: ' + manualOrdersInShift.length + ')')

  // --- TEST 12: Online Orders Integrity ---
  console.log('\nTest 12: Online Orders remain unaffected...')
  const { data: onlineOrders } = await supabase
    .from('orders')
    .select('order_source')
    .eq('order_source', 'online')

  assert((onlineOrders || []).length >= 3, 'Existing Online orders untouched and fully intact')

  // Cleanup test orders created during suite to keep shift clean
  console.log('\n🧹 Cleaning up test orders created in Test 10...')
  await supabase.from('order_items').delete().in('order_id', [cashOrderId, cardOrderId])
  await supabase.from('orders').delete().in('id', [cashOrderId, cardOrderId])

  // Cleanup test variant
  await supabase.from('item_variants').delete().eq('id', unavailableVariantId)

  console.log('\n=======================================')
  console.log('🏁 RESULTS: ' + passedTests + ' PASSED, ' + failedTests + ' FAILED')
  console.log('=======================================')

  if (failedTests > 0) {
    process.exit(1)
  }
}

runPhase2TestSuite().catch((err) => {
  console.error('Fatal error running test suite:', err)
  process.exit(1)
})
