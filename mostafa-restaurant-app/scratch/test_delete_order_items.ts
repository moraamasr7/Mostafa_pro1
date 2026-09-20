import fs from 'fs'
import path from 'path'

const envPath = path.resolve(__dirname, '../.env.local')
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((l) => {
    const t = l.trim()
    if (t && !t.startsWith('#')) {
      const idx = t.indexOf('=')
      if (idx > 0) process.env[t.slice(0, idx).trim()] = t.slice(idx + 1).trim()
    }
  })
}

import { getSupabaseServerClient } from '../src/lib/supabaseServer'

const supabase = getSupabaseServerClient()

async function main() {
  const { data: rows } = await supabase.from('order_items').select('id')
  console.log('Fetched order_items count:', rows?.length)

  if (rows && rows.length > 0) {
    const id = rows[0].id
    const res = await supabase.from('order_items').delete().eq('id', id).select()
    console.log('Deleted single order_item with .select():', res)
  }

  const { data: allRows } = await supabase.from('order_items').select('id')
  const allIds = allRows?.map(r => r.id) || []
  console.log('Remaining order_items count:', allIds.length)

  const chunkRes = await supabase.from('order_items').delete().in('id', allIds).select()
  console.log('Chunk delete result:', chunkRes.data?.length, 'error:', chunkRes.error)

  const { count: finalCount } = await supabase.from('order_items').select('*', { count: 'exact', head: true })
  console.log('Final count after chunk delete:', finalCount)
}

main().catch(console.error)
