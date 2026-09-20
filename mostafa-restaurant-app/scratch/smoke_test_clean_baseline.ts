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

async function smokeTest() {
  console.log('--- FUNCTIONAL SMOKE TEST (CLEAN BASELINE) ---')

  // 1. Staff Authentication
  const cookieStore = {
    get: (name: string) => (name === ADMIN_COOKIE_NAME ? { value: `staff_auth_${Date.now()}` } : undefined),
  }
  const { staff, error: authErr } = await getStaffSession(supabase, cookieStore)
  if (authErr || !staff) throw new Error(`Auth failed: ${authErr}`)
  console.log('1. Staff Auth Verification: PASS (Logged in as:', staff.full_name, ')')

  // 2. Initial State Verification (Must be NO ACTIVE SHIFT)
  const { data: initialShift } = await supabase
    .from('daily_shifts')
    .select('*')
    .eq('status', 'open')
    .maybeSingle()

  if (initialShift) throw new Error('Initial shift should be null!')
  console.log('2. No Active Shift Invariant: PASS (hasActiveShift = false)')

  console.log('\n--- CLEAN BASELINE VERIFIED & CONFIRMED ---')
}

smokeTest().catch(console.error)
