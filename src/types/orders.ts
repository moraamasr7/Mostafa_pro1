export type OrderStatus =
  | 'pending'
  | 'processing'
  | 'ready'
  | 'assigned'
  | 'picked_up'
  | 'out_for_delivery'
  | 'delivered'
  | 'completed'
  | 'cancelled'

export type OrderType = 'takeaway' | 'delivery' | 'dine_in'

// القواعد المركزية للانتقالات المسموحة بين حالات الطلبات (Server & Client Source of Truth)
export const ALLOWED_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['processing', 'cancelled'],
  processing: ['ready', 'completed', 'cancelled'],
  ready: ['completed', 'assigned', 'cancelled'],
  assigned: ['picked_up', 'cancelled'],
  picked_up: ['out_for_delivery'],
  out_for_delivery: ['delivered'],
  delivered: [],
  completed: [],
  cancelled: [],
}

export function canTransitionStatus(
  currentStatus: OrderStatus,
  newStatus: OrderStatus,
  orderType: OrderType = 'takeaway'
): boolean {
  const allowedNext = ALLOWED_STATUS_TRANSITIONS[currentStatus] || []
  if (!allowedNext.includes(newStatus)) {
    return false
  }

  // طلبات الاستلام من الفرع (takeaway) لا تمر بحالات الطيارين ولا تنتقل إلى (delivered)
  if (orderType === 'takeaway') {
    const driverStates: OrderStatus[] = ['assigned', 'picked_up', 'out_for_delivery', 'delivered']
    if (driverStates.includes(newStatus)) {
      return false
    }
  }

  // طلبات الدليفري (delivery) تنتقل إلى (delivered) عند الاستلام وليس (completed)
  if (orderType === 'delivery') {
    if (newStatus === 'completed') {
      return false
    }
  }

  return true
}

export interface StatusUIConfig {
  label: string
  icon: string
  color: string
  bgColor: string
  borderColor: string
}

export const STATUS_UI_CONFIG: Record<OrderStatus, StatusUIConfig> = {
  pending: {
    label: 'في انتظار التأكيد',
    icon: '🕐',
    color: 'text-amber-800',
    bgColor: 'bg-amber-100/80',
    borderColor: 'border-amber-300',
  },
  processing: {
    label: 'جاري التحضير',
    icon: '🔥',
    color: 'text-blue-800',
    bgColor: 'bg-blue-100/80',
    borderColor: 'border-blue-300',
  },
  ready: {
    label: 'جاهز بالفرع',
    icon: '📦',
    color: 'text-emerald-800',
    bgColor: 'bg-emerald-100/80',
    borderColor: 'border-emerald-300',
  },
  assigned: {
    label: 'تم تعيين الطيار',
    icon: '🛵',
    color: 'text-indigo-800',
    bgColor: 'bg-indigo-100/80',
    borderColor: 'border-indigo-300',
  },
  picked_up: {
    label: 'تم استلام الطيار',
    icon: '🎒',
    color: 'text-cyan-800',
    bgColor: 'bg-cyan-100/80',
    borderColor: 'border-cyan-300',
  },
  out_for_delivery: {
    label: 'في الطريق للعميل',
    icon: '🚚',
    color: 'text-purple-800',
    bgColor: 'bg-purple-100/80',
    borderColor: 'border-purple-300',
  },
  delivered: {
    label: 'تم التوصيل للعميل',
    icon: '🎉',
    color: 'text-green-800',
    bgColor: 'bg-green-100/80',
    borderColor: 'border-green-300',
  },
  completed: {
    label: 'تم الاستلام بالفرع',
    icon: '✅',
    color: 'text-green-800',
    bgColor: 'bg-green-100/80',
    borderColor: 'border-green-300',
  },
  cancelled: {
    label: 'تم الإلغاء',
    icon: '❌',
    color: 'text-red-800',
    bgColor: 'bg-red-100/80',
    borderColor: 'border-red-300',
  },
}
