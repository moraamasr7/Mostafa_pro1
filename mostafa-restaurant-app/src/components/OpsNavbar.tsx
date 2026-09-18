'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

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
  owner: 'مالك المطعم',
  manager: 'مشرف / مدير',
  cashier: 'كاشير',
  kitchen: 'شيف / مطبخ',
  driver: 'طيار',
}

export default function OpsNavbar({ title, subtitle, restaurantName }: OpsNavbarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [showSecondaryMenu, setShowSecondaryMenu] = useState(false)
  const [currentStaff, setCurrentStaff] = useState<StaffMember | null>(null)
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  
  // Switch User Modal State
  const [isSwitchModalOpen, setIsSwitchModalOpen] = useState(false)
  const [selectedStaffId, setSelectedStaffId] = useState<string>('')
  const [passcode, setPasscode] = useState<string>('')
  const [switchLoading, setSwitchLoading] = useState(false)
  const [switchError, setSwitchError] = useState<string | null>(null)

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
          // Preselect next or first active staff
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

  const userRole = currentStaff?.role ? currentStaff.role.toLowerCase() : null
  const canManageSettings = userRole === 'owner' || userRole === 'manager' || userRole === null

  // Core Daily Operations Navigation
  const coreLinks = [
    { href: '/dashboard', label: '📊 الداشبورد', icon: '📊' },
    { href: '/orders', label: '📦 الطلبات', icon: '📦' },
    { href: '/drivers', label: '🛵 الطيارين', icon: '🛵' },
    { href: '/shift-control', label: '💰 الوردية والخزينة', icon: '💰' },
  ]

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

  const handleOpenSwitchModal = () => {
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
      // Seamlessly reload to update all contexts and server sessions
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
      <header className="bg-gradient-to-l from-zinc-950 via-zinc-900 to-zinc-950 text-white shadow-md sticky top-0 z-40 border-b border-zinc-800/80">
        <div className="max-w-7xl mx-auto px-4 py-2.5">
          <div className="flex items-center justify-between gap-3">
            {/* Brand / System Identity */}
            <div className="flex items-center gap-3 shrink-0">
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
            <nav className="hidden lg:flex items-center gap-1.5 text-xs font-bold">
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
                  type="button"
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

            {/* User Attribution & Actions */}
            <div className="flex items-center gap-2">
              {/* Current Staff Badge & Switch Button */}
              {currentStaff && (
                <div className="flex items-center gap-1 bg-zinc-900/90 border border-zinc-700/60 rounded-xl px-2 py-1 text-xs">
                  <span className="text-zinc-400 text-xs">👤</span>
                  <div className="flex flex-col text-right leading-tight">
                    <span className="font-bold text-white max-w-[100px] sm:max-w-[130px] truncate">
                      {currentStaff.full_name}
                    </span>
                    <span className="text-[10px] text-amber-400 font-medium">
                      {ROLE_LABELS[currentStaff.role] || currentStaff.role}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenSwitchModal}
                    title="تبديل المسؤول (Switch Operator)"
                    className="mr-1.5 p-1 bg-zinc-800 hover:bg-amber-600/30 text-amber-300 hover:text-amber-200 rounded-lg border border-amber-500/30 transition-all text-xs flex items-center gap-1"
                  >
                    <span>🔄</span>
                    <span className="hidden sm:inline text-[11px] font-bold">تبديل</span>
                  </button>
                </div>
              )}

              {/* Logout Button */}
              <button
                type="button"
                onClick={handleLogout}
                className="bg-red-950/60 hover:bg-red-900 text-red-200 text-xs font-bold py-1.5 px-2.5 sm:px-3 rounded-xl border border-red-800/50 transition-colors flex items-center gap-1 shrink-0"
                title="تسجيل الخروج من الجلسة"
              >
                <span className="hidden sm:inline">خروج</span>
                <span>🚪</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Switch User Modal */}
      {isSwitchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-fadeIn">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md p-6 shadow-2xl relative text-right text-white">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
              <h2 className="text-base font-black flex items-center gap-2 text-amber-300">
                <span>🔄</span>
                <span>تبديل المسؤول (Fast Operator Switch)</span>
              </h2>
              <button
                type="button"
                onClick={() => !switchLoading && setIsSwitchModalOpen(false)}
                className="text-zinc-400 hover:text-white text-lg p-1"
                disabled={switchLoading}
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
              اختر الموظف المستلم وأدخل رمز الدخول لتوثيق الجلسة ونقل المسؤولية التشغيلية فوراً مع الحفاظ على استمرارية الوردية.
            </p>

            {switchError && (
              <div className="bg-red-950/80 border border-red-700 text-red-200 text-xs p-3 rounded-xl mb-4 flex items-center gap-2">
                <span>⚠️</span>
                <span>{switchError}</span>
              </div>
            )}

            <form onSubmit={handleSwitchSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                  الموظف المستلم للتشغيل:
                </label>
                <select
                  value={selectedStaffId}
                  onChange={(e) => setSelectedStaffId(e.target.value)}
                  disabled={switchLoading}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-hidden focus:border-amber-500 transition-colors"
                >
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} — ({ROLE_LABELS[s.role] || s.role}) {s.id === currentStaff?.id ? '(المسؤول الحالي)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                  رمز التحقق والدخول (Passcode):
                </label>
                <input
                  type="password"
                  placeholder="أدخل رمز الدخول..."
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  disabled={switchLoading}
                  autoFocus
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs font-bold text-white tracking-widest text-center focus:outline-hidden focus:border-amber-500 transition-colors"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={switchLoading}
                  className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-black py-2.5 px-4 rounded-xl shadow-xs transition-all flex items-center justify-center gap-2"
                >
                  {switchLoading ? (
                    <>
                      <span className="animate-spin text-sm">⏳</span>
                      <span>جاري التحقق والتبديل...</span>
                    </>
                  ) : (
                    <>
                      <span>✅</span>
                      <span>تأكيد تبديل المسؤول</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsSwitchModalOpen(false)}
                  disabled={switchLoading}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold py-2.5 px-4 rounded-xl transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mobile Touch Bottom Navigation Bar (Thumb Reach) */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-zinc-950 border-t border-zinc-800 px-2 py-2 flex items-center justify-around shadow-2xl backdrop-blur-md">
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

