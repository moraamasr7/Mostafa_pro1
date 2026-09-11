/**
 * ======================================================================================
 * DIFFERENTIAL CHANGE TICKETS & MODIFICATION CONTRACTS V1.0
 * Mostafa Elgazar Restaurant Operations System
 * 
 * Strict Guarantees:
 * - NO full re-printing of kitchen tickets on order modification.
 * - If kitchen ticket not yet printed -> NO differential ticket (absorbed into initial ticket).
 * - If kitchen ticket already printed -> Prints DIFFERENTIAL_CHANGE_TICKET showing:
 *   [+] ADDED, [-] REMOVED, [=] MODIFIED.
 * - Based strictly on authoritative Server Snapshots (Before vs After).
 * - ZERO financial amounts or price recalculations.
 * - Idempotency guaranteed per modification_number.
 * ======================================================================================
 */

import { PrintWorkflow, DifferentialChangeTicketPayload } from '../../../types/printing'
import { DispatchExecutionResult } from '../execution/types'

/**
 * 1. Single Item within an Order Kitchen Snapshot
 */
export interface OrderSnapshotItem {
  /** Unique key identifying the item & variant combination */
  readonly item_key: string
  readonly name: string
  readonly variant_name: string
  readonly quantity: number
  readonly item_notes?: string
}

/**
 * 2. Complete Kitchen State Snapshot at a specific point in time
 */
export interface OrderKitchenSnapshot {
  readonly version: number
  readonly order_id: string
  readonly order_number: number
  readonly items: readonly OrderSnapshotItem[]
  readonly order_notes?: string | null
  readonly captured_at: string
}

/**
 * 3. Computed Delta between two snapshots
 */
export interface OrderModificationDelta {
  readonly order_id: string
  readonly order_number: number
  readonly modification_number: number
  readonly modified_at: string
  readonly modified_by_staff: string
  readonly shift_sequence_display: string
  /** Items newly added to the order */
  readonly added_items: ReadonlyArray<{
    readonly name: string
    readonly variant_name: string
    readonly quantity: number
    readonly item_notes?: string
  }>
  /** Items completely removed from the order */
  readonly removed_items: ReadonlyArray<{
    readonly name: string
    readonly variant_name: string
    readonly quantity: number
    readonly item_notes?: string
  }>
  /** Items whose quantity or prep notes were modified */
  readonly updated_items: ReadonlyArray<{
    readonly name: string
    readonly variant_name: string
    readonly old_quantity: number
    readonly new_quantity: number
    readonly old_notes?: string
    readonly item_notes?: string
  }>
  readonly order_notes_update?: string | null
  /** True strictly when additions, removals, updates, or notes changed */
  readonly has_kitchen_impact: boolean
  /** Assembled canonical differential ticket payload */
  readonly canonical_payload: DifferentialChangeTicketPayload
}

/**
 * 4. Order Modified Event Envelope
 */
export interface OrderModifiedEvent {
  readonly order_id: string
  readonly order_number: number
  readonly workflow: PrintWorkflow
  readonly shift_sequence_display: string
  readonly modification_number: number
  readonly modified_by_staff: string
  readonly modified_at: string
  readonly previous_snapshot: OrderKitchenSnapshot
  readonly new_snapshot: OrderKitchenSnapshot
}

/**
 * 5. Result of Processing a Modification Event
 */
export interface ModificationProcessResult {
  readonly order_id: string
  readonly modification_number: number
  readonly emitted: boolean
  readonly reason: string
  readonly delta?: OrderModificationDelta
  readonly dispatch_result?: DispatchExecutionResult
}
