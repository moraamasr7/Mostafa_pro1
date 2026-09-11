/**
 * ======================================================================================
 * PRINT BUSINESS CONTRACT & DOCUMENT TYPES V1.0
 * Mostafa Elgazar Restaurant Operations System
 * 
 * Strict Single Source of Truth Print Specifications:
 * - NO client-side prices, totals, or financial calculations allowed.
 * - Every payload maps 1-to-1 with actual DB columns in:
 *   orders, order_items, daily_shifts, drivers, delivery_trips, order_driver_assignments.
 * - Enforces the 3 independent restaurant workflows:
 *   1. Delivery (Kitchen Ticket + Driver Control Copy + Customer Receipt)
 *   2. Takeaway (Kitchen Ticket + Customer Receipt)
 *   3. Dine-In (Kitchen Ticket + Dine-In Customer Ticket)
 * ======================================================================================
 */

import { OrderType, OrderStatus } from './orders'

/**
 * 1. Document Types (Canonical 4 Documents + Differential Change Ticket)
 */
export type PrintDocumentType =
  | 'KITCHEN_TICKET'
  | 'CUSTOMER_RECEIPT'
  | 'DRIVER_CONTROL_COPY'
  | 'DINE_IN_CUSTOMER_TICKET'
  | 'DIFFERENTIAL_CHANGE_TICKET'

/**
 * 2. Operating Workflows
 */
export type PrintWorkflow = 'delivery' | 'takeaway' | 'dine_in'

/**
 * 3. Physical Destination Stations (80mm Thermal Standard)
 */
export type PrintStation = 'KITCHEN_80MM' | 'CASHIER_80MM'

/**
 * 4. Technical Print Lifecycle Statuses (No fake physical claims)
 */
export type PrintJobStatus =
  | 'PRINT_REQUESTED'
  | 'QUEUED'
  | 'SENT'
  | 'COMPLETED'
  | 'PRINT_FAILED'
  | 'RETRYING'

/**
 * 5. Nature of Print Request
 */
export type PrintNature = 'ORIGINAL' | 'REPRINT'

/**
 * 6. Authorized Reasons for Reprinting (Audit Required)
 */
export type ReprintReason =
  | 'paper_jam'          // انحشار ورق
  | 'paper_out'          // نفاد بكرة الورق
  | 'damaged_ticket'     // تلف المستند في المطبخ أو التحضير
  | 'lost_ticket'        // فقدان البون مع الطيار أو العميل
  | 'driver_reassigned'  // إعادة إسناد الطلب لطيار جديد
  | 'manager_audit'      // طلب تدقيق إداري
  | 'other'              // سبب تشغيلي آخر (يلزم توضيح نصي)

/**
 * 7. Line Item Data within Documents (Read-only, Server Assembled)
 */
export interface PrintItemDetail {
  /** menu_items.name */
  name: string
  /** item_variants.variant_name */
  variant_name: string
  /** order_items.quantity */
  quantity: number
  /** order_items.unit_price (Hidden on Kitchen Tickets) */
  unit_price?: number
  /** order_items.subtotal (Hidden on Kitchen Tickets) */
  subtotal?: number
  /** order_items.item_notes (Highlighted on Kitchen & Hall tickets) */
  item_notes?: string
}

/**
 * 8. Kitchen Ticket Contract (KOT)
 * Destination: KITCHEN_80MM
 * Trigger: Status -> 'processing' (or instant creation in Dine-In)
 * Policy: 1 Original Copy. Clean prep view with NO customer contact info or drawer financials.
 */
