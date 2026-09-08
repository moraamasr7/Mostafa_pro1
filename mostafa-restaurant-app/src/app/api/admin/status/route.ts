import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServerClient } from '@/lib/supabaseServer'
import { ADMIN_COOKIE_NAME } from '../login/route'
import { canTransitionStatus, OrderStatus, OrderType } from '@/types/orders'

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get(ADMIN_COOKIE_NAME)

    if (!sessionCookie || !sessionCookie.value.startsWith('staff_auth_')) {
      return NextResponse.json(
        { error: 'غير مصرح الوصول. يرجى تسجيل الدخول.' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { order_id, current_status, new_status, failure_reason, collected_amount } = body

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

    const serverSupabase = getSupabaseServerClient()

    if (new_status === 'failed' || (new_status === 'delivered' && failure_reason !== undefined)) {
      if (new_status === 'failed' && (!failure_reason || typeof failure_reason !== 'string' || !failure_reason.trim())) {
        return NextResponse.json(
          { error: 'سبب عدم التوصيل مطلوب عند تسجيل فشل التوصيل' },
          { status: 400 }
        )
      }

      const { data: rpcOutcome, error: rpcOutcomeErr } = await serverSupabase.rpc('record_delivery_outcome_secure', {
        p_order_id: order_id,
        p_outcome: new_status,
        p_failure_reason: failure_reason || null,
        p_collected_amount: collected_amount || 0.00,
        p_staff_actor: 'admin_cashier',
      })

      if (!rpcOutcomeErr && rpcOutcome && rpcOutcome.length > 0) {
        const res = rpcOutcome[0]
        if (!res.success) {
          return NextResponse.json({ error: res.message }, { status: 400 })
        }
        return NextResponse.json(
          {
            success: true,
            status: new_status,
            message: res.message,
            trip_completed: res.trip_completed,
            driver_released: res.driver_released,
          },
          { status: 200 }
        )
      }
    }

    const { data: rpcData, error: rpcError } = await serverSupabase.rpc('update_order_status_secure', {
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

    const { data: existingOrder, error: fetchErr } = await serverSupabase
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

    if (current_status && dbCurrentStatus !== current_status) {
      return NextResponse.json(
        {
          error: `تم تغيير حالة الطلب بالفعل بواسطة موظف آخر إلى: ${dbCurrentStatus}`,
          current_status: dbCurrentStatus,
        },
        { status: 409 }
      )
    }

    if (!canTransitionStatus(dbCurrentStatus, new_status as OrderStatus, dbOrderType)) {
      return NextResponse.json(
        {
          error: `تغيير الحالة غير مسموح من "${dbCurrentStatus}" إلى "${new_status}" للطلب نوع (${dbOrderType})`,
        },
        { status: 400 }
      )
    }

    const { error: updateErr } = await serverSupabase
      .from('orders')
      .update({ status: new_status })
      .eq('id', order_id)

    if (updateErr) {
      console.error('خطأ أثناء تحديث حالة الطلب:', updateErr)
      return NextResponse.json(
        { error: updateErr.message || 'فشل تحديث حالة الطلب في الداتابيز' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { success: true, status: new_status, message: 'تم تحديث الحالة بنجاح' },
      { status: 200 }
    )
  } catch (err: any) {
    console.error('خطأ غير متوقع في API تحديث الحالة:', err)
    return NextResponse.json(
      { error: err?.message || 'حدث خطأ غير متوقع' },
      { status: 500 }
    )
  }
}
