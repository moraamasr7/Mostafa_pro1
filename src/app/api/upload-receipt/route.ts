import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json(
        { error: 'لم يتم اختيار ملف الصورة' },
        { status: 400 }
      )
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'نوع الملف غير مدعوم. يرجى اختيار صورة (JPG, PNG, WEBP)' },
        { status: 400 }
      )
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'حجم الصورة كبير جداً (الأقصى 10 ميجابايت)' },
        { status: 400 }
      )
    }

    const fileExt = file.name.split('.').pop() || 'jpg'
    const fileName = `receipt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`
    const buffer = Buffer.from(await file.arrayBuffer())

    // رفع الملف في Supabase Storage Bucket باسم receipts
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('receipts')
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) {
      console.error('خطأ في رفع صورة التحويل لـ Supabase Storage:', uploadError)
      // إذا كان الباكت غير أنشئ بعد، نرجع رابط محلي مؤقت أو توضيح
      return NextResponse.json(
        { error: 'تعذر رفع الصورة لقاعدة البيانات. تأكد من إنشاء Storage Bucket باسم receipts في Supabase.' },
        { status: 500 }
      )
    }

    // جلب الرابط العام المباشر للصورة المرفوعة
    const { data: publicUrlData } = supabase.storage
      .from('receipts')
      .getPublicUrl(uploadData.path)

    return NextResponse.json({
      url: publicUrlData.publicUrl,
      path: uploadData.path,
    })
  } catch (err) {
    console.error('خطأ أثناء رفع إثبات الدفع:', err)
    return NextResponse.json(
      { error: 'حدث خطأ أثناء رفع الصورة' },
      { status: 500 }
    )
  }
}
