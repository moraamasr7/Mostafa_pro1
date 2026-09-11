/**
 * ======================================================================================
 * PRINT JOB FACTORY
 * Mostafa Elgazar Restaurant Operations System
 * 
 * Responsibilities:
 * - Deterministic Idempotency Key generation.
 * - Distinct Job Identity (job_id UUID).
 * - Explicit Parent-Child linking for Reprints (parent_job_id).
 * - Target station resolution via router.
 * - Strict isolation: Zero financial calculations, zero template rendering.
 * ======================================================================================
 */

import { randomUUID } from 'crypto'
import {
  PrintJob,
  CreateOriginalJobParams,
  CreateReprintJobParams,
  CreateDifferentialJobParams,
} from './types'
import { resolvePrintStation } from './router'

/**
 * Deterministic key generator for original jobs
 */
export function buildOriginalIdempotencyKey(
  orderId: string,
  documentType: string
): string {
  return `print:order:${orderId}:doc:${documentType}:ORIGINAL`
}

/**
 * Deterministic key generator for differential tickets
 */
export function buildDifferentialIdempotencyKey(
  orderId: string,
  modificationNumber: number
): string {
  return `print:order:${orderId}:diff:${modificationNumber}`
}

/**
 * Unique key generator for reprint jobs linked to unique job ID
 */
export function buildReprintIdempotencyKey(
  orderId: string,
  documentType: string,
  jobId: string
): string {
  return `print:order:${orderId}:doc:${documentType}:reprint:${jobId}`
}

export class PrintJobValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PrintJobValidationError'
  }
}

/**
 * Creates an ORIGINAL PrintJob.
 * Rejects mismatch between requested document type and payload document type.
 */
export function createOriginalPrintJob(params: CreateOriginalJobParams): PrintJob {
  const { order_id, order_number, workflow, document_type, payload, max_attempts = 3 } = params

  if (payload.document_type !== document_type) {
    throw new PrintJobValidationError(
      `Payload document_type '${payload.document_type}' does not match requested job document_type '${document_type}'.`
    )
  }

  const target_station = resolvePrintStation(workflow, document_type)
  const jobId = randomUUID()
  const now = new Date().toISOString()

  return {
    job_id: jobId,
    parent_job_id: null,
    job_kind: 'ORIGINAL',
    idempotency_key: buildOriginalIdempotencyKey(order_id, document_type),
    order_id,
    order_number,
    document_type,
    workflow,
    target_station,
    status: 'PRINT_REQUESTED',
    attempts: 0,
    max_attempts,
    last_error: null,
    payload,
    created_at: now,
    updated_at: now,
    completed_at: null,
  }
}

/**
 * Creates a REPRINT PrintJob linked to an original job.
 * Enforces authorized reprint reason and staff accountability.
 */
export function createReprintPrintJob(
  params: CreateReprintJobParams,
  reprintSeqNumber: number = 1
): PrintJob {
  const { original_job, reason, custom_reason_text, requested_by, payload, max_attempts = 3 } = params

  if (original_job.job_kind !== 'ORIGINAL' && !original_job.parent_job_id) {
    throw new PrintJobValidationError('Cannot create a reprint from an unverified or invalid parent job.')
  }

  if (reason === 'other' && (!custom_reason_text || custom_reason_text.trim().length === 0)) {
    throw new PrintJobValidationError("A clarifying note ('custom_reason_text') is required when reason is 'other'.")
  }

  if (!requested_by || requested_by.trim().length === 0) {
    throw new PrintJobValidationError("Staff identity ('requested_by') is mandatory for reprints.")
  }

  const newJobId = randomUUID()
  const now = new Date().toISOString()
  const parentId = original_job.parent_job_id || original_job.job_id

  return {
    job_id: newJobId,
    parent_job_id: parentId,
    job_kind: 'REPRINT',
    idempotency_key: buildReprintIdempotencyKey(original_job.order_id, original_job.document_type, newJobId),
    order_id: original_job.order_id,
    order_number: original_job.order_number,
    document_type: original_job.document_type,
    workflow: original_job.workflow,
    target_station: original_job.target_station,
    reprint_info: {
      reprint_number: reprintSeqNumber,
      reason,
      custom_reason_text: custom_reason_text?.trim(),
      requested_by: requested_by.trim(),
      requested_at: now,
    },
    status: 'PRINT_REQUESTED',
    attempts: 0,
    max_attempts,
    last_error: null,
    payload,
    created_at: now,
    updated_at: now,
    completed_at: null,
  }
}

/**
 * Creates a DIFFERENTIAL Change Ticket PrintJob.
 */
export function createDifferentialPrintJob(params: CreateDifferentialJobParams): PrintJob {
  const { order_id, order_number, workflow, modification_number, payload, max_attempts = 3 } = params

  if (payload.document_type !== 'DIFFERENTIAL_CHANGE_TICKET') {
    throw new PrintJobValidationError(
      `Payload document_type must be 'DIFFERENTIAL_CHANGE_TICKET' for differential jobs.`
    )
  }

  const target_station = resolvePrintStation(workflow, 'DIFFERENTIAL_CHANGE_TICKET')
  const jobId = randomUUID()
  const now = new Date().toISOString()

  return {
    job_id: jobId,
    parent_job_id: null,
    job_kind: 'DIFFERENTIAL',
    idempotency_key: buildDifferentialIdempotencyKey(order_id, modification_number),
    order_id,
    order_number,
    document_type: 'DIFFERENTIAL_CHANGE_TICKET',
    workflow,
    target_station,
    status: 'PRINT_REQUESTED',
    attempts: 0,
    max_attempts,
    last_error: null,
    payload,
    created_at: now,
    updated_at: now,
    completed_at: null,
  }
}
