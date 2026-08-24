import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServerClient } from '@/lib/supabaseServer'
import { ADMIN_COOKIE_NAME } from '../login/route'

export const dynamic = 'force-dynamic'

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
    const { action, order_id, order_ids, driver_id, new_status } = body

    const serverSupabase = getSupabaseServerClient()

    if (action === 'assign') {
      if (!driver_id || typeof driver_id !== 'string') {
        return NextResponse.json(
          { error: 'مُعرّف الطيار مطلوب' },
          { status: 400 }
        )
      }

      let formattedOrderIds: Array<{ order_id: string }> = []
      if (Array.isArray(order_ids) && order_ids.length > 0) {
        formattedOrderIds = order_ids.map((id) => ({ order_id: typeof id === 'string' ? id : id.order_id }))
      } else if (order_id && typeof order_id === 'string') {
        formattedOrderIds = [{ order_id }]
      } else {
        return NextResponse.json(
          { error: 'يلزم تحديد طلب واحد على الأقل لإسناده للطيار' },
          { status: 400 }
        )
      }

      const { data: rpcData, error: rpcErr } = await serverSupabase.rpc('assign_orders_to_driver_secure', {
        p_driver_id: driver_id,
        p_order_ids: formattedOrderIds,
      })

      if (rpcErr) {
        console.error('خطأ RPC تعيين الطلبات للطيار:', rpcErr)
        return NextResponse.json(
          { error: rpcErr.message || 'تعذر تعيين الطلبات للطيار' },
          { status: 400 }
        )
      }

      if (rpcData && rpcData.length > 0) {
        const res = rpcData[0]
        if (!res.success) {
          return NextResponse.json({ error: res.message }, { status: 400 })
        }
        return NextResponse.json(
          { success: true, message: res.message, trip_id: res.trip_id, trip_number: res.trip_number },
          { status: 200 }
        )
      }
    }

    if (action === 'reassign') {
      if (!order_id || typeof order_id !== 'string') {
        return NextResponse.json(
          { error: 'مُعرّف الطلب مطلوب' },
          { status: 400 }
        )
      }

      if (!driver_id || typeof driver_id !== 'string') {
        return NextResponse.json(
          { error: 'مُعرّف الطيار الجديد مطلوب' },
          { status: 400 }
        )
      }

      const { data: rpcData, error: rpcErr } = await serverSupabase.rpc('reassign_order_secure', {
        p_order_id: order_id,
        p_new_driver_id: driver_id,
      })

      if (rpcErr) {
        console.error('خطأ RPC إعادة تعيين الطلب:', rpcErr)
        return NextResponse.json(
          { error: rpcErr.message || 'تعذر إعادة تعيين الطلب' },
          { status: 400 }
        )
      }

      if (rpcData && rpcData.length > 0) {
        const res = rpcData[0]
        if (!res.success) {
          return NextResponse.json({ error: res.message }, { status: 400 })
        }
        return NextResponse.json(
          { success: true, message: res.message, new_assignment_id: res.new_assignment_id },
          { status: 200 }
        )
      }
    }

    if (action === 'update_status') {
      if (!order_id || typeof order_id !== 'string') {
        return NextResponse.json(
          { error: 'مُعرّف الطلب مطلوب' },
          { status: 400 }
        )
      }

      if (!new_status || typeof new_status !== 'string') {
        return NextResponse.json(
          { error: 'الحالة الجديدة مطلوبة' },
          { status: 400 }
        )
      }

      const { data: rpcData, error: rpcErr } = await serverSupabase.rpc('update_delivery_status_secure', {
        p_order_id: order_id,
        p_new_status: new_status,
      })

      if (rpcErr) {
        console.error('خطأ RPC تحديث حالة التوصيل:', rpcErr)
        return NextResponse.json(
          { error: rpcErr.message || 'تعذر تحديث حالة التوصيل' },
          { status: 400 }
        )
      }

      if (rpcData && rpcData.length > 0) {
        const res = rpcData[0]
        if (!res.success) {
          return NextResponse.json({ error: res.message }, { status: 400 })
        }
        return NextResponse.json(
          { success: true, message: res.message },
          { status: 200 }
        )
      }
    }

    return NextResponse.json(
      { error: 'الإجراء غير معروف' },
      { status: 400 }
    )
  } catch (err: any) {
    console.error('خطأ غير متوقع في API التعيينات:', err)
    return NextResponse.json(
      { error: err?.message || 'حدث خطأ غير متوقع' },
      { status: 500 }
    )
  }
}
