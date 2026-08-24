import { supabase } from './supabase'
import { MenuVariantRow } from '../types/menu'

export async function getMenu(): Promise<MenuVariantRow[]> {
  const { data, error } = await supabase
    .from('v_full_menu')
    .select('*')
    .order('category_order', { ascending: true })

  if (error) {
    console.error('Error fetching menu:', error)
    return []
  }

  return data as MenuVariantRow[]
}

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
