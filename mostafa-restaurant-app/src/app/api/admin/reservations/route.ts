import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServerClient } from '@/lib/supabaseServer'
import { getStaffSession } from '@/lib/staffAuth'
import { ReservationStatus, canTransitionReservation } from '@/types/reservations'

export const dynamic = 'force-dynamic'

const AUTHORIZED_ROLES = ['owner', 'cashier']

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const serverSupabase = getSupabaseServerClient()

    const { staff, error: authErr, status: authStatus } = await getStaffSession(serverSupabase, cookieStore)
    if (authErr || !staff) {
      return NextResponse.json(
        { error: authErr || 'غير مصرح الوصول. يرجى تسجيل الدخول كعضو في طاقم العمل.' },
        { status: authStatus || 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const dateParam = searchParams.get('date')
    const statusParam = searchParams.get('status')

    let query = serverSupabase
      .from('reservations')
      .select('*')
      .order('reservation_date', { ascending: false })
      .order('reservation_time', { ascending: true })

    if (dateParam) {
      query = query.eq('reservation_date', dateParam)
    }

    if (statusParam && statusParam !== 'all') {
      query = query.eq('status', statusParam)
    }

    const { data: reservations, error } = await query

    if (error) {
      console.error('Error fetching reservations:', error)
      return NextResponse.json(
        { error: 'تعذر تحميل بيانات الحجوزات' },
        { status: 500 }
      )
    }

    return NextResponse.json({ reservations: reservations || [] }, { status: 200 })
  } catch (err) {
    console.error('Unexpected error in reservations GET:', err)
    return NextResponse.json(
      { error: 'حدث خطأ غير متوقع أثناء جلب الحجوزات' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const serverSupabase = getSupabaseServerClient()

    const { staff, error: authErr, status: authStatus } = await getStaffSession(serverSupabase, cookieStore)
    if (authErr || !staff) {
      return NextResponse.json(
        { error: authErr || 'غير مصرح الوصول. يرجى تسجيل الدخول كعضو في طاقم العمل.' },
        { status: authStatus || 401 }
      )
    }

    const staffRole = staff.role ? staff.role.toLowerCase().trim() : ''
    if (!AUTHORIZED_ROLES.includes(staffRole)) {
      return NextResponse.json(
        { error: 'غير مصرح لك بتعديل الحجوزات. العملية مقتصرة على المشرفين والكاشير والمالك.' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { id, status: newStatus, table_number, notes } = body

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'معرف الحجز مطلوب' },
        { status: 400 }
      )
    }

    // 1. Fetch current reservation
    const { data: currentRes, error: fetchErr } = await serverSupabase
      .from('reservations')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (fetchErr || !currentRes) {
      return NextResponse.json(
        { error: 'الحجز غير موجود في النظام' },
        { status: 404 }
      )
    }

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    // 2. Validate status transition if provided
    if (newStatus !== undefined) {
      const validStatuses: ReservationStatus[] = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show']
      if (!validStatuses.includes(newStatus as ReservationStatus)) {
        return NextResponse.json(
          { error: 'حالة الحجز غير مقبولة' },
          { status: 400 }
        )
      }

      if (currentRes.status !== newStatus) {
        if (!canTransitionReservation(currentRes.status as ReservationStatus, newStatus as ReservationStatus)) {
          return NextResponse.json(
            { error: `لا يمكن تحويل الحجز من حالة ${currentRes.status} إلى ${newStatus}` },
            { status: 409 }
          )
        }
        updatePayload.status = newStatus
      }
    }

    // 3. Update table_number if provided
    if (table_number !== undefined) {
      updatePayload.table_number = typeof table_number === 'string' && table_number.trim()
        ? table_number.trim()
        : null
    }

    // 4. Update notes if provided
    if (notes !== undefined) {
      updatePayload.notes = typeof notes === 'string' && notes.trim()
        ? notes.trim()
        : null
    }

    const { data: updatedRes, error: updateErr } = await serverSupabase
      .from('reservations')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single()

    if (updateErr) {
      console.error('Error updating reservation:', updateErr)
      return NextResponse.json(
        { error: updateErr.message || 'تعذر تحديث بيانات الحجز' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        message: 'تم تحديث بيانات الحجز بنجاح',
        reservation: updatedRes,
      },
      { status: 200 }
    )
  } catch (err: any) {
    console.error('Unexpected error in reservations PATCH:', err)
    return NextResponse.json(
      { error: err?.message || 'حدث خطأ غير متوقع أثناء تحديث الحجز' },
      { status: 500 }
    )
  }
}
