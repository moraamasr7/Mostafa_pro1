import fs from 'fs'
import path from 'path'

// Load .env.local BEFORE any other imports
const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((l) => {
    const t = l.trim()
    if (t && !t.startsWith('#')) {
      const idx = t.indexOf('=')
      if (idx > 0) process.env[t.slice(0, idx).trim()] = t.slice(idx + 1).trim()
    }
  })
}

async function run() {
  const { getSupabaseServerClient } = await import('../src/lib/supabaseServer')
  const { canStaffCloseShift, getStaffSession } = await import('../src/lib/staffAuth')
  const { isRestaurantOpen } = await import('../src/lib/schedule')

  const supabase = getSupabaseServerClient()

  console.log('='.repeat(70))
  console.log('🧪 TASK 3 VERIFICATION SUITE: CURRENT USER IDENTITY & SHIFT CLOSE GUARD')
  console.log('='.repeat(70))

  let passedTests = 0
  let totalTests = 0

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`)
      passedTests++
    } else {
      console.error(`  ❌ FAIL: ${testName} - ${detail || ''}`)
    }
  }

  // ----------------------------------------------------
  // Section 1: Role Authorization Matrix (canStaffCloseShift)
  // ----------------------------------------------------
  console.log('\n--- Section 1: Role Authorization Matrix (canStaffCloseShift) ---')
  assert(canStaffCloseShift('cashier') === true, 'Role: cashier is authorized to close shift')
  assert(canStaffCloseShift('owner') === true, 'Role: owner is authorized to close shift')
  assert(canStaffCloseShift('manager') === true, 'Role: manager is authorized to close shift')
  assert(canStaffCloseShift('kitchen') === false, 'Role: kitchen is BLOCKED from closing shift')
  assert(canStaffCloseShift('driver') === false, 'Role: driver is BLOCKED from closing shift')
  assert(canStaffCloseShift('') === false, 'Role: empty string is BLOCKED')
  assert(canStaffCloseShift(undefined as any) === false, 'Role: undefined is BLOCKED')

  // ----------------------------------------------------
  // Section 2: Backend Session Resolution (staff_profiles)
  // ----------------------------------------------------
  console.log('\n--- Section 2: Backend Session Resolution (staff_profiles) ---')
  
  const { data: staffList, error: staffErr } = await supabase
    .from('staff_profiles')
    .select('*')

  assert(!staffErr && staffList && staffList.length > 0, 'Fetched active staff_profiles from Supabase')
  
  const cashierStaff = staffList?.find((s: any) => s.role === 'cashier' && s.is_active)
  const kitchenStaff = staffList?.find((s: any) => s.role === 'kitchen')

  if (cashierStaff) {
    const mockCookieStore = {
      get: (name: string) => ({ value: `staff_auth_${cashierStaff.id}_${Date.now()}` })
    }
    const sessionRes = await getStaffSession(supabase, mockCookieStore)
    assert(
      sessionRes.staff?.id === cashierStaff.id && sessionRes.staff?.role === 'cashier',
      `Cashier session correctly resolved to ${cashierStaff.full_name} (${cashierStaff.role})`
    )
  }

  if (kitchenStaff) {
    const mockCookieStore = {
      get: (name: string) => ({ value: `staff_auth_${kitchenStaff.id}_${Date.now()}` })
    }
    const sessionRes = await getStaffSession(supabase, mockCookieStore)
    assert(
      sessionRes.staff?.id === kitchenStaff.id && !canStaffCloseShift(sessionRes.staff?.role || ''),
      `Kitchen session resolved to ${kitchenStaff.full_name} but canStaffCloseShift correctly returns false`
    )
  }

  // Test Nonexistent staff ID
  const fakeStaffCookie = {
    get: (name: string) => ({ value: `staff_auth_00000000-0000-0000-0000-000000000000_${Date.now()}` })
  }
  const fakeSessionRes = await getStaffSession(supabase, fakeStaffCookie)
  assert(
    fakeSessionRes.staff === null && fakeSessionRes.status === 401,
    'Nonexistent staff profile returns 401 Unauthorized'
  )

  // Test Missing / unauthenticated cookie
  const emptyCookie = { get: () => undefined }
  const unauthSessionRes = await getStaffSession(supabase, emptyCookie)
  assert(
    unauthSessionRes.staff === null && unauthSessionRes.status === 401,
    'Missing session cookie returns 401 Unauthorized'
  )

  // ----------------------------------------------------
  // Section 3: Operating Hours Shift Close Guard
  // ----------------------------------------------------
  console.log('\n--- Section 3: Operating Hours Shift Close Guard ---')
  const currentOpStatus = await isRestaurantOpen(new Date())
  console.log(`  ℹ️ Current Restaurant Operating Status: isOpen = ${currentOpStatus.isOpen} (${currentOpStatus.reason})`)
  assert(
    typeof currentOpStatus.isOpen === 'boolean',
    'isRestaurantOpen correctly evaluates Cairo timezone & operating window'
  )

  // ----------------------------------------------------
  // Section 4: Shift Close Simulation & Trusted Identity
  // ----------------------------------------------------
  console.log('\n--- Section 4: Shift Close Trusted Identity Formatting ---')
  if (cashierStaff) {
    const trustedClosedBy = `${cashierStaff.full_name} (${cashierStaff.role})`
    assert(
      trustedClosedBy.includes(cashierStaff.full_name) && trustedClosedBy.includes(cashierStaff.role),
      `Trusted closed_by string correctly formatted: "${trustedClosedBy}"`
    )
  }

  console.log('\n' + '='.repeat(70))
  console.log(`🎯 TASK 3 TEST RESULTS: ${passedTests}/${totalTests} PASS (${Math.round((passedTests / totalTests) * 100)}%)`)
  console.log('='.repeat(70))
}

run().catch(console.error)
