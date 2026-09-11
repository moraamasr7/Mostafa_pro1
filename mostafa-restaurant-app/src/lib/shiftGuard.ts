import { SupabaseClient } from '@supabase/supabase-js'

export interface ActiveShiftCheckResult {
  hasActiveShift: boolean
  activeShiftId?: string
  shiftNumber?: number
  openedBy?: string
  openedAt?: string
  error?: string
}

/**
 * Checks if there is currently an open daily shift for the restaurant.
 * Returns the shift info if open, or hasActiveShift: false.
 */
export async function getActiveDailyShift(supabase: SupabaseClient): Promise<ActiveShiftCheckResult> {
  try {
    const { data: shift, error } = await supabase
      .from('daily_shifts')
      .select('id, shift_number, opened_by, opened_at, status')
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('Error verifying active daily shift:', error)
      return { hasActiveShift: false, error: 'تعذر التحقق من حالة الوردية' }
    }

    if (!shift) {
      return { hasActiveShift: false }
    }

    return {
      hasActiveShift: true,
      activeShiftId: shift.id,
      shiftNumber: shift.shift_number,
      openedBy: shift.opened_by,
      openedAt: shift.opened_at,
    }
  } catch (err: any) {
    console.error('Unexpected error checking active shift:', err)
    return { hasActiveShift: false, error: 'خطأ غير متوقع أثناء فحص الوردية' }
  }
}
