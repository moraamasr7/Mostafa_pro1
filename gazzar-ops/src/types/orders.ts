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

  if (orderType === 'takeaway') {
    const driverStates: OrderStatus[] = ['assigned', 'picked_up', 'out_for_delivery', 'delivered']
    if (driverStates.includes(newStatus)) {
      return false
    }
  }

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
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/20',
  },
  processing: {
    label: 'جاري التحضير',
    icon: '🔥',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/20',
  },
  ready: {
    label: 'جاهز بالفرع',
    icon: '📦',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/20',
  },
  assigned: {
    label: 'تم تعيين الطيار',
    icon: '🛵',
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/10',
    borderColor: 'border-indigo-500/20',
  },
  picked_up: {
    label: 'تم استلام الطيار',
    icon: '🎒',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
    borderColor: 'border-cyan-500/20',
  },
  out_for_delivery: {
    label: 'في الطريق للعميل',
    icon: '🚚',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/20',
  },
  delivered: {
    label: 'تم التوصيل للعميل',
    icon: '🎉',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/20',
  },
  completed: {
    label: 'تم الاستلام بالفرع',
    icon: '✅',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/20',
  },
  cancelled: {
    label: 'تم الإلغاء',
    icon: '❌',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/20',
  },
}
