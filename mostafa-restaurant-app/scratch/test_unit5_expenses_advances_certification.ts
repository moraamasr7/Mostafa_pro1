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
import { getActiveDailyShift } from '../src/lib/shiftGuard'
import { calculateDailyShiftAccounting } from '../src/lib/dailyShiftAccounting'
import { calculateFleetDriversAccounting } from '../src/lib/driverAccounting'

async function runUnit5Certification() {
  console.log('====================================================')
  console.log('🧪 RUNNING UNIT 5 — EXPENSES & ADVANCES CERTIFICATION')
  console.log('====================================================\n')

  const supabase = getSupabaseServerClient()
  let passCount = 0
  let totalTests = 0

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++
    if (condition) {
      passCount++
      console.log(`  ✅ [PASS] ${testName}`)
    } else {
      console.error(`  ❌ [FAIL] ${testName}${detail ? ' -> ' + detail : ''}`)
    }
  }

  // ----------------------------------------------------
  // TEST GROUP 1: ACTIVE SHIFT & CONTEXT DISCOVERY
  // ----------------------------------------------------
  console.log('\n--- GROUP 1: Active Daily Shift Discovery ---')

  const shiftCheck = await getActiveDailyShift(supabase)
  assert(shiftCheck.hasActiveShift && !!shiftCheck.activeShiftId, 'Active Daily Shift exists for expenses binding')

  if (!shiftCheck.hasActiveShift || !shiftCheck.activeShiftId) {
    console.error('❌ Cannot run DB tests without open daily shift')
    return
  }

  const shiftId = shiftCheck.activeShiftId

  // Discover or create a test driver
  const testPhone = '010' + Math.floor(10000000 + Math.random() * 90000000)
  const { data: testDriver } = await supabase
    .from('drivers')
    .insert({
      name: 'طيار سلف تجريبي',
      phone: testPhone,
      is_active: true,
      status: 'available',
    })
    .select()
    .single()

  assert(!!testDriver && !!testDriver.id, 'Test Driver setup for driver advances')
  const driverId = testDriver.id

  // Start driver shift
  await supabase.rpc('start_driver_shift_secure', { p_driver_id: driverId })

  // Discover or create a test staff member
  const { data: staffMember } = await supabase
    .from('staff_profiles')
    .select('id, full_name, role')
    .limit(1)
    .maybeSingle()

  const staffId = staffMember?.id || null
  const staffName = staffMember?.full_name || 'موظف تجريبي'

  const createdExpenseIds: string[] = []

  try {
    // ----------------------------------------------------
    // TEST GROUP 2: GENERAL EXPENSE INSERTION & AUDIT
    // ----------------------------------------------------
    console.log('\n--- GROUP 2: General Expense Record & Audit ---')

    const generalAmount = 150.00
    const { data: genExp, error: genErr } = await supabase
      .from('shift_expenses')
      .insert({
        shift_id: shiftId,
        category: 'مشتريات خضار ومستلزمات',
        amount: generalAmount,
        description: 'شراء طماطم وخضروات طازجة للمطبخ',
        recipient_name: 'سوق الخضار',
        recorded_by: 'الكاشير مصطفى',
      })
      .select()
      .single()

    assert(!genErr && !!genExp?.id, 'Insert General Expense', genErr?.message)
    if (genExp) {
      createdExpenseIds.push(genExp.id)
      assert(genExp.shift_id === shiftId, 'Expense linked to active shift_id')
      assert(Number(genExp.amount) === generalAmount, 'Expense amount is exact numeric value')
      assert(genExp.recorded_by === 'الكاشير مصطفى', 'Expense recorded_by operator audit is stored')
    }

    // ----------------------------------------------------
    // TEST GROUP 3: STAFF ADVANCE RECORD
    // ----------------------------------------------------
    console.log('\n--- GROUP 3: Staff Advance Record ---')

    const staffAdvanceAmount = 200.00
    const { data: stExp, error: stErr } = await supabase
      .from('shift_expenses')
      .insert({
        shift_id: shiftId,
        category: 'سلف عاملين',
        amount: staffAdvanceAmount,
        description: `سلفة على المرتب للموظف ${staffName}`,
        recipient_name: staffName,
        staff_id: staffId,
        recorded_by: 'الكاشير مصطفى',
      })
      .select()
      .single()

    assert(!stErr && !!stExp?.id, 'Insert Staff Advance', stErr?.message)
    if (stExp) {
      createdExpenseIds.push(stExp.id)
      assert(stExp.category === 'سلف عاملين', 'Category is سلف عاملين')
      assert(stExp.recipient_name === staffName, 'Staff recipient name preserved')
    }

    // ----------------------------------------------------
    // TEST GROUP 4: DRIVER ADVANCE RECORD
    // ----------------------------------------------------
    console.log('\n--- GROUP 4: Driver Advance Record & Fleet Linkage ---')

    const driverAdvanceAmount = 100.00
    const { data: drvExp, error: drvErr } = await supabase
      .from('shift_expenses')
      .insert({
        shift_id: shiftId,
        category: 'سلف طيارين',
        amount: driverAdvanceAmount,
        description: 'سلفة بنزين للطيار',
        recipient_name: testDriver.name,
        driver_id: driverId,
        recorded_by: 'الكاشير مصطفى',
      })
      .select()
      .single()

    assert(!drvErr && !!drvExp?.id, 'Insert Driver Advance', drvErr?.message)
    if (drvExp) {
      createdExpenseIds.push(drvExp.id)
      assert(drvExp.category === 'سلف طيارين', 'Category is سلف طيارين')
      assert(drvExp.driver_id === driverId, 'Driver Advance directly linked to driver_id')
    }

    // ----------------------------------------------------
    // TEST GROUP 5: FINANCIAL SHIFT ACCOUNTING AGGREGATION
    // ----------------------------------------------------
    console.log('\n--- GROUP 5: Centralized Shift Financial Reconciliation Impact ---')

    const shiftAccounting = await calculateDailyShiftAccounting(supabase, shiftId)

    assert(
      shiftAccounting.general_expenses >= generalAmount,
      'calculateDailyShiftAccounting aggregates general expenses correctly'
    )
    assert(
      shiftAccounting.staff_advances >= staffAdvanceAmount,
      'calculateDailyShiftAccounting aggregates staff advances correctly'
    )
    assert(
      shiftAccounting.driver_advances >= driverAdvanceAmount,
      'calculateDailyShiftAccounting aggregates driver advances correctly'
    )
    assert(
      shiftAccounting.total_expenses ===
        shiftAccounting.general_expenses + shiftAccounting.staff_advances + shiftAccounting.driver_advances,
      'total_expenses = general_expenses + staff_advances + driver_advances'
    )

    // Expected cash deduction
    const expectedCalc =
      shiftAccounting.initial_cash + shiftAccounting.cash_sales - shiftAccounting.total_expenses
    assert(
      shiftAccounting.system_expected_cash === expectedCalc,
      'system_expected_cash = initial_cash + cash_sales - total_expenses'
    )

    // ----------------------------------------------------
    // TEST GROUP 6: DRIVER FLEET ACCOUNTING ADVANCE DEDUCTION
    // ----------------------------------------------------
    console.log('\n--- GROUP 6: Driver Fleet Net Payout Advance Deduction ---')

    const fleetAccounting = await calculateFleetDriversAccounting(
      supabase,
      shiftId,
      shiftAccounting.opened_at
    )

    assert(
      fleetAccounting.total_driver_advances >= driverAdvanceAmount,
      'Fleet Accounting reflects driver advances for the shift'
    )

    const driverSummary = fleetAccounting.driver_summaries.find((s) => s.driver_id === driverId)
    assert(!!driverSummary, 'Driver summary found in fleet accounting')
    if (driverSummary) {
      assert(
        driverSummary.accounting.advances_total >= driverAdvanceAmount,
        'Specific Driver accounting accurately deducts the advance amount'
      )
    }

    // ----------------------------------------------------
    // TEST GROUP 7: INPUT VALIDATION & CONSTRAINTS
    // ----------------------------------------------------
    console.log('\n--- GROUP 7: Validation & Security Constraints ---')

    // 7a. Non-existent shift
    const fakeShiftId = '00000000-0000-0000-0000-000000000000'
    const { error: badShiftErr } = await supabase
      .from('shift_expenses')
      .insert({
        shift_id: fakeShiftId,
        category: 'نثريات',
        amount: 50,
        description: 'مصروف وردية وهمية',
        recorded_by: 'كاشير',
      })

    assert(!!badShiftErr, 'Rejection of expense on non-existent shift (Foreign Key constraint)')

  } finally {
    // Clean up
    if (createdExpenseIds.length > 0) {
      await supabase.from('shift_expenses').delete().in('id', createdExpenseIds)
    }
    await supabase.rpc('end_driver_shift_secure', { p_driver_id: driverId })
    await supabase.from('driver_shifts').delete().eq('driver_id', driverId)
    await supabase.from('drivers').delete().eq('id', driverId)
  }

  console.log('\n====================================================')
  console.log(`📊 FINAL RESULT: ${passCount}/${totalTests} TESTS PASSED`)
  console.log('====================================================')
}

runUnit5Certification().catch(console.error)
