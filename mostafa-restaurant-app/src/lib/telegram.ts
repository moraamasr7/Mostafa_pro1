import { FinalDailyReportPayload } from './dailyReportPresentation'

export interface TelegramSendResult {
  success: boolean
  error?: string
}

export async function sendTelegramMessage(text: string): Promise<TelegramSendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim()

  if (!token || !chatId) {
    console.warn('Telegram notifications skipped: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing in environment variables')
    return { success: false, error: 'Telegram credentials missing in environment variables' }
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    })

    const data = await res.json()
    if (!data.ok) {
      console.error('Telegram API error:', data.description)
      return { success: false, error: data.description }
    }
    return { success: true }
  } catch (err) {
    console.error('Error sending Telegram message:', err)
    return { success: false, error: String(err) }
  }
}

/**
 * Pure Presentation / Formatting Function for Telegram Executive Reports.
 * 
 * Rules:
 * 1. Zero financial calculations (+, -, *, /, sum, reduce on financial values).
 * 2. Directly formats numbers provided by FinalDailyReportPayload.
 * 3. Does NOT modify or create any new financial figures.
 */
export function formatTelegramFinalDailyReport(report: FinalDailyReportPayload): string {
  const shift = report.shift
  const fin = report.financial_summary
  const rec = report.cash_reconciliation
  const custody = report.cash_custody
  const exp = report.expenses_summary
  const ord = report.orders_summary
  const fleet = report.fleet_summary

  const statusEmoji = shift.status === 'open' ? '🟢' : '🔴'
  const statusLabel = shift.status === 'open' ? 'وردية تشغيلية مفتوحة (تقرير فوري)' : 'وردية تشغيلية مغلقة'

  let discBadge = '⏳ في انتظار إغلاق الوردية وجرد الدرج'
  if (rec.reconciliation_status === 'balanced') {
    discBadge = '✅ الدرج مطابق تماماً (0 ج.م)'
  } else if (rec.reconciliation_status === 'surplus') {
    discBadge = `⚠️ زيادة بالدرج (+${Number(rec.discrepancy || 0).toLocaleString()} ج.م)`
  } else if (rec.reconciliation_status === 'deficit') {
    discBadge = `🚨 عجز بالدرج (${Number(rec.discrepancy || 0).toLocaleString()} ج.م)`
  } else if (rec.reconciliation_status === 'closed_without_cash_count') {
    discBadge = '⚠️ تم الإغلاق بدون تسجيل جرد نقدي'
  }

  const driverLines = fleet.driver_details.length > 0
    ? fleet.driver_details.map(d =>
        `  • <b>${d.driver_name}:</b> ${d.delivered_orders_count} طلب | ${d.duration_hours} س | صافي: <b>${Number(d.net_payout).toLocaleString()} ج.م</b>`
      ).join('\n')
    : ''

  const lines = [
    `📊 <b>التقرير المالي والتشغيلي التنفيذي (#${shift.shift_number})</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🔖 <b>حالة الوردية:</b> ${statusEmoji} ${statusLabel}`,
    `👤 <b>المسؤول:</b> ${shift.closed_by || shift.opened_by}`,
    shift.opened_at ? `⏰ <b>وقت الفتح:</b> ${new Date(shift.opened_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' })}` : '',
    shift.closed_at ? `⏰ <b>وقت الإغلاق:</b> ${new Date(shift.closed_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' })}` : '',
    `━━━━━━━━━━━━━━━━━━━━`,
    `💵 <b>المبيعات وتفصيل الدفع:</b>`,
    `• إجمالي المبيعات الكلي: <b>${Number(fin.total_sales).toLocaleString()} ج.م</b> (${ord.completed_orders_count} طلب)`,
    ord.product_sales !== undefined ? `  └ مبيعات الأصناف (Food): <b>${Number(ord.product_sales).toLocaleString()} ج.م</b>` : '',
    ord.delivery_fees_total !== undefined && ord.delivery_fees_total > 0 ? `  └ إجمالي خدمات التوصيل: <b>${Number(ord.delivery_fees_total).toLocaleString()} ج.م</b>` : '',
    `• كاش مورد بالخزينة: <b>${Number(fin.cash_sales).toLocaleString()} ج.م</b>`,
    `• تحويلات إنستاباي: <b>${Number(fin.instapay_sales).toLocaleString()} ج.م</b>`,
    `• محافظ إلكترونية: <b>${Number(fin.wallet_sales).toLocaleString()} ج.م</b>`,
    fin.other_electronic_sales > 0 ? `• مدفوعات إلكترونية أخرى: <b>${Number(fin.other_electronic_sales).toLocaleString()} ج.م</b>` : '',
    `• إجمالي اللانقدي: <b>${Number(fin.non_cash_sales).toLocaleString()} ج.م</b>`,
    ord.delivery_sales > 0 ? `• مبيعات الدليفري: <b>${Number(ord.delivery_sales).toLocaleString()} ج.م</b> (${ord.delivery_orders_count} طلب)` : '',
    ord.takeaway_sales > 0 ? `• صالة واستلام: <b>${Number(ord.takeaway_sales).toLocaleString()} ج.م</b> (${ord.takeaway_orders_count} طلب)` : '',
    `\n💸 <b>المصروفات والسلف:</b>`,
    `• مصروفات تشغيلية وعامة: <b>${Number(exp.general_expenses).toLocaleString()} ج.م</b>`,
    `• سلف الطيارين المسحوبة: <b>${Number(exp.driver_advances).toLocaleString()} ج.م</b>`,
    `• سلف ومرتبات العاملين: <b>${Number(exp.staff_advances).toLocaleString()} ج.م</b>`,
    `• إجمالي المصروفات: <b>${Number(exp.total_expenses).toLocaleString()} ج.م</b>`,
    `\n💰 <b>الخزينة ومطابقة النقدية:</b>`,
    `• العهدة الافتتاحية: <b>${Number(rec.initial_cash).toLocaleString()} ج.م</b>`,
    `• كاش المبيعات المورد: <b>${Number(rec.cash_sales_settled).toLocaleString()} ج.م</b>`,
    `• الكاش المطلوب توفره بالدرج: <b>${Number(rec.expected_cash_in_drawer).toLocaleString()} ج.م</b>`,
    rec.actual_cash_in_drawer !== null ? `• الكاش الفعلي المسلم: <b>${Number(rec.actual_cash_in_drawer).toLocaleString()} ج.م</b>` : '• الكاش الفعلي: <i>قيد الجرد</i>',
    `• نتيجة المطابقة: <b>${discBadge}</b>`,
    `\n💼 <b>مواقع تواجد النقدية (Cash Custody):</b>`,
    `• كاش محصل ومورد بالدرج: <b>${Number(custody.settled_to_cashier).toLocaleString()} ج.م</b>`,
    `• كاش في عهدة الطيارين: <b>${Number(custody.driver_custody_cash).toLocaleString()} ج.م</b>`,
    `• مبالغ معلقة غير محصلة: <b>${Number(custody.uncollected_cash).toLocaleString()} ج.م</b>`,
    (fleet.active_drivers_count > 0 || fleet.delivery_trips_count > 0 || fleet.total_hours > 0) ? [
      `\n🛵 <b>حركة التوصيل وأسطول الطيارين:</b>`,
      `• الطيارين النشطين: <b>${fleet.active_drivers_count} طيارين</b> (${fleet.delivery_trips_count} رحلة)`,
      `• ساعات عمل الأسطول: <b>${fleet.total_hours} ساعة</b> (${Number(fleet.total_hours_wage).toLocaleString()} ج.م)`,
      `• طلبات مسلمة بالأسطول: <b>${fleet.total_delivered_orders} طلب</b> (عمولات: ${Number(fleet.total_delivery_commissions).toLocaleString()} ج.م)`,
      fleet.total_driver_advances > 0 ? `• سلف الطيارين المخصومة: <b>-${Number(fleet.total_driver_advances).toLocaleString()} ج.م</b>` : '',
      `• <b>صافي مستحقات الأسطول: ${Number(fleet.total_net_payout).toLocaleString()} ج.م</b>`,
      driverLines ? `\n📋 <b>تفاصيل مستحقات الطيارين:</b>\n${driverLines}` : '',
    ].filter(Boolean).join('\n') : '',
    (ord.cancelled_orders_count > 0 || ord.failed_orders_count > 0) ? [
      `\n⚠️ <b>الفواقد والإلغاءات:</b>`,
      ord.cancelled_orders_count > 0 ? `• طلبات ملغاة: <b>${ord.cancelled_orders_count}</b> (بقيمة: ${Number(ord.cancelled_amount).toLocaleString()} ج.م)` : '',
      ord.failed_orders_count > 0 ? `• طلبات فاشلة / مرتجعة: <b>${ord.failed_orders_count}</b>` : '',
    ].filter(Boolean).join('\n') : '',
    shift.notes ? `\n📝 <b>ملاحظات الإدارة:</b> ${shift.notes}` : '',
    `━━━━━━━━━━━━━━━━━━━━`,
    `✨ <i>تم التقرير والاعتماد عبر لوحة العمليات السحابية.</i>`,
  ].filter(Boolean).join('\n')

  return lines
}

