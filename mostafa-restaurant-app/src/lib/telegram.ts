interface TelegramSendResult {
  success: boolean
  error?: string
}

const DEFAULT_BOT_TOKEN = '8838184657:AAE-ab3FEgwinx2My5Shdx90vzlbpgPwwTo'
const DEFAULT_CHAT_ID = '8658748027'

export async function sendTelegramMessage(text: string): Promise<TelegramSendResult> {
  const token = (process.env.TELEGRAM_BOT_TOKEN || DEFAULT_BOT_TOKEN).trim()
  const chatId = (process.env.TELEGRAM_CHAT_ID || DEFAULT_CHAT_ID).trim()

  if (!token || !chatId) {
    console.warn('Telegram notifications skipped: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing')
    return { success: false, error: 'Telegram credentials missing' }
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

export async function notifyShiftOpened(data: {
  shiftNumber: number | string
  openedBy: string
  initialCash: number
}) {
  const time = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
  const date = new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'numeric', day: 'numeric' })
  
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
  totalOrdersCount: number
  deliverySales: number
  deliveryOrdersCount: number
  takeawaySales: number
  takeawayOrdersCount: number
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
  const time = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
  const date = data.dateStr || new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const disc = Number(data.discrepancy || 0)
  const discText = disc === 0
    ? '✅ الدرج مطابق تماماً (0 ج.م)'
    : disc > 0
    ? `⚠️ زيادة بالدرج (+${disc.toLocaleString()} ج.م)`
    : `🚨 عجز بالدرج (${disc.toLocaleString()} ج.م)`

  const avgOrder = data.totalOrdersCount > 0 ? Math.round(data.totalSales / data.totalOrdersCount) : 0

  const lines = [
    `📊 <b>التقرير المالي والتشغيلي اليومي (#${data.shiftNumber})</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📅 <b>التاريخ:</b> ${date}`,
    `⏰ <b>توقيت التقفيل:</b> ${time}`,
    `👤 <b>المسؤول:</b> ${data.closedBy}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `💵 <b>المبيعات والإيرادات:</b>`,
    `• إجمالي المبيعات: <b>${Number(data.totalSales).toLocaleString()} ج.م</b> (${data.totalOrdersCount} طلب)`,
    avgOrder > 0 ? `• متوسط الفاتورة: <b>${avgOrder.toLocaleString()} ج.م</b>` : '',
    data.deliverySales > 0 ? `• مبيعات الدليفري: <b>${Number(data.deliverySales).toLocaleString()} ج.م</b> (${data.deliveryOrdersCount || 0} طلب)` : '',
    data.takeawaySales > 0 ? `• صالة واستلام: <b>${Number(data.takeawaySales).toLocaleString()} ج.م</b> (${data.takeawayOrdersCount || 0} طلب)` : '',
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
  return sendExecutiveDailyReport({
    shiftNumber: data.shiftNumber,
    closedBy: data.closedBy,
    totalSales: data.totalSales,
    totalOrdersCount: data.totalOrdersCount || 0,
    deliverySales: data.deliverySales || 0,
    deliveryOrdersCount: data.deliveryOrdersCount || 0,
    takeawaySales: data.takeawaySales || 0,
    takeawayOrdersCount: data.takeawayOrdersCount || 0,
    initialCash: data.initialCash,
    totalExpenses: data.totalExpenses,
    expectedCash: data.expectedCash,
    actualCash: data.actualCash,
    discrepancy: data.discrepancy,
    deliveryTripsCount: data.deliveryTripsCount,
    activeDriversCount: data.activeDriversCount,
    fleetAccounting: data.fleetAccounting,
    cancelledOrdersCount: data.cancelledOrdersCount,
    cancelledAmount: data.cancelledAmount,
    failedOrdersCount: data.failedOrdersCount,
    notes: data.notes,
  })
}

export async function notifyExpenseRecorded(data: {
  category: string
  amount: number
  description: string
  recipientName?: string
  recordedBy: string
}) {
  const time = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
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
  const time = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
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
  const time = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
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
