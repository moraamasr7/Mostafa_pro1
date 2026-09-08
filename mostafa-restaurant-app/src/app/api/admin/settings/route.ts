import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabaseServer'
import { cookies } from 'next/headers'
import { ADMIN_COOKIE_NAME } from '../login/route'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabaseServer = getSupabaseServerClient()
    const { data: policies, error } = await supabaseServer
      .from('restaurant_policies')
      .select('*')

    if (error) {
      // Fallback defaults if table is not yet migrated in Supabase
      return NextResponse.json({
        policies: [
          { key: 'delivery_fee_per_km', value: 5.0, description: 'سعر الكيلومتر للتوصيل بالجنيه' },
          { key: 'max_delivery_radius_km', value: 15.0, description: 'أقصى نصف قطر مسموح به للتوصيل بالكيلومتر' },
          { key: 'max_driver_active_orders', value: 5, description: 'أقصى عدد طلبات نشطة مسموح بحملها للطيار' },
          { key: 'min_order_amount', value: 50.0, description: 'الحد الأدنى لقيمة الطلب' },
        ],
      })
    }

    return NextResponse.json({ policies: policies || [] })
  } catch (err) {
    console.error('Error fetching settings:', err)
    return NextResponse.json({ error: 'حدث خطأ أثناء جلب الإعدادات' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get(ADMIN_COOKIE_NAME)

    if (!sessionCookie || !sessionCookie.value.startsWith('staff_auth_')) {
      return NextResponse.json(
        { error: 'غير مصرح الوصول. يرجى تسجيل الدخول كمسؤول.' },
        { status: 401 }
      )
    }

    const { key, value } = await request.json()

    if (!key || value === undefined) {
      return NextResponse.json({ error: 'البيانات غير مكتملة' }, { status: 400 })
    }

    const supabaseServer = getSupabaseServerClient()
    const { error } = await supabaseServer
      .from('restaurant_policies')
      .upsert({
        key,
        value: JSON.stringify(value),
        updated_at: new Date().toISOString(),
      })

    if (error) {
      console.error('Error updating policy:', error)
      return NextResponse.json({ error: 'فشل حفظ التعديل في قاعدة البيانات' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'تم حفظ السياسة بنجاح' })
  } catch (err) {
    console.error('Error saving settings:', err)
    return NextResponse.json({ error: 'حدث خطأ غير متوقع' }, { status: 500 })
  }
}
