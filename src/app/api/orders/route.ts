import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { CartLine } from '@/types/menu'

// واجهة بيانات الطلب الواردة من الفرونت
interface OrderPayload {
  items: CartLine[]
  customer_name: string
  customer_phone: string
  notes: string
  turnstile_token: string
}

export async function POST(request: NextRequest) {
  try {
    const body: OrderPayload = await request.json()
    const { items, customer_name, customer_phone, notes, turnstile_token } = body

    // === 1. التحقق من Turnstile أولاً — لو فشل، نرفض الطلب فوراً ===
    const turnstileRes = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret: process.env.TURNSTILE_SECRET_KEY || '',
          response: turnstile_token,
        }),
      }
    )

    const turnstileData = await turnstileRes.json()

    if (!turnstileData.success) {
      return NextResponse.json(
        { error: 'فشل التحقق من أنك مش روبوت. جرب تاني.' },
        { status: 400 }
      )
    }

    // === 2. التحقق من صحة البيانات ===
    if (!customer_name || customer_name.trim().length === 0) {
      return NextResponse.json(
        { error: 'الاسم مطلوب' },
        { status: 400 }
      )
    }

    // رقم مصري: 11 رقم يبدأ بـ 01
    const cleanPhone = customer_phone?.replace(/\s/g, '') || ''
    if (!/^01\d{9}$/.test(cleanPhone)) {
      return NextResponse.json(
        { error: 'رقم الموبايل لازم يكون 11 رقم ويبدأ بـ 01' },
        { status: 400 }
      )
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'السلة فاضية' },
        { status: 400 }
      )
    }

    // === 3. إنشاء الطلب في قاعدة البيانات ===
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        customer_name: customer_name.trim(),
        customer_phone: cleanPhone,
        order_type: 'takeaway',
        status: 'pending',
        notes: notes?.trim() || null,
      })
      .select('id, order_number')
      .single()

    if (orderError || !order) {
      console.error('خطأ في إنشاء الطلب:', orderError)
      return NextResponse.json(
        { error: 'حصل مشكلة في إنشاء الطلب. جرب تاني.' },
        { status: 500 }
      )
    }

    // === 4. إدخال أصناف الطلب — الأسعار من السلة مش من قاعدة البيانات ===
    // ليه؟ عشان لو السعر اتغير بين ما العميل فتح المنيو وبعت الطلب، نسجل السعر اللي شافه
    const orderItems = items.map((line) => ({
      order_id: order.id,
      variant_id: line.variant_id,
      quantity: line.quantity,
      unit_price: line.price,
      item_notes: line.item_notes || null,
    }))

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems)

    if (itemsError) {
      console.error('خطأ في إدخال أصناف الطلب:', itemsError)
      // الطلب اتعمل لكن الأصناف فشلت — حالة نادرة لكن لازم نتعامل معاها
      return NextResponse.json(
        { error: 'الطلب اتسجل لكن حصل مشكلة في الأصناف. تواصل مع المطعم.' },
        { status: 500 }
      )
    }

    // === 5. نرجع بيانات الطلب للفرونت ===
    return NextResponse.json(
      { order_id: order.id, order_number: order.order_number },
      { status: 201 }
    )
  } catch (err) {
    console.error('خطأ غير متوقع في API الطلبات:', err)
    return NextResponse.json(
      { error: 'حصل خطأ غير متوقع. جرب تاني.' },
      { status: 500 }
    )
  }
}
