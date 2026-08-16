import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

// كلمة مرور طاقم الكاشير/الإدارة (من البيئة أو الإفتراضي GazzaR2026)
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || 'gazzar2026'
export const ADMIN_COOKIE_NAME = 'admin_session'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { passcode } = body

    if (!passcode || typeof passcode !== 'string') {
      return NextResponse.json(
        { error: 'رمز الدخول مطلوب' },
        { status: 400 }
      )
    }

    if (passcode.trim() !== ADMIN_PASSCODE) {
      return NextResponse.json(
        { error: 'رمز الدخول غير صحيح' },
        { status: 401 }
      )
    }

    // إنشاء جلسة الإدارة وتخزين الكوكي المحمي HTTP-Only
    const cookieStore = await cookies()
    cookieStore.set(ADMIN_COOKIE_NAME, `staff_auth_${Date.now()}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 12, // 12 ساعة
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
