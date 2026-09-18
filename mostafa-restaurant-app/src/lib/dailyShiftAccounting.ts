import { SupabaseClient } from '@supabase/supabase-js'
import { calculateFleetDriversAccounting, FleetDriversAccountingResult } from './driverAccounting'

export interface DailyShiftFinancialSummary {
  shift_id: string
  shift_number: number
  status: 'open' | 'closed'
  opened_by: string
  closed_by: string | null
  opened_at: string
  closed_at: string | null
  initial_cash: number
  final_cash: number | null
  system_expected_cash: number
  discrepancy: number | null
  notes: string | null

  // Sales Breakdown by Payment Method
  total_sales: number
  cash_sales: number // Settled to cashier
  instapay_sales: number
  wallet_sales: number
  other_electronic_sales: number

  // Cash Custody Breakdown
  driver_custody_cash: number // In transit with drivers (collected but not yet settled)
  uncollected_cash: number // Unpaid / pending

  // Sales Breakdown by Order Type
  takeaway_sales: number
  delivery_sales: number

  // Expenses Breakdown
  total_expenses: number
  general_expenses: number
  driver_advances: number
  staff_advances: number

  // Order Counts
  total_orders_count: number
  completed_orders_count: number
  cancelled_orders_count: number
  cancelled_amount: number
  failed_orders_count: number
  delivery_orders_count: number
  takeaway_orders_count: number

  // Fleet & Trips Summary
  delivery_trips_count: number
  active_drivers_count: number
  fleet_accounting: FleetDriversAccountingResult | null
}

/**
 * Single Source of Truth calculation for Daily Shift Financial Reconciliation.
 * Guaranteed to match between /api/admin/daily-shift, /api/admin/daily-report, and UI.
 */
