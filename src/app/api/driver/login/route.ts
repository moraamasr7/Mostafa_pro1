import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const DRIVER_COOKIE_NAME = 'driver_session'

export async function POST(request: NextRequest) {
  try {
    const { phone } = await request.json()

    if (!phone || typeof phone !== 'string') {
      return NextResponse.json(
        { error: 'يرجى إدخال رقم هاتف الطيار المسجل' },
        { status: 400 }
      )
    }

    const cleanPhone = phone.trim()

    // البحث عن الطيار ورقم هاتفه في قاعدة البيانات
    const { data: driver, error } = await supabase
      .from('drivers')
      .select('id, name, phone, is_active, status')
      .eq('phone', cleanPhone)
      .maybeSingle()

    if (error || !driver) {
      return NextResponse.json(
        { error: 'رقم الهاتف غير مسجل كطيار في المطعم' },
        { status: 401 }
      )
    }

    if (!driver.is_active) {
      return NextResponse.json(
        { error: 'حساب الطيار موقف حالياً، يرجى مراجعة إدارة المطعم' },
        { status: 403 }
      )
    }

    const token = `driver_auth_${driver.id}_${Date.now()}`

    const response = NextResponse.json(
      {
        message: 'تم تسجيل دخول الطيار بنجاح',
        driver: {
          id: driver.id,
          name: driver.name,
          phone: driver.phone,
          status: driver.status,
        },
      },
      { status: 200 }
    )

    response.cookies.set({
      name: DRIVER_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 أيام
      path: '/',
    })

    return response
  } catch (err) {
    console.error('خطأ في تسجيل دخول الطيار:', err)
    return NextResponse.json(
      { error: 'حدث خطأ غير متوقع' },
      { status: 500 }
    )
  }
}
