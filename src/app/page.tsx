import { Suspense } from 'react'
import { getMenu } from '@/lib/queries'
import { MenuVariantRow, GroupedCategory } from '@/types/menu'
import MenuPageClient from '@/components/MenuPageClient'

// تجميع الصفوف المسطحة (flat) من v_full_menu إلى هيكل شجري: category → item → variants
// ليه؟ الـ view بترجع صف لكل variant، لكن الفرونت محتاج يعرض كل صنف مع كل أحجامه مع بعض
function groupMenu(rows: MenuVariantRow[]): GroupedCategory[] {
  const categoryMap = new Map<string, GroupedCategory>()

  for (const row of rows) {
    // لو القسم مش موجود لسه، نضيفه
    if (!categoryMap.has(row.category_id)) {
      categoryMap.set(row.category_id, {
        id: row.category_id,
        name: row.category_name,
        order: row.category_order,
        items: [],
      })
    }

    const category = categoryMap.get(row.category_id)!

    // نبحث عن الصنف جوه القسم
    let menuItem = category.items.find((item) => item.id === row.item_id)

    if (!menuItem) {
      menuItem = {
        id: row.item_id,
        name: row.item_name,
        description: row.item_description,
        available: row.item_available,
        variants: [],
      }
      category.items.push(menuItem)
    }

    // نضيف الحجم (variant) للصنف
    menuItem.variants.push({
      id: row.variant_id,
      name: row.variant_name,
      price: Number(row.price),
      available: row.variant_available,
    })
  }

  // ترتيب الأقسام حسب الترتيب المحدد في قاعدة البيانات
  return Array.from(categoryMap.values()).sort((a, b) => a.order - b.order)
}

// Server component — يقرأ المنيو من قاعدة البيانات ويمرره للعميل
export default async function MenuPage() {
  const rows = await getMenu()
  const categories = groupMenu(rows)

  return (
    <Suspense fallback={<div className="min-h-screen bg-amber-50 flex items-center justify-center p-4 text-amber-900 font-bold">جاري تحميل المنيو...</div>}>
      <MenuPageClient categories={categories} />
    </Suspense>
  )
}
