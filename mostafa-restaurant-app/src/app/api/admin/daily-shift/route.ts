import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServerClient } from '@/lib/supabaseServer'
import { ADMIN_COOKIE_NAME } from '../login/route'
import { notifyShiftOpened, sendTelegramFinalDailyReport } from '@/lib/telegram'
import { calculateFleetDriversAccounting } from '@/lib/driverAccounting'
import { calculateDailyShiftAccounting } from '@/lib/dailyShiftAccounting'
import { buildFinalDailyReport } from '@/lib/dailyReportPresentation'

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

    // 2. Calculate shift financials using Canonical Daily Shift Accounting
    const accounting = await calculateDailyShiftAccounting(serverSupabase, activeShift.id)

    return NextResponse.json({
      hasActiveShift: true,
      activeShift: {
        ...activeShift,
        totalSales: accounting.total_sales,
        cashSales: accounting.cash_sales,
        driverCustodyCash: accounting.driver_custody_cash,
        uncollectedCash: accounting.uncollected_cash,
        instapaySales: accounting.instapay_sales,
        walletSales: accounting.wallet_sales,
        otherElectronicSales: accounting.other_electronic_sales,
        nonCashSales: accounting.instapay_sales + accounting.wallet_sales + accounting.other_electronic_sales,
        takeawaySales: accounting.takeaway_sales,
        deliverySales: accounting.delivery_sales,
        totalExpenses: accounting.total_expenses,
        generalExpenses: accounting.general_expenses,
        driverAdvances: accounting.driver_advances,
        staffAdvances: accounting.staff_advances,
        systemExpectedCash: accounting.system_expected_cash,
        fleetAccounting: accounting.fleet_accounting ? {
          hourlyRate: accounting.fleet_accounting.hourly_rate,
          driversCount: accounting.fleet_accounting.drivers_count,
          totalHours: accounting.fleet_accounting.total_hours,
          totalHoursWage: accounting.fleet_accounting.total_hours_wage,
          totalDeliveredOrders: accounting.fleet_accounting.total_delivered_orders,
          totalDeliveryCommissions: accounting.fleet_accounting.total_delivery_commissions,
          totalDriverAdvances: accounting.fleet_accounting.total_driver_advances,
          totalNetPayout: accounting.fleet_accounting.total_net_payout,
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

      // 📊 Single Source of Truth: Canonical Daily Shift Accounting
      const accounting = await calculateDailyShiftAccounting(serverSupabase, shift.id)

      const [activeOrdersRes, openTripsRes, openDriverShiftsRes] = await Promise.all([
        serverSupabase
          .from('orders')
          .select('id, order_number, status')
          .eq('daily_shift_id', shift.id)
          .in('status', ['pending', 'processing', 'ready', 'assigned', 'picked_up', 'out_for_delivery']),
        serverSupabase
          .from('delivery_trips')
          .select('id, trip_number, status')
          .gte('created_at', shift.opened_at)
          .not('status', 'in', '("completed","cancelled")'),
        serverSupabase
          .from('driver_shifts')
          .select('id, driver_id, drivers(name)')
          .eq('status', 'open'),
      ])

      const activeUnresolvedOrders = activeOrdersRes.data || []
      const openTrips = openTripsRes.data || []
      const openDriverShifts = openDriverShiftsRes.data || []

      // 🔒 التحقق التشغيلي الأول: التأكد من حسم جميع طلبات الوردية (لا توجد طلبات معلقة قيد التحضير أو في الطريق)
      if (activeUnresolvedOrders.length > 0) {
        return NextResponse.json({
          error: `أمان العمليات: لا يمكن تقفيل الوردية لوجود (${activeUnresolvedOrders.length}) طلبات نشطة لم تُحسم بعد (أرقام: ${activeUnresolvedOrders.slice(0, 5).map(o => '#' + o.order_number).join(', ')}${activeUnresolvedOrders.length > 5 ? '...' : ''}). يجب تسليمها أو إلغاؤها أولاً.`
        }, { status: 400 })
      }

      // 🔒 التحقق التشغيلي الثاني: التأكد من إغلاق كافة رحلات التوصيل
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

      // 🔒 التحقق التشغيلي الرابع: التأكد من توريد كاش عهدة الطيارين للخزينة بالكامل
      if (accounting.driver_custody_cash > 0) {
        return NextResponse.json({
          error: `أمان العمليات: توجد مبالغ نقدية في عهدة الطيارين لم تُورّد للخزينة بقيمة (${accounting.driver_custody_cash} ج.م). يجب تسوية وتوريد خطوط سير الطيارين للخزينة قبل تقفيل الوردية.`
        }, { status: 400 })
      }

      const initialCash = accounting.initial_cash
      const totalSales = accounting.total_sales
      const totalExpenses = accounting.total_expenses
      const expectedCash = accounting.system_expected_cash
      const actualCash = Number(final_cash) || 0
      const discrepancy = Math.round((actualCash - expectedCash) * 100) / 100

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

      // 📤 Post-Commit Telegram Notification (Failure Isolated)
      buildFinalDailyReport(serverSupabase, shift.id)
        .then((finalReport) => sendTelegramFinalDailyReport(finalReport))
        .catch((tgErr) => console.error('Non-blocking Telegram send failure on shift close:', tgErr))

      return NextResponse.json({
        success: true,
        message: 'تم تقفيل الوردية بنجاح وتسجيل المطابقة',
        shift: closedShift,
        reconciliation: {
          initial_cash: initialCash,
          cash_sales: accounting.cash_sales,
          total_expenses: totalExpenses,
          system_expected_cash: expectedCash,
          actual_cash: actualCash,
          discrepancy: discrepancy,
          reconciliation_status: discrepancy === 0 ? 'balanced' : discrepancy > 0 ? 'surplus' : 'deficit',
        }
      }, { status: 200 })
    }

    return NextResponse.json({ error: 'إجراء غير معروف' }, { status: 400 })
  } catch (err) {
    console.error('Unexpected error in daily-shift POST:', err)
    return NextResponse.json({ error: 'حدث خطأ غير متوقع' }, { status: 500 })
  }
}
