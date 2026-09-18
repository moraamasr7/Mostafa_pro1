'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface CurrentStaffInfo {
  id: string
  full_name: string
  role: string
}

interface ActiveShiftFinancials {
  id: string
  shift_number: number
  opened_by: string
  opened_at: string
  status: string
  systemExpectedCash: number
  driverCustodyCash: number
  totalSales: number
  cashSales: number
}

interface GlobalShiftBarProps {
  onShiftStateChange?: (hasActiveShift: boolean) => void
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'مالك المطعم',
  manager: 'مشرف / مدير',
  cashier: 'كاشير',
  kitchen: 'شيف / مطبخ',
  driver: 'طيار',
}

export default function GlobalShiftBar({ onShiftStateChange }: GlobalShiftBarProps) {
  const [loading, setLoading] = useState(true)
  const [hasActiveShift, setHasActiveShift] = useState<boolean | null>(null)
  const [shiftData, setShiftData] = useState<ActiveShiftFinancials | null>(null)
  const [currentStaff, setCurrentStaff] = useState<CurrentStaffInfo | null>(null)
  const [elapsedMinutes, setElapsedMinutes] = useState<number>(0)

  const fetchShiftState = async () => {
    try {
      const res = await fetch('/api/admin/daily-shift')
      if (!res.ok) {
        setHasActiveShift(false)
        setShiftData(null)
        if (onShiftStateChange) onShiftStateChange(false)
        return
      }

      const data = await res.json()
      if (data.currentStaff) {
        setCurrentStaff(data.currentStaff)
      }

      if (data.hasActiveShift && data.activeShift) {
        setHasActiveShift(true)
        setShiftData(data.activeShift)
        if (onShiftStateChange) onShiftStateChange(true)

        if (data.activeShift.opened_at) {
          const openedTime = new Date(data.activeShift.opened_at).getTime()
          const now = Date.now()
          setElapsedMinutes(Math.max(0, Math.floor((now - openedTime) / 60000)))
        }
      } else {
        setHasActiveShift(false)
        setShiftData(null)
        if (onShiftStateChange) onShiftStateChange(false)
      }
    } catch {
      setHasActiveShift(false)
      setShiftData(null)
      if (onShiftStateChange) onShiftStateChange(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchShiftState()

    const timer = setInterval(() => {
      if (shiftData?.opened_at) {
        const openedTime = new Date(shiftData.opened_at).getTime()
        const now = Date.now()
        setElapsedMinutes(Math.max(0, Math.floor((now - openedTime) / 60000)))
      }
    }, 60000)

    const channel = supabase
      .channel('global-shift-context')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_shifts' }, () => {
        fetchShiftState()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchShiftState()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_expenses' }, () => {
        fetchShiftState()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_trips' }, () => {
        fetchShiftState()
      })
      .subscribe()

    return () => {
      clearInterval(timer)
      supabase.removeChannel(channel)
    }
  }, [shiftData?.opened_at])

  const formatDuration = (mins: number) => {
    if (mins < 60) return `${mins} دقيقة`
    const hours = Math.floor(mins / 60)
    const rem = mins % 60
    return rem > 0 ? `${hours} س و ${rem} د` : `${hours} ساعة`
  }

  if (loading) {
    return (
      <aside aria-label="شريط حالة الوردية" className="w-full bg-zinc-900 border-b border-zinc-800 px-4 py-2 text-xs text-zinc-400">
        <div className="max-w-7xl mx-auto flex items-center justify-between animate-pulse">
          <div className="h-4 w-48 bg-zinc-800 rounded"></div>
          <div className="h-4 w-32 bg-zinc-800 rounded"></div>
        </div>
      </aside>
    )
  }

  // State A: NO OPEN SHIFT (Shift Required Mode)
  if (!hasActiveShift || !shiftData) {
    return (
      <aside aria-label="تنبيه حالة الوردية" className="w-full bg-amber-950/90 border-b border-amber-600/50 text-amber-100 px-4 py-2.5 shadow-xs transition-all">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
            </span>
            <div className="flex items-center gap-2">
              <span className="font-black tracking-wide text-amber-200">⚠️ لا توجد وردية تشغيلية مفتوحة حالياً</span>
              <span className="hidden sm:inline text-amber-300/80 font-medium">| العمليات مقيدة لحين فتح وردية جديدة وتثبيت العهدة</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {currentStaff && (
              <span className="text-[11px] text-amber-300/90 font-medium hidden md:inline">
                الموظف الحالي: <strong className="text-white">{currentStaff.full_name}</strong> ({ROLE_LABELS[currentStaff.role] || currentStaff.role})
              </span>
            )}
            <Link
              href="/shift-control"
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-3.5 py-1.5 rounded-xl shadow-xs transition-all flex items-center gap-1.5 text-xs shrink-0"
            >
              <span>🟢</span>
              <span>فتح وردية جديدة وبدء التشغيل</span>
            </Link>
          </div>
        </div>
      </aside>
    )
  }

  // State B: OPEN SHIFT (Terminal Active Context)
  const hasDriverCustody = (shiftData.driverCustodyCash || 0) > 0

  return (
    <aside aria-label="سياق الوردية الحالي" className="w-full bg-zinc-950 text-zinc-100 border-b border-zinc-800 px-4 py-2 shadow-xs sticky top-[57px] z-30 transition-all backdrop-blur-xs">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Left: Shift Identity & Duration */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-emerald-950/80 border border-emerald-600/60 text-emerald-300 px-2.5 py-1 rounded-lg font-black">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>الوردية #{shiftData.shift_number}</span>
          </div>

          <div className="text-zinc-400 font-medium hidden sm:flex items-center gap-2 text-[11px]">
            <span>⏱️ مفتوحة منذ: <strong className="text-zinc-200">{formatDuration(elapsedMinutes)}</strong></span>
            <span>•</span>
            <span>المسؤول: <strong className="text-zinc-200">{shiftData.opened_by}</strong></span>
          </div>
        </div>

        {/* Right: Cash & Custody Context + Shift Action */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Expected Cash in Drawer */}
          <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-700/60 px-2.5 py-1 rounded-lg">
            <span className="text-zinc-400">💰 كاش الدرج المتوقع:</span>
            <span className="font-black text-emerald-400 font-mono">
              {(shiftData.systemExpectedCash || 0).toLocaleString()} ج.م
            </span>
          </div>

          {/* Driver Custody Alert Badge */}
          {hasDriverCustody && (
            <div className="flex items-center gap-1.5 bg-amber-950/80 border border-amber-600/80 px-2.5 py-1 rounded-lg text-amber-200 animate-pulse">
              <span>🛵 عهدة طيارين معلقة:</span>
              <span className="font-black text-amber-300 font-mono">
                {(shiftData.driverCustodyCash || 0).toLocaleString()} ج.م
              </span>
            </div>
          )}

          {/* Current Staff Badge */}
          {currentStaff && (
            <div className="hidden lg:flex items-center gap-1.5 text-[11px] bg-zinc-900/90 border border-zinc-800 px-2 py-1 rounded-lg text-zinc-300">
              <span>👤</span>
              <span className="font-bold text-white">{currentStaff.full_name}</span>
              <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-medium">
                {ROLE_LABELS[currentStaff.role] || currentStaff.role}
              </span>
            </div>
          )}

          {/* Fast Link to Shift Management */}
          <Link
            href="/shift-control"
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white font-bold px-2.5 py-1 rounded-lg border border-zinc-700 transition-all flex items-center gap-1 text-[11px] shrink-0"
          >
            <span>📋</span>
            <span>إدارة الوردية</span>
          </Link>
        </div>
      </div>
    </aside>
  )
}
