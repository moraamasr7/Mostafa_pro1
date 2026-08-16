import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { CreateOrderPayload, OrderItemInput } from '@/types/menu'

// خريطة حفظ الطلبات المؤقتة لمنع الطلبات المكررة في التردد السريع (Anti-duplicate submissions)
const recentOrdersMap = new Map<string, number>()

export async function POST(request: NextRequest) {
  try {
    const body: CreateOrderPayload = await request.json()
    const { customer_name, customer_phone, notes, order_type, delivery_address, items, turnstile_token } = body

    // === 1. التحقق من Turnstile حماية من البوتات ===
    const turnstileSecret = process.env.TURNSTILE_SECRET_KEY
    if (turnstileSecret) {
      const turnstileRes = await fetch(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            secret: turnstileSecret,
            response: turnstile_token || '',
          }),
        }
      )

      const turnstileData = await turnstileRes.json()
      if (!turnstileData.success) {
        return NextResponse.json(
          { error: 'فشل التحقق الأمني (Turnstile). يرجى المحاولة مرة أخرى.' },
          { status: 400 }
        )
      }
    }

    // === 2. التحقق الدقيق من المدخلات ===
    const cleanName = customer_name?.trim() || ''
    if (!cleanName || cleanName.length < 2 || cleanName.length > 100) {
      return NextResponse.json(
        { error: 'يرجى إدخال اسم صحيح (بين 2 و100 حرف)' },
        { status: 400 }
      )
    }

    const cleanPhone = customer_phone?.replace(/\s/g, '') || ''
    if (!/^01\d{9}$/.test(cleanPhone)) {
      return NextResponse.json(
        { error: 'رقم الموبايل غير صحيح (يجب أن يكون 11 رقم ويبدأ بـ 01)' },
        { status: 400 }
      )
    }

    const cleanOrderType = order_type ? order_type.trim().toLowerCase() : 'takeaway'
    if (!['takeaway', 'delivery', 'dine_in'].includes(cleanOrderType)) {
      return NextResponse.json(
        { error: 'نوع الطلب غير صحيح' },
        { status: 400 }
      )
    }

    const cleanDeliveryAddress = delivery_address?.trim() || ''
    if (cleanOrderType === 'delivery' && (!cleanDeliveryAddress || cleanDeliveryAddress.length < 5)) {
      return NextResponse.json(
        { error: 'عنوان التوصيل مطلوب وبحد أدنى 5 حروف عند طلب الدليفري' },
        { status: 400 }
      )
    }

    const cleanNotes = notes?.trim().slice(0, 500) || undefined

    if (!items || !Array.isArray(items) || items.length === 0 || items.length > 20) {
      return NextResponse.json(
        { error: 'السلة يجب أن تحتوي على صنف واحد على الأقل (وبحد أقصى 20 صنف)' },
        { status: 400 }
      )
    }

    for (const item of items) {
      if (!item.variant_id || typeof item.variant_id !== 'string') {
        return NextResponse.json(
          { error: 'مُعرّف الصنف غير صحيح' },
          { status: 400 }
        )
      }
      if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > 50) {
        return NextResponse.json(
          { error: 'الكمية لكل صنف يجب أن تكون رقماً صحيحاً بين 1 و 50' },
          { status: 400 }
        )
      }
    }

    // === 3. الحماية من إرسال طلب مكرر (Anti-Duplicate Submissions) ===
    const requestKey = `${cleanPhone}:${cleanOrderType}:${items.map(i => `${i.variant_id}:${i.quantity}`).sort().join(',')}`
    const now = Date.now()
    const lastSubmitTime = recentOrdersMap.get(requestKey)
    if (lastSubmitTime && now - lastSubmitTime < 10000) {
      return NextResponse.json(
        { error: 'تم استقبال طلبك بالفعل، يرجى الانتظار بضع ثوان قبل إعادة المحاولة.' },
        { status: 429 }
      )
    }
    recentOrdersMap.set(requestKey, now)

    if (recentOrdersMap.size > 500) {
      for (const [k, time] of recentOrdersMap.entries()) {
        if (now - time > 60000) recentOrdersMap.delete(k)
      }
    }

    // === 4. محاولة تنفيذ الطلب ذرّياً عبر RPC المحمية في Supabase ===
    const sanitizedItemsJson = items.map((item: OrderItemInput) => ({
      variant_id: item.variant_id,
      quantity: item.quantity,
      item_notes: item.item_notes?.trim().slice(0, 200) || null,
    }))

    const { data: rpcData, error: rpcError } = await supabase.rpc('create_order_secure', {
      p_customer_name: cleanName,
      p_customer_phone: cleanPhone,
      p_notes: cleanNotes || null,
      p_items: sanitizedItemsJson,
      p_order_type: cleanOrderType,
      p_delivery_address: cleanOrderType === 'delivery' ? cleanDeliveryAddress : null,
    })

    if (!rpcError && rpcData && rpcData.length > 0) {
      const createdOrder = rpcData[0]
      return NextResponse.json(
        {
          order_id: createdOrder.order_id,
          order_number: createdOrder.order_number,
          total_amount: createdOrder.total_amount,
          tracking_token: createdOrder.tracking_token,
        },
        { status: 201 }
      )
    }

    // === 5. fallback: إذا لم تكن دالة RPC محدثة في السيرفر، يتم استكمال الفحص يدوياً ===
    const variantIds = Array.from(new Set(items.map(i => i.variant_id)))

    const { data: dbVariants, error: fetchError } = await supabase
      .from('item_variants')
      .select(`
        id,
        price,
        is_available,
        menu_items!inner (
          is_available,
          categories!inner (
            is_active
          )
        )
      `)
      .in('id', variantIds)

    if (fetchError || !dbVariants) {
      console.error('خطأ في جلب بيانات الأصناف:', fetchError)
      return NextResponse.json(
        { error: 'تعذر التحقق من بيانات الأصناف من قاعدة البيانات' },
        { status: 500 }
      )
    }

    const variantMap = new Map<string, { price: number; available: boolean }>()
    interface VariantCheckRow {
      id: string
      price: number
      is_available: boolean
      menu_items?: {
        is_available: boolean
        categories?: {
          is_active: boolean
        }
      }
    }

    for (const v of (dbVariants as unknown as VariantCheckRow[])) {
      const isVariantAvail = v.is_available === true
      const isItemAvail = v.menu_items?.is_available === true
      const isCatActive = v.menu_items?.categories?.is_active === true
      const available = isVariantAvail && isItemAvail && isCatActive

      variantMap.set(v.id, {
        price: Number(v.price),
        available,
      })
    }

    for (const item of items) {
      const dbVariant = variantMap.get(item.variant_id)
      if (!dbVariant) {
        return NextResponse.json(
          { error: 'أحد الأصناف المطلوبة غير موجود في المنيو' },
          { status: 400 }
        )
      }
      if (!dbVariant.available) {
        return NextResponse.json(
          { error: 'عفواً، أحد الأصناف المطلوبة غير متوفر حالياً' },
          { status: 400 }
        )
      }
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        customer_name: cleanName,
        customer_phone: cleanPhone,
        order_type: cleanOrderType,
        delivery_address: cleanOrderType === 'delivery' ? cleanDeliveryAddress : null,
        status: 'pending',
        notes: cleanNotes || null,
      })
      .select('id, order_number, tracking_token')
      .single()

    if (orderError || !order) {
      console.error('خطأ أثناء حفظ الطلب:', orderError)
      return NextResponse.json(
        { error: 'حصلت مشكلة أثناء تسجيل الطلب، يرجى المحاولة لاحقاً.' },
        { status: 500 }
      )
    }

    const orderItemsToInsert = items.map((line) => {
      const dbPrice = variantMap.get(line.variant_id)!.price
      return {
        order_id: order.id,
        variant_id: line.variant_id,
        quantity: line.quantity,
        unit_price: dbPrice,
        item_notes: line.item_notes?.trim().slice(0, 200) || null,
      }
    })

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItemsToInsert)

    if (itemsError) {
      console.error('خطأ أثناء حفظ عناصر الطلب، يتم التراجع عن الطلب المعزول:', itemsError)
      await supabase.from('orders').delete().eq('id', order.id)
      return NextResponse.json(
        { error: 'فشل تسجيل أصناف الطلب. تم إلغاء المحاولة للحفاظ على سلامة البيانات.' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        order_id: order.id,
        order_number: order.order_number,
        tracking_token: order.tracking_token,
      },
      { status: 201 }
    )
  } catch (err) {
    console.error('خطأ غير متوقع في API الطلبات:', err)
    return NextResponse.json(
      { error: 'حدث خطأ غير متوقع في النظام. يرجى المحاولة لاحقاً.' },
      { status: 500 }
    )
  }
}
