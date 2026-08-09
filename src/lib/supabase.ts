import { createClient } from '@supabase/supabase-js'

// تهيئة عميل قاعدة البيانات (Supabase) للاتصال بالخادم
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
