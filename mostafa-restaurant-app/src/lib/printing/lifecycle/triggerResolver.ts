/**
 * ======================================================================================
 * ORDER LIFECYCLE PRINT TRIGGER RESOLVER
 * Mostafa Elgazar Restaurant Operations System
 * 
 * Policy Specification:
 * 1. ORDER_CREATED:
 *    - Takeaway: KITCHEN_TICKET (ORIGINAL) + CUSTOMER_RECEIPT (ORIGINAL)
 *    - Dine-In:  KITCHEN_TICKET (ORIGINAL) + DINE_IN_CUSTOMER_TICKET (ORIGINAL)
 *    - Delivery: KITCHEN_TICKET (ORIGINAL) [Driver & Receipt deferred to Driver Assignment]
 * 
 * 2. ORDER_STATUS_PROCESSING:
 *    - KITCHEN_TICKET (ORIGINAL) if not already printed during creation.
 * 
 * 3. DRIVER_ASSIGNED:
 *    - Delivery Only.
 *    - First Assignment: DRIVER_CONTROL_COPY (ORIGINAL) + CUSTOMER_RECEIPT (ORIGINAL)
 *    - Reassignment (previous_driver != new_driver):
 *      DRIVER_CONTROL_COPY (REPRINT with reason 'driver_reassigned')
 *    - Same Driver Replay: Idempotently skipped (no print).
 * ======================================================================================
 */

import {
  OrderLifecycleEvent,
  PrintTriggerDecision,
} from './types'

export class InvalidLifecycleEventError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidLifecycleEventError'
  }
}

/**
 * Resolves the list of print triggers dictated by an incoming lifecycle event
 */
export function resolvePrintTriggers(event: OrderLifecycleEvent): PrintTriggerDecision[] {
  const decisions: PrintTriggerDecision[] = []

  switch (event.event_type) {
    case 'ORDER_CREATED': {
      // 1. Kitchen Ticket is universal across all workflows
      decisions.push({
        document_type: 'KITCHEN_TICKET',
        document_payload: event.documents.kitchen_ticket,
        job_kind: 'ORIGINAL',
        trigger_key: `trigger:order:${event.order_id}:doc:KITCHEN_TICKET:orig`,
      })

      // 2. Takeaway creates Customer Receipt at order creation & payment
      if (event.workflow === 'takeaway') {
        if (!event.documents.customer_receipt) {
          throw new InvalidLifecycleEventError(
            `OrderCreated event for takeaway order '${event.order_id}' must include customer_receipt payload.`
          )
        }
        decisions.push({
          document_type: 'CUSTOMER_RECEIPT',
          document_payload: event.documents.customer_receipt,
          job_kind: 'ORIGINAL',
          trigger_key: `trigger:order:${event.order_id}:doc:CUSTOMER_RECEIPT:orig`,
        })
      }

      // 3. Dine-In creates Hall Customer Ticket at order creation
      if (event.workflow === 'dine_in') {
        if (!event.documents.dine_in_ticket) {
          throw new InvalidLifecycleEventError(
            `OrderCreated event for dine-in order '${event.order_id}' must include dine_in_ticket payload.`
          )
        }
        decisions.push({
          document_type: 'DINE_IN_CUSTOMER_TICKET',
          document_payload: event.documents.dine_in_ticket,
          job_kind: 'ORIGINAL',
          trigger_key: `trigger:order:${event.order_id}:doc:DINE_IN_CUSTOMER_TICKET:orig`,
        })
      }

      // For delivery, Driver Control Copy & Customer Receipt are deferred to DRIVER_ASSIGNED
      break
    }

    case 'ORDER_STATUS_PROCESSING': {
      // Triggers Kitchen Ticket if not yet printed (or in case order was created as draft/pending)
      decisions.push({
        document_type: 'KITCHEN_TICKET',
        document_payload: event.kitchen_ticket,
        job_kind: 'ORIGINAL',
        trigger_key: `trigger:order:${event.order_id}:doc:KITCHEN_TICKET:orig`,
      })
      break
    }

    case 'DRIVER_ASSIGNED': {
      const currentWorkflow = (event as any).workflow
      if (currentWorkflow !== 'delivery') {
        throw new InvalidLifecycleEventError(
          `DRIVER_ASSIGNED event is only valid for 'delivery' workflow, received '${currentWorkflow}'.`
        )
      }

      const isReassignment =
        Boolean(event.previous_driver_id) &&
        event.previous_driver_id !== event.driver_id

      if (isReassignment) {
        // Reassignment: emit REPRINT of Driver Control Copy
        decisions.push({
          document_type: 'DRIVER_CONTROL_COPY',
          document_payload: {
            ...event.documents.driver_control_copy,
            print_nature: 'REPRINT',
            reprint_reason: `إعادة إسناد من ${event.previous_driver_name || 'سائق سابق'} إلى ${event.driver_name}`,
          },
          job_kind: 'REPRINT',
          trigger_key: `trigger:order:${event.order_id}:doc:DRIVER_CONTROL_COPY:reassign:${event.driver_id}`,
          reprint_meta: {
            reason: 'driver_reassigned',
            requested_by: event.staff_authorizer,
            custom_notes: `Reassigned from driver ${event.previous_driver_id} to ${event.driver_id}`,
          },
        })
      } else {
        // First assignment (or initial driver selection)
        decisions.push({
          document_type: 'DRIVER_CONTROL_COPY',
          document_payload: event.documents.driver_control_copy,
          job_kind: 'ORIGINAL',
          trigger_key: `trigger:order:${event.order_id}:doc:DRIVER_CONTROL_COPY:orig`,
        })

        decisions.push({
          document_type: 'CUSTOMER_RECEIPT',
          document_payload: event.documents.customer_receipt,
          job_kind: 'ORIGINAL',
          trigger_key: `trigger:order:${event.order_id}:doc:CUSTOMER_RECEIPT:orig`,
        })
      }
      break
    }
  }

  return decisions
}
