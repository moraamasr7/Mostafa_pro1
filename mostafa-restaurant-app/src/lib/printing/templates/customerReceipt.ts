import { CustomerReceiptPayload } from '@/types/printing'
import {
  formatCentered,
  formatDivider,
  formatTwoColumns,
  formatDateTime,
  formatCurrency,
  THERMAL_80MM_CSS,
  THERMAL_LINE_WIDTH,
} from './formatters'
import { RenderedTemplateOutput } from './kitchenTicket'

export function renderCustomerReceipt(payload: CustomerReceiptPayload): RenderedTemplateOutput {
  const { dateStr, timeStr } = formatDateTime(payload.created_at)

  const orderTypeArabic =
    payload.order_type === 'delivery'
      ? 'توصيل منازل (DELIVERY)'
      : 'استلام من الفرع (TAKEAWAY)'

  const paymentMethodArabic =
    payload.payment_method === 'card'
      ? 'بطاقة دفع إلكتروني (فيزا) 💳'
      : payload.payment_method === 'instapay'
      ? 'تحويل إنستا باي (InstaPay) ⚡'
      : payload.payment_method === 'wallet'
      ? 'محفظة إلكترونية 📱'
      : 'نقدي كاش 💵'

  // --- 1. Raw Text (48-column thermal format) ---
  const lines: string[] = []

  lines.push(formatCentered('مطعم مصطفى الجزار', THERMAL_LINE_WIDTH))
  lines.push(formatCentered('أصالة المذاق وجودة اللحوم البلدي', THERMAL_LINE_WIDTH))
  lines.push(formatCentered('*** فاتورة بيع رسمية ***', THERMAL_LINE_WIDTH))
  lines.push(formatDivider('=', THERMAL_LINE_WIDTH))

  if (payload.print_nature === 'REPRINT') {
    lines.push(formatCentered(`*** [نسخة معاد طباعتها - REPRINT #${payload.reprint_count || 1}] ***`, THERMAL_LINE_WIDTH))
    if (payload.reprint_reason) {
      lines.push(formatCentered(`سبب الإعادة: ${payload.reprint_reason}`, THERMAL_LINE_WIDTH))
    }
    lines.push(formatDivider('-', THERMAL_LINE_WIDTH))
  }

  lines.push(formatTwoColumns(`رقم الفاتورة: #${payload.order_number}`, `الوردية: #${payload.shift_number}`))
  lines.push(formatTwoColumns(`الرقم التشغيلي: ${payload.shift_sequence_display}`, `نوع الطلب: ${payload.order_type}`))
  lines.push(formatTwoColumns(`التاريخ: ${dateStr}`, `الوقت: ${timeStr}`))
  lines.push(formatTwoColumns(`الكاشير: ${payload.created_by_staff}`, `طريقة الدفع: ${payload.payment_method}`))
  lines.push(formatDivider('-', THERMAL_LINE_WIDTH))

  lines.push(`العميل: ${payload.customer_name}`)
  lines.push(`الهاتف: ${payload.customer_phone}`)
  if (payload.delivery_address) {
    lines.push(`العنوان: ${payload.delivery_address}`)
  }
  if (payload.driver_name) {
    lines.push(`الطيار المسلم: ${payload.driver_name}`)
  }
  lines.push(formatDivider('=', THERMAL_LINE_WIDTH))

  lines.push(formatTwoColumns('الصنف / الكمية × السعر', 'الإجمالي'))
  lines.push(formatDivider('-', THERMAL_LINE_WIDTH))

  for (const itm of payload.items) {
    const itemHeader = `${itm.name} (${itm.variant_name})`
    lines.push(itemHeader)
    const detailLeft = formatCurrency(Number(itm.subtotal || 0))
    const detailRight = `  ${itm.quantity} × ${Number(itm.unit_price || 0).toFixed(2)}`
    lines.push(formatTwoColumns(detailRight, detailLeft))

    if (itm.item_notes) {
      lines.push(`  ملاحظة: ${itm.item_notes}`)
    }
  }

  lines.push(formatDivider('=', THERMAL_LINE_WIDTH))

  lines.push(formatTwoColumns('إجمالي الأصناف:', formatCurrency(payload.subtotal_amount)))

  if (payload.order_type === 'delivery' && Number(payload.delivery_fee) > 0) {
    lines.push(formatTwoColumns('خدمة التوصيل:', formatCurrency(payload.delivery_fee)))
  }

  lines.push(formatDivider('-', THERMAL_LINE_WIDTH))
  lines.push(formatTwoColumns('*** الإجمالي النهائي ***:', formatCurrency(payload.total_amount)))
  lines.push(formatTwoColumns('طريقة السداد:', paymentMethodArabic))
  lines.push(formatDivider('=', THERMAL_LINE_WIDTH))

  lines.push(formatCentered('شكراً لزيارتكم مطعم مصطفى الجزار', THERMAL_LINE_WIDTH))
  lines.push(formatCentered('خدمتكم شرف لنا دائماً', THERMAL_LINE_WIDTH))
  lines.push('\n\n\n')

  const rawText = lines.join('\n')

  // --- 2. HTML 80mm Template ---
  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>فاتورة عميل #${payload.order_number}</title>
  <style>${THERMAL_80MM_CSS}</style>
</head>
<body>
  <div class="thermal-receipt">
    <div class="center bold extra-large">مطعم مصطفى الجزار</div>
    <div class="center" style="font-size: 11px;">أصالة المذاق وجودة اللحوم البلدي</div>
    <div class="center bold large" style="margin-top: 3px;">فاتورة بيع</div>
    <div class="divider-double"></div>

    ${
      payload.print_nature === 'REPRINT'
        ? `<div class="reprint-banner">
             *** نسخة معاد طباعتها - REPRINT #${payload.reprint_count || 1} ***<br>
             <span style="font-size: 11px; font-weight: normal;">السبب: ${payload.reprint_reason || 'غير محدد'}</span>
           </div>`
        : ''
    }

    <div class="row bold">
      <span>رقم الطلب: #${payload.order_number}</span>
      <span class="badge-box">${payload.shift_sequence_display}</span>
    </div>

    <div class="row" style="font-size: 11px;">
      <span>الوردية: #${payload.shift_number}</span>
      <span>${orderTypeArabic}</span>
    </div>

    <div class="row" style="font-size: 11px;">
      <span>التاريخ: ${dateStr}</span>
      <span>الوقت: ${timeStr}</span>
    </div>

    <div class="row" style="font-size: 11px;">
      <span>الكاشير: ${payload.created_by_staff}</span>
    </div>

    <div class="divider"></div>

    <div style="font-size: 12px; margin: 4px 0;">
      <div><strong>العميل:</strong> ${payload.customer_name}</div>
      <div><strong>الهاتف:</strong> ${payload.customer_phone}</div>
      ${payload.delivery_address ? `<div><strong>العنوان:</strong> ${payload.delivery_address}</div>` : ''}
      ${payload.driver_name ? `<div><strong>الطيار:</strong> ${payload.driver_name}</div>` : ''}
    </div>

    <div class="divider-double"></div>

    <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
      <thead>
        <tr style="border-bottom: 1px solid #000;">
          <th style="text-align: right; padding: 2px 0;">الصنف</th>
          <th style="text-align: center; width: 45px;">الكمية</th>
          <th style="text-align: left; width: 65px;">المجموع</th>
        </tr>
      </thead>
      <tbody>
        ${payload.items
          .map(
            (itm) => `
          <tr style="border-bottom: 1px dotted #ddd;">
            <td style="padding: 4px 0;">
              <span class="bold">${itm.name}</span>
              <div style="font-size: 10px; color: #555;">${itm.variant_name} (${Number(itm.unit_price || 0).toFixed(0)} ج.م)</div>
              ${itm.item_notes ? `<div style="font-size: 10px; color: #777;">* ${itm.item_notes}</div>` : ''}
            </td>
            <td style="text-align: center; font-weight: bold;">${itm.quantity}</td>
            <td style="text-align: left; font-weight: bold;">${formatCurrency(Number(itm.subtotal || 0))}</td>
          </tr>
        `
          )
          .join('')}
      </tbody>
    </table>

    <div class="divider"></div>

    <div class="row" style="font-size: 12px;">
      <span>إجمالي الأصناف:</span>
      <span class="bold">${formatCurrency(payload.subtotal_amount)}</span>
    </div>

    ${
      payload.order_type === 'delivery' && Number(payload.delivery_fee) > 0
        ? `<div class="row" style="font-size: 12px;">
             <span>خدمة التوصيل:</span>
             <span class="bold">${formatCurrency(payload.delivery_fee)}</span>
           </div>`
        : ''
    }

    <div class="divider-double"></div>

    <div class="row bold large" style="margin: 4px 0;">
      <span>الإجمالي المطلوب:</span>
      <span>${formatCurrency(payload.total_amount)}</span>
    </div>

    <div class="row" style="font-size: 12px;">
      <span>طريقة الدفع:</span>
      <span class="bold">${paymentMethodArabic}</span>
    </div>

    <div class="divider-double"></div>

    <div class="center bold" style="margin-top: 6px;">شكراً لزيارتكم مطعم مصطفى الجزار</div>
    <div class="center" style="font-size: 11px;">خدمتكم شرف لنا دائماً</div>
  </div>
</body>
</html>
  `.trim()

  return {
    document_type: 'CUSTOMER_RECEIPT',
    station: 'CASHIER_80MM',
    title: `فاتورة بيع #${payload.order_number}`,
    rawText,
    html,
  }
}
