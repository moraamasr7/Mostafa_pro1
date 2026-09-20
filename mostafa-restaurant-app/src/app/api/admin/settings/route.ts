import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabaseServer'
import { cookies } from 'next/headers'
import { getStaffSession, canStaffManageSettings } from '@/lib/staffAuth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabaseServer = getSupabaseServerClient()
    const { staff, error: authErr, status: authStatus } = await getStaffSession(supabaseServer, cookieStore)

    if (authErr || !staff) {
      return NextResponse.json(
        { error: authErr || 'غير مصرح بالوصول. يرجى تسجيل الدخول.' },
        { status: authStatus || 401 }
      )
    }

    if (!canStaffManageSettings(staff.role)) {
      return NextResponse.json(
        { error: 'غير مصرح لك بالاطلاع على سياسات وإعدادات المطعم. هذه الصفحة مقتصرة على المالك فقط.' },
        { status: 403 }
      )
    }

    const { data: policies, error } = await supabaseServer
      .from('restaurant_policies')
      .select('*')

    if (error) {
      return NextResponse.json({
        policies: [
          { key: 'delivery_fee_per_km', value: 8.0, description: 'سعر الكيلومتر للتوصيل بالجنيه' },
          { key: 'min_delivery_fee', value: 15.0, description: 'الحد الأدنى لرسوم التوصيل بالجنيه' },
          { key: 'max_delivery_radius_km', value: 13.0, description: 'أقصى نصف قطر مسموح به للتوصيل بالكيلومتر' },
          { key: 'max_driver_active_orders', value: 5, description: 'أقصى عدد طلبات نشطة مسموح بحملها للطيار' },
          { key: 'min_order_amount', value: 80.0, description: 'الحد الأدنى لقيمة الطلب' },
          { key: 'driver_hourly_rate', value: 20.0, description: 'أجر ساعة عمل الطيار' },
          { key: 'delivery_zones', value: [], description: 'مناطق التوصيل الثابتة ومطابقة العناوين' },
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
    const supabaseServer = getSupabaseServerClient()
    const { staff, error: authErr, status: authStatus } = await getStaffSession(supabaseServer, cookieStore)

    if (authErr || !staff) {
      return NextResponse.json(
        { error: authErr || 'غير مصرح بالوصول. يرجى تسجيل الدخول كمسؤول.' },
        { status: authStatus || 401 }
      )
    }

    if (!canStaffManageSettings(staff.role)) {
      return NextResponse.json(
        { error: 'غير مصرح لك بتعديل سياسات وإعدادات المطعم. هذه العملية مقتصرة على المالك فقط.' },
        { status: 403 }
      )
    }

    const { key, value } = await request.json()

    if (!key || value === undefined) {
      return NextResponse.json({ error: 'البيانات غير مكتملة' }, { status: 400 })
    }

    // Server-Side Validation for Settings & Policies
    if (key === 'delivery_fee_per_km') {
      const num = Number(value)
      if (isNaN(num) || num <= 0) {
        return NextResponse.json({ error: 'سعر الكيلومتر يجب أن يكون رقماً أكبر من صفر' }, { status: 400 })
      }
    } else if (key === 'min_delivery_fee') {
      const num = Number(value)
      if (isNaN(num) || num < 0) {
        return NextResponse.json({ error: 'الحد الأدنى لرسوم التوصيل يجب أن يكون رقماً صفراً أو أكثر' }, { status: 400 })
      }
    } else if (key === 'max_delivery_radius_km') {
      const num = Number(value)
      if (isNaN(num) || num <= 0) {
        return NextResponse.json({ error: 'أقصى نطاق توصيل يجب أن يكون رقماً أكبر من صفر' }, { status: 400 })
      }
    } else if (key === 'min_order_amount') {
      const num = Number(value)
      if (isNaN(num) || num < 0) {
        return NextResponse.json({ error: 'الحد الأدنى لقيمة الطلب يجب أن يكون رقماً صفراً أو أكثر' }, { status: 400 })
      }
    } else if (key === 'max_driver_active_orders') {
      const num = Number(value)
      if (isNaN(num) || num < 1) {
        return NextResponse.json({ error: 'أقصى حمولة للطيار يجب أن تكون طلباً واحداً على الأقل' }, { status: 400 })
      }
    } else if (key === 'driver_hourly_rate') {
      const num = Number(value)
      if (isNaN(num) || num < 0) {
        return NextResponse.json({ error: 'أجر ساعة عمل الطيار يجب أن يكون رقماً صفراً أو أكثر' }, { status: 400 })
      }
    } else if (key === 'delivery_zones') {
      if (!Array.isArray(value)) {
        return NextResponse.json({ error: 'مناطق التوصيل يجب أن تكون قائمة صالحة' }, { status: 400 })
      }

      const seenIds = new Set<string>()
      for (const zone of value) {
        if (!zone || typeof zone !== 'object') {
          return NextResponse.json({ error: 'بيانات المنطقة غير صالحة' }, { status: 400 })
        }
        if (!zone.id || typeof zone.id !== 'string' || !zone.id.trim()) {
          return NextResponse.json({ error: 'معرف المنطقة (ID) مطلوب وغير صالح' }, { status: 400 })
        }
        if (seenIds.has(zone.id.trim())) {
          return NextResponse.json({ error: `معرف المنطقة مكرر: ${zone.id}` }, { status: 400 })
        }
        seenIds.add(zone.id.trim())

        if (!zone.name || typeof zone.name !== 'string' || !zone.name.trim()) {
          return NextResponse.json({ error: 'اسم المنطقة مطلوب' }, { status: 400 })
        }
        const minFee = Number(zone.min_fee)
        const maxFee = Number(zone.max_fee)
        if (isNaN(minFee) || minFee < 0) {
          return NextResponse.json({ error: `الحد الأدنى للسعر غير صالح في منطقة ${zone.name}` }, { status: 400 })
        }
        if (isNaN(maxFee) || maxFee < minFee) {
          return NextResponse.json({ error: `الحد الأقصى للسعر يجب أن يكون أكبر من أو يساوي الحد الأدنى في منطقة ${zone.name}` }, { status: 400 })
        }
        if (typeof zone.is_active !== 'boolean') {
          return NextResponse.json({ error: `حالة التفعيل غير صالحة في منطقة ${zone.name}` }, { status: 400 })
        }
        if (!Array.isArray(zone.areas) || zone.areas.length === 0) {
          return NextResponse.json({ error: `يجب تحديد حي أو منطقة فرعية واحدة على الأقل في ${zone.name}` }, { status: 400 })
        }
        for (const area of zone.areas) {
          if (typeof area !== 'string' || !area.trim()) {
            return NextResponse.json({ error: `اسم الحي الفرعي غير صالح في منطقة ${zone.name}` }, { status: 400 })
          }
        }
      }
    }

    const { error } = await supabaseServer
      .from('restaurant_policies')
      .upsert({
        key,
        value,
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
