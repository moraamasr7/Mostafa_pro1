'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { MoneyDisplay } from '@/components/ui/MoneyDisplay'

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

export default function GlobalShiftBar({ onShiftStateChange }: GlobalShiftBarProps) {
  const [loading, setLoading] = useState(true)
  const [hasActiveShift, setHasActiveShift] = useState<boolean | null>(null)
  const [shiftData, setShiftData] = useState<ActiveShiftFinancials | null>(null)
  const [currentStaff, setCurrentStaff] = useState<CurrentStaffInfo | null>(null)
  const [elapsedMinutes, setElapsedMinutes] = useState<number>(0)
  
  const openedAtRef = useRef<string | null>(null)
  const syncDebounceRef = useRef<NodeJS.Timeout | null>(null)

  const fetchShiftState = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true)
    try {
      const res = await fetch('/api/admin/daily-shift')
      if (res.status === 401) {
        setHasActiveShift(false)
        setShiftData(null)
        openedAtRef.current = null
        if (onShiftStateChange) onShiftStateChange(false)
        return
      }

      if (res.ok) {
        const data = await res.json()
        if (data.currentStaff) {
          setCurrentStaff(data.currentStaff)
        }

        if (data.hasActiveShift && data.activeShift) {
          setHasActiveShift(true)
          setShiftData(data.activeShift)
          openedAtRef.current = data.activeShift.opened_at || null
          if (onShiftStateChange) onShiftStateChange(true)

          if (data.activeShift.opened_at) {
            const openedTime = new Date(data.activeShift.opened_at).getTime()
            const now = Date.now()
            setElapsedMinutes(Math.max(0, Math.floor((now - openedTime) / 60000)))
          }
        } else if (!data.hasActiveShift) {
          setHasActiveShift(false)
          setShiftData(null)
          openedAtRef.current = null
          if (onShiftStateChange) onShiftStateChange(false)
        }
      }
    } catch {
      // Keep existing state or mark unauthenticated on hard error
    } finally {
      setLoading(false)
    }
  }, [onShiftStateChange])

  const scheduleBackgroundSync = useCallback(() => {
    if (syncDebounceRef.current) {
      clearTimeout(syncDebounceRef.current)
    }
    syncDebounceRef.current = setTimeout(() => {
      fetchShiftState(true)
    }, 300)
  }, [fetchShiftState])

  useEffect(() => {
    fetchShiftState(false)

    const timer = setInterval(() => {
      if (openedAtRef.current) {
        const openedTime = new Date(openedAtRef.current).getTime()
        const now = Date.now()
        setElapsedMinutes(Math.max(0, Math.floor((now - openedTime) / 60000)))
      }
    }, 60000)

    const channel = supabase
      .channel('global-shift-context')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_shifts' }, () => {
        scheduleBackgroundSync()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        scheduleBackgroundSync()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_expenses' }, () => {
        scheduleBackgroundSync()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_trips' }, () => {
        scheduleBackgroundSync()
      })
      .subscribe()

    return () => {
      clearInterval(timer)
      if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current)
      supabase.removeChannel(channel)
    }
  }, [fetchShiftState, scheduleBackgroundSync])

  const formatDuration = (mins: number) => {
    if (mins < 60) return `${mins}د`
    const hours = Math.floor(mins / 60)
    const rem = mins % 60
    return rem > 0 ? `${hours}س ${rem}د` : `${hours}س`
  }

  if (loading) {
    return (
      <aside aria-label="شريط حالة الوردية" className="w-full bg-zinc-900 border-b border-zinc-800 px-3 py-1.5 text-xs text-zinc-400">
        <div className="max-w-7xl mx-auto flex items-center justify-between animate-pulse">
          <div className="h-3.5 w-36 bg-zinc-800 rounded"></div>
          <div className="h-3.5 w-24 bg-zinc-800 rounded"></div>
        </div>
      </aside>
    )
  }

  // State A: NO OPEN SHIFT
  if (!hasActiveShift || !shiftData) {
    return (
      <aside aria-label="تنبيه حالة الوردية" className="w-full bg-amber-950/80 border-b border-amber-600/40 text-amber-100 px-3 py-1.5 shadow-xs transition-all select-none">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse shrink-0"></span>
            <span className="font-bold text-amber-200">لا توجد وردية مفتوحة</span>
          </div>

          <Link
            href="/shift-control"
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-3 py-1 rounded-lg text-xs transition-all flex items-center gap-1 shrink-0 cursor-pointer"
          >
            <span>🟢</span>
            <span>فتح وردية</span>
          </Link>
        </div>
      </aside>
    )
  }

  // State B: OPEN SHIFT (Calm Industrial Strip)
  const hasDriverCustody = (shiftData.driverCustodyCash || 0) > 0

  return (
    <aside aria-label="سياق الوردية الحالي" className="w-full bg-zinc-950 text-zinc-200 border-b border-zinc-800 px-3 py-1.5 shadow-xs sticky top-[49px] z-30 transition-all backdrop-blur-xs select-none">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs">
        {/* Left: Shift Identity & Duration */}
        <div className="flex items-center gap-2 font-bold shrink-0">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
          <span className="text-emerald-400 font-black">وردية #{shiftData.shift_number}</span>
          <span className="text-zinc-500">·</span>
          <span className="text-zinc-300 font-mono text-[11px]">{formatDuration(elapsedMinutes)}</span>
          <span className="text-zinc-500 hidden sm:inline">·</span>
          <span className="text-zinc-400 font-medium hidden sm:inline">{shiftData.opened_by}</span>
        </div>

        {/* Right: Cash Drawer, Custody & Details Link */}
        <div className="flex items-center gap-2.5 sm:gap-3.5">
          {/* Expected Cash in Drawer */}
          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-lg text-[11px]">
            <span className="text-zinc-400">كاش:</span>
            <MoneyDisplay amount={shiftData.systemExpectedCash || 0} size="sm" variant="emerald" />
          </div>

          {/* Driver Custody (if any) */}
          {hasDriverCustody && (
            <div className="flex items-center gap-1 bg-amber-950/60 border border-amber-600/40 px-2 py-0.5 rounded-lg text-[11px]">
              <span className="text-amber-400">عهدة:</span>
              <MoneyDisplay amount={shiftData.driverCustodyCash || 0} size="sm" variant="amber" />
            </div>
          )}

          {/* Details Action */}
          <Link
            href="/shift-control"
            className="text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-750 px-2.5 py-0.5 rounded-lg text-[11px] font-bold transition-colors shrink-0"
          >
            تفاصيل
          </Link>
        </div>
      </div>
    </aside>
  )
}