/**
 * Sends the Final Daily Report to Telegram.
 * 
 * Guarantees Failure Isolation:
 * Network or Telegram errors are caught safely and return { success: false, error: ... }
 * without throwing uncaught exceptions or affecting caller workflows.
 */
export async function sendTelegramFinalDailyReport(report: FinalDailyReportPayload): Promise<TelegramSendResult> {
  try {
    const formattedHtml = formatTelegramFinalDailyReport(report)
    return await sendTelegramMessage(formattedHtml)
  } catch (err: any) {
    console.error('Error formatting or sending Telegram Final Daily Report:', err)
    return { success: false, error: err?.message || String(err) }
  }
}

export async function notifyShiftOpened(data: {
  shiftNumber: number | string
  openedBy: string
  initialCash: number
}) {
  const time = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' })
  const date = new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'Africa/Cairo' })
  
  const msg = [
    `🟢 <b>فتح وردية جديدة للمطعم (#${data.shiftNumber})</b>`,
    `━━━━━━━━━━━━━━━━━━━`,
    `👤 <b>المسؤول:</b> ${data.openedBy}`,
    `📅 <b>التاريخ:</b> ${date}`,
    `⏰ <b>التوقيت:</b> ${time}`,
    `💵 <b>العهدة النقدية الافتتاحية:</b> ${Number(data.initialCash).toFixed(0)} ج.م`,
    `━━━━━━━━━━━━━━━━━━━`,
    `✨ <i>تم بدء اليوم التشغيلي بنجاح.</i>`,
  ].join('\n')

  return sendTelegramMessage(msg)
}

