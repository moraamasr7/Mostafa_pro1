import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabaseServer'

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
    const serverSupabase = getSupabaseServerClient()

    // 1. Search driver_credentials using Server Client (Service Role Key bypasses RLS on driver_credentials)
    const { data: creds, error: credsError } = await serverSupabase
      .from('driver_credentials')
      .select('driver_id, phone')
      .eq('phone', cleanPhone)
      .maybeSingle()

    let targetDriverId: string | null = creds?.driver_id || null

    // Fallback: If credentials table is empty or migration pending, attempt check on drivers table
    if (!targetDriverId) {
      const { data: fallbackDriver } = await serverSupabase
        .from('drivers')
        .select('id')
        .eq('phone', cleanPhone)
        .maybeSingle()

      if (fallbackDriver) {
        targetDriverId = fallbackDriver.id
      }
    }

    if (credsError || !targetDriverId) {
      return NextResponse.json(
        { error: 'رقم الهاتف غير مسجل كطيار في المطعم' },
        { status: 401 }
      )
    }

    // 2. Fetch public driver status & details
    const { data: driver, error: driverError } = await serverSupabase
      .from('drivers')
      .select('id, name, is_active, status')
      .eq('id', targetDriverId)
      .single()

    if (driverError || !driver) {
      return NextResponse.json(
        { error: 'بيانات الطيار غير متاحة حالياً' },
        { status: 404 }
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
      maxAge: 60 * 60 * 24 * 7,
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
