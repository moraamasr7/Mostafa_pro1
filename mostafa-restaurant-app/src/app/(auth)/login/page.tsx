'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface StaffItem {
  id: string
  full_name: string
  role: string
}

export default function LoginPage() {
  const router = useRouter()
  const [authTab, setAuthTab] = useState<'staff' | 'driver'>('staff')

  // Staff Form
  const [staffList, setStaffList] = useState<StaffItem[]>([])
  const [selectedStaffId, setSelectedStaffId] = useState('')
  const [pin, setPin] = useState('')

  // Driver Form
  const [driverPhone, setDriverPhone] = useState('')

  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  useEffect(() => {
    // Fetch staff list for quick selection
    fetch('/api/admin/staff')
      .then((res) => res.json())
      .then((data) => {
        if (data.staff && Array.isArray(data.staff) && data.staff.length > 0) {
          setStaffList(data.staff)
          setSelectedStaffId(data.staff[0].id)
        }
      })
      .catch(() => {
        // ignore
      })
  }, [])

  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    if (!selectedStaffId) {
      setErrorMsg('يرجى تحديد حساب الموظف')
      setLoading(false)
      return
    }

    if (!pin.trim()) {
      setErrorMsg('يرجى إدخال رمز الدخول السري (PIN)')
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_id: selectedStaffId,
          pin: pin.trim(),
        }),
      })

      const data = await res.json()
      if (res.ok) {
        setSuccessMsg(`أهلاً بك يا ${data.staff?.full_name || ''} ✅`)
        setTimeout(() => router.push('/dashboard'), 500)
      } else {
        setErrorMsg(data.error || 'رمز الدخول (PIN) غير صحيح')
      }
    } catch {
      setErrorMsg('حدث خطأ أثناء الاتصال بالخادم')
    } finally {
      setLoading(false)
    }
  }

  const handleDriverLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const cleanPhone = driverPhone.replace(/\s/g, '')
      if (!cleanPhone || cleanPhone.length < 11) {
        setErrorMsg('يرجى إدخال رقم هاتف صحيح مكون من 11 رقماً')
        setLoading(false)
        return
      }

      const res = await fetch('/api/driver/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone }),
      })

      const data = await res.json()
      if (res.ok) {
        setSuccessMsg(`أهلاً بك يا كابتن ${data.driver?.name || ''} 🛵`)
        setTimeout(() => router.push('/driver-portal'), 600)
      } else {
        setErrorMsg(data.error || 'فشل تسجيل دخول الطيار')
      }
    } catch {
      setErrorMsg('حدث خطأ أثناء تسجيل الدخول')
    } finally {
      setLoading(false)
    }
  }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'owner':
        return '👑 مالك المطعم'
      case 'cashier':
        return '💰 كاشير'
      case 'kitchen':
        return '🍳 شيف المطبخ'
      default:
        return role
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-amber-950 flex flex-col justify-center items-center p-4 font-sans text-white">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl p-6 sm:p-8 space-y-6">
        <div className="text-center space-y-2">
          <span className="text-5xl">🥩</span>
          <h1 className="text-2xl font-black text-white">مطعم مصطفى الجزار</h1>
          <p className="text-xs text-amber-300/80 font-bold">بوابة تسجيل الدخول برمز المرور السري (Individual PIN)</p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-zinc-950 p-1 rounded-2xl border border-zinc-800 text-xs font-bold">
          <button
            type="button"
            onClick={() => {
              setAuthTab('staff')
              setErrorMsg(null)
              setSuccessMsg(null)
            }}
            className={`flex-1 py-2.5 rounded-xl transition-all ${
              authTab === 'staff'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            👔 طاقم العمل (Staff PIN)
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthTab('driver')
              setErrorMsg(null)
              setSuccessMsg(null)
            }}
            className={`flex-1 py-2.5 rounded-xl transition-all ${
              authTab === 'driver'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            🛵 بوابة الطيار
          </button>
        </div>

        {errorMsg && (
          <div className="bg-red-950/80 border border-red-800 text-red-200 text-xs p-3.5 rounded-2xl font-bold flex items-center justify-between">
            <span>⚠️ {errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="text-red-400 font-extrabold">✕</button>
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-950/80 border border-emerald-800 text-emerald-200 text-xs p-3.5 rounded-2xl font-bold">
            {successMsg}
          </div>
        )}

        {authTab === 'staff' ? (
          <form onSubmit={handleStaffLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-300 block">اختر حساب الموظف:</label>
              <select
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
              >
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} ({getRoleBadge(s.role)})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-amber-300 block">رمز الدخول السري (Individual PIN):</label>
              <input
                type="password"
                required
                placeholder="أدخل رمز الـ PIN الخاص بك"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="w-full bg-zinc-950 border border-amber-600/50 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 text-center tracking-widest text-lg font-bold"
                maxLength={10}
              />
              <p className="text-[10px] text-zinc-500 text-center">الـ PIN مشفر بأعلى معايير الأمان ومقارنته تتم بالكامل على السيرفر</p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-600 hover:bg-amber-500 text-white font-black text-sm py-3.5 rounded-xl shadow-lg shadow-amber-950 transition-all disabled:opacity-50"
            >
              {loading ? 'جاري التحقق من الـ PIN...' : 'تسجيل الدخول'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleDriverLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-300 block">رقم هاتف الطيار المسجل</label>
              <input
                type="tel"
                required
                placeholder="01012345678"
                value={driverPhone}
                onChange={(e) => setDriverPhone(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 text-left dir-ltr focus:outline-none focus:border-amber-500"
              />
              <p className="text-[11px] text-zinc-500">سجل بنفس رقم الموبايل المعتمد في إدارة المطعم</p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-black text-sm py-3.5 rounded-xl shadow-lg shadow-purple-950 transition-all"
            >
              {loading ? 'جاري التحقق...' : 'دخول بوابة الطيار 🛵'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
