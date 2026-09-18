'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useTheme, ThemeMode } from '@/components/ThemeProvider'

interface StaffMember {
  id: string
  full_name: string
  role: string
}

interface OpsNavbarProps {
  title?: string
  subtitle?: string
  restaurantName?: string
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'مالك',
  manager: 'مشرف',
  cashier: 'كاشير',
  kitchen: 'مطبخ',
  driver: 'طيار',
}

export default function OpsNavbar({ title, restaurantName }: OpsNavbarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { theme, setTheme } = useTheme()

  const [showSecondaryMenu, setShowSecondaryMenu] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [currentStaff, setCurrentStaff] = useState<StaffMember | null>(null)
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  
  // Switch User Modal State
  const [isSwitchModalOpen, setIsSwitchModalOpen] = useState(false)
  const [selectedStaffId, setSelectedStaffId] = useState<string>('')
  const [passcode, setPasscode] = useState<string>('')
  const [switchLoading, setSwitchLoading] = useState(false)
  const [switchError, setSwitchError] = useState<string | null>(null)

  const userMenuRef = useRef<HTMLDivElement>(null)
  const secondaryMenuRef = useRef<HTMLDivElement>(null)

  const fetchStaffData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/staff')
      if (!res.ok) return
      const data = await res.json()
      if (data.currentStaff) {
        setCurrentStaff(data.currentStaff)
      }
      if (Array.isArray(data.staff)) {
        setStaffList(data.staff)
        if (data.staff.length > 0 && !selectedStaffId) {
          const nextStaff = data.staff.find((s: StaffMember) => s.id !== data.currentStaff?.id) || data.staff[0]
          setSelectedStaffId(nextStaff.id)
        }
      }
    } catch {
      // ignore
    }
  }, [selectedStaffId])

  useEffect(() => {
    fetchStaffData()
  }, [fetchStaffData])

  // Click outside listener for dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false)
      }
      if (secondaryMenuRef.current && !secondaryMenuRef.current.contains(e.target as Node)) {
        setShowSecondaryMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const userRole = currentStaff?.role ? currentStaff.role.toLowerCase() : null
  const canManageSettings = userRole === 'owner' || userRole === 'manager' || userRole === null

  // Core 4 Navigation Links
  const coreLinks = [
    { href: '/dashboard', label: 'الرئيسية', icon: '📊' },
    { href: '/orders', label: 'الطلبات', icon: '📦' },
    { href: '/drivers', label: 'الطيارين', icon: '🛵' },
    { href: '/shift-control', label: 'الخزينة', icon: '💰' },
  ]

  // Secondary Tools
  const allSecondaryLinks = [
    { href: '/reports', label: '📈 التقارير التنفيذية (Z-Report)', roleRestricted: false },
    { href: '/kitchen', label: '🍳 شاشة المطبخ (KDS)', roleRestricted: false },
    { href: '/assignments', label: '📦 توجيه الرحلات', roleRestricted: false },
    { href: '/settings', label: '⚙️ إعدادات وسياسات المطعم', roleRestricted: true },
    { href: '/driver-portal', label: '📱 بوابة الطيار الميداني', roleRestricted: false },
  ]

  const secondaryLinks = allSecondaryLinks.filter((l) => !l.roleRestricted || canManageSettings)

  const handleOpenSwitchModal = () => {
    setShowUserMenu(false)
    setSwitchError(null)
    setPasscode('')
    if (staffList.length > 0 && !selectedStaffId) {
      const candidate = staffList.find((s) => s.id !== currentStaff?.id) || staffList[0]
      setSelectedStaffId(candidate.id)
    }
    setIsSwitchModalOpen(true)
  }

  const handleSwitchSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedStaffId) {
      setSwitchError('يرجى اختيار الموظف أولاً')
      return
    }
    if (!passcode.trim()) {
      setSwitchError('يرجى إدخال رمز الدخول')
      return
    }

    setSwitchLoading(true)
    setSwitchError(null)

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_id: selectedStaffId,
          passcode: passcode.trim(),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setSwitchError(data.error || 'فشل التحقق من رمز الدخول')
        setSwitchLoading(false)
        return
      }

      setIsSwitchModalOpen(false)
      setPasscode('')
      window.location.reload()
    } catch (err: any) {
      setSwitchError(err?.message || 'حدث خطأ في الاتصال بالخادم')
      setSwitchLoading(false)
    }
  }

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
      <header className="bg-zinc-950 text-zinc-100 border-b border-zinc-800 sticky top-0 z-40 select-none">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2">
          <div className="flex items-center justify-between gap-3">
            {/* Brand Identity */}
            <div className="flex items-center gap-2.5 shrink-0">
              <span className="text-xl sm:text-2xl">🥩</span>
              <div className="flex items-center gap-2">
                <span className="text-sm sm:text-base font-black tracking-tight text-white">
                  {restaurantName || 'مطعم مصطفى الجزار'}
                </span>
                {title && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700 hidden sm:inline">
                    {title}
                  </span>
                )}
              </div>
            </div>

            {/* Core Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1 text-xs font-bold">
              {coreLinks.map((link) => {
                const isActive =
                  pathname === link.href || (link.href !== '/dashboard' && pathname.startsWith(link.href))
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all flex items-center gap-1.5 ${
                      isActive
                        ? 'bg-amber-600 text-white font-black shadow-xs'
                        : 'text-zinc-300 hover:text-white hover:bg-zinc-850'
                    }`}
                  >
                    <span>{link.icon}</span>
                    <span>{link.label}</span>
                  </Link>
                )
              })}

              {/* Secondary Menu Dropdown */}
              <div className="relative" ref={secondaryMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowSecondaryMenu(!showSecondaryMenu)}
                  className={`px-2.5 py-1.5 rounded-lg whitespace-nowrap transition-all flex items-center gap-1 text-xs font-bold cursor-pointer ${
                    isSecondaryActive
                      ? 'bg-zinc-800 text-amber-300 border border-amber-500/40'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
                  }`}
                >
                  <span>⋯ المزيد</span>
                </button>

                {showSecondaryMenu && (
                  <div className="absolute left-0 mt-2 w-52 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl py-1.5 z-50 text-xs text-right animate-fadeIn">
                    <div className="px-3 py-1 text-[10px] font-bold text-zinc-500 uppercase border-b border-zinc-800 mb-1">
                      أدوات إضافية
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
                              ? 'bg-amber-600/20 text-amber-300 font-bold'
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

            {/* Right: User Menu with Integrated Theme Selector */}
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-850 border border-zinc-700/80 rounded-xl px-2.5 py-1.5 text-xs text-right transition-colors cursor-pointer"
              >
                <span>👤</span>
                <div className="flex flex-col leading-tight">
                  <span className="font-bold text-white max-w-[90px] sm:max-w-[120px] truncate">
                    {currentStaff?.full_name || 'طاقم العمل'}
                  </span>
                  <span className="text-[10px] text-amber-400 font-medium">
                    {currentStaff?.role ? ROLE_LABELS[currentStaff.role] || currentStaff.role : 'كاشير'}
                  </span>
                </div>
                <span className="text-zinc-400 text-[10px]">▾</span>
              </button>

              {/* User Dropdown Menu */}
              {showUserMenu && (
                <div className="absolute left-0 mt-2 w-56 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-2 z-50 text-xs text-right animate-fadeIn">
                  {/* Staff Info Header */}
                  <div className="px-2.5 py-2 border-b border-zinc-800 mb-1.5">
                    <p className="font-black text-white text-sm">{currentStaff?.full_name}</p>
                    <p className="text-[11px] text-amber-400 font-medium">
                      الدور: {currentStaff?.role ? ROLE_LABELS[currentStaff.role] || currentStaff.role : 'مستخدم'}
                    </p>
                  </div>

                  {/* Switch Operator */}
                  <button
                    type="button"
                    onClick={handleOpenSwitchModal}
                    className="w-full flex items-center justify-between px-2.5 py-2 text-zinc-200 hover:bg-zinc-800 rounded-xl transition-colors font-bold cursor-pointer"
                  >
                    <span>🔄 تبديل المسؤول</span>
                    <span className="text-[10px] text-zinc-400">سريع</span>
                  </button>

                  {/* Theme Selector Section */}
                  <div className="my-1.5 p-2 bg-zinc-950/60 rounded-xl border border-zinc-800/80">
                    <p className="text-[10px] font-bold text-zinc-400 mb-1.5">المظهر (Theme):</p>
                    <div className="grid grid-cols-3 gap-1">
                      {(
                        [
                          { mode: 'light', label: '☀️ فاتح' },
                          { mode: 'dark', label: '🌙 داكن' },
                          { mode: 'system', label: '⚙️ تلقائي' },
                        ] as const
                      ).map((item) => {
                        const isCurrent = theme === item.mode
                        return (
                          <button
                            key={item.mode}
                            type="button"
                            onClick={() => setTheme(item.mode as ThemeMode)}
                            className={`py-1 px-1.5 rounded-lg text-[10px] font-bold transition-all text-center cursor-pointer ${
                              isCurrent
                                ? 'bg-amber-600 text-white shadow-xs'
                                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                            }`}
                          >
                            {item.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="border-t border-zinc-800 my-1"></div>

                  {/* Logout Action */}
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-2.5 py-2 text-red-300 hover:bg-red-950/60 hover:text-red-200 rounded-xl transition-colors font-bold cursor-pointer"
                  >
                    <span>🚪</span>
                    <span>تسجيل الخروج</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Fast Switch User Modal */}
      {isSwitchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-fadeIn">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md p-5 shadow-2xl relative text-right text-white">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-3">
              <h2 className="text-sm sm:text-base font-black flex items-center gap-2 text-amber-300">
                <span>🔄</span>
                <span>تبديل المسؤول</span>
              </h2>
              <button
                type="button"
                onClick={() => !switchLoading && setIsSwitchModalOpen(false)}
                className="text-zinc-400 hover:text-white text-base p-1 cursor-pointer"
                disabled={switchLoading}
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-zinc-400 mb-3 leading-relaxed">
              اختر الموظف المستلم وأدخل رمز الدخول لتوثيق الجلسة فوراً.
            </p>

            {switchError && (
              <div className="bg-red-950/80 border border-red-700 text-red-200 text-xs p-2.5 rounded-xl mb-3 flex items-center gap-2">
                <span>⚠️</span>
                <span>{switchError}</span>
              </div>
            )}

            <form onSubmit={handleSwitchSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1">
                  الموظف المستلم:
                </label>
                <select
                  value={selectedStaffId}
                  onChange={(e) => setSelectedStaffId(e.target.value)}
                  disabled={switchLoading}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-hidden focus:border-amber-500"
                >
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} — ({ROLE_LABELS[s.role] || s.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1">
                  رمز الدخول (Passcode):
                </label>
                <input
                  type="password"
                  placeholder="••••"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  disabled={switchLoading}
                  autoFocus
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs font-bold text-white tracking-widest text-center focus:outline-hidden focus:border-amber-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={switchLoading}
                  className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-black py-2.5 px-4 rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {switchLoading ? (
                    <span>جاري التحقق...</span>
                  ) : (
                    <span>✅ تأكيد التبديل</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsSwitchModalOpen(false)}
                  disabled={switchLoading}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold py-2.5 px-3.5 rounded-xl cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mobile Touch Bottom Bar (4 Core Links) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-zinc-950 border-t border-zinc-800 px-2 py-1.5 flex items-center justify-around shadow-2xl backdrop-blur-md">
        {coreLinks.map((link) => {
          const isActive =
            pathname === link.href || (link.href !== '/dashboard' && pathname.startsWith(link.href))
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all ${
                isActive ? 'text-amber-400 font-black' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span className="text-base">{link.icon}</span>
              <span className="text-[10px] mt-0.5">{link.label}</span>
            </Link>
          )
        })}
      </div>
    </>
  )
}


