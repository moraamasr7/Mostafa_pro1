import fs from 'fs'
import path from 'path'

const envPath = path.resolve(__dirname, '../.env.local')
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((l) => {
    const t = l.trim()
    if (t && !t.startsWith('#')) {
      const idx = t.indexOf('=')
      if (idx > 0) process.env[t.slice(0, idx).trim()] = t.slice(idx + 1).trim()
    }
  })
}

import { getSupabaseServerClient } from '../src/lib/supabaseServer'

const supabase = getSupabaseServerClient()

async function getCount(table: string): Promise<number> {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true })
  if (error) throw new Error(`Error getting count for ${table}: ${error.message}`)
  return count ?? 0
}

async function clearTableByIds(tableName: string): Promise<number> {
  const { data: rows, error: selectErr } = await supabase.from(tableName).select('id')
  if (selectErr) throw new Error(`Error selecting IDs from ${tableName}: ${selectErr.message}`)
  if (!rows || rows.length === 0) return 0

  const ids = rows.map((r: any) => r.id)
  const chunkSize = 40
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    const { error } = await supabase.from(tableName).delete().in('id', chunk)
    if (error) throw new Error(`Failed deleting chunk from ${tableName}: ${error.message}`)
  }
  return ids.length
}

async function performFullOperationalTestReset() {
  console.log('====================================================')
  console.log('🧹 EXECUTING FULL OPERATIONAL TEST RESET')
  console.log('Timestamp:', new Date().toISOString())
  console.log('Database URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
  console.log('====================================================\n')

  // 1. Initial Snapshot / Counts Before
  const beforeCounts = {
    order_items: await getCount('order_items'),
    delivery_outcomes: await getCount('delivery_outcomes'),
    order_driver_assignments: await getCount('order_driver_assignments'),
    delivery_trips: await getCount('delivery_trips'),
    orders: await getCount('orders'),
    shift_expenses: await getCount('shift_expenses'),
    driver_shifts: await getCount('driver_shifts'),
    reservations: await getCount('reservations'),
    daily_shifts: await getCount('daily_shifts'),
    // Master data
    categories: await getCount('categories'),
    menu_items: await getCount('menu_items'),
    item_variants: await getCount('item_variants'),
    restaurant_policies: await getCount('restaurant_policies'),
    restaurant_operating_hours: await getCount('restaurant_operating_hours'),
    staff_profiles: await getCount('staff_profiles'),
    drivers: await getCount('drivers'),
  }

  console.log('--- BEFORE RESET COUNTS ---')
  console.log(JSON.stringify(beforeCounts, null, 2))

  // 2. Sequential Deletion in Strict Dependency Order
  console.log('\n--- EXECUTING DELETION IN STRICT DEPENDENCY ORDER ---')

  // Step 2.1: order_items
  const delOrderItems = await clearTableByIds('order_items')
  console.log(`1. Deleted order_items: ${delOrderItems}`)

  // Step 2.2: delivery_outcomes
  const delOutcomes = await clearTableByIds('delivery_outcomes')
  console.log(`2. Deleted delivery_outcomes: ${delOutcomes}`)

  // Step 2.3: order_driver_assignments
  const delAssignments = await clearTableByIds('order_driver_assignments')
  console.log(`3. Deleted order_driver_assignments: ${delAssignments}`)

  // Step 2.4: delivery_trips
  const delTrips = await clearTableByIds('delivery_trips')
  console.log(`4. Deleted delivery_trips: ${delTrips}`)

  // Step 2.5: orders
  const delOrders = await clearTableByIds('orders')
  console.log(`5. Deleted orders: ${delOrders}`)

  // Step 2.6: shift_expenses
  const delExpenses = await clearTableByIds('shift_expenses')
  console.log(`6. Deleted shift_expenses: ${delExpenses}`)

  // Step 2.7: driver_shifts
  const delDriverShifts = await clearTableByIds('driver_shifts')
  console.log(`7. Deleted driver_shifts: ${delDriverShifts}`)

  // Step 2.8: reservations
  const delReservations = await clearTableByIds('reservations')
  console.log(`8. Deleted reservations: ${delReservations}`)

  // Step 2.9: daily_shifts
  const delDailyShifts = await clearTableByIds('daily_shifts')
  console.log(`9. Deleted daily_shifts: ${delDailyShifts}`)

  // Step 2.10: Reset drivers operational status to offline
  console.log('10. Resetting drivers operational status to offline...')
  const { error: errDriverStatus } = await supabase.from('drivers').update({ status: 'offline' }).neq('id', '00000000-0000-0000-0000-000000000000')
  if (errDriverStatus) throw new Error(`Failed resetting drivers status: ${errDriverStatus.message}`)

  // 3. Verification / Counts After
  console.log('\n--- VERIFYING POST-RESET STATE ---')
  const afterCounts = {
    order_items: await getCount('order_items'),
    delivery_outcomes: await getCount('delivery_outcomes'),
    order_driver_assignments: await getCount('order_driver_assignments'),
    delivery_trips: await getCount('delivery_trips'),
    orders: await getCount('orders'),
    shift_expenses: await getCount('shift_expenses'),
    driver_shifts: await getCount('driver_shifts'),
    reservations: await getCount('reservations'),
    daily_shifts: await getCount('daily_shifts'),
    // Master data
    categories: await getCount('categories'),
    menu_items: await getCount('menu_items'),
    item_variants: await getCount('item_variants'),
    restaurant_policies: await getCount('restaurant_policies'),
    restaurant_operating_hours: await getCount('restaurant_operating_hours'),
    staff_profiles: await getCount('staff_profiles'),
    drivers: await getCount('drivers'),
  }

  console.log(JSON.stringify(afterCounts, null, 2))

  // 4. Invariant Assertions
  console.log('\n--- ASSERTING INVARIANTS ---')
  if (afterCounts.daily_shifts !== 0) throw new Error('Assertion Failed: daily_shifts is not 0')
  if (afterCounts.orders !== 0) throw new Error('Assertion Failed: orders is not 0')
  if (afterCounts.order_items !== 0) throw new Error('Assertion Failed: order_items is not 0')
  if (afterCounts.driver_shifts !== 0) throw new Error('Assertion Failed: driver_shifts is not 0')
  if (afterCounts.delivery_trips !== 0) throw new Error('Assertion Failed: delivery_trips is not 0')
  if (afterCounts.order_driver_assignments !== 0) throw new Error('Assertion Failed: order_driver_assignments is not 0')
  if (afterCounts.delivery_outcomes !== 0) throw new Error('Assertion Failed: delivery_outcomes is not 0')
  if (afterCounts.shift_expenses !== 0) throw new Error('Assertion Failed: shift_expenses is not 0')
  if (afterCounts.reservations !== 0) throw new Error('Assertion Failed: reservations is not 0')

  if (afterCounts.categories !== beforeCounts.categories) throw new Error('Assertion Failed: categories modified!')
  if (afterCounts.menu_items !== beforeCounts.menu_items) throw new Error('Assertion Failed: menu_items modified!')
  if (afterCounts.item_variants !== beforeCounts.item_variants) throw new Error('Assertion Failed: item_variants modified!')
  if (afterCounts.restaurant_policies !== beforeCounts.restaurant_policies) throw new Error('Assertion Failed: restaurant_policies modified!')
  if (afterCounts.restaurant_operating_hours !== beforeCounts.restaurant_operating_hours) throw new Error('Assertion Failed: restaurant_operating_hours modified!')
  if (afterCounts.staff_profiles !== beforeCounts.staff_profiles) throw new Error('Assertion Failed: staff_profiles modified!')
  if (afterCounts.drivers !== beforeCounts.drivers) throw new Error('Assertion Failed: drivers master count modified!')

  console.log('✅ ALL INVARIANTS SATISFIED: CLEAN BASELINE READY!')
}

performFullOperationalTestReset().catch(console.error)
