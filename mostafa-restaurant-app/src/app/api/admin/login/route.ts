import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabaseServer'
import { ADMIN_COOKIE_NAME } from '@/lib/staffAuth'
import { verifyPin } from '@/lib/pinAuth'

export { ADMIN_COOKIE_NAME }

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const pin = (body.pin || body.passcode || '') as string
    const staffId = (body.staff_id || '') as string
    const email = (body.email || '') as string

    if (!pin || typeof pin !== 'string' || !pin.trim()) {
      return NextResponse.json(
        { error: 'رمز الدخول (PIN) مطلوب' },
        { status: 400 }
      )
    }

    if (!staffId && !email) {
      return NextResponse.json(
        { error: 'يرجى تحديد حساب الموظف أو إدخال البريد الإلكتروني' },
        { status: 400 }
      )
    }

    const serverSupabase = getSupabaseServerClient()

    let query = serverSupabase
      .from('staff_profiles')
      .select('id, email, full_name, role, is_active, pin_hash')

    if (staffId && typeof staffId === 'string' && staffId.trim()) {
      query = query.eq('id', staffId.trim())
    } else if (email && typeof email === 'string' && email.trim()) {
      query = query.eq('email', email.trim().toLowerCase())
    }

    const { data: staffRecord, error } = await query.maybeSingle()

    if (error || !staffRecord) {
      return NextResponse.json(
        { error: 'ملف الموظف غير موجود في سجلات المطعم' },
        { status: 401 }
      )
    }

    if (!staffRecord.is_active) {
      return NextResponse.json(
        { error: 'حساب الموظف المحدد غير نشط حالياً' },
        { status: 403 }
      )
    }

    if (!staffRecord.pin_hash) {
      return NextResponse.json(
        { error: 'لم يتم تهيئة رمز الدخول لهذا الحساب. يرجى مراجعة إدارة المطعم.' },
        { status: 401 }
      )
    }

    const isPinValid = verifyPin(pin.trim(), staffRecord.pin_hash)

    if (!isPinValid) {
      return NextResponse.json(
        { error: 'رمز الدخول (PIN) غير صحيح' },
        { status: 401 }
      )
    }

    const response = NextResponse.json(
      {
        success: true,
        message: 'تم تسجيل الدخول بنجاح',
        staff: {
          id: staffRecord.id,
          full_name: staffRecord.full_name,
          role: staffRecord.role,
        },
      },
      { status: 200 }
    )

    response.cookies.set({
      name: ADMIN_COOKIE_NAME,
      value: `staff_auth_${staffRecord.id}_${Date.now()}`,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 12,
      path: '/',
    })

    return response
  } catch (err) {
    console.error('خطأ في تسجيل دخول الإدارة:', err)
    return NextResponse.json(
      { error: 'حدث خطأ غير متوقع أثناء تسجيل الدخول' },
      { status: 500 }
    )
  }
}
