import { SupabaseClient } from '@supabase/supabase-js'

export const ADMIN_COOKIE_NAME = 'admin_session'

export interface StaffSessionUser {
  id: string
  email: string
  full_name: string
  role: 'owner' | 'cashier' | 'kitchen' | string
  is_active: boolean
}

export const AUTHORIZED_SHIFT_CLOSE_ROLES = ['owner', 'cashier']
export const AUTHORIZED_SETTINGS_ROLES = ['owner']

export function canStaffCloseShift(role?: string): boolean {
  return AUTHORIZED_SHIFT_CLOSE_ROLES.includes(role?.toLowerCase().trim() || '')
}

export function canStaffManageSettings(role?: string): boolean {
  return (role?.toLowerCase().trim() || '') === 'owner'
}

export async function getStaffSession(
  serverSupabase: SupabaseClient,
  cookieStore: { get: (name: string) => { value: string } | undefined }
): Promise<{ staff: StaffSessionUser | null; error?: string; status?: number }> {
  const sessionCookie = cookieStore.get(ADMIN_COOKIE_NAME)
  if (!sessionCookie || !sessionCookie.value || !sessionCookie.value.startsWith('staff_auth')) {
    return {
      staff: null,
      error: 'غير مصرح الوصول. يرجى تسجيل الدخول كعضو في طاقم العمل.',
      status: 401,
    }
  }

  const cookieVal = sessionCookie.value
  const parts = cookieVal.split(/[:_]/)
  let staffId: string | null = null

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  for (const p of parts) {
    if (uuidRegex.test(p)) {
      staffId = p
      break
    }
  }

  if (!staffId) {
    return {
      staff: null,
      error: 'جلسة العمل غير صالحة. يرجى تسجيل الدخول مجدداً.',
      status: 401,
    }
  }

  const { data: profile, error } = await serverSupabase
    .from('staff_profiles')
    .select('id, email, full_name, role, is_active')
    .eq('id', staffId)
    .maybeSingle()

  if (error || !profile) {
    return {
      staff: null,
      error: 'ملف الموظف غير موجود في سجلات المطعم (staff_profiles).',
      status: 401,
    }
  }

  if (!profile.is_active) {
    return {
      staff: null,
      error: 'حساب الموظف معطل حالياً من قِبل الإدارة.',
      status: 403,
    }
  }

  return { staff: profile as StaffSessionUser }
}
