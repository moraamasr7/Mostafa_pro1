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
  const { data: ord } = await supabase.from('orders').select('id').limit(1).single()
  console.log('Trying to delete order:', ord?.id)

  const { error } = await supabase.from('orders').delete().eq('id', ord?.id)
  console.log('Delete single order error:', error)
}

main().catch(console.error)
