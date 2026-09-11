/**
 * ======================================================================================
 * REPRINT AUTHORIZATION POLICY & VALIDATION
 * Mostafa Elgazar Restaurant Operations System
 * 
 * Strict Multi-Level Authorization:
 * - Routine kitchen reprint (paper_jam, paper_out) allowed for kitchen_staff / cashier.
 * - Sensitive financial documents (CUSTOMER_RECEIPT, DRIVER_CONTROL_COPY)
 *   strictly require supervisor, manager, or admin role.
 * - Sensitive reasons (lost_ticket, damaged_ticket, driver_reassigned, manager_audit, other)
 *   strictly require supervisor, manager, or admin role.
 * - Reason 'other' requires mandatory non-empty custom_reason_text.
 * ======================================================================================
 */

import { PrintDocumentType, ReprintReason } from '../../../types/printing'
import { AuthorizedStaff, StaffRole } from './types'

export class ReprintAuthorizationError extends Error {
  constructor(
    public readonly staff: AuthorizedStaff,
    public readonly documentType: PrintDocumentType,
    public readonly reason: ReprintReason,
    message: string
  ) {
    super(message)
    this.name = 'ReprintAuthorizationError'
  }
}

export class ReprintValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReprintValidationError'
  }
}

const SUPERVISOR_ROLES: readonly StaffRole[] = ['supervisor', 'manager', 'admin']
const ALL_STAFF_ROLES: readonly StaffRole[] = [
  'cashier',
  'waiter',
  'kitchen_staff',
  'supervisor',
  'manager',
  'admin',
]

/**
 * Validates whether a reprint request satisfies operational authorization policies.
 * Throws ReprintAuthorizationError or ReprintValidationError on violation.
 */
export function validateReprintAuthorization(params: {
  documentType: PrintDocumentType
  reason?: ReprintReason | null
  customReasonText?: string | null
  staff?: AuthorizedStaff | null
}): void {
  const { documentType, reason, customReasonText, staff } = params

  // 1. Mandatory Staff Identity
  if (!staff || !staff.username || staff.username.trim().length === 0) {
    throw new ReprintValidationError('Staff identity is mandatory for reprinting.')
  }

  // 2. Mandatory Reason
  if (!reason) {
    throw new ReprintValidationError('A valid operational reprint reason is required.')
  }

  // 3. Custom text required for 'other'
  if (reason === 'other' && (!customReasonText || customReasonText.trim().length === 0)) {
    throw new ReprintValidationError(
      "A detailed clarifying note ('customReasonText') is required when reprint reason is 'other'."
    )
  }

  // 4. Role Authorization Matrix
  const isSupervisor = SUPERVISOR_ROLES.includes(staff.role)

  // Policy A: Financial documents strictly require supervisor role
  if (
    documentType === 'CUSTOMER_RECEIPT' ||
    documentType === 'DRIVER_CONTROL_COPY' ||
    documentType === 'DINE_IN_CUSTOMER_TICKET'
  ) {
    if (!isSupervisor) {
      throw new ReprintAuthorizationError(
        staff,
        documentType,
        reason,
        `Role '${staff.role}' is not authorized to reprint financial document '${documentType}'. Requires Supervisor or Manager authorization.`
      )
    }
  }

  // Policy B: Sensitive operational reasons strictly require supervisor role
  if (
    reason === 'lost_ticket' ||
    reason === 'damaged_ticket' ||
    reason === 'driver_reassigned' ||
    reason === 'manager_audit' ||
    reason === 'other'
  ) {
    if (!isSupervisor) {
      throw new ReprintAuthorizationError(
        staff,
        documentType,
        reason,
        `Reprint reason '${reason}' requires Supervisor or Manager authorization. Staff role '${staff.role}' is insufficient.`
      )
    }
  }

  // Policy C: Routine kitchen paper jams / paper out are permitted for kitchen & cashier
  if (reason === 'paper_jam' || reason === 'paper_out') {
    if (!ALL_STAFF_ROLES.includes(staff.role)) {
      throw new ReprintAuthorizationError(
        staff,
        documentType,
        reason,
        `Unrecognized staff role '${staff.role}'.`
      )
    }
  }
}
