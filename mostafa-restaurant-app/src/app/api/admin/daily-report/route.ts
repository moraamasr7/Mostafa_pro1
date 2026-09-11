import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabaseServer'
import { sendExecutiveDailyReport } from '@/lib/telegram'
import { calculateFleetDriversAccounting } from '@/lib/driverAccounting'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const serverSupabase = getSupabaseServerClient()
    const { searchParams } = new URL(req.url)
    const shiftId = searchParams.get('shift_id')

    let query = serverSupabase.from('daily_shifts').select('*').order('opened_at', { ascending: false }).limit(1)
    if (shiftId) {
      query = serverSupabase.from('daily_shifts').select('*').eq('id', shiftId).limit(1)
    }

    const { data: shifts, error: shiftErr } = await query

    if (shiftErr || !shifts || shifts.length === 0) {
      return NextResponse.json({ error: 'لا توجد ورديات مسجلة' }, { status: 404 })
    }

    const activeShift = shifts[0]
    const startTime = activeShift.opened_at
    const endTime = activeShift.closed_at || new Date().toISOString()

    const [ordersRes, expensesRes, tripsRes, driversRes] = await Promise.all([
      serverSupabase
        .from('orders')
        .select('total_amount, status, order_type, created_at')
        .gte('created_at', startTime)
        .lte('created_at', endTime),
      serverSupabase
        .from('shift_expenses')
        .select('amount, category')
        .eq('shift_id', activeShift.id),
      serverSupabase
        .from('delivery_trips')
        .select('id, status')
        .gte('created_at', startTime),
      serverSupabase
        .from('driver_shifts')
        .select('driver_id')
        .gte('started_at', startTime),
    ])

    const orders: any[] = ordersRes.data || []
    const expenses: any[] = expensesRes.data || []
    const trips: any[] = tripsRes.data || []
    const driverShifts: any[] = driversRes.data || []

    const completedOrders = orders.filter((o: any) => ['completed', 'delivered'].includes(o.status))
    const totalSales = completedOrders.reduce((acc: number, o: any) => acc + Number(o.total_amount || 0), 0)

    const deliveryOrders = completedOrders.filter((o: any) => o.order_type === 'delivery')
    const deliverySales = deliveryOrders.reduce((acc: number, o: any) => acc + Number(o.total_amount || 0), 0)

    const takeawayOrders = completedOrders.filter((o: any) => o.order_type === 'takeaway' || o.order_type === 'dine_in')
    const takeawaySales = takeawayOrders.reduce((acc: number, o: any) => acc + Number(o.total_amount || 0), 0)

    const cancelledOrders = orders.filter((o: any) => o.status === 'cancelled')
    const cancelledAmount = cancelledOrders.reduce((acc: number, o: any) => acc + Number(o.total_amount || 0), 0)
    const failedOrders = orders.filter((o: any) => o.status === 'failed')

    const uniqueDrivers = new Set(driverShifts.map((ds: any) => ds.driver_id))
    const totalExpenses = expenses.reduce((acc: number, e: any) => acc + Number(e.amount || 0), 0)
    const initialCash = Number(activeShift.initial_cash || 0)
    const expectedCash = initialCash + totalSales - totalExpenses
    const actualCash = activeShift.status === 'closed' ? Number(activeShift.final_cash || 0) : null
    const discrepancy = actualCash !== null ? actualCash - expectedCash : null

    // 🛵 Single Source of Truth for Driver Fleet Accounting
    const fleetAccounting = await calculateFleetDriversAccounting(
      serverSupabase,
      activeShift.id,
      activeShift.opened_at,
      activeShift.closed_at
    )

    const reportData = {
      shiftNumber: activeShift.shift_number,
      shiftStatus: activeShift.status,
      openedBy: activeShift.opened_by,
      openedAt: activeShift.opened_at,
      closedBy: activeShift.closed_by || null,
      closedAt: activeShift.closed_at || null,
      totalSales,
      totalOrdersCount: completedOrders.length,
      averageOrderValue: completedOrders.length > 0 ? Math.round(totalSales / completedOrders.length) : 0,
      deliverySales,
      deliveryOrdersCount: deliveryOrders.length,
      takeawaySales,
      takeawayOrdersCount: takeawayOrders.length,
      initialCash,
      totalExpenses,
      expectedCash,
      actualCash,
      discrepancy,
      activeDriversCount: uniqueDrivers.size,
      deliveryTripsCount: trips.length,
      fleetAccounting: {
        hourlyRate: fleetAccounting.hourly_rate,
        driversCount: fleetAccounting.drivers_count,
        totalHours: fleetAccounting.total_hours,
        totalHoursWage: fleetAccounting.total_hours_wage,
        totalDeliveredOrders: fleetAccounting.total_delivered_orders,
        totalDeliveryCommissions: fleetAccounting.total_delivery_commissions,
        totalDriverAdvances: fleetAccounting.total_driver_advances,
        totalNetPayout: fleetAccounting.total_net_payout,
      },
      cancelledOrdersCount: cancelledOrders.length,
      cancelledAmount,
      failedOrdersCount: failedOrders.length,
      notes: activeShift.notes || null,
    }

    return NextResponse.json({ success: true, report: reportData })
  } catch (err: any) {
    console.error('Error generating daily report:', err)
    return NextResponse.json({ error: 'تعذر استخراج التقرير اليومي' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const serverSupabase = getSupabaseServerClient()
    const { searchParams } = new URL(req.url)
    const shiftId = searchParams.get('shift_id')

    let query = serverSupabase.from('daily_shifts').select('*').order('opened_at', { ascending: false }).limit(1)
    if (shiftId) {
      query = serverSupabase.from('daily_shifts').select('*').eq('id', shiftId).limit(1)
    }

    const { data: shifts } = await query
    const shift = shifts?.[0]

    if (!shift) {
      return NextResponse.json({ error: 'لم يتم العثور على وردية' }, { status: 404 })
    }

    const startTime = shift.opened_at
    const endTime = shift.closed_at || new Date().toISOString()

    const [ordersRes, expensesRes, tripsRes, driversRes] = await Promise.all([
      serverSupabase
        .from('orders')
        .select('total_amount, status, order_type')
        .gte('created_at', startTime)
        .lte('created_at', endTime),
      serverSupabase.from('shift_expenses').select('amount').eq('shift_id', shift.id),
      serverSupabase.from('delivery_trips').select('id, status').gte('created_at', startTime),
      serverSupabase.from('driver_shifts').select('driver_id').gte('started_at', startTime),
    ])

    const orders: any[] = ordersRes.data || []
    const expenses: any[] = expensesRes.data || []
    const trips: any[] = tripsRes.data || []
    const driverShifts: any[] = driversRes.data || []

    const completedOrders = orders.filter((o: any) => ['completed', 'delivered'].includes(o.status))
    const totalSales = completedOrders.reduce((acc: number, o: any) => acc + Number(o.total_amount || 0), 0)

    const deliveryOrders = completedOrders.filter((o: any) => o.order_type === 'delivery')
    const deliverySales = deliveryOrders.reduce((acc: number, o: any) => acc + Number(o.total_amount || 0), 0)

    const takeawayOrders = completedOrders.filter((o: any) => o.order_type === 'takeaway' || o.order_type === 'dine_in')
    const takeawaySales = takeawayOrders.reduce((acc: number, o: any) => acc + Number(o.total_amount || 0), 0)

    const cancelledOrders = orders.filter((o: any) => o.status === 'cancelled')
    const cancelledAmount = cancelledOrders.reduce((acc: number, o: any) => acc + Number(o.total_amount || 0), 0)
    const failedOrders = orders.filter((o: any) => o.status === 'failed')

    const uniqueDrivers = new Set(driverShifts.map((ds: any) => ds.driver_id))
    const totalExpenses = expenses.reduce((acc: number, e: any) => acc + Number(e.amount || 0), 0)
    const initialCash = Number(shift.initial_cash || 0)
    const expectedCash = initialCash + totalSales - totalExpenses
    const actualCash = Number(shift.final_cash ?? expectedCash)
    const discrepancy = actualCash - expectedCash

    // 🛵 Single Source of Truth for Driver Fleet Accounting
    const fleetAccounting = await calculateFleetDriversAccounting(
      serverSupabase,
      shift.id,
      shift.opened_at,
      shift.closed_at
    )

    const result = await sendExecutiveDailyReport({
      shiftNumber: shift.shift_number,
      closedBy: shift.closed_by || shift.opened_by || 'الإدارة',
      totalSales,
      totalOrdersCount: completedOrders.length,
      deliverySales,
      deliveryOrdersCount: deliveryOrders.length,
      takeawaySales,
      takeawayOrdersCount: takeawayOrders.length,
      initialCash,
      totalExpenses,
      expectedCash,
      actualCash,
      discrepancy,
      deliveryTripsCount: trips.length,
      activeDriversCount: uniqueDrivers.size,
      fleetAccounting: {
        totalHours: fleetAccounting.total_hours,
        totalHoursWage: fleetAccounting.total_hours_wage,
        totalDeliveredOrders: fleetAccounting.total_delivered_orders,
        totalDeliveryCommissions: fleetAccounting.total_delivery_commissions,
        totalDriverAdvances: fleetAccounting.total_driver_advances,
        totalNetPayout: fleetAccounting.total_net_payout,
      },
      cancelledOrdersCount: cancelledOrders.length,
      cancelledAmount,
      failedOrdersCount: failedOrders.length,
      notes: shift.notes || (shift.status === 'open' ? '⚠️ تقرير فوري خلال الوردية (الوردية ما زالت مفتوحة)' : undefined),
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'فشل إرسال التقرير لتليجرام' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'تم إرسال التقرير التنفيذي لتليجرام بنجاح' })
  } catch (err: any) {
    console.error('Error sending on-demand daily report:', err)
    return NextResponse.json({ error: 'حدث خطأ غير متوقع' }, { status: 500 })
  }
}
