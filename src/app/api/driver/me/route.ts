import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import { DRIVER_COOKIE_NAME } from '../login/route'

export const dynamic = 'force-dynamic'

export async function GET() {
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

    // جلب بيانات الطيار
    const { data: driver, error: driverErr } = await supabase
      .from('drivers')
      .select('id, name, phone, is_active, status')
      .eq('id', driverId)
      .single()

    if (driverErr || !driver) {
      return NextResponse.json({ error: 'الطيار غير موجود' }, { status: 404 })
    }

    // جلب بيانات الوردية المفتوحة
    const { data: openShift } = await supabase
      .from('driver_shifts')
      .select('id, started_at, status')
      .eq('driver_id', driverId)
      .eq('status', 'open')
      .maybeSingle()

    // جلب خط السير النشط للطيار
    const { data: activeTrip } = await supabase
      .from('delivery_trips')
      .select(`
        id,
        trip_number,
        status,
        expected_amount,
        collected_amount,
        collection_status,
        dispatched_at,
        created_at,
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
            notes,
            status
          )
        )
      `)
      .eq('driver_id', driverId)
      .in('status', ['created', 'picked_up', 'out_for_delivery'])
      .order('created_at', { ascending: false })
      .maybeSingle()

    return NextResponse.json({
      driver,
      open_shift: openShift || null,
      active_trip: activeTrip || null,
    })
  } catch (err) {
    console.error('خطأ غير متوقع في API بيانات الطيار:', err)
    return NextResponse.json({ error: 'حدث خطأ غير متوقع' }, { status: 500 })
  }
}
