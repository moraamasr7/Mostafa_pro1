import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServerClient } from '@/lib/supabaseServer'
import { ADMIN_COOKIE_NAME } from '../login/route'
import { getActiveDailyShift } from '@/lib/shiftGuard'

export const dynamic = 'force-dynamic'

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
    const { action, driver_id, allow_reopen, reopen_reason } = body

    if (!driver_id || typeof driver_id !== 'string') {
      return NextResponse.json(
        { error: 'مُعرّف الطيار مطلوب' },
        { status: 400 }
      )
    }

    const serverSupabase = getSupabaseServerClient()

    if (action === 'start') {
      // 🔒 Shift Guard: منع فتح ورديات الطيارين إذا كانت وردية المطعم العامة مغلقة
      const shiftCheck = await getActiveDailyShift(serverSupabase)
      if (!shiftCheck.hasActiveShift || !shiftCheck.openedAt) {
        return NextResponse.json(
          { error: 'أمان التشغيل: لا يمكن بدء وردية للطيار لعدم وجود وردية مطعم مفتوحة حالياً. افتح الوردية اليومية أولاً.' },
          { status: 403 }
        )
      }

      // 🔒 فحص عدم تكرار فتح وردية لنفس الطيار داخل نفس الوردية اليومية للمطعم
      const { data: previousShifts, error: prevErr } = await serverSupabase
        .from('driver_shifts')
        .select('id, started_at, ended_at, status')
        .eq('driver_id', driver_id)
        .gte('started_at', shiftCheck.openedAt)
        .order('started_at', { ascending: false })

      if (!prevErr && previousShifts && previousShifts.length > 0) {
        const closedShifts = previousShifts.filter((s) => s.status === 'closed')
        if (closedShifts.length > 0 && !allow_reopen) {
          return NextResponse.json(
            {
              error: 'هذا الطيار سجل بالفعل وردية وانتهت خلال وردية اليوم الحالية. فتح وردية ثانية استثنائية يتطلب تأكيداً وموافقة صريحة.',
              requires_override: true,
              closed_shift_count: closedShifts.length,
            },
            { status: 409 }
          )
        }
      }

      const { data: rpcData, error: rpcErr } = await serverSupabase.rpc('start_driver_shift_secure', {
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
      const { data: rpcData, error: rpcErr } = await serverSupabase.rpc('end_driver_shift_secure', {
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
