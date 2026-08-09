import { supabase } from './supabase'
import { MenuVariantRow } from '../types/menu'

// جلب قائمة الطعام بالكامل من قاعدة البيانات
// يقوم بالقراءة من الـ view المجهزة لتسريع وضمان سلامة البيانات المعروضة
export async function getMenu(): Promise<MenuVariantRow[]> {
  const { data, error } = await supabase
    .from('v_full_menu')
    .select('*')
    .order('category_order', { ascending: true })
    .order('item_name', { ascending: true })

  if (error) {
    // تسجيل الخطأ للمطورين في حالة وجود خلل في الاستعلام
    console.error('Error fetching menu:', error)
    return []
  }

  return data as MenuVariantRow[]
}

// جلب تفاصيل طلب معين باستخدام الـ ID الخاص به
export async function getOrder(id: string) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching order:', error)
    return null
  }

  return data
}

// جلب الأصناف التابعة لطلب معين بالتفصيل
export async function getOrderItems(orderId: string) {
  const { data, error } = await supabase
    .from('order_items')
    .select(`
      id,
      quantity,
      unit_price,
      subtotal,
      item_notes,
      item_variants (
        variant_name,
        menu_items (
          name
        )
      )
    `)
    .eq('order_id', orderId)

  if (error) {
    console.error('Error fetching order items:', error)
    return []
  }

  return data
}
