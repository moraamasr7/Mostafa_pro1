import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabaseServer'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = getSupabaseServerClient()
    const { data: categories, error } = await supabase
      .from('categories')
      .select('id, name, display_order, is_active, menu_items(id, name, description, is_available, item_variants(id, variant_name, price, is_available))')
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    if (error) {
      console.error('Error fetching menu items:', error)
      return NextResponse.json({ error: 'تعذر تحميل قائمة الطعام' }, { status: 500 })
    }

    return NextResponse.json({ categories: categories || [] }, { status: 200 })
  } catch (err) {
    console.error('Unexpected error fetching menu:', err)
    return NextResponse.json({ error: 'حدث خطأ غير متوقع أثناء تحميل المنيو' }, { status: 500 })
  }
}
