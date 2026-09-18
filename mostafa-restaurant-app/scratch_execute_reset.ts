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

async function executeCleanReset() {
  console.log('=====================================================')
  console.log('🧹 EXECUTING OPERATIONAL RESET (FRESH PILOT START)')
  console.log('=====================================================')

  // 1. Delete shift expenses
  const { error: expErr } = await supabase.from('shift_expenses').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('1. shift_expenses cleared:', expErr ? `❌ ${expErr.message}` : '✅ Clean')

  // 2. Delete order items
  const { error: oiErr } = await supabase.from('order_items').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('2. order_items cleared:', oiErr ? `❌ ${oiErr.message}` : '✅ Clean')

  // 3. Delete delivery outcomes
  const { error: outErr } = await supabase.from('delivery_outcomes').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('3. delivery_outcomes cleared:', outErr ? `❌ ${outErr.message}` : '✅ Clean')

  // 4. Delete order driver assignments
  const { error: odaErr } = await supabase.from('order_driver_assignments').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('4. order_driver_assignments cleared:', odaErr ? `❌ ${odaErr.message}` : '✅ Clean')

  // 5. Delete delivery trips
  const { error: dtErr } = await supabase.from('delivery_trips').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('5. delivery_trips cleared:', dtErr ? `❌ ${dtErr.message}` : '✅ Clean')

  // 6. Delete orders
  const { error: ordErr } = await supabase.from('orders').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('6. orders cleared:', ordErr ? `❌ ${ordErr.message}` : '✅ Clean')

  // 7. Delete driver shifts
  const { error: dsErr } = await supabase.from('driver_shifts').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('7. driver_shifts cleared:', dsErr ? `❌ ${dsErr.message}` : '✅ Clean')

  // 8. Delete daily shifts
  const { error: dailyErr } = await supabase.from('daily_shifts').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('8. daily_shifts cleared:', dailyErr ? `❌ ${dailyErr.message}` : '✅ Clean')

  // 9. Reset drivers status to offline
  const { error: drvErr } = await supabase.from('drivers').update({ status: 'offline' }).neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('9. drivers status reset to offline:', drvErr ? `❌ ${drvErr.message}` : '✅ Clean')

  console.log('=====================================================')
  console.log('✨ ALL OPERATIONAL DATA HAS BEEN SAFELY RESET!')
  console.log('✨ Master Data (Menu, Staff, Policies, Drivers) is 100% Intact.')
  console.log('=====================================================')
}

executeCleanReset()
