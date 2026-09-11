import { DineInCustomerTicketPayload } from '@/types/printing'
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

export function renderDineInTicket(payload: DineInCustomerTicketPayload): RenderedTemplateOutput {
  const { dateStr, timeStr } = formatDateTime(payload.created_at)

  const paymentMethodArabic =
    payload.payment_method === 'card'
      ? 'بطاقة دفع (فيزا) 💳'
      : payload.payment_method === 'instapay'
      ? 'إنستا باي ⚡'
      : payload.payment_method === 'wallet'
      ? 'محفظة إلكترونية 📱'
      : 'نقدي كاش 💵'

  // --- 1. Raw Text (48-column thermal format) ---
  const lines: string[] = []

  lines.push(formatCentered('مطعم مصطفى الجزار', THERMAL_LINE_WIDTH))
  lines.push(formatCentered('*** تذكرة صالة العميل (DINE-IN) ***', THERMAL_LINE_WIDTH))
  lines.push(formatDivider('=', THERMAL_LINE_WIDTH))

  if (payload.print_nature === 'REPRINT') {
    lines.push(formatCentered(`*** [نسخة معاد طباعتها - REPRINT #${payload.reprint_count || 1}] ***`, THERMAL_LINE_WIDTH))
    if (payload.reprint_reason) {
      lines.push(formatCentered(`سبب الإعادة: ${payload.reprint_reason}`, THERMAL_LINE_WIDTH))
    }
    lines.push(formatDivider('-', THERMAL_LINE_WIDTH))
  }

  // Highlight Hall Turn
  lines.push(formatDivider('*', THERMAL_LINE_WIDTH))
  lines.push(formatCentered(`دور الصالة: ${payload.turn_display}`, THERMAL_LINE_WIDTH))
  lines.push(formatCentered(`العميل: ${payload.customer_name}`, THERMAL_LINE_WIDTH))
  if (payload.party_size) {
    lines.push(formatCentered(`عدد الأفراد: ${payload.party_size} أفراد`, THERMAL_LINE_WIDTH))
  }
  lines.push(formatDivider('*', THERMAL_LINE_WIDTH))

  lines.push(formatTwoColumns(`طلب رقم: #${payload.order_number}`, `الوردية: #${payload.shift_number}`))
  lines.push(formatTwoColumns(`التاريخ: ${dateStr}`, `الوقت: ${timeStr}`))
  lines.push(formatTwoColumns(`الكاشير: ${payload.created_by_staff}`, `السداد: ${payload.payment_method}`))
  lines.push(formatDivider('-', THERMAL_LINE_WIDTH))

  lines.push(formatTwoColumns('الصنف والكمية', 'المجموع'))
  lines.push(formatDivider('-', THERMAL_LINE_WIDTH))

  for (const itm of payload.items) {
    const title = `${itm.name} (${itm.variant_name})`
    lines.push(title)
    const subLeft = formatCurrency(Number(itm.subtotal || 0))
    const subRight = `  ${itm.quantity} × ${Number(itm.unit_price || 0).toFixed(2)}`
    lines.push(formatTwoColumns(subRight, subLeft))

    if (itm.item_notes) {
      lines.push(`  * ${itm.item_notes}`)
    }
  }

  lines.push(formatDivider('=', THERMAL_LINE_WIDTH))

  lines.push(formatTwoColumns('*** الإجمالي المطلوب ***:', formatCurrency(payload.total_amount)))
  lines.push(formatTwoColumns('طريقة الدفع:', paymentMethodArabic))
  lines.push(formatDivider('=', THERMAL_LINE_WIDTH))

  if (payload.order_notes) {
    lines.push(`ملاحظات: ${payload.order_notes}`)
    lines.push(formatDivider('-', THERMAL_LINE_WIDTH))
  }

  lines.push(formatCentered('أهلاً بكم في صالة مطعم مصطفى الجزار', THERMAL_LINE_WIDTH))
  lines.push(formatCentered('نتمنى لكم وجبة شهية وزيارة طيبة', THERMAL_LINE_WIDTH))
  lines.push('\n\n\n')

  const rawText = lines.join('\n')

  // --- 2. HTML 80mm Template ---
  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>بون صالة - ${payload.turn_display}</title>
  <style>${THERMAL_80MM_CSS}</style>
</head>
<body>
  <div class="thermal-receipt">
    <div class="center bold extra-large">مطعم مصطفى الجزار</div>
    <div class="center bold" style="font-size: 13px;">بون صالة العميل والويتر</div>
    <div class="divider-double"></div>

    ${
      payload.print_nature === 'REPRINT'
        ? `<div class="reprint-banner">
             *** نسخة معاد طباعتها - REPRINT #${payload.reprint_count || 1} ***<br>
             <span style="font-size: 11px; font-weight: normal;">السبب: ${payload.reprint_reason || 'غير محدد'}</span>
           </div>`
        : ''
    }

    <!-- Turn Highlight Box -->
    <div style="border: 2px solid #000; padding: 6px; text-align: center; margin: 4px 0; background: #fafafa; border-radius: 6px;">
      <div class="bold extra-large" style="letter-spacing: 1px;">
        ${payload.turn_display}
      </div>
      <div class="bold large" style="margin-top: 2px;">
        العميل: ${payload.customer_name}
      </div>
      ${payload.party_size ? `<div style="font-size: 11px; font-weight: bold; margin-top: 2px;">عدد الأفراد: ${payload.party_size} أفراد</div>` : ''}
    </div>

    <div class="row" style="font-size: 11px;">
      <span>طلب رقم: #${payload.order_number}</span>
      <span>الوردية: #${payload.shift_number}</span>
    </div>

    <div class="row" style="font-size: 11px;">
      <span>التاريخ: ${dateStr}</span>
      <span>الوقت: ${timeStr}</span>
    </div>

    <div class="row" style="font-size: 11px;">
      <span>الكاشير: ${payload.created_by_staff}</span>
    </div>

    <div class="divider-double"></div>

    <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
      <thead>
        <tr style="border-bottom: 1px solid #000;">
          <th style="text-align: right; padding: 2px 0;">الصنف</th>
          <th style="text-align: center; width: 40px;">الكمية</th>
          <th style="text-align: left; width: 65px;">المجموع</th>
        </tr>
      </thead>
      <tbody>
        ${payload.items
          .map(
            (itm) => `
          <tr style="border-bottom: 1px dotted #ddd;">
            <td style="padding: 3px 0;">
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

    <div class="divider-double"></div>

    <div class="row bold large" style="margin: 4px 0;">
      <span>الإجمالي:</span>
      <span>${formatCurrency(payload.total_amount)}</span>
    </div>

    <div class="row" style="font-size: 12px;">
      <span>طريقة الدفع:</span>
      <span class="bold">${paymentMethodArabic}</span>
    </div>

    ${
      payload.order_notes
        ? `<div class="divider"></div>
           <div style="font-size: 11px; padding: 3px; background: #eee;">
             <strong>ملاحظات:</strong> ${payload.order_notes}
           </div>`
        : ''
    }

    <div class="divider-double"></div>
    <div class="center bold" style="font-size: 11px;">نتمنى لكم وجبة شهية وزيارة طيبة</div>
  </div>
</body>
</html>
  `.trim()

  return {
    document_type: 'DINE_IN_CUSTOMER_TICKET',
    station: 'CASHIER_80MM',
    title: `بون صالة - ${payload.turn_display} (${payload.customer_name})`,
    rawText,
    html,
  }
}
