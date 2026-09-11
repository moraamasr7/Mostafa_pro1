/**
 * ======================================================================================
 * PRINT EXECUTION RUNTIME & DISPATCHER
 * Mostafa Elgazar Restaurant Operations System
 * 
 * Orchestrates the end-to-end printing pipeline:
 * CanonicalPrintDocument -> Document Renderer -> PrintPayload -> PrintJob ->
 * Station Router -> Adapter Registry -> Concrete Adapter -> PrintResult -> State Machine
 * 
 * Strict Guarantees:
 * - Pure execution runtime: No DB, No RPCs, No UI, No Order Status mutation.
 * - Concurrency guard: In-flight execution lock prevents race conditions.
 * - Idempotency guard: Prevents duplicate execution of identical original jobs.
 * - Hardware ACK distinction: Never claims physical print confirmation without device ACK.
 * ======================================================================================
 */

import { renderPrintDocument } from '../templates'
import {
  PrintJob,
  RuntimePrintJobRegistry,
  globalRuntimeJobRegistry,
  createOriginalPrintJob,
  createReprintPrintJob,
  createDifferentialPrintJob,
} from '../jobs'
import {
  PrintAdapterRegistry,
  globalPrintAdapterRegistry,
  PrintPayload,
  PrintResult,
  PrinterConnection,
} from '../adapters'
import {
  StationConfigManager,
  globalStationConfig,
} from './stationConfig'
import {
  DispatchRequest,
  DispatchExecutionResult,
  DispatchOptions,
} from './types'

export class ConcurrentDispatchError extends Error {
  constructor(public readonly jobId: string, message: string) {
    super(message)
    this.name = 'ConcurrentDispatchError'
  }
}

export class PrintExecutionRuntime {
  private registry: RuntimePrintJobRegistry
  private adapterRegistry: PrintAdapterRegistry
  private stationConfig: StationConfigManager

  // In-flight locks to prevent concurrent double-execution of the same job
  private inFlightJobIds = new Set<string>()

  constructor(
    registry: RuntimePrintJobRegistry = globalRuntimeJobRegistry,
    adapterRegistry: PrintAdapterRegistry = globalPrintAdapterRegistry,
    stationConfig: StationConfigManager = globalStationConfig
  ) {
    this.registry = registry
    this.adapterRegistry = adapterRegistry
    this.stationConfig = stationConfig
  }

  /**
   * Main entry point to dispatch any print request (Original, Reprint, or Differential).
   */
  public async dispatch(request: DispatchRequest): Promise<DispatchExecutionResult> {
    const startTime = Date.now()
    const options = request.options || {}
    const maxAttempts = options.maxAttempts ?? 3

    // 1. STEP A: Render Document through Step 2 Templates
    const rendered = renderPrintDocument(request.document)

    // 2. STEP B: Instantiate PrintJob through Step 3 Factory
    let job: PrintJob
    switch (request.kind) {
      case 'ORIGINAL':
        job = createOriginalPrintJob({
          order_id: request.document.order_id,
          order_number: request.document.order_number,
          workflow: request.workflow,
          document_type: request.document.document_type,
          payload: request.document,
          max_attempts: maxAttempts,
        })
        break

      case 'REPRINT': {
        const reprintSeq = this.registry.countReprints(
          request.original_job.order_id,
          request.original_job.document_type
        ) + 1

        job = createReprintPrintJob(
          {
            original_job: request.original_job,
            reason: request.reason,
            custom_reason_text: request.custom_reason_text,
            requested_by: request.requested_by,
            payload: request.document,
            max_attempts: maxAttempts,
          },
          reprintSeq
        )
        break
      }

      case 'DIFFERENTIAL':
        job = createDifferentialPrintJob({
          order_id: request.document.order_id,
          order_number: request.document.order_number,
          workflow: request.workflow,
          modification_number: request.modification_number,
          payload: request.document,
          max_attempts: maxAttempts,
        })
        break
    }

    // 3. STEP C: Register Job & Enforce Idempotency in Runtime Registry
    job = this.registry.registerJob(job)

    // 4. STEP D: Prepare Transport PrintPayload Envelope
    const payload: PrintPayload = {
      job_id: job.job_id,
      order_id: job.order_id,
      order_number: job.order_number,
      document_type: job.document_type,
      station: job.target_station,
      print_nature: job.job_kind === 'REPRINT' ? 'REPRINT' : 'ORIGINAL',
      raw_text: rendered.rawText,
      html: rendered.html,
      prepared_at: new Date().toISOString(),
    }

    // 5. STEP E: Resolve Connection & Adapter for Target Station
    const connection = this.stationConfig.getConnection(
      job.target_station,
      options.customStationConfig
    )
    const adapter = this.adapterRegistry.resolve(connection)

    // 6. STEP F: Concurrency In-Flight Guard
    if (this.inFlightJobIds.has(job.job_id)) {
      throw new ConcurrentDispatchError(
        job.job_id,
        `PrintJob '${job.job_id}' is already actively executing in flight.`
      )
    }

    this.inFlightJobIds.add(job.job_id)

    try {
      // 7. STEP G: Execute Dispatch with State Transitions & Auto-Retry Loop
      const result = await this.executeDispatchLifecycle(
        job,
        payload,
        connection,
        adapter,
        options
      )

      const durationMs = Date.now() - startTime
      const finalJob = this.registry.getJob(job.job_id) || job

      return {
        job: finalJob,
        payload,
        result,
        hardware_ack_verified: result.device_ack_received === true,
        duration_ms: durationMs,
      }
    } finally {
      this.inFlightJobIds.delete(job.job_id)
    }
  }

