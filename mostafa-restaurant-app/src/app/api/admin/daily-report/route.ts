import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabaseServer'
import { sendTelegramFinalDailyReport } from '@/lib/telegram'
import { calculateDailyShiftAccounting } from '@/lib/dailyShiftAccounting'
import { buildFinalDailyReport } from '@/lib/dailyReportPresentation'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const serverSupabase = getSupabaseServerClient()
    const { searchParams } = new URL(req.url)
    const shiftId = searchParams.get('shift_id')

    let query = serverSupabase.from('daily_shifts').select('id').order('opened_at', { ascending: false }).limit(1)
    if (shiftId) {
      query = serverSupabase.from('daily_shifts').select('id').eq('id', shiftId).limit(1)
    }

    const { data: shifts, error: shiftErr } = await query

    if (shiftErr || !shifts || shifts.length === 0) {
      return NextResponse.json({ error: 'لا توجد ورديات مسجلة' }, { status: 404 })
    }

    const activeShift = shifts[0]
    const finalReport = await buildFinalDailyReport(serverSupabase, activeShift.id)

    // Backwards compatible flattened structure for existing callers + full structured payload
    const reportData = {
      shiftId: finalReport.shift.id,
      shiftNumber: finalReport.shift.shift_number,
      shiftStatus: finalReport.shift.status,
      openedBy: finalReport.shift.opened_by,
      openedAt: finalReport.shift.opened_at,
      closedBy: finalReport.shift.closed_by,
      closedAt: finalReport.shift.closed_at,
      totalSales: finalReport.financial_summary.total_sales,
      cashSales: finalReport.financial_summary.cash_sales,
      instapaySales: finalReport.financial_summary.instapay_sales,
      walletSales: finalReport.financial_summary.wallet_sales,
      otherElectronicSales: finalReport.financial_summary.other_electronic_sales,
      nonCashSales: finalReport.financial_summary.non_cash_sales,
      driverCustodyCash: finalReport.cash_custody.driver_custody_cash,
      uncollectedCash: finalReport.cash_custody.uncollected_cash,
      totalOrdersCount: finalReport.orders_summary.completed_orders_count,
      averageOrderValue: finalReport.orders_summary.average_order_value,
      deliverySales: finalReport.orders_summary.delivery_sales,
      deliveryOrdersCount: finalReport.orders_summary.delivery_orders_count,
      takeawaySales: finalReport.orders_summary.takeaway_sales,
      takeawayOrdersCount: finalReport.orders_summary.takeaway_orders_count,
      productSales: finalReport.orders_summary.product_sales,
      deliveryFeesTotal: finalReport.orders_summary.delivery_fees_total,
      initialCash: finalReport.cash_reconciliation.initial_cash,
      totalExpenses: finalReport.expenses_summary.total_expenses,
      generalExpenses: finalReport.expenses_summary.general_expenses,
      driverAdvances: finalReport.expenses_summary.driver_advances,
      staffAdvances: finalReport.expenses_summary.staff_advances,
      expectedCash: finalReport.cash_reconciliation.expected_cash_in_drawer,
      actualCash: finalReport.cash_reconciliation.actual_cash_in_drawer,
      discrepancy: finalReport.cash_reconciliation.discrepancy,
      activeDriversCount: finalReport.fleet_summary.active_drivers_count,
      deliveryTripsCount: finalReport.fleet_summary.delivery_trips_count,
      fleetAccounting: {
        hourlyRate: finalReport.fleet_summary.hourly_rate,
        driversCount: finalReport.fleet_summary.active_drivers_count,
        totalHours: finalReport.fleet_summary.total_hours,
        totalHoursWage: finalReport.fleet_summary.total_hours_wage,
        totalDeliveredOrders: finalReport.fleet_summary.total_delivered_orders,
        totalDeliveryCommissions: finalReport.fleet_summary.total_delivery_commissions,
        totalDriverAdvances: finalReport.fleet_summary.total_driver_advances,
        totalNetPayout: finalReport.fleet_summary.total_net_payout,
      },
      cancelledOrdersCount: finalReport.orders_summary.cancelled_orders_count,
      cancelledAmount: finalReport.orders_summary.cancelled_amount,
      failedOrdersCount: finalReport.orders_summary.failed_orders_count,
      notes: finalReport.shift.notes,
      final_daily_report: finalReport,
    }

    return NextResponse.json({ success: true, report: reportData, final_daily_report: finalReport })
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

    let query = serverSupabase.from('daily_shifts').select('id').order('opened_at', { ascending: false }).limit(1)
    if (shiftId) {
      query = serverSupabase.from('daily_shifts').select('id').eq('id', shiftId).limit(1)
    }

    const { data: shifts, error: shiftErr } = await query
    const shift = shifts?.[0]

    if (shiftErr || !shift) {
      return NextResponse.json({ error: 'لم يتم العثور على وردية' }, { status: 404 })
    }

    // 📊 Canonical Presentation Layer Output
    const finalReport = await buildFinalDailyReport(serverSupabase, shift.id)

    // 📤 Dispatch to Telegram Output Sink (Failure Isolated)
    const result = await sendTelegramFinalDailyReport(finalReport)

    if (!result.success) {
      return NextResponse.json({
        success: true,
        telegram_sent: false,
        warning: result.error || 'تعذر إرسال التقرير لتليجرام',
        final_daily_report: finalReport,
      }, { status: 200 })
    }

    return NextResponse.json({
      success: true,
      telegram_sent: true,
      message: 'تم إرسال التقرير التنفيذي لتليجرام بنجاح',
      final_daily_report: finalReport,
    }, { status: 200 })
  } catch (err: any) {
    console.error('Error sending on-demand daily report:', err)
    return NextResponse.json({ error: 'حدث خطأ غير متوقع' }, { status: 500 })
  }
}


