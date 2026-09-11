/**
 * ======================================================================================
 * ORDER LIFECYCLE PRINT INTEGRATION CONTRACTS V1.0
 * Mostafa Elgazar Restaurant Operations System
 * 
 * Strict Architecture & Direction of Dependency:
 * - Order Events trigger Printing, NEVER the reverse.
 * - Printing CANNOT modify orders.status or financial accounting.
 * - Print failures NEVER fail or rollback order state transitions.
 * - Deterministic event triggers prevent duplicate prints on event replay.
 * ======================================================================================
 */

import {
  PrintWorkflow,
  PrintDocumentType,
  KitchenTicketPayload,
  CustomerReceiptPayload,
  DriverControlCopyPayload,
  DineInCustomerTicketPayload,
  CanonicalDocumentPayload,
} from '../../../types/printing'
import { DispatchExecutionResult } from '../execution/types'

/**
 * Authorized lifecycle events that trigger print policies
 */
export type OrderLifecycleEventType =
  | 'ORDER_CREATED'
  | 'ORDER_STATUS_PROCESSING'
  | 'DRIVER_ASSIGNED'

/**
 * 1. Base Event Envelope
 */
export interface BaseOrderLifecycleEvent {
  readonly event_type: OrderLifecycleEventType
  /** Unique Event ID or deterministic deduplication key */
  readonly event_id: string
  readonly order_id: string
  readonly order_number: number
  readonly workflow: PrintWorkflow
  readonly timestamp: string
}

/**
 * 2. Order Created Event
 */
export interface OrderCreatedLifecycleEvent extends BaseOrderLifecycleEvent {
  readonly event_type: 'ORDER_CREATED'
  /** Authoritative canonical documents assembled by server at creation time */
  readonly documents: {
    readonly kitchen_ticket: KitchenTicketPayload
    readonly customer_receipt?: CustomerReceiptPayload // Required for takeaway
    readonly dine_in_ticket?: DineInCustomerTicketPayload // Required for dine_in
  }
}

/**
 * 3. Status Changed to Processing Event
 */
export interface OrderProcessingLifecycleEvent extends BaseOrderLifecycleEvent {
  readonly event_type: 'ORDER_STATUS_PROCESSING'
  readonly kitchen_ticket: KitchenTicketPayload
}

/**
 * 4. Driver Assigned Event (Delivery Only)
 */
export interface DriverAssignedLifecycleEvent extends BaseOrderLifecycleEvent {
  readonly event_type: 'DRIVER_ASSIGNED'
  readonly workflow: 'delivery'
  readonly driver_id: string
  readonly driver_name: string
  readonly trip_number: number
  /** If present and different from driver_id, signifies a driver reassignment */
  readonly previous_driver_id?: string | null
  readonly previous_driver_name?: string | null
  readonly staff_authorizer: string
  readonly documents: {
    readonly driver_control_copy: DriverControlCopyPayload
    readonly customer_receipt: CustomerReceiptPayload
  }
}

export type OrderLifecycleEvent =
  | OrderCreatedLifecycleEvent
  | OrderProcessingLifecycleEvent
  | DriverAssignedLifecycleEvent

/**
 * 5. Trigger Decision Item
 */
export interface PrintTriggerDecision {
  readonly document_type: PrintDocumentType
  readonly document_payload: CanonicalDocumentPayload
  readonly job_kind: 'ORIGINAL' | 'REPRINT'
  readonly trigger_key: string
  readonly reprint_meta?: {
    readonly reason: 'driver_reassigned' | 'manager_audit'
    readonly requested_by: string
    readonly custom_notes?: string
  }
}

/**
 * 6. Resolution Result of Event Handling
 */
export interface OrderLifecyclePrintResult {
  readonly event_id: string
  readonly order_id: string
  readonly event_type: OrderLifecycleEventType
  /** All jobs successfully dispatched or attempted */
  readonly dispatched: DispatchExecutionResult[]
  /** Any triggers skipped due to deterministic idempotency / existing prints */
  readonly skipped: Array<{
    readonly document_type: PrintDocumentType
    readonly trigger_key: string
    readonly reason: string
  }>
  /** Non-fatal printer errors captured without failing the order */
  readonly print_errors: Array<{
    readonly document_type: PrintDocumentType
    readonly error: string
  }>
}
