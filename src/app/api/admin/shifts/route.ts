import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import { ADMIN_COOKIE_NAME } from '../login/route'

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get(ADMIN_COOKIE_NAME)

    if (!sessionCookie || !sessionCookie.value.startsWith('staff_auth_')) {
      return NextResponse.json(
        { error: 'غير مصرح الوصول. يرجى تسجيل الدخول.' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { action, driver_id } = body

    if (!driver_id || typeof driver_id !== 'string') {
      return NextResponse.json(
        { error: 'مُعرّف الطيار مطلوب' },
        { status: 400 }
      )
    }

    if (action === 'start') {
      // 1. استدعاء RPC بدء الوردية الذرية
      const { data: rpcData, error: rpcErr } = await supabase.rpc('start_driver_shift_secure', {
        p_driver_id: driver_id,
      })

      if (rpcErr) {
        console.error('خطأ RPC بدء الوردية:', rpcErr)
        return NextResponse.json(
          { error: rpcErr.message || 'تعذر بدء الوردية' },
          { status: 400 }
        )
      }

      if (rpcData && rpcData.length > 0) {
        const res = rpcData[0]
        if (!res.success) {
          return NextResponse.json(
            { error: res.message },
            { status: 400 }
          )
        }
        return NextResponse.json(
          { success: true, message: res.message, shift_id: res.shift_id },
          { status: 200 }
        )
      }
    } else if (action === 'end') {
      // 2. استدعاء RPC إنهاء الوردية الذرية (تمنع الإغلاق لو يوجد طلب نشط)
      const { data: rpcData, error: rpcErr } = await supabase.rpc('end_driver_shift_secure', {
        p_driver_id: driver_id,
      })

      if (rpcErr) {
        console.error('خطأ RPC إنهاء الوردية:', rpcErr)
        return NextResponse.json(
          { error: rpcErr.message || 'تعذر إنهاء الوردية' },
          { status: 400 }
        )
      }

      if (rpcData && rpcData.length > 0) {
        const res = rpcData[0]
        if (!res.success) {
          return NextResponse.json(
            { error: res.message },
            { status: 400 }
          )
        }
        return NextResponse.json(
          { success: true, message: res.message },
          { status: 200 }
        )
      }
    }

    return NextResponse.json(
      { error: 'الإجراء غير معروف' },
      { status: 400 }
    )
  } catch (err) {
    console.error('خطأ غير متوقع في API الورديات:', err)
    return NextResponse.json(
      { error: 'حدث خطأ غير متوقع' },
      { status: 500 }
    )
  }
}
