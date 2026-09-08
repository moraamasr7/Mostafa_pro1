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

export async function notifyShiftClosed(data: {
  shiftNumber: number | string
  closedBy: string
  initialCash: number
  totalSales: number
  totalExpenses: number
  expectedCash: number
  actualCash: number
  discrepancy: number
  notes?: string
}) {
  const time = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
  const disc = Number(data.discrepancy)
  const discText = disc === 0 ? '✅ الدرج مطابق تماماً (0 ج.م)' : disc > 0 ? `⚠️ زيادة في الدرج (+${disc.toFixed(0)} ج.م)` : `🚨 عجز في الدرج (${disc.toFixed(0)} ج.م)`

  const msg = [
    `🔒 <b>تقفيل وإغلاق الوردية (#${data.shiftNumber})</b>`,
    `━━━━━━━━━━━━━━━━━━━`,
    `👤 <b>أغلق بواسطة:</b> ${data.closedBy}`,
    `⏰ <b>توقيت الإغلاق:</b> ${time}`,
    `💰 <b>العهدة الافتتاحية:</b> ${Number(data.initialCash).toFixed(0)} ج.م`,
    `📈 <b>إجمالي مبيعات الوردية:</b> ${Number(data.totalSales).toFixed(0)} ج.م`,
    `💸 <b>إجمالي المصروفات والسلف:</b> ${Number(data.totalExpenses).toFixed(0)} ج.م`,
    `💵 <b>المبلغ المحسوب المطلوب:</b> ${Number(data.expectedCash).toFixed(0)} ج.م`,
    `🧾 <b>المبلغ الفعلي المستلم:</b> ${Number(data.actualCash).toFixed(0)} ج.م`,
    `━━━━━━━━━━━━━━━━━━━`,
    `📊 <b>المطابقة:</b> ${discText}`,
    data.notes ? `📝 <b>ملاحظات:</b> ${data.notes}` : '',
  ].filter(Boolean).join('\n')

  return sendTelegramMessage(msg)
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
