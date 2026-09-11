/**
 * ======================================================================================
 * PRINT AUDIT LOGGING, REPRINT AUTHORIZATION & PROOF OF PRINT CONTRACTS V1.0
 * Mostafa Elgazar Restaurant Operations System
 * 
 * Strict Guarantees:
 * - PrintJob = Mutable execution lifecycle.
 * - Audit Log = Append-only, immutable historical record of what happened, who, when, and why.
 * - Proof of Print: Honest distinction between TRANSPORT_DELIVERED, HARDWARE_ACK, and PHYSICAL_PAPER_CONFIRMED.
 * - Zero Financial Impact: Audit logging never alters orders.status, totals, or accounting.
 * ======================================================================================
 */

import {
  PrintDocumentType,
  PrintStation,
  ReprintReason,
  CanonicalDocumentPayload,
} from '../../../types/printing'
import { PrintJobKind, PrintJobStatus } from '../jobs/types'
import { AdapterType } from '../adapters/types'

/**
 * 1. Authorized Staff Roles
 */
export type StaffRole =
  | 'cashier'
  | 'waiter'
  | 'kitchen_staff'
  | 'supervisor'
  | 'manager'
  | 'admin'

export interface AuthorizedStaff {
  readonly username: string
  readonly role: StaffRole
  readonly display_name?: string
}

/**
 * 2. Honest Proof of Print Classification
 */
export type ProofOfPrintLevel =
  | 'TRANSPORT_DELIVERED'      // Bytes sent over wire/socket/intent/browser spooler
  | 'HARDWARE_ACK'            // Hardware confirmed receipt of buffer (DLE EOT / Socket ACK)
  | 'PHYSICAL_PAPER_CONFIRMED' // Dedicated optical sensor confirmed paper exit from roll

export interface ProofOfPrint {
  readonly level: ProofOfPrintLevel
  /** True when transport/driver accepted the stream */
  readonly transport_delivered: boolean
  /** True strictly when device firmware returned buffer ACK */
  readonly hardware_ack: boolean
  /** True strictly if physical paper exit was sensor-verified */
  readonly physical_paper_confirmed: boolean
  readonly bytes_transmitted: number
  readonly timestamp: string
  readonly adapter_type: AdapterType
  readonly station: PrintStation
}

/**
 * 3. Audit Log Actions
 */
export type AuditLogAction =
  | 'JOB_CREATED'
  | 'JOB_QUEUED'
  | 'JOB_DISPATCH_ATTEMPT'
  | 'JOB_RETRY'
  | 'JOB_COMPLETED'
  | 'JOB_FAILED'
  | 'JOB_CANCELLED'
  | 'TRIGGER_SKIPPED_DUPLICATE'
  | 'REPRINT_REQUESTED'
  | 'REPRINT_AUTHORIZED'
  | 'REPRINT_REJECTED'

/**
 * 4. Immutable Print Audit Entry
 */
export interface PrintAuditEntry {
  readonly entry_id: string
  readonly timestamp: string
  readonly action: AuditLogAction
  readonly order_id: string
  readonly order_number: number
  readonly document_type: PrintDocumentType
  readonly target_station: PrintStation
  readonly job_id?: string
  readonly parent_job_id?: string | null
  readonly job_kind: PrintJobKind
  readonly attempt_number?: number
  readonly reprint_meta?: {
    readonly reprint_number: number
    readonly reason: ReprintReason
    readonly custom_reason_text?: string
    readonly requested_by: string
    readonly authorized_by: string
  }
  readonly proof_of_print?: ProofOfPrint | null
  readonly error?: {
    readonly category: string
    readonly message: string
    readonly retryable: boolean
  } | null
  readonly staff?: AuthorizedStaff
  readonly details?: Record<string, unknown>
}

/**
 * 5. Input for Appending an Audit Entry
 */
export interface AppendAuditEntryInput {
  readonly action: AuditLogAction
  readonly order_id: string
  readonly order_number: number
  readonly document_type: PrintDocumentType
  readonly target_station: PrintStation
  readonly job_id?: string
  readonly parent_job_id?: string | null
  readonly job_kind: PrintJobKind
  readonly attempt_number?: number
  readonly reprint_meta?: {
    readonly reprint_number: number
    readonly reason: ReprintReason
    readonly custom_reason_text?: string
    readonly requested_by: string
    readonly authorized_by: string
  }
  readonly proof_of_print?: ProofOfPrint | null
  readonly error?: {
    readonly category: string
    readonly message: string
    readonly retryable: boolean
  } | null
  readonly staff?: AuthorizedStaff
  readonly details?: Record<string, unknown>
}

/**
 * 6. Audit Query Summary (Answers all gate questions)
 */
export interface OrderAuditSummary {
  readonly order_id: string
  readonly order_number: number
  readonly total_entries: number
  readonly original_prints_count: number
  readonly reprints_count: number
  readonly total_attempts: number
  readonly successful_dispatches: number
  readonly failed_dispatches: number
  readonly hardware_acks_received: number
  readonly documents_summary: Record<
    PrintDocumentType,
    {
      original_completed: boolean
      original_job_id?: string
      reprints_issued: number
      latest_status: PrintJobStatus | 'NOT_STARTED'
      proof_level: ProofOfPrintLevel | 'NONE'
    }
  >
  readonly chronology: readonly PrintAuditEntry[]
}
