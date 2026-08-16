import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import { ADMIN_COOKIE_NAME } from '../login/route'
import { canTransitionStatus, OrderStatus, OrderType } from '@/types/orders'

export async function POST(request: NextRequest) {
  try {
    // 1. التحقق من صلاحية الجلسة لكاشير/إدارة المطعم
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get(ADMIN_COOKIE_NAME)

    if (!sessionCookie || !sessionCookie.value.startsWith('staff_auth_')) {
      return NextResponse.json(
        { error: 'غير مصرح الوصول. يرجى تسجيل الدخول.' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { order_id, current_status, new_status } = body

    if (!order_id || typeof order_id !== 'string') {
      return NextResponse.json(
        { error: 'مُعرّف الطلب غير صحيح' },
        { status: 400 }
      )
    }

    if (!new_status || typeof new_status !== 'string') {
      return NextResponse.json(
        { error: 'الحالة الجديدة مطلوبة' },
        { status: 400 }
      )
    }

    // 2. محاولة التنفيذ عبر RPC المخصصة لدورة الحياة والتماسك وحماية التزامن
    const { data: rpcData, error: rpcError } = await supabase.rpc('update_order_status_secure', {
      p_order_id: order_id,
      p_expected_status: current_status || null,
      p_new_status: new_status,
    })

    if (!rpcError && rpcData && rpcData.length > 0) {
      const res = rpcData[0]
      if (!res.success) {
        return NextResponse.json(
          { error: res.message, current_status: res.updated_status },
          { status: 409 }
        )
      }
      return NextResponse.json(
        { success: true, message: res.message, status: res.updated_status },
        { status: 200 }
      )
    }

    // 3. fallback: التحقق من التزامن والانتقالات المسموحة من الموديول المركزي للأوامر
    const { data: existingOrder, error: fetchErr } = await supabase
      .from('orders')
      .select('id, status, order_type')
      .eq('id', order_id)
      .single()

    if (fetchErr || !existingOrder) {
      return NextResponse.json(
        { error: 'الطلب غير موجود' },
        { status: 404 }
      )
    }

    const dbCurrentStatus = existingOrder.status as OrderStatus
    const dbOrderType = (existingOrder.order_type || 'takeaway') as OrderType

    // حماية التزامن: التأكد من أن الحالة الحالية لم تتغير من قِبَل موظف آخر
    if (current_status && dbCurrentStatus !== current_status) {
      return NextResponse.json(
        {
          error: `تم تغيير حالة الطلب بالفعل بواسطة موظف آخر إلى: ${dbCurrentStatus}`,
          current_status: dbCurrentStatus,
        },
        { status: 409 }
      )
    }

    // التحقق الموحد من قواعد دورة الحياة والانتقال
    if (!canTransitionStatus(dbCurrentStatus, new_status as OrderStatus, dbOrderType)) {
      return NextResponse.json(
        {
          error: `تغيير الحالة غير مسموح من "${dbCurrentStatus}" إلى "${new_status}" للطلب نوع (${dbOrderType})`,
        },
        { status: 400 }
      )
    }

    // تحديث الحالة فقط
    const { error: updateErr } = await supabase
      .from('orders')
      .update({ status: new_status })
      .eq('id', order_id)

    if (updateErr) {
      console.error('خطأ أثناء تحديث حالة الطلب:', updateErr)
      return NextResponse.json(
        { error: 'فشل تحديث حالة الطلب' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { success: true, status: new_status, message: 'تم تحديث الحالة بنجاح' },
      { status: 200 }
    )
  } catch (err) {
    console.error('خطأ غير متوقع في API تحديث الحالة:', err)
    return NextResponse.json(
      { error: 'حدث خطأ غير متوقع' },
      { status: 500 }
    )
  }
}
