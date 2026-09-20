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
import { getStaffSession, ADMIN_COOKIE_NAME } from '../src/lib/staffAuth'

const supabase = getSupabaseServerClient()

async function main() {
  console.log('Querying all daily_shifts...')
  const { data: allShifts, error: allErr } = await supabase
    .from('daily_shifts')
    .select('*')
    .order('opened_at', { ascending: false })

  console.log('Total shifts in DB:', allShifts?.length, 'error:', allErr)
  console.log('Shifts overview:', allShifts?.map(s => ({
    id: s.id,
    shift_number: s.shift_number,
    status: s.status,
    opened_by: s.opened_by,
    opened_at: s.opened_at,
    closed_at: s.closed_at
  })))

  console.log('\nQuerying .eq("status", "open").maybeSingle()...')
  const { data: maybeSingleData, error: maybeSingleErr } = await supabase
    .from('daily_shifts')
    .select('*')
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
    .maybeSingle()

  console.log('maybeSingle data:', maybeSingleData ? { id: maybeSingleData.id, shift_number: maybeSingleData.shift_number, status: maybeSingleData.status } : null)
  console.log('maybeSingle error:', maybeSingleErr)

  console.log('\nChecking staff_profiles...')
  const { data: staff, error: staffErr } = await supabase
    .from('staff_profiles')
    .select('*')

  console.log('Staff profiles:', staff, 'error:', staffErr)
}

main().catch(console.error)
