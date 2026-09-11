import { SupabaseClient } from '@supabase/supabase-js'
import { DriverShiftAccounting, ShiftStatus } from '@/types/drivers'

export interface DriverShiftAccountingSummary {
  driver_id: string
  driver_name: string
  accounting: DriverShiftAccounting
}

export interface FleetDriversAccountingResult {
  hourly_rate: number
  drivers_count: number
  total_hours: number
  total_hours_wage: number
  total_delivered_orders: number
  total_delivery_commissions: number
  total_driver_advances: number
  total_net_payout: number
  driver_summaries: DriverShiftAccountingSummary[]
}

/**
 * Single source of truth calculation for driver accounting within a daily shift or specific driver shift.
 * Guaranteed to match between /drivers UI, /api/admin/drivers, and /api/admin/daily-report.
 */
export async function calculateFleetDriversAccounting(
  supabase: SupabaseClient,
  dailyShiftId: string,
  dailyShiftOpenedAt: string,
  dailyShiftClosedAt?: string | null
): Promise<FleetDriversAccountingResult> {
  const endTime = dailyShiftClosedAt || new Date().toISOString()
  const nowTime = new Date().getTime()

  // 1. Fetch policy for driver hourly rate (fallback 20.0 EGP)
  const { data: policiesData } = await supabase
    .from('restaurant_policies')
    .select('key, value')

  let hourlyRate = 20.0
  if (policiesData) {
    const ratePolicy = policiesData.find((p) => p.key === 'driver_hourly_rate')
    if (ratePolicy && !isNaN(Number(ratePolicy.value))) {
      hourlyRate = Number(ratePolicy.value)
    }
  }

  // 2. Fetch all drivers with their shifts and order assignments
  const { data: drivers } = await supabase
    .from('drivers')
    .select(`
      id,
      name,
      driver_shifts (
        id,
        started_at,
        ended_at,
        status
      ),
      order_driver_assignments (
        id,
        order_id,
        shift_id,
        status,
        orders (
          id,
          order_number,
          status,
          delivery_fee,
          failure_reason,
          cancellation_reason
        )
      )
    `)
    .order('name', { ascending: true })

  // 3. Fetch advances for this daily shift
  const { data: expensesData } = await supabase
    .from('shift_expenses')
    .select('id, amount, description, recipient_name, created_at')
    .eq('shift_id', dailyShiftId)
    .eq('category', 'سلف طيارين')

  const advancesList = (expensesData || []).map((e) => ({
    id: e.id,
    amount: Number(e.amount || 0),
    description: e.description || '',
    recipient_name: e.recipient_name,
    created_at: e.created_at,
  }))

  interface ShiftRow { id: string; started_at: string; ended_at?: string | null; status: string }
  interface OrderInAssignment {
    id: string
    order_number: number
    status: string
    delivery_fee?: number | null
    failure_reason?: string | null
    cancellation_reason?: string | null
  }
  interface AssignmentRow {
    id: string
    order_id: string
    shift_id?: string | null
    status: string
    orders?: OrderInAssignment | null
  }
  interface DriverQueryRow {
    id: string
    name: string
    driver_shifts?: ShiftRow[]
    order_driver_assignments?: AssignmentRow[]
  }

  const summaries: DriverShiftAccountingSummary[] = []
  let totalHours = 0
  let totalHoursWage = 0
  let totalDeliveredOrders = 0
  let totalCommissions = 0
  let totalAdvances = 0
  let totalNetPayout = 0

  for (const d of ((drivers as unknown as DriverQueryRow[]) || [])) {
    const allShifts = d.driver_shifts || []
    // Find open shift or shifts within this daily shift window
    let currentShift = allShifts.find((s) => s.status === 'open')
    if (!currentShift) {
      const dailyShiftsForDriver = allShifts
        .filter((s) => s.started_at >= dailyShiftOpenedAt && s.started_at <= endTime)
        .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
      if (dailyShiftsForDriver.length > 0) {
        currentShift = dailyShiftsForDriver[0]
      }
    }

    if (!currentShift) continue

    const startTimeMs = new Date(currentShift.started_at).getTime()
    const shiftEndMs = currentShift.ended_at ? new Date(currentShift.ended_at).getTime() : nowTime
    const durationHours = Math.max(0, (shiftEndMs - startTimeMs) / (1000 * 60 * 60))
    const roundedHours = Math.round(durationHours * 100) / 100
    const hoursWage = Math.round(roundedHours * hourlyRate * 100) / 100

    const shiftAssignments = (d.order_driver_assignments || []).filter((a) => a.shift_id === currentShift!.id)

    let deliveredCount = 0
    let commissionTotal = 0
    const failedOrCancelled: Array<{ order_number: number; status: string; reason: string }> = []

    shiftAssignments.forEach((a) => {
      const ord = a.orders
      if (ord) {
        if (a.status === 'delivered' || ord.status === 'delivered' || ord.status === 'completed') {
          deliveredCount += 1
          const fee = Number(ord.delivery_fee || 0)
          commissionTotal += fee
        } else if (a.status === 'failed' || a.status === 'cancelled' || ord.status === 'failed' || ord.status === 'cancelled') {
          failedOrCancelled.push({
            order_number: ord.order_number,
            status: ord.status || a.status,
            reason: ord.failure_reason || ord.cancellation_reason || 'غير محدد',
          })
        }
      }
    })

    const driverNameLower = d.name.trim().toLowerCase()
    const matchedAdvances = advancesList.filter((adv) => {
      if (!adv.recipient_name) return false
      const recLower = adv.recipient_name.trim().toLowerCase()
      return recLower === driverNameLower || recLower.includes(driverNameLower) || driverNameLower.includes(recLower)
    })

    const advancesTotal = matchedAdvances.reduce((acc, curr) => acc + curr.amount, 0)
    const netPayout = Math.round((hoursWage + commissionTotal - advancesTotal) * 100) / 100

    const accounting: DriverShiftAccounting = {
      shift_id: currentShift.id,
      shift_status: currentShift.status as ShiftStatus,
      started_at: currentShift.started_at,
      ended_at: currentShift.ended_at || null,
      duration_hours: roundedHours,
      hourly_rate: hourlyRate,
      hours_wage: hoursWage,
      delivered_orders_count: deliveredCount,
      delivery_commission_total: commissionTotal,
      failed_or_cancelled_orders: failedOrCancelled,
      advances_total: advancesTotal,
      advances_list: matchedAdvances.map((adv) => ({
        id: adv.id,
        amount: adv.amount,
        description: adv.description,
        created_at: adv.created_at,
      })),
      net_payout: netPayout,
    }

    summaries.push({
      driver_id: d.id,
      driver_name: d.name,
      accounting,
    })

    totalHours += roundedHours
    totalHoursWage += hoursWage
    totalDeliveredOrders += deliveredCount
    totalCommissions += commissionTotal
    totalAdvances += advancesTotal
    totalNetPayout += netPayout
  }

  return {
    hourly_rate: hourlyRate,
    drivers_count: summaries.length,
    total_hours: Math.round(totalHours * 100) / 100,
    total_hours_wage: Math.round(totalHoursWage * 100) / 100,
    total_delivered_orders: totalDeliveredOrders,
    total_delivery_commissions: Math.round(totalCommissions * 100) / 100,
    total_driver_advances: Math.round(totalAdvances * 100) / 100,
    total_net_payout: Math.round(totalNetPayout * 100) / 100,
    driver_summaries: summaries,
  }
}
