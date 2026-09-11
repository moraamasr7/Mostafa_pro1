/**
 * ======================================================================================
 * RUNTIME PRINT JOB REGISTRY & CACHE (IN-MEMORY ONLY)
 * Mostafa Elgazar Restaurant Operations System
 * 
 * ⚠️ ARCHITECTURAL NOTICE:
 * This module is strictly an IN-MEMORY RUNTIME CACHE & COORDINATOR.
 * It is NOT a persistent database audit log.
 * Persistent audit logging will be introduced in a dedicated database persistence phase.
 * 
 * Guarantees in Step 3:
 * - NO Supabase or database calls.
 * - NO modification of orders or daily shift tables.
 * - Purely tracks print job lifecycles in memory during application runtime.
 * - Idempotency guard: Prevents duplicate ORIGINAL jobs for the same order & document.
 * ======================================================================================
 */

import { PrintJob, PrintJobStatus } from './types'
import {
  transitionJob,
  enqueueJob,
  markJobSent,
  confirmPrintSuccess,
  failPrintJob,
  retryPrintJob,
  cancelPrintJob,
} from './stateMachine'

export class DuplicatePrintJobError extends Error {
  constructor(
    public readonly idempotencyKey: string,
    public readonly existingJobId: string,
    message: string
  ) {
    super(message)
    this.name = 'DuplicatePrintJobError'
  }
}

export class PrintJobNotFoundError extends Error {
  constructor(public readonly jobId: string) {
    super(`Print job '${jobId}' was not found in the runtime registry.`)
    this.name = 'PrintJobNotFoundError'
  }
}

/**
 * In-memory registry storing active/recent jobs by ID and Idempotency Key
 */
export class RuntimePrintJobRegistry {
  private jobsById = new Map<string, PrintJob>()
  private jobsByIdempotencyKey = new Map<string, string>() // idempotencyKey -> jobId

  /**
   * Registers a newly instantiated PrintJob.
   * Enforces idempotency:
   * - If an active or completed job with the same idempotency key already exists,
   *   throws DuplicatePrintJobError (preventing double-printing of originals).
   */
  public registerJob(job: PrintJob): PrintJob {
    const existingJobId = this.jobsByIdempotencyKey.get(job.idempotency_key)
    if (existingJobId) {
      const existingJob = this.jobsById.get(existingJobId)
      if (existingJob && existingJob.status !== 'CANCELLED') {
        throw new DuplicatePrintJobError(
          job.idempotency_key,
          existingJobId,
          `An active or completed PrintJob with key '${job.idempotency_key}' already exists (Job ID: ${existingJobId}). Duplicate original is prohibited.`
        )
      }
    }

    this.jobsById.set(job.job_id, job)
    this.jobsByIdempotencyKey.set(job.idempotency_key, job.job_id)
    return job
  }

  /**
   * Retrieves a job by ID
   */
  public getJob(jobId: string): PrintJob | undefined {
    return this.jobsById.get(jobId)
  }

  /**
   * Retrieves a job by Idempotency Key
   */
  public getJobByIdempotencyKey(key: string): PrintJob | undefined {
    const jobId = this.jobsByIdempotencyKey.get(key)
    return jobId ? this.jobsById.get(jobId) : undefined
  }

  /**
   * Counts how many reprints have been registered for a given order and document type
   */
  public countReprints(orderId: string, documentType: string): number {
    let count = 0
    for (const job of this.jobsById.values()) {
      if (
        job.order_id === orderId &&
        job.document_type === documentType &&
        job.job_kind === 'REPRINT' &&
        job.status !== 'CANCELLED'
      ) {
        count++
      }
    }
    return count
  }

  /**
   * Transitions a job to QUEUED state
   */
  public markQueued(jobId: string): PrintJob {
    const job = this.requireJob(jobId)
    const updated = enqueueJob(job)
    this.jobsById.set(jobId, updated)
    return updated
  }

  /**
   * Transitions a job to SENT state.
   * ⚠️ SENT indicates dispatch to adapter, NOT confirmation of physical print.
   */
  public markSent(jobId: string): PrintJob {
    const job = this.requireJob(jobId)
    const updated = markJobSent(job)
    this.jobsById.set(jobId, updated)
    return updated
  }

  /**
   * Transitions a job to COMPLETED state.
   * Only called when adapter explicitly confirms physical print or spooler acceptance.
   */
  public markCompleted(jobId: string): PrintJob {
    const job = this.requireJob(jobId)
    const updated = confirmPrintSuccess(job)
    this.jobsById.set(jobId, updated)
    return updated
  }

  /**
   * Transitions a job to PRINT_FAILED state.
   * Guarantees: Does NOT touch orders.status in DB.
   */
  public markFailed(jobId: string, error: string): PrintJob {
    const job = this.requireJob(jobId)
    const updated = failPrintJob(job, error)
    this.jobsById.set(jobId, updated)
    return updated
  }

  /**
   * Transitions a job to RETRYING state.
   * If max attempts exceeded, transitions directly to PRINT_FAILED.
   */
  public markRetrying(
    jobId: string,
    error?: string,
    options?: { resetAttempts?: boolean }
  ): PrintJob {
    const job = this.requireJob(jobId)
    const updated = retryPrintJob(job, error, options)
    this.jobsById.set(jobId, updated)
    return updated
  }

  /**
   * Cancels a job before or during queue
   */
  public markCancelled(jobId: string, reason?: string): PrintJob {
    const job = this.requireJob(jobId)
    const updated = cancelPrintJob(job, reason)
    this.jobsById.set(jobId, updated)
    return updated
  }

  /**
   * Filters jobs by order ID
   */
  public getJobsByOrderId(orderId: string): PrintJob[] {
    const results: PrintJob[] = []
    for (const job of this.jobsById.values()) {
      if (job.order_id === orderId) {
        results.push(job)
      }
    }
    return results
  }

  /**
   * Helper to fetch or throw
   */
  private requireJob(jobId: string): PrintJob {
    const job = this.jobsById.get(jobId)
    if (!job) {
      throw new PrintJobNotFoundError(jobId)
    }
    return job
  }

  /**
   * Resets the in-memory cache (primarily for tests)
   */
  public clear(): void {
    this.jobsById.clear()
    this.jobsByIdempotencyKey.clear()
  }
}

/**
 * Singleton instance for runtime usage
 */
export const globalRuntimeJobRegistry = new RuntimePrintJobRegistry()
