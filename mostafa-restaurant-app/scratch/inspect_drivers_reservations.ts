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
  console.log('--- DRIVERS INSPECTION ---')
  const { data: drivers, error: dErr } = await supabase.from('drivers').select('*')
  console.log('Drivers:', drivers?.length, 'error:', dErr)
  console.log(drivers?.map(d => ({ id: d.id, name: d.name, status: d.status, is_active: d.is_active })))

  console.log('--- RESERVATIONS INSPECTION ---')
  const { data: reservations, error: rErr } = await supabase.from('reservations').select('*')
  console.log('Reservations:', reservations?.length, 'error:', rErr)
  console.log(reservations)
}

main().catch(console.error)
