import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServerClient } from '@/lib/supabaseServer'
import { ADMIN_COOKIE_NAME } from '../../login/route'
import { getActiveDailyShift } from '@/lib/shiftGuard'

export const dynamic = 'force-dynamic'

interface ManualOrderItemInput {
  variant_id: string
  quantity: number
  item_notes?: string
}

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate Staff Session
    let sessionCookieValue: string | undefined = request.cookies?.get(ADMIN_COOKIE_NAME)?.value
    if (!sessionCookieValue) {
      try {
        const cookieStore = await cookies()
        sessionCookieValue = cookieStore.get(ADMIN_COOKIE_NAME)?.value
      } catch {}
    }

    if (!sessionCookieValue || !sessionCookieValue.startsWith('staff_auth_')) {
      return NextResponse.json(
        { error: 'غير مصرح الوصول. يرجى تسجيل الدخول بكود الكاشير.' },
        { status: 401 }
      )
    }

    const serverSupabase = getSupabaseServerClient()

    // 2. Fetch Open Daily Shift Server-Side
    const shiftCheck = await getActiveDailyShift(serverSupabase)
    if (!shiftCheck.hasActiveShift || !shiftCheck.activeShiftId) {
      return NextResponse.json(
        { error: 'أمان التشغيل: لا توجد وردية يومية مفتوحة حالياً. يرجى فتح الوردية وتحديد العهدة لتسجيل الطلبات اليدوية.' },
        { status: 403 }
      )
    }

    // Determine staff identity from shift or fallback
    const authenticatedStaff = shiftCheck.openedBy || 'كاشير الوردية'

    // 3. Parse & Validate Client Payload
    const body = await request.json()
    const {
      customer_name,
      customer_phone,
      order_type,
      delivery_address,
      payment_method,
      notes,
      items,
    } = body

    // 4. Validate Customer Details
    if (!customer_name || typeof customer_name !== 'string' || !customer_name.trim()) {
      return NextResponse.json(
        { error: 'اسم العميل مطلوب' },
        { status: 400 }
      )
    }

    if (!customer_phone || typeof customer_phone !== 'string' || !/^01[0-9]{9}$/.test(customer_phone.trim())) {
      return NextResponse.json(
        { error: 'رقم الموبايل غير صحيح (يجب أن يكون 11 رقم ويبدأ بـ 01)' },
        { status: 400 }
      )
    }

    // 5. Validate Order Type
    const validOrderType = (order_type && typeof order_type === 'string') ? order_type.trim() : 'takeaway'
    if (!['takeaway', 'delivery', 'dine_in'].includes(validOrderType)) {
      return NextResponse.json(
        { error: 'نوع الطلب غير صحيح (يجب أن يكون takeaway أو delivery أو dine_in)' },
        { status: 400 }
      )
    }

    // 6. Validate Delivery Requirements
    if (validOrderType === 'delivery') {
      if (!delivery_address || typeof delivery_address !== 'string' || delivery_address.trim().length < 5) {
        return NextResponse.json(
          { error: 'عنوان التوصيل مطلوب بحد أدنى 5 حروف عند اختيار الدليفري' },
          { status: 400 }
        )
      }
    }

    // 7. Validate Payment Method
    const validPaymentMethod = (payment_method && typeof payment_method === 'string') ? payment_method.trim() : 'cash'
    if (!['cash', 'instapay', 'wallet', 'card'].includes(validPaymentMethod)) {
      return NextResponse.json(
        { error: 'طريقة الدفع غير مقبولة (المقبول: cash, instapay, wallet, card)' },
        { status: 400 }
      )
    }

    // 8. Validate Items
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'يجب اختيار صنف واحد على الأقل' },
        { status: 400 }
      )
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const sanitizedItems: ManualOrderItemInput[] = []

    for (let idx = 0; idx < items.length; idx++) {
      const itm = items[idx]
      if (!itm || typeof itm !== 'object') {
        return NextResponse.json(
          { error: 'بيانات الصنف رقم ' + (idx + 1) + ' غير صحيحة' },
          { status: 400 }
        )
      }

      if (!itm.variant_id || !uuidRegex.test(String(itm.variant_id).trim())) {
        return NextResponse.json(
          { error: 'معرف الصنف رقم ' + (idx + 1) + ' غير صحيح' },
          { status: 400 }
        )
      }

      const qty = Number(itm.quantity)
      if (isNaN(qty) || !Number.isInteger(qty) || qty <= 0 || qty > 50) {
        return NextResponse.json(
          { error: 'الكمية غير صحيحة للصنف رقم ' + (idx + 1) + ' (يجب أن تكون بين 1 و 50)' },
          { status: 400 }
        )
      }

      sanitizedItems.push({
        variant_id: String(itm.variant_id).trim(),
        quantity: qty,
        item_notes: itm.item_notes && typeof itm.item_notes === 'string' ? itm.item_notes.trim() : undefined,
      })
    }

    // 9. Execute Atomic RPC Transaction
    // Pricing is calculated strictly server-side inside create_manual_order_secure
    // Client total_amount, order_source, daily_shift_id, created_by_staff are completely ignored.
    const { data: rpcData, error: rpcError } = await serverSupabase.rpc('create_manual_order_secure', {
      p_customer_name: customer_name.trim(),
      p_customer_phone: customer_phone.trim(),
      p_order_type: validOrderType,
      p_payment_method: validPaymentMethod,
      p_delivery_address: validOrderType === 'delivery' ? delivery_address.trim() : null,
      p_notes: notes && typeof notes === 'string' ? notes.trim() : null,
      p_items: sanitizedItems,
      p_daily_shift_id: shiftCheck.activeShiftId,
      p_created_by_staff: authenticatedStaff,
    })

    if (rpcError || !rpcData || rpcData.length === 0) {
      console.error('Error creating manual order via RPC:', rpcError)
      const errorMsg = rpcError?.message || 'تعذر تسجيل الطلب اليدوي'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const createdOrder = rpcData[0]

    return NextResponse.json(
      {
        success: true,
        message: 'تم تسجيل الطلب اليدوي بنجاح',
        order: {
          id: createdOrder.order_id,
          order_number: createdOrder.order_number,
          order_source: 'manual',
          order_type: validOrderType,
          total_amount: createdOrder.total_amount,
          daily_shift_id: shiftCheck.activeShiftId,
          created_by_staff: authenticatedStaff,
          tracking_token: createdOrder.tracking_token,
        },
      },
      { status: 201 }
    )
  } catch (err: any) {
    console.error('Unexpected error in manual order route:', err)
    return NextResponse.json(
      { error: 'حدث خطأ غير متوقع أثناء تسجيل الطلب اليدوي' },
      { status: 500 }
    )
  }
}
