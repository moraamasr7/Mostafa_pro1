import fs from 'fs'
import path from 'path'

// القراءة المباشرة لـ .env.local لتسجيل متغيرات البيئة قبل الاتصال
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

async function runMultiOrderDriverFlow() {
  console.log('🚀 بدء تجربة وإثبات دورة حياة الطيار والرحلة المتعددة...\n')
  const supabase = getSupabaseServerClient()

  // 1. إضافة طيار جديد في الداتابيز
  const testPhone = '010998877' + Math.floor(10 + Math.random() * 90)
  const driverName = 'علي طيار التوصيل'

  console.log(`1️⃣ إضافة طيار جديد باسم: ${driverName} برقم موبايل: ${testPhone}...`)
  
  const { data: driverData, error: driverErr } = await supabase
    .from('drivers')
    .insert({ name: driverName, phone: testPhone, status: 'offline', is_active: true })
    .select('id, name, status')
    .single()

  if (driverErr || !driverData) {
    console.error('❌ فشل إضافة الطيار:', driverErr)
    return
  }

  const driverId = driverData.id
  console.log(`✅ تم إضافة الطيار بنجاح (ID: ${driverId}) | الحالة الحالية: ${driverData.status}`)

  // إضافة بيانات الدخول المحمية في driver_credentials
  try {
    await supabase
      .from('driver_credentials')
      .insert({ driver_id: driverId, phone: testPhone })
  } catch {}

  // 2. بدء وردية للطيار (Start Shift)
  console.log('\n2️⃣ فتح وردية عمل جديدة للطيار (Start Shift)...')
  const { data: shiftRes, error: shiftErr } = await supabase.rpc('start_driver_shift_secure', {
    p_driver_id: driverId,
  })

  if (shiftErr) {
    console.error('❌ فشل فتح الوردية:', shiftErr)
    return
  }

  console.log(`✅ نتيجة فتح الوردية: ${shiftRes[0]?.message} | Shift ID: ${shiftRes[0]?.shift_id}`)

  // التحقق من حالة الطيار بعد فتح الوردية
  const { data: driverAfterShift } = await supabase
    .from('drivers')
    .select('status')
    .eq('id', driverId)
    .single()

  console.log(`📌 حالة الطيار بعد فتح الوردية: [${driverAfterShift?.status}] (متوقع: available)`)

  // 3. إنشاء 3 طلبات دليفري في حالة جاهز بالمطبخ مع حساب المسافة وسعر التوصيل
  console.log('\n3️⃣ إنشاء 3 طلبات دليفري بمواقع ومسافات مختلفة وتجهيزها بالمطبخ...')

  const mockCustomers = [
    { name: 'أحمد محمود', phone: '01011112222', address: 'شارع شبرا مصر - القليوبية', lat: 30.1285, lng: 31.2995 },
    { name: 'عمر خالد', phone: '01133334444', address: 'شارع بنها الجديد - بنها', lat: 30.1450, lng: 31.3150 },
    { name: 'محمد مصطفى', phone: '01255556666', address: 'شارع كفر شكر - القليوبية', lat: 30.1650, lng: 31.3350 },
  ]

  const createdOrderIds: string[] = []

  // جلب صنف افتراضي للسلة
  const { data: variants } = await supabase.from('item_variants').select('id').limit(1)
  const variantId = variants && variants.length > 0 ? variants[0].id : '00000000-0000-0000-0000-000000000000'

  for (let i = 0; i < mockCustomers.length; i++) {
    const cust = mockCustomers[i]
    const { data: orderRes, error: orderErr } = await supabase.rpc('create_order_secure', {
      p_customer_name: cust.name,
      p_customer_phone: cust.phone,
      p_notes: `طلب اختبار رقم ${i + 1}`,
      p_items: [{ variant_id: variantId, quantity: 1 }],
      p_order_type: 'delivery',
      p_delivery_address: cust.address,
      p_customer_lat: cust.lat,
      p_customer_lng: cust.lng,
    })

    if (orderErr) {
      console.error(`❌ فشل إنشاء الطلب ${i + 1}:`, orderErr)
      continue
    }

    const orderObj = orderRes[0]
    createdOrderIds.push(orderObj.order_id)
    console.log(
      `  📦 طلب #${orderObj.order_number} (ID: ${orderObj.order_id}) | المسافة: ${orderObj.delivery_distance_km} كم | رسم التوصيل: ${orderObj.delivery_fee} ج.م | الإجمالي: ${orderObj.total_amount} ج.م`
    )

    // تحديث حالة الطلب إلى (جاهز بالمطبخ) لتجهيزه للإسناد
    await supabase.from('orders').update({ status: 'ready' }).eq('id', orderObj.order_id)
  }

  // 4. إسناد الطلبات الثلاثة دفعة واحدة للطيار وإنشاء خط سير واحد
  console.log(`\n4️⃣ إسناد الـ 3 طلبات دفعة واحدة للطيار (${driverName}) وإنشاء رحلة خط سير...`)

  const formattedOrdersParam = createdOrderIds.map((id) => ({ order_id: id }))
  const { data: assignRes, error: assignErr } = await supabase.rpc('assign_orders_to_driver_secure', {
    p_driver_id: driverId,
    p_order_ids: formattedOrdersParam,
  })

  if (assignErr) {
    console.error('❌ فشل إسناد الطلبات للطيار:', assignErr)
    return
  }

  const tripObj = assignRes[0]
  console.log(`✅ تم إنشاء خط السير بنجاح! رقم الرحلة: #${tripObj.trip_number} | Trip ID: ${tripObj.trip_id}`)

  // التحقق من أن حالة الطيار تحولت تلقائياً إلى busy
  const { data: driverAfterAssign } = await supabase
    .from('drivers')
    .select('status')
    .eq('id', driverId)
    .single()

  console.log(`📌 حالة الطيار بعد إسناد الطلبات: [${driverAfterAssign?.status}] (متوقع تلقائياً: busy)`)

  // 5. اتخاذ قرار مستقل لكل طلب من الـ 3 طلبات
  console.log('\n5️⃣ تنفيذ القرارات المستقلة لكل طلب في خط السير:')

  // القرارات المطلوبة:
  // الطلب 1: تم التسليم للعميل بنجاح (delivered)
  // الطلب 2: تعذر التوصيل (failed) مع سبب: "العميل لا يرد على الهاتف"
  // الطلب 3: تم التسليم للعميل بنجاح (delivered)

  const outcomesToRecord = [
    { orderId: createdOrderIds[0], outcome: 'delivered', reason: null, label: '🎉 تم التسليم بنجاح (delivered)' },
    { orderId: createdOrderIds[1], outcome: 'failed', reason: 'العميل لا يرد على الهاتف', label: '⚠️ تعذر التوصيل (failed)' },
    { orderId: createdOrderIds[2], outcome: 'delivered', reason: null, label: '🎉 تم التسليم بنجاح (delivered)' },
  ]

  for (let idx = 0; idx < outcomesToRecord.length; idx++) {
    const item = outcomesToRecord[idx]
    console.log(`\n  --- تسجيل نتيجة الطلب ${idx + 1} (${item.label}) ---`)

    const { data: outcomeRes, error: outcomeErr } = await supabase.rpc('record_delivery_outcome_secure', {
      p_order_id: item.orderId,
      p_outcome: item.outcome,
      p_failure_reason: item.reason,
      p_collected_amount: item.outcome === 'delivered' ? 100.0 : 0.0,
      p_staff_actor: 'cashier_test',
    })

    if (outcomeErr) {
      console.error(`❌ فشل تسجيل نتيجة الطلب ${idx + 1}:`, outcomeErr)
      continue
    }

    const resObj = outcomeRes[0]
    console.log(
      `  ✅ النتيجة: ${resObj.message} | إغلاق الرحلة: ${resObj.trip_completed ? 'نعم ✓' : 'لا'} | تحرير الطيار: ${
        resObj.driver_released ? 'نعم ✓' : 'لا'
      }`
    )

    // استعلام حالة الطيار الحالية في كل خطوة
    const { data: currentDriverState } = await supabase
      .from('drivers')
      .select('status')
      .eq('id', driverId)
      .single()

    console.log(`  📊 حالة الطيار الحالية بالداتابيز: [${currentDriverState?.status}]`)
  }

  // 6. التحقق النهائي من إغلاق الرحلة وتحرير الطيار تلقائياً
  console.log('\n6️⃣ التدقيق والتحقق النهائي من الداتابيز بعد حسم جميع الطلبات:')

  const { data: finalTrip } = await supabase
    .from('delivery_trips')
    .select('id, trip_number, status, expected_amount, collected_amount')
    .eq('id', tripObj.trip_id)
    .single()

  const { data: finalDriver } = await supabase
    .from('drivers')
    .select('id, name, status')
    .eq('id', driverId)
    .single()

  console.log('\n📋 التقرير النهائي للعملية:')
  console.log(`  • حالة رحلة التوصيل #${finalTrip?.trip_number}: [${finalTrip?.status}] (متوقع: completed)`)
  console.log(`  • المبلغ المتوقع للرحلة: ${finalTrip?.expected_amount} ج.م | المحصل فعلياً: ${finalTrip?.collected_amount} ج.م`)
  console.log(`  • حالة الطيار النهائية تلقائياً: [${finalDriver?.status}] (متوقع: available)`)

  if (finalTrip?.status === 'completed' && finalDriver?.status === 'available') {
    console.log('\n🎉✨ نجح الإثبات بالكامل 100%! تم إسناد عدة طلبات وحسم قراراتها وتحرير الطيار تلقائياً وبدون أي تعارض.')
  } else {
    console.log('\n⚠️ تنبيه: تحقق من التفاصيل.')
  }
}

runMultiOrderDriverFlow().catch(console.error)
