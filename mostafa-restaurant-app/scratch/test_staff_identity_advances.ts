import fs from 'fs'
import path from 'path'

// Load .env.local
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
import { calculateFleetDriversAccounting } from '../src/lib/driverAccounting'

const supabase = getSupabaseServerClient()

async function runStaffIdentityAdvancesTests() {
  console.log('🚀 [START] Running Comprehensive Staff Identity & Driver Advances Test Suite...\n')
  let passedCount = 0
  let failedCount = 0

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`)
      passedCount++
    } else {
      console.error(`  ❌ FAIL: ${message}`)
      failedCount++
    }
  }

  try {
    // 0. Fetch active daily shift
    const { data: openShifts } = await supabase
      .from('daily_shifts')
      .select('id, shift_number, opened_at')
      .eq('status', 'open')
      .limit(1)

    assert(Boolean(openShifts && openShifts.length > 0), `Found active open daily shift #${openShifts?.[0]?.shift_number}`)
    const activeShift = openShifts![0]

    // 1. Fetch the two drivers with identical names: "علي طيار التوصيل"
    const { data: sameNameDrivers } = await supabase
      .from('drivers')
      .select('id, name, phone')
      .eq('name', 'علي طيار التوصيل')
      .order('created_at', { ascending: true })

    assert(Boolean(sameNameDrivers && sameNameDrivers.length >= 2), 'Found at least 2 drivers with the exact same name ("علي طيار التوصيل")')
    const driverA = sameNameDrivers![0]
    const driverB = sameNameDrivers![1]

    console.log(`  ℹ️ Driver A: ID=${driverA.id}, Phone=${driverA.phone}`)
    console.log(`  ℹ️ Driver B: ID=${driverB.id}, Phone=${driverB.phone}`)

    // Ensure shifts are open for both drivers on this daily shift
    await supabase.rpc('start_driver_shift_secure', { p_driver_id: driverA.id })
    await supabase.rpc('start_driver_shift_secure', { p_driver_id: driverB.id })

    // Clean up any test advances for this shift to start clean
    await supabase
      .from('shift_expenses')
      .delete()
      .eq('shift_id', activeShift.id)
      .eq('description', 'TEST_ADVANCE_ISOLATION')

    // ==========================================
    // TEST 1: Driver Advance with driver_id for Driver A
    // ==========================================
    console.log('\n--- TEST 1: Driver Advance with driver_id for Driver A ---')
    const { data: expA, error: expAErr } = await supabase
      .from('shift_expenses')
      .insert({
        shift_id: activeShift.id,
        category: 'سلف طيارين',
        amount: 175.0,
        description: 'TEST_ADVANCE_ISOLATION',
        recipient_name: driverA.name,
        driver_id: driverA.id,
        recorded_by: 'كاشير التجربة',
      })
      .select('*')
      .single()

    assert(!expAErr && Boolean(expA?.id), 'Inserted 175.00 EGP advance linked to Driver A driver_id')

    // Run fleet accounting calculation
    let fleetResult = await calculateFleetDriversAccounting(supabase, activeShift.id, activeShift.opened_at)
    let summaryA = fleetResult.driver_summaries.find((s) => s.driver_id === driverA.id)
    let summaryB = fleetResult.driver_summaries.find((s) => s.driver_id === driverB.id)

    assert(summaryA?.accounting.advances_total === 175.0, 'Driver A accounting accurately reflects 175.00 EGP advance')
    assert(summaryB?.accounting.advances_total === 0.0, 'Driver B accounting has STRICT ZERO advance (No leakage despite identical name)')

    // ==========================================
    // TEST 2: Driver Advance with driver_id for Driver B
    // ==========================================
    console.log('\n--- TEST 2: Driver Advance with driver_id for Driver B ---')
    const { data: expB, error: expBErr } = await supabase
      .from('shift_expenses')
      .insert({
        shift_id: activeShift.id,
        category: 'سلف طيارين',
        amount: 320.0,
        description: 'TEST_ADVANCE_ISOLATION',
        recipient_name: driverB.name,
        driver_id: driverB.id,
        recorded_by: 'كاشير التجربة',
      })
      .select('*')
      .single()

    assert(!expBErr && Boolean(expB?.id), 'Inserted 320.00 EGP advance linked to Driver B driver_id')

    fleetResult = await calculateFleetDriversAccounting(supabase, activeShift.id, activeShift.opened_at)
    summaryA = fleetResult.driver_summaries.find((s) => s.driver_id === driverA.id)
    summaryB = fleetResult.driver_summaries.find((s) => s.driver_id === driverB.id)

    assert(summaryA?.accounting.advances_total === 175.0, 'Driver A accounting remains strictly 175.00 EGP')
    assert(summaryB?.accounting.advances_total === 320.0, 'Driver B accounting remains strictly 320.00 EGP')
    assert(fleetResult.total_driver_advances >= 495.0, 'Total fleet driver advances accurately aggregates sum (175 + 320 = 495)')

    // ==========================================
    // TEST 3: Historical Record with driver_id = NULL (Fallback Verification)
    // ==========================================
    console.log('\n--- TEST 3: Historical Record with driver_id = NULL (Fallback Verification) ---')
    // We test a distinct driver name e.g. "amr"
    const { data: distinctDriver } = await supabase
      .from('drivers')
      .select('id, name')
      .eq('name', 'amr')
      .single()

    if (distinctDriver) {
      await supabase.rpc('start_driver_shift_secure', { p_driver_id: distinctDriver.id })

      const { data: expHist, error: expHistErr } = await supabase
        .from('shift_expenses')
        .insert({
          shift_id: activeShift.id,
          category: 'سلف طيارين',
          amount: 50.0,
          description: 'TEST_ADVANCE_ISOLATION',
          recipient_name: distinctDriver.name,
          driver_id: null, // Legacy record simulation
          recorded_by: 'كاشير قديم',
        })
        .select('*')
        .single()

      assert(!expHistErr && Boolean(expHist?.id), 'Inserted legacy historical advance with driver_id = NULL')

      fleetResult = await calculateFleetDriversAccounting(supabase, activeShift.id, activeShift.opened_at)
      const summaryAmr = fleetResult.driver_summaries.find((s) => s.driver_id === distinctDriver.id)

      assert(summaryAmr?.accounting.advances_total === 50.0, 'Historical advance with driver_id = NULL resolves via fallback to "amr"')
    }

    // ==========================================
    // TEST 4: General Expense (driver_id = NULL, staff_id = NULL)
    // ==========================================
    console.log('\n--- TEST 4: General Expense (No Staff / Driver Identity) ---')
    const { data: generalExp, error: generalExpErr } = await supabase
      .from('shift_expenses')
      .insert({
        shift_id: activeShift.id,
        category: 'صيانة ونظافة',
        amount: 80.0,
        description: 'TEST_ADVANCE_ISOLATION - صيانة عامة',
        recipient_name: null,
        driver_id: null,
        staff_id: null,
        recorded_by: 'كاشير الوردية',
      })
      .select('*')
      .single()

    assert(!generalExpErr && Boolean(generalExp?.id), 'General expense inserted with driver_id = NULL and staff_id = NULL')
    assert(generalExp?.driver_id === null && generalExp?.staff_id === null, 'General expense retains NULL identities')

    // ==========================================
    // TEST 5: Staff Expense with staff_id
    // ==========================================
    console.log('\n--- TEST 5: Staff Expense with staff_id ---')
    // Create or find a test staff profile
    let testStaffId: string | null = null
    const { data: existingStaff, error: staffFetchErr } = await supabase
      .from('staff_profiles')
      .select('id, full_name')
      .limit(1)

    if (staffFetchErr) {
      console.error('💥 staffFetchErr:', staffFetchErr)
    }

    if (existingStaff && existingStaff.length > 0) {
      testStaffId = existingStaff[0].id
    }

    assert(Boolean(testStaffId), `Found test staff profile (${testStaffId})`)

    const { data: staffExp, error: staffExpErr } = await supabase
      .from('shift_expenses')
      .insert({
        shift_id: activeShift.id,
        category: 'سلف موظفين',
        amount: 300.0,
        description: 'TEST_ADVANCE_ISOLATION - سلفة مطبخ',
        recipient_name: 'شيف مصطفى الجزار',
        driver_id: null,
        staff_id: testStaffId,
        recorded_by: 'مدير الصالة',
      })
      .select('*')
      .single()

    assert(!staffExpErr && staffExp?.staff_id === testStaffId, 'Staff expense saved with staff_id foreign key')
    assert(staffExp?.driver_id === null, 'Staff expense has driver_id = NULL')

    // Clean up test records
    await supabase
      .from('shift_expenses')
      .delete()
      .eq('shift_id', activeShift.id)
      .eq('description', 'TEST_ADVANCE_ISOLATION')
    await supabase
      .from('shift_expenses')
      .delete()
      .eq('shift_id', activeShift.id)
      .eq('description', 'TEST_ADVANCE_ISOLATION - صيانة عامة')
    await supabase
      .from('shift_expenses')
      .delete()
      .eq('shift_id', activeShift.id)
      .eq('description', 'TEST_ADVANCE_ISOLATION - سلفة مطبخ')

  } catch (err: any) {
    console.error('💥 Unhandled Exception in Test Suite:', err)
    failedCount++
  }

  console.log('\n==========================================')
  console.log(`🏁 [SUMMARY] Total Passed: ${passedCount} | Total Failed: ${failedCount}`)
  console.log('==========================================\n')

  if (failedCount > 0) {
    process.exit(1)
  }
}

runStaffIdentityAdvancesTests()