export interface KitchenTicketPayload {
  document_type: 'KITCHEN_TICKET'
  /** orders.id */
  order_id: string
  /** orders.order_number (Global BIGINT) */
  order_number: number
  /** daily_shifts.shift_number (Official shift integer) */
  shift_number: number
  /** orders.order_type ('delivery' | 'takeaway' | 'dine_in') */
  order_type: OrderType
  /** Human readable sequence header: e.g. "Takeaway #024", "Turn #007", "Delivery #1085" */
  shift_sequence_display: string
  /** Clean items list (Prices omitted for kitchen focus) */
  items: Array<{
    name: string
    variant_name: string
    quantity: number
    item_notes?: string
  }>
  /** orders.notes */
  order_notes?: string
  /** ISO timestamp of print dispatch */
  dispatched_at: string
  /** Original vs Reprint indicator */
  print_nature: PrintNature
  reprint_count?: number
  reprint_reason?: string
}

/**
 * 9. Customer Receipt Contract
 * Destination: CASHIER_80MM
 * Triggers:
 *  - Takeaway: Order Created & Payment Settled
 *  - Delivery: Driver Assigned (hands off to customer upon arrival)
 * Policy: 1 Original Copy.
 */
export interface CustomerReceiptPayload {
  document_type: 'CUSTOMER_RECEIPT'
  /** orders.id */
  order_id: string
  /** orders.order_number (Global BIGINT) */
  order_number: number
  /** daily_shifts.shift_number */
  shift_number: number
  /** orders.order_type ('takeaway' | 'delivery') */
  order_type: OrderType
  /** Operational sequence string (e.g. "استلام سفري: #024" or "دليفري: #1085") */
  shift_sequence_display: string
  /** orders.customer_name */
  customer_name: string
  /** orders.customer_phone */
  customer_phone: string
  /** orders.delivery_address (Required for delivery, null for takeaway) */
  delivery_address?: string | null
  /** Complete items list with server unit prices & subtotals */
  items: PrintItemDetail[]
  /** Sum of items subtotal */
  subtotal_amount: number
  /** orders.delivery_fee (0.00 for takeaway) */
  delivery_fee: number
  /** orders.total_amount (Server calculated source of truth) */
  total_amount: number
  /** orders.payment_method ('cash' | 'card' | 'instapay' | 'wallet') */
  payment_method: string
  /** orders.created_by_staff */
  created_by_staff: string
  /** ISO timestamp */
  created_at: string
  /** drivers.name (Populated when assigned for delivery) */
  driver_name?: string | null
  /** Original vs Reprint */
  print_nature: PrintNature
  reprint_count?: number
  reprint_reason?: string
}

/**
 * 10. Driver Control Copy Contract (كعب الرقابة المالي)
 * Destination: CASHIER_80MM (Front Counter Dispatch Board)
 * Trigger: Driver Assigned (assign_orders_to_driver_secure)
 * Policy: 1 Original Copy. Retained at counter until driver returns & settles.
 */
export interface DriverControlCopyPayload {
  document_type: 'DRIVER_CONTROL_COPY'
  /** orders.id */
  order_id: string
  /** orders.order_number */
  order_number: number
  /** daily_shifts.shift_number */
  shift_number: number
  /** delivery_trips.trip_number (Official batch trip sequence) */
  trip_number: number
  /** drivers.name (Prominently displayed: "DRIVER: X") */
  driver_name: string
  /** drivers.phone */
  driver_phone?: string | null
  /** orders.customer_name */
  customer_name: string
  /** orders.customer_phone */
  customer_phone: string
  /** orders.delivery_address */
  delivery_address: string
  /**
   * Net Cash Amount to be collected from driver at settlement.
   * Calculated strictly server-side: orders.total_amount IF payment_method === 'cash', otherwise 0.00.
   * NOTE: orders.total_amount in DB already includes delivery_fee via the database trigger update_order_total_amount.
   */
  amount_to_collect: number
  /** orders.payment_method */
  payment_method: string
  /** orders.notes (Delivery notes only) */
  order_notes?: string | null
  /** orders.created_by_staff */
  created_by_staff: string
  /** ISO timestamp */
  dispatched_at: string
  /** Original vs Reprint */
  print_nature: PrintNature
  reprint_count?: number
  reprint_reason?: string
}

