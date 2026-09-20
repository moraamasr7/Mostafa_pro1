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
  const { data: ords, count, error } = await supabase.from('orders').select('*', { count: 'exact' })
  console.log('Orders count:', count, 'data length:', ords?.length, 'error:', error)
  if (ords && ords.length > 0) {
    console.log('First order:', ords[0])
  }
}

main().catch(console.error)
