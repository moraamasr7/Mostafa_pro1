import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import { ADMIN_COOKIE_NAME } from '../login/route'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get(ADMIN_COOKIE_NAME)

    if (!sessionCookie || !sessionCookie.value.startsWith('staff_auth_')) {
      return NextResponse.json(
        { error: 'غير مصرح الوصول. يرجى تسجيل الدخول بكود الكاشير.' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const statusFilter = searchParams.get('status') || 'active'

    let query = supabase
      .from('orders')
      .select(`
        id,
        order_number,
        customer_name,
        customer_phone,
        delivery_address,
        order_type,
        payment_method,
        payment_receipt_url,
        status,
        total_amount,
        notes,
        created_at,
        order_items (
          id,
          quantity,
          unit_price,
          subtotal,
          item_notes,
          item_variants (
            variant_name,
            menu_items (
              name
            )
          )
        ),
        order_driver_assignments (
          id,
          status,
          assigned_at,
          drivers (
            id,
            name,
            phone
          )
        )
      `)
      .order('created_at', { ascending: false })

    if (statusFilter === 'active') {
      query = query.in('status', ['pending', 'processing', 'ready', 'assigned', 'picked_up', 'out_for_delivery'])
    } else if (statusFilter === 'takeaway') {
      query = query.eq('order_type', 'takeaway').in('status', ['pending', 'processing', 'ready'])
    } else if (statusFilter === 'delivery') {
      query = query.eq('order_type', 'delivery').in('status', ['pending', 'processing', 'ready', 'assigned', 'picked_up', 'out_for_delivery'])
    } else if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }

    const { data: rawOrders, error } = await query

    if (error) {
      console.error('خطأ في جلب طلبات الداشبورد:', error)
      return NextResponse.json(
        { error: 'تعذر تحميل بيانات الطلبات' },
        { status: 500 }
      )
    }

    interface DriverSubRow { id: string; name: string; phone: string }
    interface AssignmentQueryRow { id: string; status: string; drivers?: DriverSubRow }
    interface OrderQueryRow {
      id: string
      order_number: number
      customer_name: string
      customer_phone: string
      delivery_address?: string
      order_type: string
      status: string
      total_amount: number
      notes?: string
      created_at: string
      order_items?: unknown[]
      order_driver_assignments?: AssignmentQueryRow[]
    }

    const formattedOrders = ((rawOrders as unknown as OrderQueryRow[]) || []).map((o) => {
      const activeAssignment = (o.order_driver_assignments || []).find((a) =>
        ['assigned', 'accepted', 'picked_up', 'out_for_delivery'].includes(a.status)
      )

      return {
        ...o,
        assigned_driver: activeAssignment
          ? {
              assignment_id: activeAssignment.id,
              assignment_status: activeAssignment.status,
              driver_id: activeAssignment.drivers?.id,
              driver_name: activeAssignment.drivers?.name,
              driver_phone: activeAssignment.drivers?.phone,
            }
          : null,
      }
    })

    return NextResponse.json({ orders: formattedOrders }, { status: 200 })
  } catch (err) {
    console.error('خطأ غير متوقع في API الداشبورد:', err)
    return NextResponse.json(
      { error: 'حدث خطأ غير متوقع' },
      { status: 500 }
    )
  }
}
