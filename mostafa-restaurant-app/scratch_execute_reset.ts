import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

// Load .env.local
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

async function executeCompleteWipe() {
  console.log('--- Checking foreign key references to orders ---')
  const { data: ords } = await supabase.from('orders').select('id')
  console.log('Orders remaining count:', ords?.length)

  // Try deleting from order_status_history if exists
  const { error: oshErr } = await supabase.from('order_status_history').delete().not('id', 'is', null)
  console.log('order_status_history delete:', oshErr?.message || 'ok')

  // Try deleting order_items
  const { error: oiErr } = await supabase.from('order_items').delete().not('id', 'is', null)
  console.log('order_items delete:', oiErr?.message || 'ok')

  // Try deleting order_driver_assignments
  const { error: odaErr } = await supabase.from('order_driver_assignments').delete().not('id', 'is', null)
  console.log('order_driver_assignments delete:', odaErr?.message || 'ok')

  // Try deleting delivery_outcomes
  const { error: outErr } = await supabase.from('delivery_outcomes').delete().not('id', 'is', null)
  console.log('delivery_outcomes delete:', outErr?.message || 'ok')

  // Delete orders
  const { error: ordErr } = await supabase.from('orders').delete().not('id', 'is', null)
  console.log('orders delete:', ordErr?.message || 'ok')

  // Delete delivery_trips
  const { error: dtErr } = await supabase.from('delivery_trips').delete().not('id', 'is', null)
  console.log('delivery_trips delete:', dtErr?.message || 'ok')

  // Delete shift_expenses
  const { error: expErr } = await supabase.from('shift_expenses').delete().not('id', 'is', null)
  console.log('shift_expenses delete:', expErr?.message || 'ok')

  // Delete driver_shifts
  const { error: dsErr } = await supabase.from('driver_shifts').delete().not('id', 'is', null)
  console.log('driver_shifts delete:', dsErr?.message || 'ok')

  // Delete daily_shifts
  const { error: dailyErr } = await supabase.from('daily_shifts').delete().not('id', 'is', null)
  console.log('daily_shifts delete:', dailyErr?.message || 'ok')

  // Reset driver status to offline
  const { error: drvErr } = await supabase.from('drivers').update({ status: 'offline' }).not('id', 'is', null)
  console.log('drivers reset to offline:', drvErr?.message || 'ok')
}

executeCompleteWipe()
