import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

// Load .env.local manually
const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx > 0) {
      const key = trimmed.substring(0, idx).trim()
      const val = trimmed.substring(idx + 1).trim().replace(/^['"]|['"]$/g, '')
      process.env[key] = val
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || ''

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function inspectAndReset() {
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
