import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServerClient } from '@/lib/supabaseServer'
import { ADMIN_COOKIE_NAME, getStaffSession } from '@/lib/staffAuth'
import { notifyExpenseRecorded } from '@/lib/telegram'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const serverSupabase = getSupabaseServerClient()

    const { staff: currentStaff, error: authErr, status: authStatus } = await getStaffSession(serverSupabase, cookieStore)
    if (authErr || !currentStaff) {
      return NextResponse.json({ error: 'غير مصرح الوصول.' }, { status: authStatus || 401 })
    }

    const { searchParams } = new URL(request.url)
    const shiftId = searchParams.get('shift_id')

    let query = serverSupabase
      .from('shift_expenses')
      .select('*')
      .order('created_at', { ascending: false })

    if (shiftId) {
      query = query.eq('shift_id', shiftId)
    }

    const { data: expenses, error } = await query

    if (error) {
      console.error('Error fetching expenses:', error)
      return NextResponse.json({ error: 'تعذر جلب المصروفات' }, { status: 500 })
    }

    return NextResponse.json({ expenses: expenses || [] }, { status: 200 })
  } catch (err) {
    console.error('Unexpected error in expenses GET:', err)
    return NextResponse.json({ error: 'حدث خطأ غير متوقع' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const serverSupabase = getSupabaseServerClient()

    const { staff: currentStaff, error: authErr, status: authStatus } = await getStaffSession(serverSupabase, cookieStore)
    if (authErr || !currentStaff) {
      return NextResponse.json(
        { error: authErr || 'غير مصرح الوصول. يرجى تسجيل الدخول كعضو في طاقم العمل.' },
        { status: authStatus || 401 }
      )
    }

    const body = await request.json()
    const { category, amount, description, recipient_name, driver_id, staff_id } = body

    if (!category || !description || typeof description !== 'string') {
      return NextResponse.json({ error: 'البند وتفاصيل الصرف مطلوبان' }, { status: 400 })
    }

    const numAmount = Number(amount)
    if (isNaN(numAmount) || numAmount <= 0) {
      return NextResponse.json({ error: 'المبلغ يجب أن يكون رقماً أكبر من صفر' }, { status: 400 })
    }

    // Find active daily shift
    const { data: activeShift } = await serverSupabase
      .from('daily_shifts')
      .select('id')
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .maybeSingle()

    if (!activeShift) {
      return NextResponse.json({
        error: 'لا توجد وردية مفتوحة حالياً. يرجى فتح وردية أولاً لتسجيل المصروف عليها.'
      }, { status: 400 })
    }

    // Server-side authenticated operator identity (ignores any client-supplied recorded_by)
    const cleanRecordedBy = currentStaff.full_name
    let finalRecipientName = recipient_name?.trim() || null
    const validDriverId = (driver_id && String(driver_id).trim()) || null
    const validStaffId = (staff_id && String(staff_id).trim()) || null

    if (validDriverId && !finalRecipientName) {
      const { data: driverRow } = await serverSupabase
        .from('drivers')
        .select('name')
        .eq('id', validDriverId)
        .maybeSingle()
      if (driverRow?.name) {
        finalRecipientName = driverRow.name
      }
    } else if (validStaffId && !finalRecipientName) {
      const { data: staffRow } = await serverSupabase
        .from('staff_profiles')
        .select('full_name')
        .eq('id', validStaffId)
        .maybeSingle()
      if (staffRow?.full_name) {
        finalRecipientName = staffRow.full_name
      }
    }

    const { data: newExp, error: insErr } = await serverSupabase
      .from('shift_expenses')
      .insert({
        shift_id: activeShift.id,
        category: category.trim(),
        amount: numAmount,
        description: description.trim(),
        recipient_name: finalRecipientName,
        driver_id: validDriverId,
        staff_id: validStaffId,
        recorded_by: cleanRecordedBy,
      })
      .select('*')
      .single()

    if (insErr || !newExp) {
      console.error('Error inserting expense:', insErr)
      return NextResponse.json({ error: 'تعذر حفظ المصروف' }, { status: 500 })
    }

    // Telegram notification
    notifyExpenseRecorded({
      category: newExp.category,
      amount: newExp.amount,
      description: newExp.description,
      recipientName: newExp.recipient_name || undefined,
      recordedBy: newExp.recorded_by,
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      message: 'تم تسجيل المصروف بنجاح وخصمه من تقرير الوردية',
      expense: newExp,
    }, { status: 201 })
  } catch (err) {
    console.error('Unexpected error in expenses POST:', err)
    return NextResponse.json({ error: 'حدث خطأ غير متوقع' }, { status: 500 })
  }
}
