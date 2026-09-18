import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabaseServer'
import { ADMIN_COOKIE_NAME } from '@/lib/staffAuth'

export { ADMIN_COOKIE_NAME }

export async function POST(request: NextRequest) {
  try {
    const adminPasscode = process.env.ADMIN_PASSCODE

    if (!adminPasscode) {
      console.error('CRITICAL: ADMIN_PASSCODE environment variable is missing!')
      return NextResponse.json(
        { error: 'رمز الإدارة غير مهيأ في إعدادات البيئة (ADMIN_PASSCODE)' },
        { status: 500 }
      )
    }

    const body = await request.json()
    const { passcode, staff_id } = body

    if (!passcode || typeof passcode !== 'string') {
      return NextResponse.json(
        { error: 'رمز الدخول مطلوب' },
        { status: 400 }
      )
    }

    if (passcode.trim() !== adminPasscode.trim()) {
      return NextResponse.json(
        { error: 'رمز الدخول غير صحيح' },
        { status: 401 }
      )
    }

    const serverSupabase = getSupabaseServerClient()
    let staffRecord: { id: string; email: string; full_name: string; role: string; is_active: boolean } | null = null

    if (staff_id && typeof staff_id === 'string') {
      const { data, error } = await serverSupabase
        .from('staff_profiles')
        .select('id, email, full_name, role, is_active')
        .eq('id', staff_id.trim())
        .maybeSingle()

      if (error || !data) {
        return NextResponse.json(
          { error: 'ملف الموظف المحدد غير موجود في سجلات المطعم' },
          { status: 401 }
        )
      }
      if (!data.is_active) {
        return NextResponse.json(
          { error: 'حساب الموظف المحدد غير نشط حالياً' },
          { status: 403 }
        )
      }
      staffRecord = data
    } else {
      // Fallback: pick the primary active manager/cashier
      const { data, error } = await serverSupabase
        .from('staff_profiles')
        .select('id, email, full_name, role, is_active')
        .eq('is_active', true)
        .in('role', ['cashier', 'owner', 'manager'])
        .order('role', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (error || !data) {
        return NextResponse.json(
          { error: 'لا يوجد حساب موظف نشط ومصرح له في قاعدة البيانات' },
          { status: 401 }
        )
      }
      staffRecord = data
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
      { error: 'حدث خطأ غير متوقع' },
      { status: 500 }
    )
  }
}