/**
 * 11. Dine-In Customer Ticket Contract (بون طاولة الصالة)
 * Destination: CASHIER_80MM / Hall Counter
 * Trigger: Dine-In Order Created
 * Policy: 1 Original Copy. Handed to customer / waiter for table matching.
 */
export interface DineInCustomerTicketPayload {
  document_type: 'DINE_IN_CUSTOMER_TICKET'
  /** orders.id */
  order_id: string
  /** orders.order_number */
  order_number: number
  /** daily_shifts.shift_number */
  shift_number: number
  /**
   * Dine-In Turn Number (Independent daily hall sequence: e.g. 15 -> "TURN #015").
   * Completely decoupled from Takeaway Sequence.
   */
  turn_number: number
  turn_display: string
  /** orders.customer_name */
  customer_name: string
  /** Guest party size if recorded */
  party_size?: number | null
  /** Items with prices */
  items: PrintItemDetail[]
  /** orders.total_amount */
  total_amount: number
  /** orders.payment_method */
  payment_method: string
  /** orders.notes */
  order_notes?: string | null
  /** orders.created_by_staff */
  created_by_staff: string
  /** ISO timestamp */
  created_at: string
  /** Original vs Reprint */
  print_nature: PrintNature
  reprint_count?: number
  reprint_reason?: string
}

/**
 * 12. Differential Change Ticket Contract (تذكرة تعديل المطبخ)
 * Destination: KITCHEN_80MM
 * Trigger: Modification of an order whose KOT was already printed.
 * Policy: Prints ONLY the delta (additions, cancellations, quantity changes).
 */
export interface DifferentialChangeTicketPayload {
  document_type: 'DIFFERENTIAL_CHANGE_TICKET'
  order_id: string
  order_number: number
  shift_sequence_display: string
  modification_number: number
  modified_at: string
  modified_by_staff: string
  /** Items added to the order */
  added_items: Array<{
    name: string
    variant_name: string
    quantity: number
    item_notes?: string
  }>
  /** Items removed from the order (Kitchen must stop preparing) */
  removed_items: Array<{
    name: string
    variant_name: string
    quantity: number
    item_notes?: string
  }>
  /** Items whose quantities or notes changed */
  updated_items: Array<{
    name: string
    variant_name: string
    old_quantity: number
    new_quantity: number
    item_notes?: string
  }>
  order_notes_update?: string | null
}

/**
 * Union of all canonical printable payloads
 */
export type CanonicalDocumentPayload =
  | KitchenTicketPayload
  | CustomerReceiptPayload
  | DriverControlCopyPayload
  | DineInCustomerTicketPayload
  | DifferentialChangeTicketPayload

/**
 * 13. Reprint Request Envelope (Input from Cashier / Manager)
 * Strictly enforces staff identity and operational reason.
 */
export interface ReprintRequestContract {
  order_id: string
  document_type: PrintDocumentType
  reason: ReprintReason
  custom_reason_text?: string
  requested_by_staff: string
}

/**
 * 14. Server-Side Data Assembler Context
 * Enforces that assembling print data only requires authoritative IDs.
 */
export interface PrintDataAssemblerContext {
  order_id: string
  document_type: PrintDocumentType
  print_nature: PrintNature
  reprint_info?: {
    reprint_count: number
    reason: ReprintReason
    custom_reason_text?: string
    requested_by_staff: string
  }
}

/**
 * 15. Operational Numbers Mapping & Source of Truth Summary
 */
export interface AuthoritativeDocumentNumbers {
  /** orders.order_number: Global BIGINT sequence */
  readonly order_number: number
  /** daily_shifts.shift_number: Shift sequence */
  readonly shift_number: number
  /** delivery_trips.trip_number: Multi-drop trip sequence (if delivery) */
  readonly trip_number?: number | null
  /** Calculated relative sequence for takeaway orders within the current daily shift */
  readonly takeaway_sequence?: number | null
  /** Calculated relative turn number for dine-in orders within the current daily shift */
  readonly dine_in_turn_number?: number | null
}
