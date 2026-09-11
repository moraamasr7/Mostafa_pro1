import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServerClient } from '@/lib/supabaseServer'
import { ADMIN_COOKIE_NAME } from '../login/route'
import { notifyShiftOpened, notifyShiftClosed } from '@/lib/telegram'
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

    // 1. Get current active shift
    const { data: activeShift, error: shiftErr } = await serverSupabase
      .from('daily_shifts')
      .select('*')
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .maybeSingle()

    if (shiftErr) {
      console.error('Error fetching active daily shift:', shiftErr)
      return NextResponse.json({ error: 'تعذر جلب بيانات الوردية' }, { status: 500 })
    }

    if (!activeShift) {
      const { data: lastClosed } = await serverSupabase
        .from('daily_shifts')
        .select('*')
        .eq('status', 'closed')
        .order('closed_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      return NextResponse.json({
        hasActiveShift: false,
        activeShift: null,
        lastClosedShift: lastClosed || null,
      }, { status: 200 })
    }

    // 2. Calculate shift financials
    const shiftStartTime = activeShift.opened_at

    const { data: orders } = await serverSupabase
      .from('orders')
      .select('id, total_amount, order_type, status, payment_method')
      .gte('created_at', shiftStartTime)

    let totalSales = 0
    let cashSales = 0
    let nonCashSales = 0
    let takeawaySales = 0
    let deliverySales = 0

    ;(orders || []).forEach(o => {
      if (['completed', 'delivered'].includes(o.status)) {
        const amount = Number(o.total_amount || 0)
        totalSales += amount
        const isCash = (o.payment_method || 'cash') === 'cash'
        if (isCash) {
          cashSales += amount
        } else {
          nonCashSales += amount
        }
        if (o.order_type === 'takeaway') takeawaySales += amount
        if (o.order_type === 'delivery') deliverySales += amount
      }
    })

    const { data: expenses } = await serverSupabase
      .from('shift_expenses')
      .select('amount')
      .eq('shift_id', activeShift.id)

    const totalExpenses = (expenses || []).reduce((acc, exp) => acc + Number(exp.amount || 0), 0)
    const initialCash = Number(activeShift.initial_cash || 0)
    const systemExpectedCash = initialCash + cashSales - totalExpenses

    // 🛵 Single Source of Truth for Driver Fleet Accounting
    const fleetAccounting = await calculateFleetDriversAccounting(
      serverSupabase,
      activeShift.id,
      activeShift.opened_at
    ).catch(() => null)

    return NextResponse.json({
      hasActiveShift: true,
      activeShift: {
        ...activeShift,
        totalSales,
        cashSales,
        nonCashSales,
        takeawaySales,
        deliverySales,
        totalExpenses,
        systemExpectedCash,
        fleetAccounting: fleetAccounting ? {
          hourlyRate: fleetAccounting.hourly_rate,
          driversCount: fleetAccounting.drivers_count,
          totalHours: fleetAccounting.total_hours,
          totalHoursWage: fleetAccounting.total_hours_wage,
          totalDeliveredOrders: fleetAccounting.total_delivered_orders,
          totalDeliveryCommissions: fleetAccounting.total_delivery_commissions,
          totalDriverAdvances: fleetAccounting.total_driver_advances,
          totalNetPayout: fleetAccounting.total_net_payout,
        } : null,
      },
    }, { status: 200 })
  } catch (err) {
    console.error('Unexpected error in daily-shift GET:', err)
    return NextResponse.json({ error: 'حدث خطأ غير متوقع' }, { status: 500 })
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
    const { action, opened_by, initial_cash, closed_by, final_cash, notes } = body
    const serverSupabase = getSupabaseServerClient()

    if (action === 'open') {
      if (!opened_by || typeof opened_by !== 'string' || !opened_by.trim()) {
        return NextResponse.json({ error: 'اسم المسؤول عن فتح الوردية مطلوب' }, { status: 400 })
      }

      const { data: existing } = await serverSupabase
        .from('daily_shifts')
        .select('id, shift_number')
        .eq('status', 'open')
        .maybeSingle()

      if (existing) {
        return NextResponse.json({
          error: `توجد بالفعل وردية مفتوحة حالياً برقم #${existing.shift_number}. يجب إغلاقها أولاً.`
        }, { status: 400 })
      }

      const initialAmount = Math.max(0, Number(initial_cash) || 0)

      const { data: newShift, error: insErr } = await serverSupabase
        .from('daily_shifts')
        .insert({
          opened_by: opened_by.trim(),
          initial_cash: initialAmount,
          status: 'open',
          opened_at: new Date().toISOString(),
        })
        .select('*')
        .single()

      if (insErr || !newShift) {
        console.error('Error opening daily shift:', insErr)
        return NextResponse.json({ error: 'تعذر فتح الوردية' }, { status: 500 })
      }

      notifyShiftOpened({
        shiftNumber: newShift.shift_number,
        openedBy: newShift.opened_by,
        initialCash: initialAmount,
      }).catch(() => {})

      return NextResponse.json({
        success: true,
        message: 'تم فتح الوردية بنجاح',
        shift: newShift,
      }, { status: 201 })
    }

    if (action === 'close') {
      const { shift_id } = body
      if (!shift_id) {
        return NextResponse.json({ error: 'معرف الوردية مطلوب للإغلاق' }, { status: 400 })
      }

      if (!closed_by || typeof closed_by !== 'string' || !closed_by.trim()) {
        return NextResponse.json({ error: 'اسم المسؤول عن إغلاق الوردية مطلوب' }, { status: 400 })
      }

      const { data: shift, error: fetchErr } = await serverSupabase
        .from('daily_shifts')
        .select('*')
        .eq('id', shift_id)
        .single()

      if (fetchErr || !shift || shift.status !== 'open') {
        return NextResponse.json({ error: 'الوردية غير موجودة أو تم إغلاقها بالفعل' }, { status: 400 })
      }

      const [ordersRes, expensesRes, tripsRes, driversRes, openDriverShiftsRes] = await Promise.all([
        serverSupabase
          .from('orders')
          .select('id, order_number, total_amount, status, order_type, payment_method')
          .gte('created_at', shift.opened_at),
        serverSupabase
          .from('shift_expenses')
          .select('amount')
          .eq('shift_id', shift.id),
        serverSupabase
          .from('delivery_trips')
          .select('id, trip_number, status')
          .gte('created_at', shift.opened_at),
        serverSupabase
          .from('driver_shifts')
          .select('driver_id')
          .gte('started_at', shift.opened_at),
        serverSupabase
          .from('driver_shifts')
          .select('id, driver_id, drivers(name)')
          .eq('status', 'open'),
      ])

      const orders = ordersRes.data || []
      const expenses = expensesRes.data || []
      const trips = tripsRes.data || []
      const driverShifts = driversRes.data || []
      const openDriverShifts = openDriverShiftsRes.data || []

      // 🔒 التحقق التشغيلي الأول: التأكد من حسم جميع طلبات الوردية (لا توجد طلبات معلقة قيد التحضير أو في الطريق)
      const activeUnresolvedOrders = orders.filter(o =>
        ['pending', 'processing', 'ready', 'assigned', 'picked_up', 'out_for_delivery'].includes(o.status)
      )
      if (activeUnresolvedOrders.length > 0) {
        return NextResponse.json({
          error: `أمان العمليات: لا يمكن تقفيل الوردية لوجود (${activeUnresolvedOrders.length}) طلبات نشطة لم تُحسم بعد (أرقام: ${activeUnresolvedOrders.slice(0, 5).map(o => '#' + o.order_number).join(', ')}${activeUnresolvedOrders.length > 5 ? '...' : ''}). يجب تسليمها أو إلغاؤها أولاً.`
        }, { status: 400 })
      }

      // 🔒 التحقق التشغيلي الثاني: التأكد من إغلاق كافة رحلات التوصيل
      const openTrips = trips.filter(t => !['completed', 'cancelled'].includes(t.status))
      if (openTrips.length > 0) {
        return NextResponse.json({
          error: `أمان العمليات: يوجد (${openTrips.length}) رحلات دليفري نشطة لم تُغلق بعد. يجب تسوية وتوريد رحلات الطيارين أولاً.`
        }, { status: 400 })
      }

      // 🔒 التحقق التشغيلي الثالث: التأكد من إنهاء ورديات الطيارين المفتوحة
      if (openDriverShifts.length > 0) {
        interface DriverJoinRow { drivers?: { name?: string } }
        const openNames = (openDriverShifts as unknown as DriverJoinRow[])
          .map(ds => ds.drivers?.name || 'طيار')
          .join(', ')
        return NextResponse.json({
          error: `أمان العمليات: يوجد (${openDriverShifts.length}) ورديات طيارين مفتوحة حالياً (${openNames}). يجب إنهاء وردياتهم وتصفية عهدهم أولاً قبل تقفيل وردية المحل.`
        }, { status: 400 })
      }

      const completedOrders = orders.filter(o => ['completed', 'delivered'].includes(o.status))
      const totalSales = completedOrders.reduce((acc, o) => acc + Number(o.total_amount || 0), 0)
      const cashSales = completedOrders.reduce((acc, o) => ((o.payment_method || 'cash') === 'cash' ? acc + Number(o.total_amount || 0) : acc), 0)
      const nonCashSales = totalSales - cashSales

      const deliveryOrders = completedOrders.filter(o => o.order_type === 'delivery')
      const deliverySales = deliveryOrders.reduce((acc, o) => acc + Number(o.total_amount || 0), 0)

      const takeawayOrders = completedOrders.filter(o => o.order_type === 'takeaway' || o.order_type === 'dine_in')
      const takeawaySales = takeawayOrders.reduce((acc, o) => acc + Number(o.total_amount || 0), 0)

      const cancelledOrders = orders.filter(o => o.status === 'cancelled')
      const cancelledAmount = cancelledOrders.reduce((acc, o) => acc + Number(o.total_amount || 0), 0)
      const failedOrders = orders.filter(o => o.status === 'failed')

      const uniqueDrivers = new Set(driverShifts.map(ds => ds.driver_id))

      const totalExpenses = expenses.reduce((acc, e) => acc + Number(e.amount || 0), 0)
      const initialCash = Number(shift.initial_cash || 0)
      const expectedCash = initialCash + cashSales - totalExpenses
      const actualCash = Number(final_cash) || 0
      const discrepancy = actualCash - expectedCash

      const { data: closedShift, error: updateErr } = await serverSupabase
        .from('daily_shifts')
        .update({
          status: 'closed',
          closed_by: closed_by.trim(),
          closed_at: new Date().toISOString(),
          final_cash: actualCash,
          system_expected_cash: expectedCash,
          discrepancy: discrepancy,
          notes: notes?.trim() || null,
        })
        .eq('id', shift_id)
        .eq('status', 'open')
        .select('*')
        .maybeSingle()

      if (updateErr || !closedShift) {
        console.error('Error closing daily shift:', updateErr)
        return NextResponse.json({ error: 'الوردية غير موجودة أو تم إغلاقها بالفعل من قِبل مسؤول آخر' }, { status: 409 })
      }

      // 🛵 Single Source of Truth for Driver Fleet Accounting upon shift close
      const fleetAccounting = await calculateFleetDriversAccounting(
        serverSupabase,
        shift.id,
        shift.opened_at,
        new Date().toISOString()
      ).catch(() => null)

      notifyShiftClosed({
        shiftNumber: shift.shift_number,
        closedBy: closed_by.trim(),
        initialCash,
        totalSales,
        totalExpenses,
        expectedCash,
        actualCash,
        discrepancy,
        totalOrdersCount: completedOrders.length,
        deliverySales,
        deliveryOrdersCount: deliveryOrders.length,
        takeawaySales,
        takeawayOrdersCount: takeawayOrders.length,
        deliveryTripsCount: trips.length,
        activeDriversCount: uniqueDrivers.size,
        fleetAccounting: fleetAccounting ? {
          totalHours: fleetAccounting.total_hours,
          totalHoursWage: fleetAccounting.total_hours_wage,
          totalDeliveredOrders: fleetAccounting.total_delivered_orders,
          totalDeliveryCommissions: fleetAccounting.total_delivery_commissions,
          totalDriverAdvances: fleetAccounting.total_driver_advances,
          totalNetPayout: fleetAccounting.total_net_payout,
        } : undefined,
        cancelledOrdersCount: cancelledOrders.length,
        cancelledAmount,
        failedOrdersCount: failedOrders.length,
        notes: notes?.trim() || undefined,
      }).catch(() => {})

      return NextResponse.json({
        success: true,
        message: 'تم تقفيل الوردية بنجاح وتسجيل المطابقة',
        shift: closedShift,
      }, { status: 200 })
    }

    return NextResponse.json({ error: 'إجراء غير معروف' }, { status: 400 })
  } catch (err) {
    console.error('Unexpected error in daily-shift POST:', err)
    return NextResponse.json({ error: 'حدث خطأ غير متوقع' }, { status: 500 })
  }
}
