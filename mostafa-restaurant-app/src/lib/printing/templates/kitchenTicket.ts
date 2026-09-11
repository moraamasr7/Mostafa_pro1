import { KitchenTicketPayload } from '@/types/printing'
import {
  formatCentered,
  formatDivider,
  formatTwoColumns,
  formatDateTime,
  THERMAL_80MM_CSS,
  THERMAL_LINE_WIDTH,
} from './formatters'

export interface RenderedTemplateOutput {
  document_type: string
  station: 'KITCHEN_80MM' | 'CASHIER_80MM'
  title: string
  rawText: string
  html: string
}

export function renderKitchenTicket(payload: KitchenTicketPayload): RenderedTemplateOutput {
  const { dateStr, timeStr } = formatDateTime(payload.dispatched_at)

  const orderTypeArabic =
    payload.order_type === 'delivery'
      ? '🛵 دليفري (DELIVERY)'
      : payload.order_type === 'dine_in'
      ? '🍽️ صالة (DINE-IN)'
      : '🏪 استلام سفري (TAKEAWAY)'

  // --- 1. Raw Text (48-column thermal format) ---
  const lines: string[] = []

  lines.push(formatCentered('مطعم مصطفى الجزار', THERMAL_LINE_WIDTH))
  lines.push(formatCentered('*** تذكرة تحضير مطبخ (KOT) ***', THERMAL_LINE_WIDTH))
  lines.push(formatDivider('=', THERMAL_LINE_WIDTH))

  if (payload.print_nature === 'REPRINT') {
    lines.push(formatCentered(`*** [نسخة معاد طباعتها - REPRINT #${payload.reprint_count || 1}] ***`, THERMAL_LINE_WIDTH))
    if (payload.reprint_reason) {
      lines.push(formatCentered(`سبب الإعادة: ${payload.reprint_reason}`, THERMAL_LINE_WIDTH))
    }
    lines.push(formatDivider('-', THERMAL_LINE_WIDTH))
  }

  lines.push(formatTwoColumns(`نوع الطلب: ${orderTypeArabic}`, `وردية #${payload.shift_number}`))
  lines.push(formatTwoColumns(`الرقم التشغيلي: ${payload.shift_sequence_display}`, `طلب عام: #${payload.order_number}`))
  lines.push(formatTwoColumns(`التاريخ: ${dateStr}`, `الوقت: ${timeStr}`))
  lines.push(formatDivider('=', THERMAL_LINE_WIDTH))

  lines.push(formatTwoColumns('الصنف والنوع', 'الكمية'))
  lines.push(formatDivider('-', THERMAL_LINE_WIDTH))

  for (const itm of payload.items) {
    const itemTitle = `${itm.name} (${itm.variant_name})`
    const qtyStr = `[ ${itm.quantity} × ]`
    lines.push(formatTwoColumns(itemTitle, qtyStr))

    if (itm.item_notes) {
      lines.push(`  * تنبيه: [ ${itm.item_notes} ]`)
    }
  }

  lines.push(formatDivider('=', THERMAL_LINE_WIDTH))

  if (payload.order_notes) {
    lines.push(`ملاحظات عامة للطلب:`)
    lines.push(`>> ${payload.order_notes}`)
    lines.push(formatDivider('-', THERMAL_LINE_WIDTH))
  }

  lines.push(formatCentered('يرجى الالتزام بملاحظات التحضير وسرعة التجهيز', THERMAL_LINE_WIDTH))
  lines.push('\n\n\n') // Feed lines for cutter

  const rawText = lines.join('\n')

  // --- 2. HTML 80mm Template ---
  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>تذكرة مطبخ #${payload.order_number}</title>
  <style>${THERMAL_80MM_CSS}</style>
</head>
<body>
  <div class="thermal-receipt">
    <div class="center bold large">مطعم مصطفى الجزار</div>
    <div class="center bold">*** تذكرة تحضير مطبخ ***</div>
    <div class="divider-double"></div>

    ${
      payload.print_nature === 'REPRINT'
        ? `<div class="reprint-banner">
             *** نسخة معاد طباعتها - REPRINT #${payload.reprint_count || 1} ***<br>
             <span style="font-size: 11px; font-weight: normal;">السبب: ${payload.reprint_reason || 'غير محدد'}</span>
           </div>`
        : ''
    }

    <div class="center" style="margin: 4px 0;">
      <span class="badge-box large">${orderTypeArabic}</span>
    </div>

    <div class="row bold">
      <span>الرقم التشغيلي:</span>
      <span class="extra-large">${payload.shift_sequence_display}</span>
    </div>

    <div class="row" style="font-size: 11px;">
      <span>طلب عام: #${payload.order_number}</span>
      <span>وردية: #${payload.shift_number}</span>
    </div>

    <div class="row" style="font-size: 11px;">
      <span>التاريخ: ${dateStr}</span>
      <span>الوقت: ${timeStr}</span>
    </div>

    <div class="divider"></div>

    <div style="margin: 8px 0;">
      ${payload.items
        .map(
          (itm) => `
        <div style="margin-bottom: 8px; border-bottom: 1px dotted #ccc; padding-bottom: 4px;">
          <div class="row" style="align-items: flex-start;">
            <div style="flex: 1; padding-left: 8px;">
              <span class="bold large" style="display: block;">${itm.name}</span>
              <span style="font-size: 12px; color: #333;">الحجم/النوع: ${itm.variant_name}</span>
            </div>
            <div class="bold extra-large" style="min-width: 45px; text-align: left; border: 2px solid #000; border-radius: 4px; padding: 2px 6px;">
              ${itm.quantity}×
            </div>
          </div>
          ${
            itm.item_notes
              ? `<div style="margin-top: 3px; background: #f4f4f4; border-right: 3px solid #000; padding: 2px 6px; font-size: 12px; font-weight: bold;">
                  تنبيه: ${itm.item_notes}
                </div>`
              : ''
          }
        </div>
      `
        )
        .join('')}
    </div>

    ${
      payload.order_notes
        ? `<div class="divider"></div>
           <div style="font-size: 12px; padding: 4px; background: #eee; border: 1px solid #000;">
             <strong>ملاحظات عامة:</strong> ${payload.order_notes}
           </div>`
        : ''
    }

    <div class="divider-double"></div>
    <div class="center bold" style="font-size: 11px;">
      سرعة التحضير وجودة الصنعة ✓
    </div>
  </div>
</body>
</html>
  `.trim()

  return {
    document_type: 'KITCHEN_TICKET',
    station: 'KITCHEN_80MM',
    title: `تذكرة مطبخ #${payload.order_number} (${payload.shift_sequence_display})`,
    rawText,
    html,
  }
}
