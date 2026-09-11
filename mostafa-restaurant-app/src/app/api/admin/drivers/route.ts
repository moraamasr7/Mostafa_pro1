import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServerClient } from '@/lib/supabaseServer'
import { ADMIN_COOKIE_NAME } from '../login/route'
import { calculateFleetDriversAccounting } from '@/lib/driverAccounting'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
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

    // 1. Fetch active daily shift if any to isolate shifts & expenses to the current operational window
    const { data: activeDailyShift } = await serverSupabase
      .from('daily_shifts')
      .select('id, opened_at, status')
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // 2. Fetch fleet accounting using shared engine
    let fleetAccounting: Awaited<ReturnType<typeof calculateFleetDriversAccounting>> | null = null
    if (activeDailyShift) {
      fleetAccounting = await calculateFleetDriversAccounting(
        serverSupabase,
        activeDailyShift.id,
        activeDailyShift.opened_at
      )
    }

    // 3. Fetch drivers with active assignments for status tracking
    const { data: drivers, error } = await serverSupabase
      .from('drivers')
      .select(`
        id,
        name,
        is_active,
        status,
        created_at,
        driver_shifts (
          id,
          status
        ),
        order_driver_assignments (
          id,
          order_id,
          status
        )
      `)
      .order('name', { ascending: true })

    if (error) {
      console.error('خطأ في جلب طاقم الطيارين:', error)
      return NextResponse.json(
        { error: 'تعذر جلب بيانات الطيارين' },
        { status: 500 }
      )
    }

    interface ShiftRow { id: string; status: string }
    interface AssignmentRow { id: string; order_id: string; status: string }
    interface DriverQueryRow {
      id: string
      name: string
      is_active: boolean
      status: string
      created_at: string
      driver_shifts?: ShiftRow[]
      order_driver_assignments?: AssignmentRow[]
    }

    const accountingMap = new Map<string, any>()
    if (fleetAccounting) {
      for (const item of fleetAccounting.driver_summaries) {
        accountingMap.set(item.driver_id, item.accounting)
      }
    }

    const formattedDrivers = ((drivers as unknown as DriverQueryRow[]) || []).map((d) => {
      const openShift = (d.driver_shifts || []).find((s) => s.status === 'open')
      const activeAssignments = (d.order_driver_assignments || []).filter((a) =>
        ['assigned', 'accepted', 'picked_up', 'out_for_delivery'].includes(a.status)
      )
      const outForDeliveryCount = (d.order_driver_assignments || []).filter((a) =>
        a.status === 'out_for_delivery'
      ).length

      const accounting = accountingMap.get(d.id) || null

      return {
        id: d.id,
        name: d.name,
        is_active: d.is_active,
        status: d.status,
        created_at: d.created_at,
        active_shift_id: openShift ? openShift.id : (accounting?.shift_id || null),
        assigned_orders_count: activeAssignments.length,
        out_for_delivery_orders_count: outForDeliveryCount,
        current_order_id: activeAssignments.length > 0 ? activeAssignments[0].order_id : null,
        accounting,
      }
    })

    return NextResponse.json({
      drivers: formattedDrivers,
      fleet_accounting: fleetAccounting ? {
        hourly_rate: fleetAccounting.hourly_rate,
        drivers_count: fleetAccounting.drivers_count,
        total_hours: fleetAccounting.total_hours,
        total_hours_wage: fleetAccounting.total_hours_wage,
        total_delivered_orders: fleetAccounting.total_delivered_orders,
        total_delivery_commissions: fleetAccounting.total_delivery_commissions,
        total_driver_advances: fleetAccounting.total_driver_advances,
        total_net_payout: fleetAccounting.total_net_payout,
      } : null
    }, { status: 200 })
  } catch (err) {
    console.error('خطأ غير متوقع في API الطيارين:', err)
    return NextResponse.json(
      { error: 'حدث خطأ غير متوقع' },
      { status: 500 }
    )
  }
}

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
    const { name, phone } = body

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json(
        { error: 'اسم الطيار مطلوب وبحد أدنى حرفين' },
        { status: 400 }
      )
    }

    const cleanPhone = phone ? String(phone).replace(/\s/g, '') : ''
    if (!/^01\d{9}$/.test(cleanPhone)) {
      return NextResponse.json(
        { error: 'رقم الموبايل غير صحيح (يجب أن يكون 11 رقم ويبدأ بـ 01)' },
        { status: 400 }
      )
    }

    const serverSupabase = getSupabaseServerClient()

    // 1. Create public driver record
    const { data: newDriver, error: driverErr } = await serverSupabase
      .from('drivers')
      .insert({
        name: name.trim(),
        is_active: true,
        status: 'offline',
      })
      .select('id, name, is_active, status')
      .single()

    if (driverErr || !newDriver) {
      console.error('خطأ في إضافة الطيار:', driverErr)
      return NextResponse.json(
        { error: 'تعذر إضافة الطيار' },
        { status: 500 }
      )
    }

    // 2. Create secure credentials record in driver_credentials
    const { error: credsErr } = await serverSupabase
      .from('driver_credentials')
      .insert({
        driver_id: newDriver.id,
        phone: cleanPhone,
      })

    if (credsErr) {
      console.error('خطأ في حفظ اعتماد الطيار:', credsErr)
      if (credsErr.code === '23505') {
        await serverSupabase.from('drivers').delete().eq('id', newDriver.id)
        return NextResponse.json(
          { error: 'رقم الموبايل مسجل بالفعل لطيار آخر' },
          { status: 409 }
        )
      }
    }

    return NextResponse.json(
      { success: true, driver: newDriver, message: 'تم إضافة الطيار وحفظ بياناته بنجاح' },
      { status: 201 }
    )
  } catch (err) {
    console.error('خطأ غير متوقع في إضافة الطيار:', err)
    return NextResponse.json(
      { error: 'حدث خطأ غير متوقع' },
      { status: 500 }
    )
  }
}
