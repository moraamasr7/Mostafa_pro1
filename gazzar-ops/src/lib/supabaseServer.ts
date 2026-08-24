import { createClient } from '@supabase/supabase-js'

export function getSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || 'https://placeholder.supabase.co'
  const serviceRoleKey =
    (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY.trim()) ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    'placeholder-key'

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
