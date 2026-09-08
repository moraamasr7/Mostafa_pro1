import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export const ADMIN_COOKIE_NAME = 'admin_session'

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
    const { passcode } = body

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

    const cookieStore = await cookies()
    cookieStore.set(ADMIN_COOKIE_NAME, `staff_auth_${Date.now()}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 12,
      path: '/',
    })

    return NextResponse.json(
      { success: true, message: 'تم تسجيل الدخول بنجاح' },
      { status: 200 }
    )
  } catch (err) {
    console.error('خطأ في تسجيل دخول الإدارة:', err)
    return NextResponse.json(
      { error: 'حدث خطأ غير متوقع' },
      { status: 500 }
    )
  }
}
