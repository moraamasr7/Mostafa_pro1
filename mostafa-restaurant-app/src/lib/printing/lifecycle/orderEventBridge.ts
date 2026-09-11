/**
 * ======================================================================================
 * ORDER LIFECYCLE PRINT EVENT BRIDGE
 * Mostafa Elgazar Restaurant Operations System
 * 
 * Strict Single Direction of Dependency:
 * Order Events -> Bridge -> Trigger Resolver -> Execution Runtime -> Adapter
 * 
 * Critical Guarantees:
 * 1. Printing never touches orders.status or DB records.
 * 2. Complete error containment: Printer/socket/network failures are recorded safely
 *    in the result without ever throwing unhandled exceptions to the order caller.
 * 3. 10x Event Replay Idempotency: Duplicate events are deduplicated at both the
 *    trigger layer and the underlying print job registry layer.
 * ======================================================================================
 */

import {
  PrintExecutionRuntime,
  globalPrintRuntime,
} from '../execution/dispatcher'
import {
  RuntimePrintJobRegistry,
  globalRuntimeJobRegistry,
  buildOriginalIdempotencyKey,
  DuplicatePrintJobError,
} from '../jobs'
import {
  OrderLifecycleEvent,
  OrderLifecyclePrintResult,
} from './types'
import { resolvePrintTriggers } from './triggerResolver'
import { DispatchExecutionResult } from '../execution/types'

export class OrderLifecyclePrintBridge {
  private runtime: PrintExecutionRuntime
  private registry: RuntimePrintJobRegistry

  // Set of executed trigger keys for deterministic trigger deduplication
  private executedTriggerKeys = new Set<string>()

  constructor(
    runtime: PrintExecutionRuntime = globalPrintRuntime,
    registry: RuntimePrintJobRegistry = globalRuntimeJobRegistry
  ) {
    this.runtime = runtime
    this.registry = registry
  }

  /**
   * Main entry point: handles any Order Lifecycle Event safely.
   */
  public async handleOrderEvent(
    event: OrderLifecycleEvent
  ): Promise<OrderLifecyclePrintResult> {
    const decisions = resolvePrintTriggers(event)

    const dispatched: DispatchExecutionResult[] = []
    const skipped: Array<{ document_type: any; trigger_key: string; reason: string }> = []
    const printErrors: Array<{ document_type: any; error: string }> = []

    for (const decision of decisions) {
      // 1. Check Trigger-Level Deduplication
      if (this.executedTriggerKeys.has(decision.trigger_key)) {
        skipped.push({
          document_type: decision.document_type,
          trigger_key: decision.trigger_key,
          reason: 'Trigger key already processed in current runtime (Idempotent Event Replay).',
        })
        continue
      }

      // 2. Check Job-Level Deduplication for ORIGINAL documents
      if (decision.job_kind === 'ORIGINAL') {
        const idempotencyKey = buildOriginalIdempotencyKey(
          event.order_id,
          decision.document_type
        )
        const existingJob = this.registry.getJobByIdempotencyKey(idempotencyKey)

        if (existingJob && existingJob.status !== 'CANCELLED') {
          // Already created/completed original job
          this.executedTriggerKeys.add(decision.trigger_key)
          skipped.push({
            document_type: decision.document_type,
            trigger_key: decision.trigger_key,
            reason: `An active or completed ORIGINAL job already exists for ${decision.document_type} (Job ID: ${existingJob.job_id}).`,
          })
          continue
        }
      }

      // 3. Prepare Dispatch Request
      try {
        if (decision.job_kind === 'REPRINT') {
          // Locate the original job in registry to link as parent
          const origKey = buildOriginalIdempotencyKey(event.order_id, decision.document_type)
          const originalJob = this.registry.getJobByIdempotencyKey(origKey)

          if (!originalJob) {
            printErrors.push({
              document_type: decision.document_type,
              error: `Cannot issue REPRINT: Original job for ${decision.document_type} was not found.`,
            })
            continue
          }

          const execResult = await this.runtime.dispatch({
            kind: 'REPRINT',
            document: decision.document_payload,
            original_job: originalJob,
            reason: decision.reprint_meta?.reason || 'manager_audit',
            custom_reason_text: decision.reprint_meta?.custom_notes,
            requested_by: decision.reprint_meta?.requested_by || 'system',
          })

          dispatched.push(execResult)
          this.executedTriggerKeys.add(decision.trigger_key)

          if (!execResult.result.success) {
            printErrors.push({
              document_type: decision.document_type,
              error: execResult.result.error?.message || 'Print dispatch failed on adapter',
            })
          }
        } else {
          // ORIGINAL dispatch
          const execResult = await this.runtime.dispatch({
            kind: 'ORIGINAL',
            document: decision.document_payload,
            workflow: event.workflow,
          })

          dispatched.push(execResult)
          this.executedTriggerKeys.add(decision.trigger_key)

          if (!execResult.result.success) {
            printErrors.push({
              document_type: decision.document_type,
              error: execResult.result.error?.message || 'Print dispatch failed on adapter',
            })
          }
        }
      } catch (err: any) {
        if (err instanceof DuplicatePrintJobError || err?.name === 'DuplicatePrintJobError') {
          this.executedTriggerKeys.add(decision.trigger_key)
          skipped.push({
            document_type: decision.document_type,
            trigger_key: decision.trigger_key,
            reason: `Concurrent trigger suppressed by idempotency guard: ${err.message}`,
          })
        } else {
          // Strict Error Isolation: NEVER let printer error bubble up to crash the order event!
          printErrors.push({
            document_type: decision.document_type,
            error: err?.message || 'Unexpected error during print dispatch',
          })
        }
      }
    }

    return {
      event_id: event.event_id,
      order_id: event.order_id,
      event_type: event.event_type,
      dispatched,
      skipped,
      print_errors: printErrors,
    }
  }

  /**
   * Resets local trigger cache (for testing)
   */
  public clear(): void {
    this.executedTriggerKeys.clear()
  }
}

export const globalOrderPrintBridge = new OrderLifecyclePrintBridge()
