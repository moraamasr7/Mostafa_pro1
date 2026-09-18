'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface OpsNavbarProps {
  title?: string
  subtitle?: string
  restaurantName?: string
}

export default function OpsNavbar({ title, subtitle, restaurantName }: OpsNavbarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [showSecondaryMenu, setShowSecondaryMenu] = useState(false)
  const [userRole, setUserRole] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/staff')
      .then((res) => res.json())
      .then((data) => {
        if (data.currentStaff?.role) {
          setUserRole(data.currentStaff.role.toLowerCase())
        }
      })
      .catch(() => {})
  }, [])

  // Core Daily Operations Navigation
  const coreLinks = [
    { href: '/dashboard', label: '📊 الداشبورد', icon: '📊' },
    { href: '/orders', label: '📦 الطلبات', icon: '📦' },
    { href: '/drivers', label: '🛵 الطيارين', icon: '🛵' },
    { href: '/shift-control', label: '💰 الوردية والخزينة', icon: '💰' },
  ]

  const canManageSettings = userRole === 'owner' || userRole === 'manager' || userRole === null

  // Secondary Tools & Management
  const allSecondaryLinks = [
    { href: '/reports', label: '📈 التقارير التنفيذية (Z-Report)', roleRestricted: false },
    { href: '/kitchen', label: '🍳 شاشة المطبخ (KDS)', roleRestricted: false },
    { href: '/assignments', label: '📦 إسناد وتوجيه الرحلات', roleRestricted: false },
    { href: '/schedule', label: '⏰ مواعيد العمل والتشغيل', roleRestricted: true },
    { href: '/settings', label: '⚙️ سياسات وإعدادات المطعم', roleRestricted: true },
    { href: '/driver-portal', label: '📱 بوابة الطيار الميداني', roleRestricted: false },
  ]

  const secondaryLinks = allSecondaryLinks.filter((l) => !l.roleRestricted || canManageSettings)

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

  const isSecondaryActive = secondaryLinks.some(
    (link) => pathname === link.href || pathname.startsWith(link.href)
  )

  return (
    <>
      <header className="bg-gradient-to-l from-zinc-950 via-zinc-900 to-zinc-950 text-white shadow-md sticky top-0 z-40 border-b border-zinc-800/80">
        <div className="max-w-7xl mx-auto px-4 py-2.5">
          <div className="flex items-center justify-between gap-4">
            {/* Brand / System Identity (Generic by Design) */}
            <div className="flex items-center gap-3">
              <span className="text-2xl sm:text-3xl">🥩</span>
              <div>
                <h1 className="text-sm sm:text-base font-black tracking-tight text-white flex items-center gap-2">
                  <span>{restaurantName || 'منظومة تشغيل المطعم'}</span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {title || 'لوحة العمليات'}
                  </span>
                </h1>
                {subtitle && <p className="text-zinc-400 text-xs hidden sm:block">{subtitle}</p>}
              </div>
            </div>

            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center gap-1.5 text-xs font-bold">
              {coreLinks.map((link) => {
                const isActive =
                  pathname === link.href || (link.href !== '/dashboard' && pathname.startsWith(link.href))
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition-all flex items-center gap-1.5 ${
                      isActive
                        ? 'bg-amber-600 text-white shadow-xs font-black'
                        : 'text-zinc-300 hover:text-white hover:bg-zinc-800'
                    }`}
                  >
                    <span>{link.label}</span>
                  </Link>
                )
              })}

              {/* Secondary Tools Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowSecondaryMenu(!showSecondaryMenu)}
                  className={`px-2.5 py-1.5 rounded-xl whitespace-nowrap transition-all flex items-center gap-1 text-xs font-bold ${
                    isSecondaryActive
                      ? 'bg-zinc-800 text-amber-300 border border-amber-500/40'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                  }`}
                >
                  <span>⋯ المزيد</span>
                </button>

                {showSecondaryMenu && (
                  <div className="absolute left-0 mt-2 w-52 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl py-2 z-50 text-xs">
                    <div className="px-3 py-1 text-[10px] font-black text-zinc-500 uppercase tracking-wider border-b border-zinc-800 mb-1">
                      الأدوات والإعدادات
                    </div>
                    {secondaryLinks.map((link) => {
                      const isActive = pathname === link.href
                      return (
                        <Link
                          key={link.href}
                          href={link.href}
                          onClick={() => setShowSecondaryMenu(false)}
                          className={`block px-3 py-2 transition-colors ${
                            isActive
                              ? 'bg-amber-600/20 text-amber-300 font-black'
                              : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                          }`}
                        >
                          {link.label}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            </nav>

            {/* Actions: Logout / Switch */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleLogout}
                className="bg-red-950/60 hover:bg-red-900 text-red-200 text-xs font-bold py-1.5 px-3 rounded-xl border border-red-800/50 transition-colors flex items-center gap-1"
                title="تسجيل الخروج من الجلسة"
              >
                <span>خروج</span>
                <span>🚪</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Touch Bottom Navigation Bar (Thumb Reach) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-zinc-950 border-t border-zinc-800 px-2 py-2 flex items-center justify-around shadow-2xl backdrop-blur-md">
        {coreLinks.map((link) => {
          const isActive =
            pathname === link.href || (link.href !== '/dashboard' && pathname.startsWith(link.href))
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all ${
                isActive ? 'text-amber-400 font-black scale-105' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span className="text-lg">{link.icon}</span>
              <span className="text-[10px] mt-0.5">{link.label.split(' ')[1] || link.label}</span>
            </Link>
          )
        })}
      </div>
    </>
  )
}
