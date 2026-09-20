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
  const { data: remainingOrders, error: ordErr } = await supabase.from('orders').select('id, order_number, daily_shift_id')
  console.log('Remaining orders count:', remainingOrders?.length, 'error:', ordErr)

  if (remainingOrders && remainingOrders.length > 0) {
    console.log('Sample remaining orders:', remainingOrders.slice(0, 5))
  }
}

main().catch(console.error)
