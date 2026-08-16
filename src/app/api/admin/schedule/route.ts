import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import { isRestaurantOpen } from '@/lib/schedule'
import { ADMIN_COOKIE_NAME } from '../login/route'

export async function GET() {
  try {
    const status = await isRestaurantOpen()

    const { data: weeklyHours } = await supabase
      .from('restaurant_operating_hours')
      .select('*')
      .order('day_of_week', { ascending: true })

    const { data: closures } = await supabase
      .from('restaurant_special_closures')
      .select('*')
      .order('closure_date', { ascending: true })

    const { data: overrides } = await supabase
      .from('restaurant_schedule_overrides')
      .select('*')
      .order('override_date', { ascending: true })

    return NextResponse.json({
      status,
      weekly_hours: weeklyHours || [],
      special_closures: closures || [],
      schedule_overrides: overrides || [],
    })
  } catch (err) {
    console.error('خطأ في جلب مواعيد العمل:', err)
    return NextResponse.json(
      { error: 'تعذر جلب بيانات مواعيد العمل' },
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
        { error: 'غير مصرح الوصول. يرجى تسجيل الدخول بكود الإدارة.' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { action } = body

    if (action === 'update_weekly') {
      const { hours } = body
      if (!Array.isArray(hours)) {
        return NextResponse.json({ error: 'بيانات المواعيد غير صحيحة' }, { status: 400 })
      }

      for (const h of hours) {
        const { error } = await supabase
          .from('restaurant_operating_hours')
          .upsert(
            {
              day_of_week: h.day_of_week,
              open_time: h.open_time,
              close_time: h.close_time,
              is_closed: h.is_closed,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'day_of_week' }
          )

        if (error) {
          console.error('خطأ في تحديث اليوم:', h.day_of_week, error)
          return NextResponse.json({ error: 'فشل تحديث الجدول الأسبوعي' }, { status: 500 })
        }
      }

      return NextResponse.json({ message: 'تم تحديث مواعيد العمل الأسبوعية بنجاح' })
    }

    if (action === 'add_closure') {
      const { closure_date, reason } = body
      if (!closure_date || !reason) {
        return NextResponse.json({ error: 'تاريخ الإغلاق والسبب مطلوبان' }, { status: 400 })
      }

      const { error } = await supabase
        .from('restaurant_special_closures')
        .insert({ closure_date, reason: reason.trim() })

      if (error) {
        if (error.code === '23505') {
          return NextResponse.json({ error: 'يوجد إغلاق مسجل لهذا التاريخ بالفعل' }, { status: 400 })
        }
        return NextResponse.json({ error: 'فشل إضافة الإغلاق الاستثنائي' }, { status: 500 })
      }

      return NextResponse.json({ message: 'تم إضافة الإغلاق الاستثنائي بنجاح' })
    }

    if (action === 'delete_closure') {
      const { closure_id } = body
      if (!closure_id) {
        return NextResponse.json({ error: 'معرف الإغلاق مطلوب' }, { status: 400 })
      }

      const { error } = await supabase
        .from('restaurant_special_closures')
        .delete()
        .eq('id', closure_id)

      if (error) {
        return NextResponse.json({ error: 'فشل حذف الإغلاق' }, { status: 500 })
      }

      return NextResponse.json({ message: 'تم حذف الإغلاق الاستثنائي بنجاح' })
    }

    if (action === 'add_override') {
      const { override_date, open_time, close_time, is_closed, reason } = body
      if (!override_date || !open_time || !close_time) {
        return NextResponse.json({ error: 'التاريخ ومواعيد الفتح والإغلاق مطلوبة' }, { status: 400 })
      }

      const { error } = await supabase
        .from('restaurant_schedule_overrides')
        .insert({
          override_date,
          open_time,
          close_time,
          is_closed: !!is_closed,
          reason: reason ? reason.trim() : null,
        })

      if (error) {
        if (error.code === '23505') {
          return NextResponse.json({ error: 'يوجد موعد استثنائي لهذا التاريخ بالفعل' }, { status: 400 })
        }
        return NextResponse.json({ error: 'فشل إضافة الموعد الاستثنائي' }, { status: 500 })
      }

      return NextResponse.json({ message: 'تم إضافة الموعد الاستثنائي بنجاح' })
    }

    if (action === 'delete_override') {
      const { override_id } = body
      if (!override_id) {
        return NextResponse.json({ error: 'معرف التجاوز مطلوب' }, { status: 400 })
      }

      const { error } = await supabase
        .from('restaurant_schedule_overrides')
        .delete()
        .eq('id', override_id)

      if (error) {
        return NextResponse.json({ error: 'فشل حذف الموعد الاستثنائي' }, { status: 500 })
      }

      return NextResponse.json({ message: 'تم حذف الموعد الاستثنائي بنجاح' })
    }

    return NextResponse.json({ error: 'إجراء غير معروف' }, { status: 400 })
  } catch (err) {
    console.error('خطأ غير متوقع في API مواعيد العمل:', err)
    return NextResponse.json({ error: 'حدث خطأ غير متوقع' }, { status: 500 })
  }
}
