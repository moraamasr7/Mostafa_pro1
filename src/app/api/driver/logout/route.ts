import { NextResponse } from 'next/server'
import { DRIVER_COOKIE_NAME } from '../login/route'

export async function POST() {
  const response = NextResponse.json(
    { message: 'تم تسجيل الخروج بنجاح' },
    { status: 200 }
  )

  response.cookies.set({
    name: DRIVER_COOKIE_NAME,
    value: '',
    httpOnly: true,
    expires: new Date(0),
    path: '/',
  })

  return response
}
