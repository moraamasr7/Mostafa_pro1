import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServerClient } from '@/lib/supabaseServer'
import { DRIVER_COOKIE_NAME } from '../login/route'

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get(DRIVER_COOKIE_NAME)

    if (!sessionCookie || !sessionCookie.value.startsWith('driver_auth_')) {
      return NextResponse.json(
        { error: 'غير مصرح الوصول. يرجى تسجيل دخول الطيار.' },
        { status: 401 }
      )
    }

    const driverId = sessionCookie.value.split('_')[2]
    const body = await request.json()
    const { action, trip_id, order_id, outcome, failure_reason, collected_amount } = body

    const serverSupabase = getSupabaseServerClient()

    if (action === 'pickup') {
      if (!trip_id) return NextResponse.json({ error: 'معرف الرحلة مطلوب' }, { status: 400 })

      const { error: tripErr } = await serverSupabase
        .from('delivery_trips')
        .update({ status: 'picked_up', dispatched_at: new Date().toISOString() })
        .eq('id', trip_id)
        .eq('driver_id', driverId)

      if (tripErr) {
        return NextResponse.json({ error: 'فشل تسجيل استلام الرحلة من المطعم' }, { status: 500 })
      }

      const { data: assignments } = await serverSupabase
        .from('order_driver_assignments')
        .select('order_id')
        .eq('trip_id', trip_id)

      if (assignments) {
        for (const a of assignments) {
          await serverSupabase.rpc('update_delivery_status_secure', {
            p_order_id: a.order_id,
            p_new_status: 'picked_up',
          })
        }
      }

      return NextResponse.json({ message: 'تم تسجيل استلام طلبات الرحلة من المطبخ بنجاح' })
    }

    if (action === 'out_for_delivery') {
      if (!trip_id) return NextResponse.json({ error: 'معرف الرحلة مطلوب' }, { status: 400 })

      const { error: tripErr } = await serverSupabase
        .from('delivery_trips')
        .update({ status: 'out_for_delivery', dispatched_at: new Date().toISOString() })
        .eq('id', trip_id)
        .eq('driver_id', driverId)

      if (tripErr) {
        return NextResponse.json({ error: 'فشل التحديث إلى خرج للتوصيل' }, { status: 500 })
      }

      const { data: assignments } = await serverSupabase
        .from('order_driver_assignments')
        .select('order_id')
        .eq('trip_id', trip_id)

      if (assignments) {
        for (const a of assignments) {
          await serverSupabase.rpc('update_delivery_status_secure', {
            p_order_id: a.order_id,
            p_new_status: 'out_for_delivery',
          })
        }
      }

      return NextResponse.json({ message: 'تم التسجيل: خرجت للعميل بنجاح' })
    }

    if (action === 'record_outcome') {
      if (!order_id || !outcome) {
        return NextResponse.json({ error: 'معرف الطلب والنتيجة مطلوبة' }, { status: 400 })
      }

      const { data: assignment } = await serverSupabase
        .from('order_driver_assignments')
        .select('id')
        .eq('order_id', order_id)
        .eq('driver_id', driverId)
        .in('status', ['assigned', 'accepted', 'picked_up', 'out_for_delivery'])
        .maybeSingle()

      if (!assignment) {
        return NextResponse.json(
          { error: 'غير مصرح للطيار بتسجيل نتيجة هذا الطلب أو تم إعادة تعيينه' },
          { status: 403 }
        )
      }

      const { data: rpcData, error: rpcErr } = await serverSupabase.rpc('record_delivery_outcome_secure', {
        p_order_id: order_id,
        p_outcome: outcome,
        p_failure_reason: failure_reason || null,
        p_collected_amount: collected_amount || 0.00,
        p_staff_actor: 'driver',
      })

      if (rpcErr) {
        return NextResponse.json({ error: rpcErr.message || 'فشل تسجيل نتيجة التوصيل' }, { status: 400 })
      }

      const result = Array.isArray(rpcData) ? rpcData[0] : rpcData
      return NextResponse.json({ message: result?.message || 'تم تسجيل نتيجة التوصيل بنجاح' })
    }

    if (action === 'complete_trip') {
      if (!trip_id) return NextResponse.json({ error: 'معرف الرحلة مطلوب' }, { status: 400 })

      const { data: rpcData, error: rpcErr } = await serverSupabase.rpc('complete_delivery_trip_secure', {
        p_trip_id: trip_id,
      })

      if (rpcErr) {
        return NextResponse.json({ error: rpcErr.message || 'تعذر إغلاق الرحلة، توجد طلبات معلقة' }, { status: 400 })
      }

      const result = Array.isArray(rpcData) ? rpcData[0] : rpcData
      return NextResponse.json({ message: result?.message || 'تم إغلاق رحلة التوصيل بنجاح' })
    }

    return NextResponse.json({ error: 'إجراء غير معروف' }, { status: 400 })
  } catch (err) {
    console.error('خطأ غير متوقع في API إجراءات الطيار:', err)
    return NextResponse.json({ error: 'حدث خطأ غير متوقع' }, { status: 500 })
  }
}