  /**
   * Internal lifecycle coordinator handling QUEUED -> SENT -> COMPLETED / RETRYING / PRINT_FAILED
   */
  private async executeDispatchLifecycle(
    job: PrintJob,
    payload: PrintPayload,
    connection: PrinterConnection,
    adapter: any,
    options: DispatchOptions
  ): Promise<PrintResult> {
    // Transition: PRINT_REQUESTED -> QUEUED
    this.registry.markQueued(job.job_id)

    const autoRetry = options.autoRetry ?? true
    const retryDelayMs = options.retryDelayMs ?? 50

    while (true) {
      // Transition: QUEUED -> SENT (Data delivered to adapter transport)
      this.registry.markSent(job.job_id)

      // Invoke concrete adapter
      let printResult: PrintResult
      try {
        printResult = await adapter.print(payload, connection)
      } catch (unexpectedError: any) {
        printResult = {
          success: false,
          adapter_type: adapter.type,
          device_ack_received: false,
          completed_at: new Date().toISOString(),
          message: unexpectedError?.message || 'Unexpected adapter execution error',
          error: {
            code: 'TRANSPORT_WRITE_FAILED',
            category: 'connection',
            message: unexpectedError?.message || 'Transport write failed',
            retryable: true,
            adapter_type: adapter.type,
          },
        }
      }

      // Check Outcome
      if (printResult.success) {
        // Transition: SENT -> COMPLETED (Confirmed by adapter)
        this.registry.markCompleted(job.job_id)
        return printResult
      }

      // Handle Failure: check if retryable
      const currentJob = this.registry.getJob(job.job_id)!
      const isRetryable = printResult.error?.retryable ?? false

      if (autoRetry && isRetryable && currentJob.attempts < currentJob.max_attempts) {
        // Transition: SENT -> RETRYING
        this.registry.markRetrying(
          job.job_id,
          printResult.error?.message || 'Adapter returned retryable error'
        )

        // Wait backoff delay
        if (retryDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
        }

        // Transition: RETRYING -> QUEUED
        this.registry.markQueued(job.job_id)
        continue // Loop to re-attempt dispatch
      }

      // Non-retryable or retries exhausted -> Transition to PRINT_FAILED
      this.registry.markFailed(
        job.job_id,
        printResult.error?.message || printResult.message || 'Print execution failed'
      )
      return printResult
    }
  }

  /**
   * Safe cancellation helper before dispatch
   */
  public cancelJob(jobId: string, reason?: string): PrintJob {
    if (this.inFlightJobIds.has(jobId)) {
      throw new Error(`Cannot cancel job '${jobId}' while in-flight execution is actively running.`)
    }
    return this.registry.markCancelled(jobId, reason)
  }
}

/**
 * Global singleton runtime instance
 */
export const globalPrintRuntime = new PrintExecutionRuntime()
