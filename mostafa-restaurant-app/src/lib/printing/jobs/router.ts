/**
 * ======================================================================================
 * PRINT STATION ROUTER & WORKFLOW VALIDATOR
 * Mostafa Elgazar Restaurant Operations System
 * 
 * Enforces strict routing:
 * - Maps (workflow, document_type) to the physical PrintStation.
 * - Rejects unauthorized documents (e.g. Driver Control Copy for Takeaway or Dine-in).
 * ======================================================================================
 */

import { PrintDocumentType, PrintWorkflow, PrintStation } from '../../../types/printing'

/**
 * Matrix of allowed document types per workflow
 */
const ALLOWED_WORKFLOW_DOCUMENTS: Record<PrintWorkflow, readonly PrintDocumentType[]> = {
  delivery: [
    'KITCHEN_TICKET',
    'DRIVER_CONTROL_COPY',
    'CUSTOMER_RECEIPT',
    'DIFFERENTIAL_CHANGE_TICKET',
  ],
  takeaway: [
    'KITCHEN_TICKET',
    'CUSTOMER_RECEIPT',
    'DIFFERENTIAL_CHANGE_TICKET',
  ],
  dine_in: [
    'KITCHEN_TICKET',
    'DINE_IN_CUSTOMER_TICKET',
    'DIFFERENTIAL_CHANGE_TICKET',
  ],
}

/**
 * Mapping of document types to target physical stations
 */
const DOCUMENT_STATION_MAP: Record<PrintDocumentType, PrintStation> = {
  KITCHEN_TICKET: 'KITCHEN_80MM',
  DIFFERENTIAL_CHANGE_TICKET: 'KITCHEN_80MM',
  CUSTOMER_RECEIPT: 'CASHIER_80MM',
  DRIVER_CONTROL_COPY: 'CASHIER_80MM',
  DINE_IN_CUSTOMER_TICKET: 'CASHIER_80MM',
}

export class PrintRoutingError extends Error {
  constructor(
    public readonly workflow: PrintWorkflow,
    public readonly documentType: PrintDocumentType,
    message: string
  ) {
    super(message)
    this.name = 'PrintRoutingError'
  }
}

/**
 * Validates that the requested document type is authorized for the given operational workflow.
 * Throws PrintRoutingError if unauthorized.
 */
export function validateWorkflowDocument(
  workflow: PrintWorkflow,
  documentType: PrintDocumentType
): void {
  const allowed = ALLOWED_WORKFLOW_DOCUMENTS[workflow]
  if (!allowed || !allowed.includes(documentType)) {
    throw new PrintRoutingError(
      workflow,
      documentType,
      `Document type '${documentType}' is not permitted in '${workflow}' workflow.`
    )
  }
}

/**
 * Resolves target physical print station for the document within the specified workflow.
 * Validates authorization first.
 */
export function resolvePrintStation(
  workflow: PrintWorkflow,
  documentType: PrintDocumentType
): PrintStation {
  validateWorkflowDocument(workflow, documentType)
  return DOCUMENT_STATION_MAP[documentType]
}

/**
 * Helper to check if a document is allowed without throwing
 */
export function isDocumentAllowedForWorkflow(
  workflow: PrintWorkflow,
  documentType: PrintDocumentType
): boolean {
  const allowed = ALLOWED_WORKFLOW_DOCUMENTS[workflow]
  return !!allowed && allowed.includes(documentType)
}
