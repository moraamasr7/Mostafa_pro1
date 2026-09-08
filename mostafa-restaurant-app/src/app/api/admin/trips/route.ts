import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServerClient } from '@/lib/supabaseServer'
import { ADMIN_COOKIE_NAME } from '../login/route'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get(ADMIN_COOKIE_NAME)

    if (!sessionCookie || !sessionCookie.value.startsWith('staff_auth_')) {
      return NextResponse.json(
        { error: 'غير مصرح الوصول. يرجى تسجيل الدخول بكود الإدارة.' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const driverId = searchParams.get('driver_id')
    const serverSupabase = getSupabaseServerClient()

    let query = serverSupabase
      .from('delivery_trips')
      .select(`
        id,
        trip_number,
        driver_id,
        shift_id,
        status,
        expected_amount,
        collected_amount,
        collection_status,
        dispatched_at,
        completed_at,
        created_at,
        drivers (
          id,
          name
        ),
        order_driver_assignments (
          id,
          order_id,
          status,
          assigned_at,
          orders (
            id,
            order_number,
            customer_name,
            customer_phone,
            delivery_address,
            total_amount,
            status
          )
        )
      `)
      .order('created_at', { ascending: false })

    if (driverId) {
      query = query.eq('driver_id', driverId)
    }

    const { data: trips, error } = await query

    if (error) {
      console.error('خطأ في جلب رحلات التوصيل:', error)
      return NextResponse.json({ error: 'تعذر جلب بيانات رحلات التوصيل' }, { status: 500 })
    }

    return NextResponse.json({ trips: trips || [] }, { status: 200 })
  } catch (err) {
    console.error('خطأ غير متوقع في API رحلات التوصيل:', err)
    return NextResponse.json({ error: 'حدث خطأ غير متوقع' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get(ADMIN_COOKIE_NAME)

    if (!sessionCookie || !sessionCookie.value.startsWith('staff_auth_')) {
      return NextResponse.json(
        { error: 'غير مصرح الوصول. يرجى تسجيل الدخول بكود الإدارة.' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { action, driver_id, order_ids, trip_id, order_id, outcome, failure_reason, collected_amount, new_status } = body
    const serverSupabase = getSupabaseServerClient()

    if (action === 'create') {
      if (!driver_id || !Array.isArray(order_ids) || order_ids.length === 0) {
        return NextResponse.json(
          { error: 'الطيار وتحديد طلب واحد على الأقل مطلوبة لإنشاء خط سير' },
          { status: 400 }
        )
      }

      if (order_ids.length > 5) {
        return NextResponse.json(
          { error: 'الحد الأقصى لخط السير الواحد هو 5 طلبات دليفري فقط' },
          { status: 400 }
        )
      }

      const formattedOrderIds = order_ids.map((id: string) => ({ order_id: id }))

      const { data: rpcData, error: rpcErr } = await serverSupabase.rpc('create_delivery_trip_secure', {
        p_driver_id: driver_id,
        p_order_ids: formattedOrderIds,
      })

      if (rpcErr) {
        console.error('خطأ RPC في إنشاء خط السير:', rpcErr)
        return NextResponse.json(
          { error: rpcErr.message || 'فشل إنشاء خط السير' },
          { status: 400 }
        )
      }

      const result = Array.isArray(rpcData) ? rpcData[0] : rpcData
      if (!result?.success) {
        return NextResponse.json({ error: result?.message || 'فشل إنشاء خط السير' }, { status: 400 })
      }

      return NextResponse.json({
        message: result.message,
        trip_id: result.trip_id,
        trip_number: result.trip_number,
      })
    }

    if (action === 'record_outcome') {
      if (!order_id || !outcome) {
        return NextResponse.json(
          { error: 'معرف الطلب ونتيجة التوصيل مطلوبة' },
          { status: 400 }
        )
      }

      const { data: rpcData, error: rpcErr } = await serverSupabase.rpc('record_delivery_outcome_secure', {
        p_order_id: order_id,
        p_outcome: outcome,
        p_failure_reason: failure_reason || null,
        p_collected_amount: collected_amount || 0.00,
        p_staff_actor: 'staff',
      })

      if (rpcErr) {
        console.error('خطأ RPC في تسجيل نتيجة التوصيل:', rpcErr)
        return NextResponse.json(
          { error: rpcErr.message || 'فشل تسجيل نتيجة التوصيل' },
          { status: 400 }
        )
      }

      const result = Array.isArray(rpcData) ? rpcData[0] : rpcData
      return NextResponse.json({ message: result?.message || 'تم تسجيل نتيجة التوصيل بنجاح' })
    }

    if (action === 'complete_trip') {
      if (!trip_id) {
        return NextResponse.json({ error: 'معرف خط السير مطلوب' }, { status: 400 })
      }

      const { data: rpcData, error: rpcErr } = await serverSupabase.rpc('complete_delivery_trip_secure', {
        p_trip_id: trip_id,
      })

      if (rpcErr) {
        console.error('خطأ RPC في إغلاق خط السير:', rpcErr)
        return NextResponse.json(
          { error: rpcErr.message || 'فشل إغلاق خط السير' },
          { status: 400 }
        )
      }

      const result = Array.isArray(rpcData) ? rpcData[0] : rpcData
      return NextResponse.json({ message: result?.message || 'تم إغلاق خط السير بنجاح' })
    }

    if (action === 'update_status') {
      if (!trip_id || !new_status) {
        return NextResponse.json(
          { error: 'معرف خط السير والحالة الجديدة مطلوبة' },
          { status: 400 }
        )
      }

      const updatePayload: Record<string, string> = { status: new_status }
      if (new_status === 'picked_up' || new_status === 'out_for_delivery') {
        updatePayload.dispatched_at = new Date().toISOString()
      }
      if (new_status === 'completed' || new_status === 'cancelled') {
        updatePayload.completed_at = new Date().toISOString()
      }

      const { error: tripUpdateErr } = await serverSupabase
        .from('delivery_trips')
        .update(updatePayload)
        .eq('id', trip_id)

      if (tripUpdateErr) {
        console.error('خطأ في تحديث حالة خط السير:', tripUpdateErr)
        return NextResponse.json({ error: 'فشل تحديث حالة خط السير' }, { status: 500 })
      }

      return NextResponse.json({ message: 'تم تحديث حالة خط السير بنجاح' })
    }

    return NextResponse.json({ error: 'إجراء غير معروف' }, { status: 400 })
  } catch (err) {
    console.error('خطأ غير متوقع في API خطوط السير:', err)
    return NextResponse.json({ error: 'حدث خطأ غير متوقع' }, { status: 500 })
  }
}
