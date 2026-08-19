// مكتبة إرسال إشعارات التليجرام لمطعم مصطفى الجزار

interface TelegramOrderData {
  order_number: number | string
  customer_name: string
  customer_phone: string
  order_type: string
  delivery_address?: string | null
  payment_method?: string | null
  payment_receipt_url?: string | null
  total_amount?: number | null
  notes?: string | null
}

export async function sendNewOrderNotification(order: TelegramOrderData) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!botToken || !chatId) {
    // تليجرام غير مفعل — يتم التجاوز بسلاسة
    return
  }

  try {
    const isDelivery = order.order_type === 'delivery'
    const typeEmoji = isDelivery ? '🛵 دليفري' : '🏪 استلام فرع'
    const paymentText =
      order.payment_method === 'instapay'
        ? 'إنستا باي ⚡'
        : order.payment_method === 'wallet'
        ? 'فودافون كاش 📱'
        : 'نقدي كاش 💵'

    let message = `🔔 *طلب جديد رقم #${order.order_number}*\n`
    message += `━━━━━━━━━━━━━━━━━━\n`
    message += `👤 *العميل*: ${order.customer_name}\n`
    message += `📞 *الهاتف*: \`${order.customer_phone}\`\n`
    message += `🏷️ *نوع الطلب*: ${typeEmoji}\n`

    if (isDelivery && order.delivery_address) {
      message += `📍 *عنوان التوصيل*: ${order.delivery_address}\n`
    }

    message += `💳 *طريقة الدفع*: ${paymentText}\n`

    if (order.payment_receipt_url) {
      message += `📄 *إثبات التحويل*: [عرض صورة التحويل](${order.payment_receipt_url})\n`
    }

    if (order.total_amount) {
      message += `💰 *الإجمالي*: *${order.total_amount} ج.م*\n`
    }

    if (order.notes) {
      message += `📝 *ملاحظات*: ${order.notes}\n`
    }

    message += `\n⏰ *التوقيت*: ${new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })}`

    // إرسال الصورة مباشرة لو كانت صورة إثبات تحويل مرفقة
    if (order.payment_receipt_url && order.payment_receipt_url.startsWith('http')) {
      await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          photo: order.payment_receipt_url,
          caption: message,
          parse_mode: 'Markdown',
        }),
      })
    } else {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'Markdown',
          disable_web_page_preview: false,
        }),
      })
    }
  } catch (err) {
    console.error('خطأ في إرسال إشعار التليجرام:', err)
  }
}
