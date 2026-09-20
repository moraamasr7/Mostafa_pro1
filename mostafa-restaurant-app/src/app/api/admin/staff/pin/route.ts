import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServerClient } from '@/lib/supabaseServer'
import { getStaffSession, canStaffManageSettings } from '@/lib/staffAuth'
import { hashPin } from '@/lib/pinAuth'
import { notifyPinChanged } from '@/lib/telegram'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabaseServer = getSupabaseServerClient()

    // 1. Authenticate Actor Session Server-Side
    const { staff: currentStaff, error: authErr, status: authStatus } = await getStaffSession(supabaseServer, cookieStore)
    if (authErr || !currentStaff) {
      return NextResponse.json(
        { error: authErr || 'غير مصرح الوصول. يرجى تسجيل الدخول كمسؤول.' },
        { status: authStatus || 401 }
      )
    }

    // 2. Strict Owner-Only Authorization
    if (!canStaffManageSettings(currentStaff.role)) {
      return NextResponse.json(
        { error: 'غير مصرح لك بتعديل رمز الدخول (PIN). هذه العملية مقتصرة حصرياً على مالك المطعم.' },
        { status: 403 }
      )
    }

    // 3. Parse & Validate Payload
    const body = await request.json()
    const { staff_id, new_pin } = body

    if (!staff_id || typeof staff_id !== 'string') {
      return NextResponse.json(
        { error: 'مُعرّف الموظف مطلوب' },
        { status: 400 }
      )
    }

    const cleanPin = (new_pin || '').toString().trim()
    if (!cleanPin || cleanPin.length < 4 || cleanPin.length > 10) {
      return NextResponse.json(
        { error: 'رمز الدخول (PIN) يجب أن يتكون من 4 إلى 10 أرقام' },
        { status: 400 }
      )
    }

    // 4. Validate Target Staff from Database
    const { data: targetStaff, error: targetErr } = await supabaseServer
      .from('staff_profiles')
      .select('id, full_name, email, role, is_active')
      .eq('id', staff_id.trim())
      .maybeSingle()

    if (targetErr || !targetStaff) {
      return NextResponse.json(
        { error: 'حساب الموظف المستهدف غير موجود في سجلات المطعم' },
        { status: 404 }
      )
    }

    if (!targetStaff.is_active) {
      return NextResponse.json(
        { error: 'لا يمكن تغيير رمز الدخول لحساب موظف معطل' },
        { status: 400 }
      )
    }

    const validRoles = ['owner', 'cashier', 'kitchen']
    if (!validRoles.includes(targetStaff.role)) {
      return NextResponse.json(
        { error: 'دور الموظف المستهدف غير صالح' },
        { status: 400 }
      )
    }

    // 5. Generate Secure scrypt PIN Hash
    const pinHash = hashPin(cleanPin)

    // 6. Update Database (Database Success is Required Before Alert)
    const { error: updateErr } = await supabaseServer
      .from('staff_profiles')
      .update({
        pin_hash: pinHash,
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetStaff.id)

    if (updateErr) {
      console.error('Error updating staff pin_hash:', updateErr)
      return NextResponse.json(
        { error: 'فشل حفظ رمز الدخول الجديد في قاعدة البيانات' },
        { status: 500 }
      )
    }

    // 7. Send Telegram Security Notification (Failure-Isolated)
    try {
      await notifyPinChanged({
        employeeName: targetStaff.full_name,
        staffId: targetStaff.id,
        role: targetStaff.role,
        actorName: currentStaff.full_name,
        actorId: currentStaff.id,
      })
    } catch (tgErr) {
      console.error('Telegram notification error for PIN change (isolated):', tgErr)
    }

    return NextResponse.json(
      {
        success: true,
        message: `تم تغيير رمز الدخول (PIN) للموظف ${targetStaff.full_name} بنجاح ✅`,
        employee: {
          id: targetStaff.id,
          full_name: targetStaff.full_name,
          role: targetStaff.role,
        },
      },
      { status: 200 }
    )
  } catch (err) {
    console.error('Unexpected error in staff PIN change route:', err)
    return NextResponse.json(
      { error: 'حدث خطأ غير متوقع أثناء تغيير رمز الدخول' },
      { status: 500 }
    )
  }
}
