/**
 * ======================================================================================
 * PRINT JOB LIFECYCLE STATE MACHINE
 * Mostafa Elgazar Restaurant Operations System
 * 
 * Rules:
 * - Deterministic status transitions.
 * - 'SENT' strictly denotes dispatch to the printer adapter/transport.
 * - 'COMPLETED' requires explicit adapter confirmation.
 * - Terminal states: COMPLETED, CANCELLED.
 * - Any failure never alters order status or operational accounting.
 * ======================================================================================
 */

import { PrintJob, PrintJobStatus } from './types'

export class InvalidStateTransitionError extends Error {
  constructor(
    public readonly currentStatus: PrintJobStatus,
    public readonly targetStatus: PrintJobStatus,
    public readonly jobId: string
  ) {
    super(
      `Invalid print job state transition: cannot transition job '${jobId}' from '${currentStatus}' to '${targetStatus}'.`
    )
    this.name = 'InvalidStateTransitionError'
  }
}

/**
 * Valid transitions dictionary
 */
const VALID_TRANSITIONS: Record<PrintJobStatus, readonly PrintJobStatus[]> = {
  PRINT_REQUESTED: ['QUEUED', 'CANCELLED'],
  QUEUED: ['SENT', 'PRINT_FAILED', 'CANCELLED'],
  SENT: ['COMPLETED', 'RETRYING', 'PRINT_FAILED'],
  RETRYING: ['QUEUED', 'PRINT_FAILED'],
  PRINT_FAILED: ['RETRYING'], // Allows manual/operator-initiated retry
  COMPLETED: [],               // Terminal state
  CANCELLED: [],               // Terminal state
}

/**
 * Checks if a transition between two statuses is permissible
 */
export function canTransition(current: PrintJobStatus, target: PrintJobStatus): boolean {
  const allowed = VALID_TRANSITIONS[current]
  return !!allowed && allowed.includes(target)
}

/**
 * Executes a transition on a PrintJob and returns a new immutable copy
 */
export function transitionJob(
  job: PrintJob,
  targetStatus: PrintJobStatus,
  options?: {
    error?: string | null
    incrementAttempt?: boolean
  }
): PrintJob {
  if (!canTransition(job.status, targetStatus)) {
    throw new InvalidStateTransitionError(job.status, targetStatus, job.job_id)
  }

  const now = new Date().toISOString()
  const attempts = options?.incrementAttempt ? job.attempts + 1 : job.attempts

  return {
    ...job,
    status: targetStatus,
    attempts,
    last_error: options?.error !== undefined ? options.error : job.last_error,
    updated_at: now,
    completed_at: targetStatus === 'COMPLETED' ? now : job.completed_at,
  }
}

/**
 * Semantic transition helpers
 */

export function enqueueJob(job: PrintJob): PrintJob {
  return transitionJob(job, 'QUEUED')
}

export function markJobSent(job: PrintJob): PrintJob {
  return transitionJob(job, 'SENT', { incrementAttempt: true })
}

export function confirmPrintSuccess(job: PrintJob): PrintJob {
  return transitionJob(job, 'COMPLETED', { error: null })
}

export function failPrintJob(job: PrintJob, error: string): PrintJob {
  return transitionJob(job, 'PRINT_FAILED', { error })
}

export function retryPrintJob(
  job: PrintJob,
  error?: string,
  options?: { resetAttempts?: boolean }
): PrintJob {
  // If operator triggers manual retry from PRINT_FAILED
  if (job.status === 'PRINT_FAILED') {
    const attempts = options?.resetAttempts ? 0 : Math.max(0, job.attempts - 1)
    const updated = transitionJob(job, 'RETRYING', { error: error || null })
    return {
      ...updated,
      attempts,
    }
  }

  // Automatic retry transition from SENT/QUEUED
  if (job.attempts >= job.max_attempts) {
    const exhaustionMsg = `Exhausted maximum retry attempts (${job.max_attempts}).`
    const detailedError = error ? `${exhaustionMsg} Last error: ${error}` : exhaustionMsg
    return transitionJob(job, 'PRINT_FAILED', {
      error: detailedError,
    })
  }
  return transitionJob(job, 'RETRYING', { error: error || job.last_error })
}

export function cancelPrintJob(job: PrintJob, reason?: string): PrintJob {
  return transitionJob(job, 'CANCELLED', { error: reason })
}
