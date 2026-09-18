import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServerClient } from '@/lib/supabaseServer'
import { getStaffSession } from '@/lib/staffAuth'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = getSupabaseServerClient()
    const cookieStore = await cookies()
    const { staff: currentStaff } = await getStaffSession(supabase, cookieStore).catch(() => ({ staff: null }))

    const { data: staff, error } = await supabase
      .from('staff_profiles')
      .select('id, full_name, role')
      .eq('is_active', true)
      .order('full_name', { ascending: true })

    if (error) {
      console.error('Error fetching staff list:', error)
      return NextResponse.json({ error: 'تعذر جلب قائمة طاقم العمل' }, { status: 500 })
    }

    return NextResponse.json({
      staff: staff || [],
      currentStaff: currentStaff ? {
        id: currentStaff.id,
        full_name: currentStaff.full_name,
        role: currentStaff.role,
      } : null,
    }, { status: 200 })
  } catch (err) {
    console.error('Staff API error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
