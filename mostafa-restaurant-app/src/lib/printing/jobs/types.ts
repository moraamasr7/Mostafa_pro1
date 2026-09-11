/**
 * ======================================================================================
 * PRINT JOB ORCHESTRATION CONTRACTS V1.0
 * Mostafa Elgazar Restaurant Operations System
 * 
 * Strict Single Source of Truth & Pure Orchestration Principles:
 * - NO database mutations or direct DB calls in this layer.
 * - NO recalculation of financial amounts or delivery fees.
 * - NO document rendering or template logic inside the job model.
 * - NO alteration of order statuses (orders.status remains completely decoupled).
 * ======================================================================================
 */

import {
  PrintDocumentType,
  PrintWorkflow,
  PrintStation,
  ReprintReason,
  CanonicalDocumentPayload,
} from '../../../types/printing'

/**
 * 1. Distinction of Job Nature / Kind
 */
export type PrintJobKind = 'ORIGINAL' | 'REPRINT' | 'DIFFERENTIAL'

/**
 * 2. Explicit State Machine Statuses
 * 
 * IMPORTANT:
 * - 'SENT' strictly means the job has been dispatched over the wire / to the print adapter.
 *   It is NOT confirmation of physical printing.
 * - 'COMPLETED' is only declared when the transport/adapter confirms execution.
 * - If transport confirmation fails, times out, or disconnects, the job transitions:
 *   SENT -> PRINT_FAILED (or RETRYING if transient).
 */
export type PrintJobStatus =
  | 'PRINT_REQUESTED'
  | 'QUEUED'
  | 'SENT'
  | 'COMPLETED'
  | 'PRINT_FAILED'
  | 'RETRYING'
  | 'CANCELLED'

/**
 * 3. Reprint Information Envelope
 */
export interface PrintJobReprintMeta {
  /** Sequential reprint number for this order/document in runtime tracking */
  reprint_number: number
  /** Authorized operational reason */
  reason: ReprintReason
  /** Optional custom detail required when reason is 'other' */
  custom_reason_text?: string
  /** Staff username / ID authorizing the reprint */
  requested_by: string
  /** ISO timestamp when reprint was requested */
  requested_at: string
}

/**
 * 4. Print Job Model
 */
export interface PrintJob {
  /** Unique Job UUID */
  job_id: string
  /** References original job_id when kind === 'REPRINT' */
  parent_job_id?: string | null
  /** Nature of the job */
  job_kind: PrintJobKind
  /**
   * Deterministic idempotency key:
   * - ORIGINAL: print:order:{order_id}:doc:{document_type}:ORIGINAL
   * - DIFFERENTIAL: print:order:{order_id}:diff:{modification_number}
   * - REPRINT: print:order:{order_id}:doc:{document_type}:reprint:{job_id}
   */
  idempotency_key: string
  /** Target Order ID */
  order_id: string
  /** Authoritative order number */
  order_number: number
  /** Target document type */
  document_type: PrintDocumentType
  /** Operational workflow */
  workflow: PrintWorkflow
  /** Destination physical printer station */
  target_station: PrintStation
  /** Reprint audit metadata (present only if job_kind === 'REPRINT') */
  reprint_info?: PrintJobReprintMeta
  /** Lifecycle state */
  status: PrintJobStatus
  /** Attempt counter for retry logic */
  attempts: number
  /** Maximum allowable attempts before fatal failure */
  max_attempts: number
  /** Last recorded error message or failure cause */
  last_error?: string | null
  /** Canonical data payload assembled from Step 1 (Read-only, authoritative) */
  payload: CanonicalDocumentPayload
  /** Created timestamp */
  created_at: string
  /** Updated timestamp */
  updated_at: string
  /** Completed timestamp (only set if COMPLETED) */
  completed_at?: string | null
}

/**
 * 5. Job Creation Input Contracts
 */
export interface CreateOriginalJobParams {
  order_id: string
  order_number: number
  workflow: PrintWorkflow
  document_type: PrintDocumentType
  payload: CanonicalDocumentPayload
  max_attempts?: number
}

export interface CreateReprintJobParams {
  original_job: PrintJob
  reason: ReprintReason
  custom_reason_text?: string
  requested_by: string
  payload: CanonicalDocumentPayload
  max_attempts?: number
}

export interface CreateDifferentialJobParams {
  order_id: string
  order_number: number
  workflow: PrintWorkflow
  modification_number: number
  payload: CanonicalDocumentPayload
  max_attempts?: number
}
