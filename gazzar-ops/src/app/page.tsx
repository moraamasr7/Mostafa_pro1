import { redirect } from 'next/navigation'

export default function OpsHomePage() {
  redirect('/admin/orders')
}
