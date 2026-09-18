import { SupabaseClient } from '@supabase/supabase-js'
import { calculateDailyShiftAccounting, DailyShiftFinancialSummary } from './dailyShiftAccounting'
import { DriverShiftAccountingSummary } from './driverAccounting'

export type ReconciliationStatus = 'balanced' | 'surplus' | 'deficit' | 'pending_shift_close' | 'closed_without_cash_count'

export interface FinalDailyReportPayload {
  metadata: {
    generated_at: string
    source_of_truth: 'Supabase PostgreSQL Database'
    layer_type: 'Presentation / Reporting Layer'
    is_financial_source_of_truth: false
  }
  shift: {
    id: string
    shift_number: number
    status: 'open' | 'closed'
    opened_by: string
    closed_by: string | null
    opened_at: string
    closed_at: string | null
    notes: string | null
  }
  financial_summary: {
    total_sales: number
    cash_sales: number
    instapay_sales: number
    wallet_sales: number
    other_electronic_sales: number
    non_cash_sales: number
  }
  cash_reconciliation: {
    initial_cash: number
    cash_sales_settled: number
    total_expenses: number
    expected_cash_in_drawer: number
    actual_cash_in_drawer: number | null
    discrepancy: number | null
    reconciliation_status: ReconciliationStatus
  }
  cash_custody: {
    settled_to_cashier: number
    driver_custody_cash: number
    uncollected_cash: number
  }
  expenses_summary: {
    total_expenses: number
    general_expenses: number
    driver_advances: number
    staff_advances: number
  }
  orders_summary: {
    total_orders_count: number
    completed_orders_count: number
    average_order_value: number
    delivery_sales: number
    delivery_orders_count: number
    takeaway_sales: number
    takeaway_orders_count: number
    cancelled_orders_count: number
    cancelled_amount: number
    failed_orders_count: number
  }
  fleet_summary: {
    active_drivers_count: number
    delivery_trips_count: number
    hourly_rate: number
    total_hours: number
    total_hours_wage: number
    total_delivered_orders: number
    total_delivery_commissions: number
    total_driver_advances: number
    total_net_payout: number
    driver_details: Array<{
      driver_id: string
      driver_name: string
      duration_hours: number
      hours_wage: number
      delivered_orders_count: number
      delivery_commission_total: number
      advances_total: number
      net_payout: number
    }>
  }
}

/**
 * Builds the Final Daily Report Presentation Payload strictly from the canonical accounting engine.
 * 
 * Rules:
 * 1. Supabase/PostgreSQL is the single Source of Truth.
 * 2. This module performs 0 financial calculations on its own; it aggregates and structures
 *    the outputs from `calculateDailyShiftAccounting`.
 * 3. Human-friendly IDs (shift_number) and backend UUIDs (shift_id, driver_id) are clearly separated.
 */
export async function buildFinalDailyReport(
  supabase: SupabaseClient,
  shiftId: string
): Promise<FinalDailyReportPayload> {
  // 1. Fetch canonical accounting numbers from single Source of Truth
  const accounting: DailyShiftFinancialSummary = await calculateDailyShiftAccounting(supabase, shiftId)

  // 2. Determine cash reconciliation status
  let reconciliationStatus: ReconciliationStatus = 'pending_shift_close'
  if (accounting.status === 'closed') {
    if (accounting.discrepancy !== null) {
      if (accounting.discrepancy === 0) {
        reconciliationStatus = 'balanced'
      } else if (accounting.discrepancy > 0) {
        reconciliationStatus = 'surplus'
      } else {
        reconciliationStatus = 'deficit'
      }
    } else {
      reconciliationStatus = 'closed_without_cash_count'
    }
  }

  // 3. Extract fleet driver details
  const driverDetails = (accounting.fleet_accounting?.driver_summaries || []).map((ds: DriverShiftAccountingSummary) => ({
    driver_id: ds.driver_id,
    driver_name: ds.driver_name,
    duration_hours: ds.accounting.duration_hours,
    hours_wage: ds.accounting.hours_wage,
    delivered_orders_count: ds.accounting.delivered_orders_count,
    delivery_commission_total: ds.accounting.delivery_commission_total,
    advances_total: ds.accounting.advances_total,
    net_payout: ds.accounting.net_payout,
  }))

  const nonCashSales = Math.round((accounting.instapay_sales + accounting.wallet_sales + accounting.other_electronic_sales) * 100) / 100
  const avgOrderValue = accounting.completed_orders_count > 0 
    ? Math.round((accounting.total_sales / accounting.completed_orders_count) * 100) / 100 
    : 0

  return {
    metadata: {
      generated_at: new Date().toISOString(),
      source_of_truth: 'Supabase PostgreSQL Database',
      layer_type: 'Presentation / Reporting Layer',
      is_financial_source_of_truth: false,
    },
    shift: {
      id: accounting.shift_id,
      shift_number: accounting.shift_number,
      status: accounting.status,
      opened_by: accounting.opened_by,
      closed_by: accounting.closed_by,
      opened_at: accounting.opened_at,
      closed_at: accounting.closed_at,
      notes: accounting.notes,
    },
    financial_summary: {
      total_sales: accounting.total_sales,
      cash_sales: accounting.cash_sales,
      instapay_sales: accounting.instapay_sales,
      wallet_sales: accounting.wallet_sales,
      other_electronic_sales: accounting.other_electronic_sales,
      non_cash_sales: nonCashSales,
    },
    cash_reconciliation: {
      initial_cash: accounting.initial_cash,
      cash_sales_settled: accounting.cash_sales,
      total_expenses: accounting.total_expenses,
      expected_cash_in_drawer: accounting.system_expected_cash,
      actual_cash_in_drawer: accounting.final_cash,
      discrepancy: accounting.discrepancy,
      reconciliation_status: reconciliationStatus,
    },
    cash_custody: {
      settled_to_cashier: accounting.cash_sales,
      driver_custody_cash: accounting.driver_custody_cash,
      uncollected_cash: accounting.uncollected_cash,
    },
    expenses_summary: {
      total_expenses: accounting.total_expenses,
      general_expenses: accounting.general_expenses,
      driver_advances: accounting.driver_advances,
      staff_advances: accounting.staff_advances,
    },
    orders_summary: {
      total_orders_count: accounting.total_orders_count,
      completed_orders_count: accounting.completed_orders_count,
      average_order_value: avgOrderValue,
      delivery_sales: accounting.delivery_sales,
      delivery_orders_count: accounting.delivery_orders_count,
      takeaway_sales: accounting.takeaway_sales,
      takeaway_orders_count: accounting.takeaway_orders_count,
      cancelled_orders_count: accounting.cancelled_orders_count,
      cancelled_amount: accounting.cancelled_amount,
      failed_orders_count: accounting.failed_orders_count,
    },
    fleet_summary: {
      active_drivers_count: accounting.active_drivers_count,
      delivery_trips_count: accounting.delivery_trips_count,
      hourly_rate: accounting.fleet_accounting?.hourly_rate || 20.0,
      total_hours: accounting.fleet_accounting?.total_hours || 0,
      total_hours_wage: accounting.fleet_accounting?.total_hours_wage || 0,
      total_delivered_orders: accounting.fleet_accounting?.total_delivered_orders || 0,
      total_delivery_commissions: accounting.fleet_accounting?.total_delivery_commissions || 0,
      total_driver_advances: accounting.fleet_accounting?.total_driver_advances || 0,
      total_net_payout: accounting.fleet_accounting?.total_net_payout || 0,
      driver_details: driverDetails,
    },
  }
}
