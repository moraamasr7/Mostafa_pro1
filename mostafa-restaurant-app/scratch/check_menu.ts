import fs from 'fs'
import path from 'path'

const envPath = path.resolve(__dirname, '../.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.replace(/\r/g, '').trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=')
      if (idx > 0) {
        process.env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim()
      }
    }
  }
}

import { getSupabaseServerClient } from '../src/lib/supabaseServer'

async function checkMenuData() {
  const supabase = getSupabaseServerClient()
  const { data: categories, error: catErr } = await supabase
    .from('categories')
    .select('id, name, display_order, is_active, menu_items(id, name, description, is_available, item_variants(id, variant_name, price, is_available))')
    .order('display_order', { ascending: true })

  console.log('Categories error:', catErr)
  console.log('Categories count:', categories?.length)
  if (categories && categories.length > 0) {
    console.log('Sample category:', categories[0].name, '| Items count:', categories[0].menu_items?.length)
    if (categories[0].menu_items?.length > 0) {
      console.log('Sample item:', categories[0].menu_items[0].name, '| Variants count:', categories[0].menu_items[0].item_variants?.length)
    }
  }
}

checkMenuData()