export interface ExecutiveDailyReportData {
  shiftNumber: number | string
  closedBy: string
  dateStr?: string
  totalSales: number
  totalOrdersCount?: number
  deliverySales?: number
  deliveryOrdersCount?: number
  takeawaySales?: number
  takeawayOrdersCount?: number
  initialCash: number
  totalExpenses: number
  expectedCash: number
  actualCash: number
  discrepancy: number
  deliveryTripsCount?: number
  activeDriversCount?: number
  fleetAccounting?: {
    totalHours?: number
    totalHoursWage?: number
    totalDeliveredOrders?: number
    totalDeliveryCommissions?: number
    totalDriverAdvances?: number
    totalNetPayout?: number
  }
  cancelledOrdersCount?: number
  cancelledAmount?: number
  failedOrdersCount?: number
  notes?: string
}

export async function sendExecutiveDailyReport(data: ExecutiveDailyReportData): Promise<TelegramSendResult> {
  const time = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' })
  const date = data.dateStr || new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Africa/Cairo' })
  const disc = Number(data.discrepancy || 0)
  const discText = disc === 0
    ? '✅ الدرج مطابق تماماً (0 ج.م)'
    : disc > 0
    ? `⚠️ زيادة بالدرج (+${disc.toLocaleString()} ج.م)`
    : `🚨 عجز بالدرج (${disc.toLocaleString()} ج.م)`

  const ordersCount = data.totalOrdersCount || 0
  const deliverySales = data.deliverySales || 0
  const takeawaySales = data.takeawaySales || 0
  const avgOrder = ordersCount > 0 ? Math.round(data.totalSales / ordersCount) : 0

  const lines = [
    `📊 <b>التقرير المالي والتشغيلي اليومي (#${data.shiftNumber})</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📅 <b>التاريخ:</b> ${date}`,
    `⏰ <b>توقيت التقفيل:</b> ${time}`,
    `👤 <b>المسؤول:</b> ${data.closedBy}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `💵 <b>المبيعات والإيرادات:</b>`,
    `• إجمالي المبيعات: <b>${Number(data.totalSales).toLocaleString()} ج.م</b> (${ordersCount} طلب)`,
    avgOrder > 0 ? `• متوسط الفاتورة: <b>${avgOrder.toLocaleString()} ج.م</b>` : '',
    deliverySales > 0 ? `• مبيعات الدليفري: <b>${Number(deliverySales).toLocaleString()} ج.م</b> (${data.deliveryOrdersCount || 0} طلب)` : '',
    takeawaySales > 0 ? `• صالة واستلام: <b>${Number(takeawaySales).toLocaleString()} ج.م</b> (${data.takeawayOrdersCount || 0} طلب)` : '',
    `\n💸 <b>المصروفات والسلف:</b>`,
    `• إجمالي الخارج من الدرج: <b>${Number(data.totalExpenses).toLocaleString()} ج.م</b>`,
    `\n💰 <b>الخزينة ومطابقة النقدية:</b>`,
    `• العهدة الافتتاحية: <b>${Number(data.initialCash).toLocaleString()} ج.م</b>`,
    `• الكاش المطلوب توفره: <b>${Number(data.expectedCash).toLocaleString()} ج.م</b>`,
    `• الكاش الفعلي المستلم: <b>${Number(data.actualCash).toLocaleString()} ج.م</b>`,
    `• نتيجة الجرد: <b>${discText}</b>`,
    (data.activeDriversCount || data.deliveryTripsCount || data.fleetAccounting) ? [
      `\n🛵 <b>حركة التوصيل والأسطول:</b>`,
      data.activeDriversCount ? `• الطيارين النشطين: <b>${data.activeDriversCount} طيارين</b>` : '',
      data.deliveryTripsCount ? `• رحلات التوصيل: <b>${data.deliveryTripsCount} رحلة</b>` : '',
      data.fleetAccounting && data.fleetAccounting.totalNetPayout !== undefined ? [
        `• ساعات عمل الأسطول: <b>${data.fleetAccounting.totalHours || 0} ساعة</b> (${(data.fleetAccounting.totalHoursWage || 0).toLocaleString()} ج.م)`,
        `• طلبات مسلّمة بالأسطول: <b>${data.fleetAccounting.totalDeliveredOrders || 0} طلب</b> (عمولات: ${(data.fleetAccounting.totalDeliveryCommissions || 0).toLocaleString()} ج.م)`,
        data.fleetAccounting.totalDriverAdvances ? `• سلف الطيارين المسحوبة: <b>-${(data.fleetAccounting.totalDriverAdvances).toLocaleString()} ج.م</b>` : '',
        `• <b>صافي مستحقات الطيارين: ${Number(data.fleetAccounting.totalNetPayout).toLocaleString()} ج.م</b>`,
      ].filter(Boolean).join('\n') : '',
    ].filter(Boolean).join('\n') : '',
    (data.cancelledOrdersCount || data.failedOrdersCount) ? [
      `\n⚠️ <b>الفواقد والإلغاءات:</b>`,
      data.cancelledOrdersCount ? `• طلبات ملغاة: <b>${data.cancelledOrdersCount}</b> (بقيمة: ${data.cancelledAmount || 0} ج.م)` : '',
      data.failedOrdersCount ? `• طلبات فاشلة / مرتجعة: <b>${data.failedOrdersCount}</b>` : '',
    ].filter(Boolean).join('\n') : '',
    data.notes ? `\n📝 <b>ملاحظات الإدارة:</b> ${data.notes}` : '',
    `━━━━━━━━━━━━━━━━━━━━`,
    `✨ <i>تم التقفيل والاعتماد عبر لوحة العمليات السحابية.</i>`,
  ].filter(Boolean).join('\n')

  return sendTelegramMessage(lines)
}

export async function notifyShiftClosed(data: {
  shiftNumber: number | string
  closedBy: string
  initialCash: number
  totalSales: number
  totalExpenses: number
  expectedCash: number
  actualCash: number
  discrepancy: number
  totalOrdersCount?: number
  deliverySales?: number
  deliveryOrdersCount?: number
  takeawaySales?: number
  takeawayOrdersCount?: number
  deliveryTripsCount?: number
  activeDriversCount?: number
  fleetAccounting?: {
    totalHours?: number
    totalHoursWage?: number
    totalDeliveredOrders?: number
    totalDeliveryCommissions?: number
    totalDriverAdvances?: number
    totalNetPayout?: number
  }
  cancelledOrdersCount?: number
  cancelledAmount?: number
  failedOrdersCount?: number
  notes?: string
}) {
  return sendExecutiveDailyReport(data)
}

export async function notifyExpenseRecorded(data: {
  category: string
  amount: number
  description: string
  recipientName?: string
  recordedBy: string
}) {
  const time = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' })
  const msg = [
    `💸 <b>تسجيل نقدية خارجة / مصروف</b>`,
    `━━━━━━━━━━━━━━━━━━━`,
    `🏷️ <b>البند:</b> ${data.category}`,
    `💰 <b>المبلغ:</b> ${Number(data.amount).toFixed(0)} ج.م`,
    `📝 <b>البيان:</b> ${data.description}`,
    data.recipientName ? `👤 <b>المستلم:</b> ${data.recipientName}` : '',
    `✍️ <b>سُجل بواسطة:</b> ${data.recordedBy}`,
    `⏰ <b>التوقيت:</b> ${time}`,
  ].filter(Boolean).join('\n')

  return sendTelegramMessage(msg)
}

export async function notifyOrderCancelled(data: {
  orderNumber: number | string
  customerName: string
  totalAmount: number
  cancelledBy: string
  reason: string
}) {
  const time = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' })
  const msg = [
    `🚨 <b>إلغاء طلب (#${data.orderNumber})</b>`,
    `━━━━━━━━━━━━━━━━━━━`,
    `👤 <b>العميل:</b> ${data.customerName}`,
    `💵 <b>قيمة الطلب:</b> ${Number(data.totalAmount).toFixed(0)} ج.م`,
    `❌ <b>ألغي بواسطة:</b> ${data.cancelledBy}`,
    `⚠️ <b>السبب المسجل:</b> ${data.reason}`,
    `⏰ <b>التوقيت:</b> ${time}`,
  ].join('\n')

  return sendTelegramMessage(msg)
}

export async function notifyNewOrder(data: {
  orderNumber: number | string
  customerName: string
  phone: string
  orderType: string
  totalAmount: number
}) {
  const time = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' })
  const typeLabel = data.orderType === 'delivery' ? '🛵 دليفري منزل' : '🏪 استلام من الفرع'
  const msg = [
    `🔥 <b>طلب جديد ورد (#${data.orderNumber})</b>`,
    `━━━━━━━━━━━━━━━━━━━`,
    `📍 <b>النوع:</b> ${typeLabel}`,
    `👤 <b>العميل:</b> ${data.customerName} (${data.phone})`,
    `💰 <b>الإجمالي:</b> ${Number(data.totalAmount).toFixed(0)} ج.م`,
    `⏰ <b>التوقيت:</b> ${time}`,
  ].join('\n')

  return sendTelegramMessage(msg)
}
