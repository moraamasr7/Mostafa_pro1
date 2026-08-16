import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { ADMIN_COOKIE_NAME } from '../login/route'

export async function POST() {
  const cookieStore = await cookies()
  cookieStore.delete(ADMIN_COOKIE_NAME)
  return NextResponse.json({ success: true, message: 'تم تسجيل الخروج' })
}
