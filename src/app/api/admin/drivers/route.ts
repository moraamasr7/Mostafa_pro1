import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import { ADMIN_COOKIE_NAME } from '../login/route'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get(ADMIN_COOKIE_NAME)

    if (!sessionCookie || !sessionCookie.value.startsWith('staff_auth_')) {
      return NextResponse.json(
        { error: 'غير مصرح الوصول. يرجى تسجيل الدخول.' },
        { status: 401 }
      )
    }

    const { data: drivers, error } = await supabase
      .from('drivers')
      .select(`
        id,
        name,
        phone,
        is_active,
        status,
        created_at,
        driver_shifts (
          id,
          status
        ),
        order_driver_assignments (
          id,
          order_id,
          status
        )
      `)
      .order('name', { ascending: true })

    if (error) {
      console.error('خطأ في جلب طاقم الطيارين:', error)
      return NextResponse.json(
        { error: 'تعذر جلب بيانات الطيارين' },
        { status: 500 }
      )
    }

    interface ShiftRow { id: string; status: string }
    interface AssignmentRow { id: string; order_id: string; status: string }
    interface DriverQueryRow {
      id: string
      name: string
      phone: string
      is_active: boolean
      status: string
      created_at: string
      driver_shifts?: ShiftRow[]
      order_driver_assignments?: AssignmentRow[]
    }

    const formattedDrivers = ((drivers as unknown as DriverQueryRow[]) || []).map((d) => {
      const openShift = (d.driver_shifts || []).find((s) => s.status === 'open')
      const activeAssignment = (d.order_driver_assignments || []).find((a) =>
        ['assigned', 'accepted', 'picked_up', 'out_for_delivery'].includes(a.status)
      )

      return {
        id: d.id,
        name: d.name,
        phone: d.phone,
        is_active: d.is_active,
        status: d.status,
        created_at: d.created_at,
        active_shift_id: openShift ? openShift.id : null,
        current_order_id: activeAssignment ? activeAssignment.order_id : null,
      }
    })

    return NextResponse.json({ drivers: formattedDrivers }, { status: 200 })
  } catch (err) {
    console.error('خطأ غير متوقع في API الطيارين:', err)
    return NextResponse.json(
      { error: 'حدث خطأ غير متوقع' },
      { status: 500 }
    )
  }
}

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
    const { name, phone } = body

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json(
        { error: 'اسم الطيار مطلوب وبحد أدنى حرفين' },
        { status: 400 }
      )
    }

    const cleanPhone = phone ? String(phone).replace(/\s/g, '') : ''
    if (!/^01\d{9}$/.test(cleanPhone)) {
      return NextResponse.json(
        { error: 'رقم الموبايل غير صحيح (يجب أن يكون 11 رقم ويبدأ بـ 01)' },
        { status: 400 }
      )
    }

    const { data: newDriver, error } = await supabase
      .from('drivers')
      .insert({
        name: name.trim(),
        phone: cleanPhone,
        is_active: true,
        status: 'offline',
      })
      .select('id, name, phone, is_active, status')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'رقم الموبايل مسجل بالفعل لطيار آخر' },
          { status: 409 }
        )
      }
      console.error('خطأ في إضافة الطيار:', error)
      return NextResponse.json(
        { error: 'تعذر إضافة الطيار' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { success: true, driver: newDriver, message: 'تم إضافة الطيار بنجاح' },
      { status: 201 }
    )
  } catch (err) {
    console.error('خطأ غير متوقع في إضافة الطيار:', err)
    return NextResponse.json(
      { error: 'حدث خطأ غير متوقع' },
      { status: 500 }
    )
  }
}
