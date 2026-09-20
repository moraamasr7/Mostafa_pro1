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
  const { count: countOI } = await supabase.from('order_items').select('*', { count: 'exact', head: true })
  const { count: countODA } = await supabase.from('order_driver_assignments').select('*', { count: 'exact', head: true })
  const { count: countDO } = await supabase.from('delivery_outcomes').select('*', { count: 'exact', head: true })
  console.log('order_items count:', countOI)
  console.log('order_driver_assignments count:', countODA)
  console.log('delivery_outcomes count:', countDO)

  const { data: ords } = await supabase.from('orders').select('id').limit(1)
  if (ords && ords[0]) {
    const res = await supabase.from('orders').delete().eq('id', ords[0].id)
    console.log('Deleting single order response:', res)
  }
}

main().catch(console.error)
