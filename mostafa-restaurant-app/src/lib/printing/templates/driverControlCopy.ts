import { DriverControlCopyPayload } from '@/types/printing'
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

export function renderDriverControlCopy(payload: DriverControlCopyPayload): RenderedTemplateOutput {
  const { dateStr, timeStr } = formatDateTime(payload.dispatched_at)

  const paymentDesc =
    payload.payment_method === 'cash'
      ? 'نقدياً عند التسليم (CASH)'
      : 'مسدد إلكترونياً (PAID ONLINE / CARD)'

  // --- 1. Raw Text (48-column thermal format) ---
  const lines: string[] = []

  lines.push(formatCentered('مطعم مصطفى الجزار', THERMAL_LINE_WIDTH))
  lines.push(formatCentered('*** كعب رقابة طيار - عهدة معلقة ***', THERMAL_LINE_WIDTH))
  lines.push(formatCentered('(يحفظ بالفرع حتى عودة الطيار والتوريد)', THERMAL_LINE_WIDTH))
  lines.push(formatDivider('=', THERMAL_LINE_WIDTH))

  if (payload.print_nature === 'REPRINT') {
    lines.push(formatCentered(`*** [نسخة معاد طباعتها - REPRINT #${payload.reprint_count || 1}] ***`, THERMAL_LINE_WIDTH))
    if (payload.reprint_reason) {
      lines.push(formatCentered(`سبب الإعادة: ${payload.reprint_reason}`, THERMAL_LINE_WIDTH))
    }
    lines.push(formatDivider('-', THERMAL_LINE_WIDTH))
  }

  // Highlight Driver
  lines.push(formatDivider('*', THERMAL_LINE_WIDTH))
  lines.push(formatCentered(`الطيار المسؤول: ${payload.driver_name}`, THERMAL_LINE_WIDTH))
  if (payload.driver_phone) {
    lines.push(formatCentered(`هاتف الطيار: ${payload.driver_phone}`, THERMAL_LINE_WIDTH))
  }
  lines.push(formatCentered(`رحلة دليفري رقم: #${payload.trip_number}`, THERMAL_LINE_WIDTH))
  lines.push(formatDivider('*', THERMAL_LINE_WIDTH))

  lines.push(formatTwoColumns(`طلب دليفري: #${payload.order_number}`, `وردية: #${payload.shift_number}`))
  lines.push(formatTwoColumns(`تاريخ الخروج: ${dateStr}`, `الوقت: ${timeStr}`))
  lines.push(formatTwoColumns(`مسؤول الإرسال: ${payload.created_by_staff}`, `الدفع: ${payload.payment_method}`))
  lines.push(formatDivider('-', THERMAL_LINE_WIDTH))

  lines.push(`العميل: ${payload.customer_name}`)
  lines.push(`الهاتف: ${payload.customer_phone}`)
  lines.push(`العنوان: ${payload.delivery_address}`)
  if (payload.order_notes) {
    lines.push(`ملاحظات: ${payload.order_notes}`)
  }
  lines.push(formatDivider('=', THERMAL_LINE_WIDTH))

  // Financial Settlement Target
  lines.push(formatCentered('المبلغ الصافي المطلوب تحصيله وتوريده:', THERMAL_LINE_WIDTH))
  lines.push(formatCentered(`>>> [ ${formatCurrency(payload.amount_to_collect)} ] <<<`, THERMAL_LINE_WIDTH))
  lines.push(formatCentered(`طبيعة التحصيل: ${paymentDesc}`, THERMAL_LINE_WIDTH))
  lines.push(formatDivider('=', THERMAL_LINE_WIDTH))

  lines.push(formatCentered('تعتمد هذه النسخة بعد توريد المبلغ وإغلاق الرحلة', THERMAL_LINE_WIDTH))
  lines.push('\n\n\n')

  const rawText = lines.join('\n')

  // --- 2. HTML 80mm Template ---
  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>كعب رقابة طيار #${payload.order_number}</title>
  <style>${THERMAL_80MM_CSS}</style>
</head>
<body>
  <div class="thermal-receipt">
    <div class="center bold large">مطعم مصطفى الجزار</div>
    <div class="center bold">كعب رقابة وتسوية طيار (عهدة معلقة)</div>
    <div class="center" style="font-size: 10px; color: #444;">يظل مع الكاشير حتى عودة السائق وتوريد الرحلة</div>
    <div class="divider-double"></div>

    ${
      payload.print_nature === 'REPRINT'
        ? `<div class="reprint-banner">
             *** نسخة معاد طباعتها - REPRINT #${payload.reprint_count || 1} ***<br>
             <span style="font-size: 11px; font-weight: normal;">السبب: ${payload.reprint_reason || 'غير محدد'}</span>
           </div>`
        : ''
    }

    <!-- Driver Highlight Box -->
    <div style="border: 2px solid #000; padding: 6px; margin: 4px 0; background: #fafafa; border-radius: 4px;">
      <div class="center bold extra-large" style="color: #000;">
        الطيار: ${payload.driver_name}
      </div>
      <div class="row" style="font-size: 11px; margin-top: 3px;">
        <span>رحلة رقم: #${payload.trip_number}</span>
        ${payload.driver_phone ? `<span>هاتف: ${payload.driver_phone}</span>` : ''}
      </div>
    </div>

    <div class="row bold" style="margin-top: 4px;">
      <span>طلب دليفري: #${payload.order_number}</span>
      <span>وردية: #${payload.shift_number}</span>
    </div>

    <div class="row" style="font-size: 11px;">
      <span>التاريخ: ${dateStr}</span>
      <span>الوقت: ${timeStr}</span>
    </div>

    <div class="row" style="font-size: 11px;">
      <span>المسؤول: ${payload.created_by_staff}</span>
    </div>

    <div class="divider"></div>

    <div style="font-size: 12px; margin: 4px 0;">
      <div><strong>العميل:</strong> ${payload.customer_name}</div>
      <div><strong>الهاتف:</strong> ${payload.customer_phone}</div>
      <div><strong>العنوان:</strong> ${payload.delivery_address}</div>
      ${payload.order_notes ? `<div><strong>ملاحظات:</strong> ${payload.order_notes}</div>` : ''}
    </div>

    <div class="divider-double"></div>

    <!-- Settlement Box -->
    <div style="border: 2px solid #000; padding: 8px; text-align: center; margin: 6px 0; background: #fdfdfd;">
      <div style="font-size: 11px; font-weight: bold;">المبلغ المطلوب تحصيله وتوريده:</div>
      <div class="bold extra-large" style="margin: 4px 0;">
        ${formatCurrency(payload.amount_to_collect)}
      </div>
      <div style="font-size: 11px; color: #333;">
        ${paymentDesc}
      </div>
    </div>

    <div class="divider"></div>
    <div class="center bold" style="font-size: 10px;">
      عند توريد النقدية يتم إغلاق الرحلة في المنظومة وأرشفة هذا الكعب ✓
    </div>
  </div>
</body>
</html>
  `.trim()

  return {
    document_type: 'DRIVER_CONTROL_COPY',
    station: 'CASHIER_80MM',
    title: `كعب طيار - ${payload.driver_name} (طلب #${payload.order_number})`,
    rawText,
    html,
  }
}
