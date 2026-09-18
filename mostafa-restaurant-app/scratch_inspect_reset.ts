import dotenv from 'dotenv'
import path from 'path'
import { getSupabaseServerClient } from './src/lib/supabaseServer'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function inspectAndReset() {
  const supabase = getSupabaseServerClient()

  console.log('--- 1. AUDITING CURRENT TRANSACTIONAL COUNTS ---')
  
  const [
    expensesRes,
    orderItemsRes,
    orderHistoryRes,
    assignmentsRes,
    outcomesRes,
    tripsRes,
    ordersRes,
    driverShiftsRes,
    dailyShiftsRes,
    driversRes,
    staffRes,
    menuItemsRes,
    categoriesRes
  ] = await Promise.all([
    supabase.from('shift_expenses').select('id', { count: 'exact', head: true }),
    supabase.from('order_items').select('id', { count: 'exact', head: true }),
    supabase.from('order_status_history').select('id', { count: 'exact', head: true }),
    supabase.from('order_driver_assignments').select('id', { count: 'exact', head: true }),
    supabase.from('delivery_outcomes').select('id', { count: 'exact', head: true }),
    supabase.from('delivery_trips').select('id', { count: 'exact', head: true }),
    supabase.from('orders').select('id', { count: 'exact', head: true }),
    supabase.from('driver_shifts').select('id', { count: 'exact', head: true }),
    supabase.from('daily_shifts').select('id', { count: 'exact', head: true }),
    supabase.from('drivers').select('id', { count: 'exact', head: true }),
    supabase.from('staff_members').select('id', { count: 'exact', head: true }),
    supabase.from('menu_items').select('id', { count: 'exact', head: true }),
    supabase.from('categories').select('id', { count: 'exact', head: true }),
  ])

  console.log('Transactional Data to Clean:')
  console.log(`- shift_expenses: ${expensesRes.count}`)
  console.log(`- order_items: ${orderItemsRes.count}`)
  console.log(`- order_status_history: ${orderHistoryRes.count}`)
  console.log(`- order_driver_assignments: ${assignmentsRes.count}`)
  console.log(`- delivery_outcomes: ${outcomesRes.count}`)
  console.log(`- delivery_trips: ${tripsRes.count}`)
  console.log(`- orders: ${ordersRes.count}`)
  console.log(`- driver_shifts: ${driverShiftsRes.count}`)
  console.log(`- daily_shifts: ${dailyShiftsRes.count}`)

  console.log('\nMaster Data to PRESERVE:')
  console.log(`- staff_members: ${staffRes.count} (PRESERVED)`)
  console.log(`- drivers: ${driversRes.count} (PRESERVED - will reset status to offline)`)
  console.log(`- menu_items: ${menuItemsRes.count} (PRESERVED)`)
  console.log(`- categories: ${categoriesRes.count} (PRESERVED)`)
}

inspectAndReset()
