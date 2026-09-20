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

async function auditTables() {
  console.log('--- DATABASE TABLES AUDIT ---')
  console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)

  const candidateTables = [
    'categories',
    'menu_items',
    'item_variants',
    'restaurant_policies',
    'restaurant_operating_hours',
    'restaurant_special_closures',
    'restaurant_schedule_overrides',
    'staff_profiles',
    'drivers',
    'driver_credentials',
    'daily_shifts',
    'orders',
    'order_items',
    'driver_shifts',
    'delivery_trips',
    'order_driver_assignments',
    'delivery_outcomes',
    'shift_expenses',
    'reservations',
    'feedback',
    'notifications',
    'operational_logs',
    'audit_logs'
  ]

  const results: Record<string, { exists: boolean; count: number; error?: string }> = {}

  for (const table of candidateTables) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })

      if (error) {
        results[table] = { exists: false, count: 0, error: error.message }
      } else {
        results[table] = { exists: true, count: count ?? 0 }
      }
    } catch (e: any) {
      results[table] = { exists: false, count: 0, error: e.message }
    }
  }

  console.log(JSON.stringify(results, null, 2))
}

auditTables().catch(console.error)
