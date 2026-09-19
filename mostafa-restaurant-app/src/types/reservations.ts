export type ReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'no_show'

export interface Reservation {
  id: string
  reservation_number: number
  customer_name: string
  customer_phone: string
  reservation_date: string
  reservation_time: string
  guest_count: number
  table_number?: string | null
  notes?: string | null
  status: ReservationStatus
  deposit_amount?: number | null
  deposit_receipt_url?: string | null
  created_at: string
  updated_at: string
}

export const ALLOWED_RESERVATION_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'no_show', 'cancelled'],
  completed: [],
  cancelled: [],
  no_show: [],
}

export function canTransitionReservation(
  currentStatus: ReservationStatus,
  newStatus: ReservationStatus
): boolean {
  const allowed = ALLOWED_RESERVATION_TRANSITIONS[currentStatus] || []
  return allowed.includes(newStatus)
}
