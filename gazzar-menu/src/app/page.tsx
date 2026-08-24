import { Suspense } from 'react'
import { getMenu } from '@/lib/queries'
import { MenuVariantRow, GroupedCategory } from '@/types/menu'
import MenuPageClient from '@/components/MenuPageClient'

function groupMenu(rows: MenuVariantRow[]): GroupedCategory[] {
  const categoryMap = new Map<string, GroupedCategory>()

  for (const row of rows) {
    if (!categoryMap.has(row.category_id)) {
      categoryMap.set(row.category_id, {
        id: row.category_id,
        name: row.category_name,
        order: row.category_order,
        items: [],
      })
    }

    const category = categoryMap.get(row.category_id)!
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

    menuItem.variants.push({
      id: row.variant_id,
      name: row.variant_name,
      price: Number(row.price),
      available: row.variant_available,
    })
  }

  return Array.from(categoryMap.values()).sort((a, b) => a.order - b.order)
}

export default async function MenuPage() {
  const rows = await getMenu()
  const categories = groupMenu(rows)

  return (
    <Suspense fallback={<div className="min-h-screen bg-dark-950 flex items-center justify-center p-4 text-amber-500 font-bold">جاري تحميل المنيو...</div>}>
      <MenuPageClient categories={categories} />
    </Suspense>
  )
}