export async function calculateDailyShiftAccounting(
  supabase: SupabaseClient,
  shiftId: string
): Promise<DailyShiftFinancialSummary> {
  // 1. Fetch the daily shift record
  const { data: shift, error: shiftErr } = await supabase
    .from('daily_shifts')
    .select('*')
    .eq('id', shiftId)
    .single()

  if (shiftErr || !shift) {
    throw new Error('الوردية اليومية غير موجودة')
  }

  // 2. Fetch all orders belonging to this daily shift (primary: daily_shift_id, fallback: created_at time range for historical)
  let { data: orders } = await supabase
    .from('orders')
    .select('id, order_number, total_amount, delivery_fee, status, order_type, payment_method, collection_status, daily_shift_id, created_at')
    .eq('daily_shift_id', shift.id)

  // Fallback for legacy shifts that have zero orders linked by daily_shift_id
  if ((!orders || orders.length === 0) && shift.status === 'closed' && shift.closed_at) {
    const { data: fallbackOrders } = await supabase
      .from('orders')
      .select('id, order_number, total_amount, delivery_fee, status, order_type, payment_method, collection_status, daily_shift_id, created_at')
      .gte('created_at', shift.opened_at)
      .lte('created_at', shift.closed_at)
    orders = fallbackOrders || []
  }

  const orderList = orders || []

  // 3. Fetch expenses for this daily shift
  const { data: expensesData } = await supabase
    .from('shift_expenses')
    .select('id, amount, category, description, recipient_name, driver_id, staff_id, created_at')
    .eq('shift_id', shift.id)

  const expensesList = expensesData || []

  // 4. Fetch trips and driver shifts for this daily shift window
  const [tripsRes, driverShiftsRes] = await Promise.all([
    supabase
      .from('delivery_trips')
      .select('id, status, expected_amount, collected_amount, collection_status')
      .gte('created_at', shift.opened_at),
    supabase
      .from('driver_shifts')
      .select('driver_id')
      .gte('started_at', shift.opened_at),
  ])

  const trips = tripsRes.data || []
  const driverShifts = driverShiftsRes.data || []
  const uniqueDrivers = new Set(driverShifts.map((ds) => ds.driver_id))

  // 5. Calculate Sales & Collection Breakdown
  let totalSales = 0
  let cashSales = 0
  let instapaySales = 0
  let walletSales = 0
  let otherElectronicSales = 0
  let driverCustodyCash = 0
  let uncollectedCash = 0
  let takeawaySales = 0
  let deliverySales = 0
  let cancelledAmount = 0

  let completedOrdersCount = 0
  let cancelledOrdersCount = 0
  let failedOrdersCount = 0
  let deliveryOrdersCount = 0
  let takeawayOrdersCount = 0

  for (const o of orderList) {
    const amount = Number(o.total_amount || 0)
    const isCompleted = ['completed', 'delivered'].includes(o.status)
    const method = (o.payment_method || 'cash').toLowerCase().trim()

    if (isCompleted) {
      completedOrdersCount++
      totalSales += amount

      if (method === 'cash') {
        if (o.collection_status === 'settled_to_cashier') {
          cashSales += amount
        } else if (o.collection_status === 'collected') {
          driverCustodyCash += amount
        } else {
          uncollectedCash += amount
        }
      } else if (method === 'instapay') {
        instapaySales += amount
      } else if (method === 'wallet' || method.includes('vodafone') || method.includes('etisalat') || method.includes('orange')) {
        walletSales += amount
      } else {
        otherElectronicSales += amount
      }

      if (o.order_type === 'delivery') {
        deliverySales += amount
        deliveryOrdersCount++
      } else {
        takeawaySales += amount
        takeawayOrdersCount++
      }
    } else if (o.status === 'cancelled') {
      cancelledOrdersCount++
      cancelledAmount += amount
    } else if (o.status === 'failed') {
      failedOrdersCount++
    }
  }

  // 6. Calculate Expenses Breakdown
  let generalExpenses = 0
  let driverAdvances = 0
  let staffAdvances = 0

  for (const e of expensesList) {
    const expAmount = Number(e.amount || 0)
    const cat = (e.category || '').trim()
    if (cat === 'سلف طيارين' || cat === 'driver_advance') {
      driverAdvances += expAmount
    } else if (cat === 'سلف موظفين' || cat === 'staff_advance' || cat === 'مرتبات') {
      staffAdvances += expAmount
    } else {
      generalExpenses += expAmount
    }
  }

  const totalExpenses = generalExpenses + driverAdvances + staffAdvances
  const initialCash = Number(shift.initial_cash || 0)
  const systemExpectedCash = Math.round((initialCash + cashSales - totalExpenses) * 100) / 100
  const actualCash = shift.final_cash !== null ? Number(shift.final_cash) : null
  const discrepancy = actualCash !== null ? Math.round((actualCash - systemExpectedCash) * 100) / 100 : null

  // 7. Calculate Fleet Driver Accounting
  const fleetAccounting = await calculateFleetDriversAccounting(
    supabase,
    shift.id,
    shift.opened_at,
    shift.closed_at
  ).catch(() => null)

  return {
    shift_id: shift.id,
    shift_number: Number(shift.shift_number),
    status: shift.status,
    opened_by: shift.opened_by,
    closed_by: shift.closed_by || null,
    opened_at: shift.opened_at,
    closed_at: shift.closed_at || null,
    initial_cash: initialCash,
    final_cash: actualCash,
    system_expected_cash: systemExpectedCash,
    discrepancy: discrepancy,
    notes: shift.notes || null,

    total_sales: Math.round(totalSales * 100) / 100,
    cash_sales: Math.round(cashSales * 100) / 100,
    instapay_sales: Math.round(instapaySales * 100) / 100,
    wallet_sales: Math.round(walletSales * 100) / 100,
    other_electronic_sales: Math.round(otherElectronicSales * 100) / 100,

    driver_custody_cash: Math.round(driverCustodyCash * 100) / 100,
    uncollected_cash: Math.round(uncollectedCash * 100) / 100,

    takeaway_sales: Math.round(takeawaySales * 100) / 100,
    delivery_sales: Math.round(deliverySales * 100) / 100,

    total_expenses: Math.round(totalExpenses * 100) / 100,
    general_expenses: Math.round(generalExpenses * 100) / 100,
    driver_advances: Math.round(driverAdvances * 100) / 100,
    staff_advances: Math.round(staffAdvances * 100) / 100,

    total_orders_count: orderList.length,
    completed_orders_count: completedOrdersCount,
    cancelled_orders_count: cancelledOrdersCount,
    cancelled_amount: Math.round(cancelledAmount * 100) / 100,
    failed_orders_count: failedOrdersCount,
    delivery_orders_count: deliveryOrdersCount,
    takeaway_orders_count: takeawayOrdersCount,

    delivery_trips_count: trips.length,
    active_drivers_count: uniqueDrivers.size,
    fleet_accounting: fleetAccounting,
  }
}
