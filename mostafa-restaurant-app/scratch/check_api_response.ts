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
import { calculateDailyShiftAccounting } from '../src/lib/dailyShiftAccounting'

const serverSupabase = getSupabaseServerClient()

async function testDailyShiftGet(cookieVal?: string) {
  console.log('--- Testing with cookie:', cookieVal || '(none)', '---')
  const cookieStore = {
    get: (name: string) => (name === ADMIN_COOKIE_NAME && cookieVal ? { value: cookieVal } : undefined),
  }

  const { staff: currentStaff, error: authErr, status: authStatus } = await getStaffSession(serverSupabase, cookieStore)
  if (authErr || !currentStaff) {
    console.log('GET /api/admin/daily-shift => Response: status =', authStatus || 401, 'error =', authErr)
    return
  }

  console.log('Auth OK: staff =', currentStaff.full_name, '(', currentStaff.role, ')')

  const { data: activeShift, error: shiftErr } = await serverSupabase
    .from('daily_shifts')
    .select('*')
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
    .maybeSingle()

  if (shiftErr) {
    console.log('shiftErr:', shiftErr)
    return
  }

  if (!activeShift) {
    console.log('No active shift found. hasActiveShift: false')
    return
  }

  const accounting = await calculateDailyShiftAccounting(serverSupabase, activeShift.id)
  console.log('GET /api/admin/daily-shift => Response: status = 200, hasActiveShift = true')
  console.log('Active Shift Info:', {
    id: activeShift.id,
    shift_number: activeShift.shift_number,
    opened_by: activeShift.opened_by,
    totalSales: accounting.total_sales,
    systemExpectedCash: accounting.system_expected_cash,
    driverCustodyCash: accounting.driver_custody_cash,
  })
}

async function main() {
  // Test 1: No cookie
  await testDailyShiftGet(undefined)

  // Test 2: Valid legacy cookie
  await testDailyShiftGet('staff_auth_' + Date.now())

  // Test 3: Valid staff cookie with UUID
  await testDailyShiftGet('staff_auth_a1111111-1111-4111-8111-111111111111_' + Date.now())
}

main().catch(console.error)
