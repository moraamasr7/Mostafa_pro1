/**
 * ======================================================================================
 * KITCHEN MODIFICATION DELTA CALCULATOR
 * Mostafa Elgazar Restaurant Operations System
 * 
 * Compares authoritative Server Kitchen Snapshots (Before vs After)
 * to produce an exact, non-redundant operational delta for the kitchen:
 * - [+] ADDED: New items to prepare
 * - [-] REMOVED: Items to discard or halt preparation
 * - [=] MODIFIED: Quantity changes or updated kitchen notes
 * 
 * Strict Isolation: ZERO prices, ZERO financial totals.
 * ======================================================================================
 */

import {
  OrderKitchenSnapshot,
  OrderModificationDelta,
  OrderSnapshotItem,
} from './types'
import { DifferentialChangeTicketPayload } from '../../../types/printing'

function buildItemKey(item: { name: string; variant_name: string }): string {
  return `${item.name.trim().toLowerCase()}:::${item.variant_name.trim().toLowerCase()}`
}

export function computeKitchenDelta(params: {
  order_id: string
  order_number: number
  shift_sequence_display: string
  modification_number: number
  modified_by_staff: string
  modified_at: string
  previous_snapshot: OrderKitchenSnapshot
  new_snapshot: OrderKitchenSnapshot
}): OrderModificationDelta {
  const {
    order_id,
    order_number,
    shift_sequence_display,
    modification_number,
    modified_by_staff,
    modified_at,
    previous_snapshot,
    new_snapshot,
  } = params

  const prevMap = new Map<string, OrderSnapshotItem>()
  for (const item of previous_snapshot.items) {
    prevMap.set(buildItemKey(item), item)
  }

  const nextMap = new Map<string, OrderSnapshotItem>()
  for (const item of new_snapshot.items) {
    nextMap.set(buildItemKey(item), item)
  }

  const addedItems: Array<{
    name: string
    variant_name: string
    quantity: number
    item_notes?: string
  }> = []

  const removedItems: Array<{
    name: string
    variant_name: string
    quantity: number
    item_notes?: string
  }> = []

  const updatedItems: Array<{
    name: string
    variant_name: string
    old_quantity: number
    new_quantity: number
    old_notes?: string
    item_notes?: string
  }> = []

  // 1. Identify Added & Modified Items
  for (const [key, nextItem] of nextMap.entries()) {
    const prevItem = prevMap.get(key)
    if (!prevItem) {
      // Completely new item
      addedItems.push({
        name: nextItem.name,
        variant_name: nextItem.variant_name,
        quantity: nextItem.quantity,
        item_notes: nextItem.item_notes,
      })
    } else {
      // Exists in both snapshots: check if quantity or notes changed
      const quantityChanged = prevItem.quantity !== nextItem.quantity
      const notesChanged = (prevItem.item_notes || '').trim() !== (nextItem.item_notes || '').trim()

      if (quantityChanged || notesChanged) {
        updatedItems.push({
          name: nextItem.name,
          variant_name: nextItem.variant_name,
          old_quantity: prevItem.quantity,
          new_quantity: nextItem.quantity,
          old_notes: prevItem.item_notes,
          item_notes: nextItem.item_notes,
        })
      }
    }
  }

  // 2. Identify Removed Items
  for (const [key, prevItem] of prevMap.entries()) {
    if (!nextMap.has(key)) {
      removedItems.push({
        name: prevItem.name,
        variant_name: prevItem.variant_name,
        quantity: prevItem.quantity,
        item_notes: prevItem.item_notes,
      })
    }
  }

  // 3. Order Notes Delta
  const prevNotes = (previous_snapshot.order_notes || '').trim()
  const nextNotes = (new_snapshot.order_notes || '').trim()
  const orderNotesUpdate = prevNotes !== nextNotes ? (nextNotes.length > 0 ? nextNotes : 'تم حذف ملاحظات الطلب') : null

  // 4. Has Kitchen Impact?
  const hasKitchenImpact =
    addedItems.length > 0 ||
    removedItems.length > 0 ||
    updatedItems.length > 0 ||
    orderNotesUpdate !== null

  // 5. Build Canonical Payload
  const canonicalPayload: DifferentialChangeTicketPayload = {
    document_type: 'DIFFERENTIAL_CHANGE_TICKET',
    order_id,
    order_number,
    shift_sequence_display,
    modification_number,
    modified_at,
    modified_by_staff,
    added_items: addedItems,
    removed_items: removedItems,
    updated_items: updatedItems,
    order_notes_update: orderNotesUpdate,
  }

  return {
    order_id,
    order_number,
    modification_number,
    modified_at,
    modified_by_staff,
    shift_sequence_display,
    added_items: addedItems,
    removed_items: removedItems,
    updated_items: updatedItems,
    order_notes_update: orderNotesUpdate,
    has_kitchen_impact: hasKitchenImpact,
    canonical_payload: canonicalPayload,
  }
}
