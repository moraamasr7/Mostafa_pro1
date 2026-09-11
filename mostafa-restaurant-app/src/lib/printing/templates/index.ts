import { CanonicalDocumentPayload } from '@/types/printing'
import { renderKitchenTicket, RenderedTemplateOutput } from './kitchenTicket'
import { renderCustomerReceipt } from './customerReceipt'
import { renderDriverControlCopy } from './driverControlCopy'
import { renderDineInTicket } from './dineInTicket'
import { renderDifferentialChangeTicket } from './differentialChangeTicket'

export * from './formatters'
export * from './kitchenTicket'
export * from './customerReceipt'
export * from './driverControlCopy'
export * from './dineInTicket'
export * from './differentialChangeTicket'

/**
 * Unified Renderer Dispatcher
 * Takes any canonical document payload and produces the exact 80mm thermal text and HTML output.
 */
export function renderPrintDocument(payload: CanonicalDocumentPayload): RenderedTemplateOutput {
  switch (payload.document_type) {
    case 'KITCHEN_TICKET':
      return renderKitchenTicket(payload)
    case 'CUSTOMER_RECEIPT':
      return renderCustomerReceipt(payload)
    case 'DRIVER_CONTROL_COPY':
      return renderDriverControlCopy(payload)
    case 'DINE_IN_CUSTOMER_TICKET':
      return renderDineInTicket(payload)
    case 'DIFFERENTIAL_CHANGE_TICKET':
      return renderDifferentialChangeTicket(payload)
    default: {
      const _exhaustiveCheck: never = payload
      throw new Error(`نوع المستند غير معروف: ${(_exhaustiveCheck as any)?.document_type}`)
    }
  }
}
