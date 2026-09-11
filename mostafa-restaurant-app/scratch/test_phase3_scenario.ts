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

async function runPhase3ScenarioTest() {
  console.log('🧪 ========================================================')
  console.log('🧪 PHASE 3: MANUAL ORDER & FINANCIAL ENGINE VERIFICATION')
  console.log('🧪 ========================================================\n')

  const supabase = getSupabaseServerClient()

  // 1. Locate or create a test variant with known price
  // Let's find variant with price 50 (e.g. 'كبير')
  const { data: variants, error: vErr } = await supabase
    .from('item_variants')
    .select('id, variant_name, price, is_available')
    .eq('is_available', true)
    .eq('price', 50)
    .limit(1)

  let testVariantId: string
  if (variants && variants.length > 0) {
    testVariantId = variants[0].id
    console.log(`📌 Found standard 50 EGP variant: ${variants[0].variant_name} (${testVariantId})`)
  } else {
    // Pick any variant and use its actual price
    const { data: anyVar } = await supabase.from('item_variants').select('id, price').limit(1).single()
    if (!anyVar) throw new Error('No variants found in DB')
    testVariantId = anyVar.id
  }

  // 2. Create an isolated test daily shift with Opening Cash = 500
  console.log('\n--- Step 1: Open Test Daily Shift (Opening Cash = 500) ---')
  const shiftStartTime = new Date().toISOString()
  const { data: testShift, error: shiftErr } = await supabase
    .from('daily_shifts')
    .insert({
      opened_by: 'كاشير اختبار المرحلة 3',
      initial_cash: 500,
      status: 'open',
      opened_at: shiftStartTime,
    })
    .select('*')
    .single()

  if (shiftErr || !testShift) {
    console.error('❌ Failed to create isolated test shift:', shiftErr)
    process.exit(1)
  }

  console.log(`✅ Test Daily Shift created: #${testShift.shift_number} (ID: ${testShift.id}) with Initial Cash: ${testShift.initial_cash} EGP`)

  const testOrderIds: string[] = []

  try {
    // 3. Create Order 1: Manual Takeaway Cash = 700 EGP (14 * 50)
    console.log('\n--- Step 2: Create Manual Takeaway Cash (700 EGP) ---')
    const { data: o1Data, error: o1Err } = await supabase.rpc('create_manual_order_secure', {
      p_customer_name: 'عميل كاشير نقدي',
      p_customer_phone: '01011112222',
      p_order_type: 'takeaway',
      p_payment_method: 'cash',
      p_delivery_address: null,
      p_notes: 'طلب سفري كاش',
      p_items: [{ variant_id: testVariantId, quantity: 14 }], // 14 * 50 = 700
      p_daily_shift_id: testShift.id,
      p_created_by_staff: 'كاشير الصالة',
    })

    if (o1Err || !o1Data || o1Data.length === 0) {
      throw new Error(`Failed to create Order 1: ${o1Err?.message}`)
    }
    const order1Id = o1Data[0].order_id
    testOrderIds.push(order1Id)
    console.log(`✅ Order 1 Created: ID=${order1Id}, Amount=${o1Data[0].total_amount} EGP, Type=takeaway, Payment=cash`)

    // 4. Create Order 2: Manual Takeaway Card = 300 EGP (6 * 50)
    console.log('\n--- Step 3: Create Manual Takeaway Card (300 EGP) ---')
    const { data: o2Data, error: o2Err } = await supabase.rpc('create_manual_order_secure', {
      p_customer_name: 'عميل كاشير فيزا',
      p_customer_phone: '01033334444',
      p_order_type: 'takeaway',
      p_payment_method: 'card',
      p_delivery_address: null,
      p_notes: 'طلب سفري فيزا',
      p_items: [{ variant_id: testVariantId, quantity: 6 }], // 6 * 50 = 300
      p_daily_shift_id: testShift.id,
      p_created_by_staff: 'كاشير الصالة',
    })

    if (o2Err || !o2Data || o2Data.length === 0) {
      throw new Error(`Failed to create Order 2: ${o2Err?.message}`)
    }
    const order2Id = o2Data[0].order_id
    testOrderIds.push(order2Id)
    console.log(`✅ Order 2 Created: ID=${order2Id}, Amount=${o2Data[0].total_amount} EGP, Type=takeaway, Payment=card`)

    // 5. Create Order 3: Manual Delivery Cash = 400 EGP (8 * 50)
    console.log('\n--- Step 4: Create Manual Delivery Cash (400 EGP) ---')
    const { data: o3Data, error: o3Err } = await supabase.rpc('create_manual_order_secure', {
      p_customer_name: 'عميل دليفري نقدي',
      p_customer_phone: '01055556666',
      p_order_type: 'delivery',
      p_payment_method: 'cash',
      p_delivery_address: 'شارع 9 - المعادي - عمارة 12 شقة 4',
      p_notes: 'طلب دليفري كاش',
      p_items: [{ variant_id: testVariantId, quantity: 8 }], // 8 * 50 = 400
      p_daily_shift_id: testShift.id,
      p_created_by_staff: 'كاشير الصالة',
    })

    if (o3Err || !o3Data || o3Data.length === 0) {
      throw new Error(`Failed to create Order 3: ${o3Err?.message}`)
    }
    const order3Id = o3Data[0].order_id
    testOrderIds.push(order3Id)
    console.log(`✅ Order 3 Created: ID=${order3Id}, Amount=${o3Data[0].total_amount} EGP, Type=delivery, Payment=cash`)

    // 6. Transition Orders through operational lifecycle
    console.log('\n--- Step 5: Advance Orders through Operational Lifecycle ---')
    await supabase.from('orders').update({ status: 'completed' }).eq('id', order1Id)
    await supabase.from('orders').update({ status: 'completed' }).eq('id', order2Id)
    await supabase.from('orders').update({ status: 'delivered' }).eq('id', order3Id)
    console.log('✅ Order 1 -> completed')
    console.log('✅ Order 2 -> completed')
    console.log('✅ Order 3 -> delivered')

    // 7. Verify Shift Financial Calculations using Central System Logic
    console.log('\n--- Step 6: Verify Central Accounting Engine Calculations ---')
    const { data: shiftOrders, error: sOrdersErr } = await supabase
      .from('orders')
      .select('id, total_amount, status, order_type, payment_method, order_source, daily_shift_id')
      .eq('daily_shift_id', testShift.id)

    if (sOrdersErr || !shiftOrders) {
      throw new Error(`Failed to fetch shift orders: ${sOrdersErr?.message}`)
    }

    const completed = shiftOrders.filter(o => ['completed', 'delivered'].includes(o.status))
    const totalSales = completed.reduce((acc, o) => acc + Number(o.total_amount || 0), 0)
    const cashSales = completed.reduce((acc, o) => ((o.payment_method || 'cash') === 'cash' ? acc + Number(o.total_amount || 0) : acc), 0)
    const cardSales = completed.reduce((acc, o) => (o.payment_method === 'card' ? acc + Number(o.total_amount || 0) : acc), 0)
    const initialCash = Number(testShift.initial_cash || 0)
    const totalExpenses = 0
    const expectedCash = initialCash + cashSales - totalExpenses

    console.log(`📊 Central Accounting Verification:`)
    console.log(`   - Opening Cash:  ${initialCash} EGP`)
    console.log(`   - Total Sales:   ${totalSales} EGP (Expected: 1400)`)
    console.log(`   - Cash Sales:    ${cashSales} EGP (Expected: 1100)`)
    console.log(`   - Card Sales:    ${cardSales} EGP (Expected: 300)`)
    console.log(`   - Expected Cash: ${expectedCash} EGP (Expected: 1600)`)

    // Assertions
    let passed = true
    function check(cond: boolean, name: string) {
      if (cond) {
        console.log(`   ✅ PASS: ${name}`)
      } else {
        console.error(`   ❌ FAIL: ${name}`)
        passed = false
      }
    }

    check(totalSales === 1400, 'Total Sales equals 1,400 EGP')
    check(cashSales === 1100, 'Cash Sales equals 1,100 EGP')
    check(cardSales === 300, 'Card Sales equals 300 EGP')
    check(expectedCash === 1600, 'Expected Cash equals 1,600 EGP (Opening 500 + Cash Sales 1100)')
    check(shiftOrders.every(o => o.order_source === 'manual'), 'All orders have order_source strictly set to manual')
    check(shiftOrders.every(o => o.daily_shift_id === testShift.id), 'All orders strictly bound to daily_shift_id')

    if (!passed) {
      process.exit(1)
    }

    console.log('\n🎉 ALL FINANCIAL INTEGRATION ASSERTIONS CERTIFIED SUCCESSFULLY!')
  } finally {
    // Clean up test orders and test shift
    console.log('\n--- Step 7: Clean up test artifacts ---')
    if (testOrderIds.length > 0) {
      await supabase.from('order_items').delete().in('order_id', testOrderIds)
      await supabase.from('orders').delete().in('id', testOrderIds)
      console.log(`🧹 Cleaned up ${testOrderIds.length} test orders.`)
    }
    await supabase.from('daily_shifts').delete().eq('id', testShift.id)
    console.log(`🧹 Cleaned up isolated test shift ${testShift.id}.`)
  }
}

runPhase3ScenarioTest().catch((err) => {
  console.error('❌ Test failed with unhandled exception:', err)
  process.exit(1)
})
