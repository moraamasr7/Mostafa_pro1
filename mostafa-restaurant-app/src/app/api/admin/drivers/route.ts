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

    // 2. Fetch policies for hourly rate and commission defaults
    const { data: policiesData } = await serverSupabase
      .from('restaurant_policies')
      .select('key, value')

    let hourlyRate = 20.0
    if (policiesData) {
      const ratePolicy = policiesData.find((p) => p.key === 'driver_hourly_rate')
      if (ratePolicy && !isNaN(Number(ratePolicy.value))) {
        hourlyRate = Number(ratePolicy.value)
      }
    }

    // 3. Fetch drivers with active shifts and assignments
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
          started_at,
          ended_at,
          status
        ),
        order_driver_assignments (
          id,
          order_id,
          shift_id,
          status,
          orders (
            id,
            order_number,
            status,
            delivery_fee,
            failure_reason,
            cancellation_reason
          )
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

    // 4. Fetch shift expenses (advances: category = 'سلف طيارين') for the active daily shift
    let advancesList: Array<{ id: string; amount: number; description: string; recipient_name: string | null; created_at: string }> = []
    if (activeDailyShift) {
      const { data: expensesData } = await serverSupabase
        .from('shift_expenses')
        .select('id, amount, description, recipient_name, created_at')
        .eq('shift_id', activeDailyShift.id)
        .eq('category', 'سلف طيارين')

      if (expensesData) {
        advancesList = expensesData.map((e) => ({
          id: e.id,
          amount: Number(e.amount || 0),
          description: e.description || '',
          recipient_name: e.recipient_name,
          created_at: e.created_at,
        }))
      }
    }

    interface ShiftRow { id: string; started_at: string; ended_at?: string | null; status: string }
    interface OrderInAssignment {
      id: string
      order_number: number
      status: string
      delivery_fee?: number | null
      failure_reason?: string | null
      cancellation_reason?: string | null
    }
    interface AssignmentRow {
      id: string
      order_id: string
      shift_id?: string | null
      status: string
      orders?: OrderInAssignment | null
    }
    interface DriverQueryRow {
      id: string
      name: string
      is_active: boolean
      status: string
      created_at: string
      driver_shifts?: ShiftRow[]
      order_driver_assignments?: AssignmentRow[]
    }

    const nowIso = new Date().toISOString()
    const nowTime = new Date().getTime()

    const formattedDrivers = ((drivers as unknown as DriverQueryRow[]) || []).map((d) => {
      const allShifts = d.driver_shifts || []
      // Prioritize open shift; otherwise most recent shift within active daily shift
      let currentShift = allShifts.find((s) => s.status === 'open')
      if (!currentShift && activeDailyShift?.opened_at) {
        const dailyShiftsForDriver = allShifts
          .filter((s) => s.started_at >= activeDailyShift.opened_at)
          .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
        if (dailyShiftsForDriver.length > 0) {
          currentShift = dailyShiftsForDriver[0]
        }
      }

      const activeAssignments = (d.order_driver_assignments || []).filter((a) =>
        ['assigned', 'accepted', 'picked_up', 'out_for_delivery'].includes(a.status)
      )
      const outForDeliveryCount = (d.order_driver_assignments || []).filter((a) =>
        a.status === 'out_for_delivery'
      ).length

      let accounting = null

      if (currentShift) {
        const startTime = new Date(currentShift.started_at).getTime()
        const endTime = currentShift.ended_at ? new Date(currentShift.ended_at).getTime() : nowTime
        const durationHours = Math.max(0, (endTime - startTime) / (1000 * 60 * 60))
        const roundedHours = Math.round(durationHours * 100) / 100
        const hoursWage = Math.round(roundedHours * hourlyRate * 100) / 100

        // Filter assignments strictly tied to this driver shift
        const shiftAssignments = (d.order_driver_assignments || []).filter((a) => a.shift_id === currentShift!.id)

        // Delivered orders: calculate commission (delivery fee per delivered order)
        let deliveredCount = 0
        let commissionTotal = 0
        const failedOrCancelled: Array<{ order_number: number; status: string; reason: string }> = []

        shiftAssignments.forEach((a) => {
          const ord = a.orders
          if (ord) {
            if (a.status === 'delivered' || ord.status === 'delivered' || ord.status === 'completed') {
              deliveredCount += 1
              const fee = Number(ord.delivery_fee || 0)
              commissionTotal += fee
            } else if (a.status === 'failed' || a.status === 'cancelled' || ord.status === 'failed' || ord.status === 'cancelled') {
              failedOrCancelled.push({
                order_number: ord.order_number,
                status: ord.status || a.status,
                reason: ord.failure_reason || ord.cancellation_reason || 'غير محدد',
              })
            }
          }
        })

        // Driver advances strictly matching this driver's name
        const driverNameLower = d.name.trim().toLowerCase()
        const matchedAdvances = advancesList.filter((adv) => {
          if (!adv.recipient_name) return false
          const recLower = adv.recipient_name.trim().toLowerCase()
          return recLower === driverNameLower || recLower.includes(driverNameLower) || driverNameLower.includes(recLower)
        })

        const advancesTotal = matchedAdvances.reduce((acc, curr) => acc + curr.amount, 0)
        const netPayout = Math.round((hoursWage + commissionTotal - advancesTotal) * 100) / 100

        accounting = {
          shift_id: currentShift.id,
          shift_status: currentShift.status as any,
          started_at: currentShift.started_at,
          ended_at: currentShift.ended_at || null,
          duration_hours: roundedHours,
          hourly_rate: hourlyRate,
          hours_wage: hoursWage,
          delivered_orders_count: deliveredCount,
          delivery_commission_total: commissionTotal,
          failed_or_cancelled_orders: failedOrCancelled,
          advances_total: advancesTotal,
          advances_list: matchedAdvances.map((adv) => ({
            id: adv.id,
            amount: adv.amount,
            description: adv.description,
            created_at: adv.created_at,
          })),
          net_payout: netPayout,
        }
      }

      return {
        id: d.id,
        name: d.name,
        is_active: d.is_active,
        status: d.status,
        created_at: d.created_at,
        active_shift_id: currentShift && currentShift.status === 'open' ? currentShift.id : null,
        assigned_orders_count: activeAssignments.length,
        out_for_delivery_orders_count: outForDeliveryCount,
        current_order_id: activeAssignments.length > 0 ? activeAssignments[0].order_id : null,
        accounting,
      }
    })

    return NextResponse.json({ drivers: formattedDrivers }, { status: 200 })
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
