/**
 * ======================================================================================
 * ORDER MODIFICATION PRINT MANAGER
 * Mostafa Elgazar Restaurant Operations System
 * 
 * Strict Operational Rules:
 * 1. If Kitchen Ticket was NEVER printed -> NO differential ticket is generated.
 * 2. If Kitchen Ticket was ALREADY printed -> Emits DIFFERENTIAL_CHANGE_TICKET.
 * 3. NO full re-printing of the original ticket.
 * 4. Incremental snapshot tracking: Each modification diff is calculated strictly
 *    against the last acknowledged kitchen snapshot.
 * 5. Replaying the same modification_number 10x produces exactly 1 Differential PrintJob.
 * ======================================================================================
 */

import {
  OrderModifiedEvent,
  ModificationProcessResult,
  OrderKitchenSnapshot,
} from './types'
import { computeKitchenDelta } from './deltaCalculator'
import { PrintExecutionRuntime, globalPrintRuntime } from '../execution/dispatcher'
import {
  RuntimePrintJobRegistry,
  globalRuntimeJobRegistry,
  buildDifferentialIdempotencyKey,
  buildOriginalIdempotencyKey,
} from '../jobs'

export class OrderModificationPrintManager {
  private runtime: PrintExecutionRuntime
  private registry: RuntimePrintJobRegistry

  // Tracks the orders whose initial kitchen ticket has been dispatched/printed
  private ordersWithPrintedKitchen = new Set<string>()

  // Tracks the latest kitchen snapshot acknowledged by the kitchen
  private latestKitchenSnapshots = new Map<string, OrderKitchenSnapshot>()

  // Tracks processed modification keys for trigger deduplication
  private processedModificationKeys = new Set<string>()

  constructor(
    runtime: PrintExecutionRuntime = globalPrintRuntime,
    registry: RuntimePrintJobRegistry = globalRuntimeJobRegistry
  ) {
    this.runtime = runtime
    this.registry = registry
  }

  /**
   * Registers that an order's original kitchen ticket has been printed,
   * setting the baseline snapshot for future modifications.
   */
  public registerKitchenPrinted(orderId: string, initialSnapshot: OrderKitchenSnapshot): void {
    this.ordersWithPrintedKitchen.add(orderId)
    this.latestKitchenSnapshots.set(orderId, initialSnapshot)
  }

  /**
   * Checks if an order's kitchen ticket was previously printed
   */
  public isKitchenPrinted(orderId: string): boolean {
    if (this.ordersWithPrintedKitchen.has(orderId)) {
      return true
    }
    // Also check underlying job registry for an active/completed original kitchen ticket
    const origKey = buildOriginalIdempotencyKey(orderId, 'KITCHEN_TICKET')
    const existingJob = this.registry.getJobByIdempotencyKey(origKey)
    return Boolean(existingJob && existingJob.status !== 'CANCELLED')
  }

  /**
   * Gets the latest snapshot known to have been sent to the kitchen
   */
  public getLatestSnapshot(orderId: string): OrderKitchenSnapshot | undefined {
    return this.latestKitchenSnapshots.get(orderId)
  }

  /**
   * Processes an order modification event.
   * Enforces all operational rules.
   */
  public async handleOrderModification(
    event: OrderModifiedEvent
  ): Promise<ModificationProcessResult> {
    const { order_id, modification_number } = event
    const diffKey = buildDifferentialIdempotencyKey(order_id, modification_number)

    // 1. GATE 1: Did the kitchen receive an original ticket yet?
    if (!this.isKitchenPrinted(order_id)) {
      // Absorb changes silently into pending order state; NO differential ticket!
      return {
        order_id,
        modification_number,
        emitted: false,
        reason: 'Original kitchen ticket has not been printed yet. Changes are absorbed into pending order.',
      }
    }

    // 2. GATE 2: Idempotent Deduplication (Prevent duplicate print for same modification)
    if (this.processedModificationKeys.has(diffKey)) {
      return {
        order_id,
        modification_number,
        emitted: false,
        reason: `Modification #${modification_number} has already been processed (Idempotent Trigger Suppression).`,
      }
    }

    const existingDiffJob = this.registry.getJobByIdempotencyKey(diffKey)
    if (existingDiffJob && existingDiffJob.status !== 'CANCELLED') {
      this.processedModificationKeys.add(diffKey)
      return {
        order_id,
        modification_number,
        emitted: false,
        reason: `A PrintJob for modification #${modification_number} already exists in registry (Job ID: ${existingDiffJob.job_id}).`,
      }
    }

    // 3. Compute the Delta against baseline (prefer recorded latest snapshot if available)
    const baselineSnapshot = this.latestKitchenSnapshots.get(order_id) || event.previous_snapshot
    const delta = computeKitchenDelta({
      order_id,
      order_number: event.order_number,
      shift_sequence_display: event.shift_sequence_display,
      modification_number,
      modified_by_staff: event.modified_by_staff,
      modified_at: event.modified_at,
      previous_snapshot: baselineSnapshot,
      new_snapshot: event.new_snapshot,
    })

    // 4. GATE 3: Does the delta have any kitchen impact?
    if (!delta.has_kitchen_impact) {
      // No items added, removed, or updated
      this.processedModificationKeys.add(diffKey)
      return {
        order_id,
        modification_number,
        emitted: false,
        reason: 'Modification resulted in zero kitchen changes (no items added, removed, or updated).',
        delta,
      }
    }

    // 5. Dispatch the Differential Change Ticket
    try {
      const dispatchResult = await this.runtime.dispatch({
        kind: 'DIFFERENTIAL',
        document: delta.canonical_payload,
        workflow: event.workflow,
        modification_number,
      })

      this.processedModificationKeys.add(diffKey)
      // Advance the acknowledged kitchen snapshot to the new state
      this.latestKitchenSnapshots.set(order_id, event.new_snapshot)

      return {
        order_id,
        modification_number,
        emitted: true,
        reason: 'Differential change ticket successfully dispatched to kitchen.',
        delta,
        dispatch_result: dispatchResult,
      }
    } catch (err: any) {
      return {
        order_id,
        modification_number,
        emitted: false,
        reason: `Failed to dispatch differential ticket: ${err?.message || 'Unknown dispatch error'}`,
        delta,
      }
    }
  }

  /**
   * Resets internal tracking (primarily for tests)
   */
  public clear(): void {
    this.ordersWithPrintedKitchen.clear()
    this.latestKitchenSnapshots.clear()
    this.processedModificationKeys.clear()
  }
}

export const globalModificationPrintManager = new OrderModificationPrintManager()
