export type DriverStatus = 'offline' | 'available' | 'busy'
export type ShiftStatus = 'open' | 'closed'
export type AssignmentStatus =
  | 'assigned'
  | 'accepted'
  | 'rejected'
  | 'picked_up'
  | 'out_for_delivery'
  | 'delivered'
  | 'failed'
  | 'cancelled'
  | 'reassigned'

export type TripStatus = 'created' | 'picked_up' | 'out_for_delivery' | 'completed' | 'cancelled'

export const FAILURE_REASONS = [
  'العميل لا يرد على الهاتف',
  'العميل رفض استلام الطلب',
  'العنوان غير صحيح أو غير موجود',
  'هاتف العميل مغلق',
  'العميل طلب الإلغاء',
  'سبب آخر',
] as const

export type FailureReason = (typeof FAILURE_REASONS)[number]

export interface DeliveryOutcome {
  id: string
  order_id: string
  trip_id?: string
  assignment_id?: string
  outcome: 'delivered' | 'failed'
  failure_reason?: string
  expected_amount: number
  collected_amount: number
  recorded_by: string
  created_at: string
}

export interface Driver {
  id: string
  name: string
  phone?: string
  is_active: boolean
  status: DriverStatus
  created_at: string
  updated_at: string
  active_shift_id?: string
  current_order_id?: string
  assigned_orders_count?: number
}

export interface DriverShift {
  id: string
  driver_id: string
  started_at: string
  ended_at?: string
  status: ShiftStatus
  created_at: string
}

export interface OrderDriverAssignment {
  id: string
  order_id: string
  driver_id: string
  shift_id: string
  trip_id?: string
  status: AssignmentStatus
  assigned_at: string
  accepted_at?: string
  picked_up_at?: string
  completed_at?: string
  cancelled_at?: string
  created_at: string
  drivers?: {
    name: string
    phone?: string
  }
}

export interface DeliveryTrip {
  id: string
  trip_number: number
  driver_id: string
  shift_id: string
  status: TripStatus
  expected_amount?: number
  collected_amount?: number
  collection_status?: 'pending' | 'collected' | 'partially_collected' | 'not_collected'
  dispatched_at?: string
  completed_at?: string
  created_at: string
  drivers?: {
    name: string
    phone?: string
  }
  assignments?: OrderDriverAssignment[]
}
