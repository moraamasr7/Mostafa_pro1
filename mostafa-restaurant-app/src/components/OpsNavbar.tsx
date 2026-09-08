'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface OpsNavbarProps {
  title?: string
  subtitle?: string
}

export default function OpsNavbar({ title, subtitle }: OpsNavbarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const navLinks = [
    { href: '/dashboard', label: '📊 الداشبورد' },
    { href: '/orders', label: '🥩 الطلبات' },
    { href: '/kitchen', label: '🍳 المطبخ' },
    { href: '/assignments', label: '📦 الإسناد' },
    { href: '/drivers', label: '🛵 الطيارين' },
    { href: '/shift-control', label: '📋 الوردية والتحصيل' },
    { href: '/schedule', label: '⏰ المواعيد' },
    { href: '/settings', label: '⚙️ الإعدادات' },
    { href: '/driver-portal', label: '📱 بوابة الطيار' },
  ]

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
    } catch {
      // ignore
    }
    try {
      await fetch('/api/admin/logout', { method: 'POST' })
    } catch {
      // ignore
    }
    router.push('/login')
  }

  return (
    <header className="bg-gradient-to-l from-zinc-900 via-amber-950 to-zinc-900 text-white shadow-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-amber-900/40">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🥩</span>
            <div>
              <h1 className="text-base font-black tracking-tight text-white flex items-center gap-2">
                <span>مصطفى الجزار</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {title || 'إدارة العمليات'}
                </span>
              </h1>
              {subtitle && <p className="text-amber-200/70 text-xs">{subtitle}</p>}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="text-xs text-amber-200/80 hover:text-white px-2 py-1 transition-colors"
            >
              تسجيل الدخول
            </Link>
            <button
              onClick={handleLogout}
              className="bg-red-900/40 hover:bg-red-800 text-red-200 text-xs font-bold py-1.5 px-3 rounded-lg border border-red-700/50 transition-colors"
            >
              خروج
            </button>
          </div>
        </div>

        <nav className="flex items-center gap-1 overflow-x-auto pt-2 scrollbar-none text-xs font-bold">
          {navLinks.map((link) => {
            const isActive = pathname === link.href || (link.href !== '/dashboard' && pathname.startsWith(link.href))
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-amber-100/80 hover:text-white hover:bg-white/10'
                }`}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
