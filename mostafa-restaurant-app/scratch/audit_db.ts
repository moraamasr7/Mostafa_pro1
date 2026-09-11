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

async function inspectFunctions() {
  const supabase = getSupabaseServerClient()

  // Query function definitions from pg_proc via rpc or check columns of orders
  // Let's test calling create_manual_order_secure with bad args to see error or query
  const { data: cols, error: colErr } = await supabase.rpc('get_table_columns_test' as any)
  console.log('Test rpc:', colErr?.message)
}

inspectFunctions()
