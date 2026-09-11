/**
 * Thermal Print Formatting Utilities (80mm Standard)
 * Width: 48 monospaced characters per line for text, 72mm-76mm printable area for HTML.
 */

export const THERMAL_LINE_WIDTH = 48

/**
 * Pads and aligns two columns (left-aligned and right-aligned) to fit exactly in line width.
 * In RTL/Arabic context: label on right, value on left.
 */
export function formatTwoColumns(labelRight: string, valueLeft: string, width = THERMAL_LINE_WIDTH): string {
  const cleanRight = labelRight.trim()
  const cleanLeft = valueLeft.trim()
  const spacesNeeded = Math.max(1, width - cleanRight.length - cleanLeft.length)
  return cleanRight + ' '.repeat(spacesNeeded) + cleanLeft
}

/**
 * Centers text within the specified line width.
 */
export function formatCentered(text: string, width = THERMAL_LINE_WIDTH): string {
  const clean = text.trim()
  if (clean.length >= width) return clean
  const totalSpaces = width - clean.length
  const leftSpaces = Math.floor(totalSpaces / 2)
  const rightSpaces = totalSpaces - leftSpaces
  return ' '.repeat(leftSpaces) + clean + ' '.repeat(rightSpaces)
}

/**
 * Generates a horizontal divider line.
 */
export function formatDivider(char = '-', width = THERMAL_LINE_WIDTH): string {
  return char.repeat(width)
}

/**
 * Formats monetary amounts in Egyptian Pounds.
 */
export function formatCurrency(amount: number): string {
  const val = Number(amount || 0)
  return `${val.toFixed(2)} ج.م`
}

/**
 * Formats date and time in localized Arabic format.
 */
export function formatDateTime(isoString: string): { dateStr: string; timeStr: string } {
  try {
    const d = new Date(isoString)
    const dateStr = d.toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const timeStr = d.toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
    return { dateStr, timeStr }
  } catch {
    return { dateStr: isoString.slice(0, 10), timeStr: isoString.slice(11, 19) }
  }
}

/**
 * Base CSS styles for 80mm thermal receipt printing.
 */
export const THERMAL_80MM_CSS = `
  @page {
    size: 80mm auto;
    margin: 0;
  }
  @media print {
    html, body {
      width: 76mm;
      margin: 0 auto;
      padding: 2mm 3mm;
      background: #ffffff;
      color: #000000;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif, monospace;
      font-size: 13px;
      line-height: 1.35;
      direction: rtl;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .no-print {
      display: none !important;
    }
  }
  .thermal-receipt {
    width: 76mm;
    margin: 0 auto;
    padding: 3mm 2mm;
    background: #ffffff;
    color: #000000;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif, monospace;
    font-size: 13px;
    line-height: 1.35;
    direction: rtl;
    box-sizing: border-box;
  }
  .center { text-align: center; }
  .bold { font-weight: 900; }
  .large { font-size: 17px; }
  .extra-large { font-size: 22px; }
  .divider {
    border-bottom: 1px dashed #000;
    margin: 6px 0;
  }
  .divider-double {
    border-bottom: 2px solid #000;
    margin: 6px 0;
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 2px 0;
  }
  .reprint-banner {
    border: 2px solid #000;
    padding: 4px;
    text-align: center;
    font-weight: 900;
    font-size: 14px;
    margin: 6px 0;
    background: #f0f0f0;
  }
  .badge-box {
    border: 1px solid #000;
    padding: 3px 6px;
    display: inline-block;
    font-weight: 900;
    border-radius: 4px;
  }
`
