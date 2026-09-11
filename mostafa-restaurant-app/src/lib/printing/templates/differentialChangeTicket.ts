import { DifferentialChangeTicketPayload } from '@/types/printing'
import {
  formatCentered,
  formatDivider,
  formatTwoColumns,
  formatDateTime,
  THERMAL_80MM_CSS,
  THERMAL_LINE_WIDTH,
} from './formatters'
import { RenderedTemplateOutput } from './kitchenTicket'

export function renderDifferentialChangeTicket(payload: DifferentialChangeTicketPayload): RenderedTemplateOutput {
  const { dateStr, timeStr } = formatDateTime(payload.modified_at)

  // --- 1. Raw Text (48-column thermal format) ---
  const lines: string[] = []

  lines.push(formatCentered('مطعم مصطفى الجزار', THERMAL_LINE_WIDTH))
  lines.push(formatCentered('*** إشعار تعديل أوردر مطبخ ***', THERMAL_LINE_WIDTH))
  lines.push(formatCentered(`[ MODIFICATION #${payload.modification_number} ]`, THERMAL_LINE_WIDTH))
  lines.push(formatDivider('=', THERMAL_LINE_WIDTH))

  lines.push(formatTwoColumns(`طلب رقم: #${payload.order_number}`, `الرقم التشغيلي: ${payload.shift_sequence_display}`))
  lines.push(formatTwoColumns(`تاريخ التعديل: ${dateStr}`, `الوقت: ${timeStr}`))
  lines.push(formatTwoColumns(`المشرف المعدل: ${payload.modified_by_staff}`, `تعديل رقم: #${payload.modification_number}`))
  lines.push(formatDivider('=', THERMAL_LINE_WIDTH))

  // Added Items
  if (payload.added_items.length > 0) {
    lines.push('>>> [+] أصناف جديدة مطلوب تحضيرها:')
    lines.push(formatDivider('-', THERMAL_LINE_WIDTH))
    for (const itm of payload.added_items) {
      lines.push(formatTwoColumns(`  + ${itm.name} (${itm.variant_name})`, `[ +${itm.quantity} × ]`))
      if (itm.item_notes) {
        lines.push(`    * ملاحظة: ${itm.item_notes}`)
      }
    }
    lines.push(formatDivider('-', THERMAL_LINE_WIDTH))
  }

  // Removed Items (Crucial for stopping food prep)
  if (payload.removed_items.length > 0) {
    lines.push('>>> [-] أصناف ملغاة (توقف عن تحضيرها فوراً!):')
    lines.push(formatDivider('*', THERMAL_LINE_WIDTH))
    for (const itm of payload.removed_items) {
      lines.push(formatTwoColumns(`  - إلغاء: ${itm.name} (${itm.variant_name})`, `[ -${itm.quantity} ]`))
      if (itm.item_notes) {
        lines.push(`    * كانت بملاحظة: ${itm.item_notes}`)
      }
    }
    lines.push(formatDivider('*', THERMAL_LINE_WIDTH))
  }

  // Updated Items
  if (payload.updated_items.length > 0) {
    lines.push('>>> [=] تعديل في الكميات:')
    lines.push(formatDivider('-', THERMAL_LINE_WIDTH))
    for (const itm of payload.updated_items) {
      lines.push(`${itm.name} (${itm.variant_name})`)
      lines.push(formatTwoColumns(`  الكمية السابقة: ${itm.old_quantity}`, `الجديدة: [ ${itm.new_quantity} ]`))
      if (itm.item_notes) {
        lines.push(`    * ملاحظة: ${itm.item_notes}`)
      }
    }
    lines.push(formatDivider('-', THERMAL_LINE_WIDTH))
  }

  if (payload.order_notes_update) {
    lines.push(`تحديث الملاحظات: ${payload.order_notes_update}`)
    lines.push(formatDivider('=', THERMAL_LINE_WIDTH))
  }

  lines.push(formatCentered('تنبيه: لا تعيد طهي الأصناف السابقة غير المذكورة هنا', THERMAL_LINE_WIDTH))
  lines.push('\n\n\n')

  const rawText = lines.join('\n')

  // --- 2. HTML 80mm Template ---
  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>إشعار تعديل مطبخ #${payload.order_number}</title>
  <style>${THERMAL_80MM_CSS}</style>
</head>
<body>
  <div class="thermal-receipt">
    <div class="center bold large">مطعم مصطفى الجزار</div>
    <div class="center bold" style="color: #990000; font-size: 14px;">*** إشعار تعديل أوردر مطبخ ***</div>
    <div class="center bold">تعديل رقم: #${payload.modification_number}</div>
    <div class="divider-double"></div>

    <div class="row bold">
      <span>طلب رقم: #${payload.order_number}</span>
      <span class="badge-box">${payload.shift_sequence_display}</span>
    </div>

    <div class="row" style="font-size: 11px;">
      <span>التاريخ: ${dateStr}</span>
      <span>الوقت: ${timeStr}</span>
    </div>

    <div class="row" style="font-size: 11px;">
      <span>المشرف المعدل: ${payload.modified_by_staff}</span>
    </div>

    <div class="divider-double"></div>

    ${
      payload.added_items.length > 0
        ? `<div style="margin-bottom: 6px;">
             <div class="bold" style="background: #e6ffe6; padding: 2px 4px; border: 1px solid #006600; font-size: 12px;">
               [+] أصناف جديدة مطلوب تحضيرها:
             </div>
             ${payload.added_items
               .map(
                 (itm) => `
               <div class="row" style="padding: 2px 4px; border-bottom: 1px dotted #ccc;">
                 <span><strong>${itm.name}</strong> (${itm.variant_name}) ${itm.item_notes ? `<span style="font-size: 10px;">[${itm.item_notes}]</span>` : ''}</span>
                 <span class="bold extra-large" style="color: #006600;">+${itm.quantity}</span>
               </div>
             `
               )
               .join('')}
           </div>`
        : ''
    }

    ${
      payload.removed_items.length > 0
        ? `<div style="margin-bottom: 6px;">
             <div class="bold" style="background: #ffe6e6; padding: 2px 4px; border: 1px solid #cc0000; font-size: 12px; color: #cc0000;">
               [-] أصناف ملغاة (توقف عن تحضيرها فوراً!):
             </div>
             ${payload.removed_items
               .map(
                 (itm) => `
               <div class="row" style="padding: 2px 4px; border-bottom: 1px dotted #cc0000;">
                 <span style="text-decoration: line-through;"><strong>${itm.name}</strong> (${itm.variant_name})</span>
                 <span class="bold extra-large" style="color: #cc0000;">-${itm.quantity}</span>
               </div>
             `
               )
               .join('')}
           </div>`
        : ''
    }

    ${
      payload.updated_items.length > 0
        ? `<div style="margin-bottom: 6px;">
             <div class="bold" style="background: #fff3cd; padding: 2px 4px; border: 1px solid #856404; font-size: 12px;">
               [=] تعديل في الكميات:
             </div>
             ${payload.updated_items
               .map(
                 (itm) => `
               <div style="padding: 2px 4px; border-bottom: 1px dotted #ccc;">
                 <div><strong>${itm.name}</strong> (${itm.variant_name})</div>
                 <div class="row" style="font-size: 11px;">
                   <span>الكمية السابقة: ${itm.old_quantity}</span>
                   <span class="bold large">الكمية الجديدة: ${itm.new_quantity}</span>
                 </div>
               </div>
             `
               )
               .join('')}
           </div>`
        : ''
    }

    ${
      payload.order_notes_update
        ? `<div class="divider"></div>
           <div style="font-size: 11px; padding: 4px; background: #eee; border: 1px solid #000;">
             <strong>تحديث ملاحظات الطلب:</strong> ${payload.order_notes_update}
           </div>`
        : ''
    }

    <div class="divider-double"></div>
    <div class="center bold" style="font-size: 10px; color: #333;">
      تنبيه: لا تعيد طهي الأصناف السابقة غير المذكورة في هذا الإشعار ✓
    </div>
  </div>
</body>
</html>
  `.trim()

  return {
    document_type: 'DIFFERENTIAL_CHANGE_TICKET',
    station: 'KITCHEN_80MM',
    title: `تعديل مطبخ #${payload.order_number} (تعديل #${payload.modification_number})`,
    rawText,
    html,
  }
}
