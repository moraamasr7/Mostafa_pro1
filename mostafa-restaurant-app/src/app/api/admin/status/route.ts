import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServerClient } from '@/lib/supabaseServer'
import { ADMIN_COOKIE_NAME } from '../login/route'
import { notifyOrderCancelled } from '@/lib/telegram'
import { getActiveDailyShift } from '@/lib/shiftGuard'

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

    const serverSupabase = getSupabaseServerClient()

    // 🔒 Shift Guard: منع تحديث حالات الطلبات في غياب وردية يومية مفتوحة
    const shiftCheck = await getActiveDailyShift(serverSupabase)
    if (!shiftCheck.hasActiveShift) {
      return NextResponse.json(
        { error: 'أمان التشغيل: لا توجد وردية يومية مفتوحة حالياً. يرجى فتح الوردية وتحديد العهدة لبدء العمليات.' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { order_id, current_status, new_status, failure_reason, collected_amount } = body

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

      if (rpcOutcomeErr) {
        console.error('خطأ RPC تسجيل نتيجة التوصيل:', rpcOutcomeErr)
        return NextResponse.json(
          { error: rpcOutcomeErr.message || 'تعذر تسجيل نتيجة التوصيل' },
          { status: 400 }
        )
      }

      if (rpcOutcome && rpcOutcome.length > 0) {
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

    const reasonText = failure_reason || body.reason || null

    const { data: rpcData, error: rpcError } = await serverSupabase.rpc('update_order_status_secure', {
      p_order_id: order_id,
      p_expected_status: current_status || null,
      p_new_status: new_status,
      p_reason: reasonText,
    })

    if (rpcError) {
      console.error('خطأ RPC تحديث حالة الطلب:', rpcError)
      return NextResponse.json(
        { error: rpcError.message || 'تعذر تحديث حالة الطلب عبر الدالة الآمنة' },
        { status: 400 }
      )
    }

    if (rpcData && rpcData.length > 0) {
      const res = rpcData[0]
      if (!res.success) {
        return NextResponse.json(
          { error: res.message, current_status: res.updated_status },
          { status: 409 }
        )
      }
      if (new_status === 'cancelled' || new_status === 'failed') {
        Promise.resolve(
          serverSupabase
            .from('orders')
            .select('order_number, customer_name, total_amount')
            .eq('id', order_id)
            .single()
        )
          .then(({ data: ord }) => {
            if (ord) {
              notifyOrderCancelled({
                orderNumber: ord.order_number,
                customerName: ord.customer_name,
                totalAmount: Number(ord.total_amount || 0),
                cancelledBy: 'الكاشير',
                reason: failure_reason || 'إلغاء يدوي من لوحة الإدارة',
              }).catch(() => {})
            }
          })
          .catch(() => {})
      }

      return NextResponse.json(
        { success: true, message: res.message, status: res.updated_status },
        { status: 200 }
      )
    }

    return NextResponse.json(
      { error: 'لم يتم استرجاع نتيجة من دالة تحديث الحالة' },
      { status: 500 }
    )
  } catch (err: any) {
    console.error('خطأ غير متوقع في API تحديث الحالة:', err)
    return NextResponse.json(
      { error: err?.message || 'حدث خطأ غير متوقع' },
      { status: 500 }
    )
  }
}
