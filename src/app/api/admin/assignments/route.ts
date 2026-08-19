import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
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
    const { action, order_id, driver_id, new_status } = body

    if (!order_id || typeof order_id !== 'string') {
      return NextResponse.json(
        { error: 'مُعرّف الطلب مطلوب' },
        { status: 400 }
      )
    }

    // 1. تعيين طلب دليفري لطيار أول مرة
    if (action === 'assign') {
      if (!driver_id || typeof driver_id !== 'string') {
        return NextResponse.json(
          { error: 'مُعرّف الطيار مطلوب' },
          { status: 400 }
        )
      }

      const { data: rpcData, error: rpcErr } = await supabase.rpc('assign_order_to_driver_secure', {
        p_order_id: order_id,
        p_driver_id: driver_id,
      })

      if (rpcErr) {
        console.error('خطأ RPC تعيين الطلب:', rpcErr)
        return NextResponse.json(
          { error: rpcErr.message || 'تعذر تعيين الطلب للطيار' },
          { status: 400 }
        )
      }

      if (rpcData && rpcData.length > 0) {
        const res = rpcData[0]
        if (!res.success) {
          return NextResponse.json({ error: res.message }, { status: 400 })
        }
        return NextResponse.json(
          { success: true, message: res.message, assignment_id: res.assignment_id },
          { status: 200 }
        )
      }
    }

    // 2. إعادة تعيين طلب لطيار آخر
    if (action === 'reassign') {
      if (!driver_id || typeof driver_id !== 'string') {
        return NextResponse.json(
          { error: 'مُعرّف الطيار الجديد مطلوب' },
          { status: 400 }
        )
      }

      const { data: rpcData, error: rpcErr } = await supabase.rpc('reassign_order_secure', {
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

    // 3. تحديث حالة توصيل الطلب (picked_up, out_for_delivery, delivered, cancelled)
    if (action === 'update_status') {
      if (!new_status || typeof new_status !== 'string') {
        return NextResponse.json(
          { error: 'الحالة الجديدة مطلوبة' },
          { status: 400 }
        )
      }

      const { data: rpcData, error: rpcErr } = await supabase.rpc('update_delivery_status_secure', {
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
  } catch (err) {
    console.error('خطأ غير متوقع في API التعيينات:', err)
    return NextResponse.json(
      { error: 'حدث خطأ غير متوقع' },
      { status: 500 }
    )
  }
}
