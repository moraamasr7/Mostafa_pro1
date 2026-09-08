'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [authTab, setAuthTab] = useState<'staff' | 'driver'>('staff')

  // Staff Form
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passcode, setPasscode] = useState('')
  const [usePasscodeFallback, setUsePasscodeFallback] = useState(false)

  // Driver Form
  const [driverPhone, setDriverPhone] = useState('')

  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      if (!usePasscodeFallback) {
        // 1. Primary: Supabase Auth Email/Password
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })

        if (error) {
          // If Supabase Auth credentials failed, provide clear message and offer fallback
          setErrorMsg(error.message || 'بيانات تسجيل الدخول غير صحيحة')
          setLoading(false)
          return
        }

        // Also establish cookie for Next.js API compatibility
        if (data.session) {
          try {
            await fetch('/api/admin/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ passcode: password }),
            })
          } catch {
            // ignore
          }

          setSuccessMsg('تم تسجيل دخول الموظف بنجاح عبر Supabase Auth ✅')
          setTimeout(() => router.push('/dashboard'), 500)
          return
        }
      } else {
        // 2. Legacy Passcode Fallback (during migration phase)
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ passcode }),
        })

        const data = await res.json()
        if (res.ok) {
          setSuccessMsg('تم التحقق من رمز المرور بنجاح ✅')
          setTimeout(() => router.push('/dashboard'), 500)
        } else {
          setErrorMsg(data.error || 'رمز المرور غير صحيح')
        }
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-amber-950 flex flex-col justify-center items-center p-4 font-sans text-white">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl p-6 sm:p-8 space-y-6">
        <div className="text-center space-y-2">
          <span className="text-5xl">🥩</span>
          <h1 className="text-2xl font-black text-white">مطعم مصطفى الجزار</h1>
          <p className="text-xs text-amber-300/80 font-bold">بوابة تسجيل دخول طاقم العمل والطيارين</p>
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
            👔 الإدارة والكاشير (Supabase Auth)
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
            {!usePasscodeFallback ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-300 block">البريد الإلكتروني (Email)</label>
                  <input
                    type="email"
                    required
                    placeholder="cashier@gazzar.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-300 block">كلمة المرور (Password)</label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </>
            ) : (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-amber-300 block">رمز مرور الإدارة (Passcode Fallback)</label>
                <input
                  type="password"
                  required
                  placeholder="أدخل رمز المرور"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  className="w-full bg-zinc-950 border border-amber-600/50 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-600 hover:bg-amber-500 text-white font-black text-sm py-3.5 rounded-xl shadow-lg shadow-amber-950 transition-all"
            >
              {loading ? 'جاري التحقق...' : usePasscodeFallback ? 'دخول برمز المرور' : 'دخول بالـ Supabase Auth'}
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setUsePasscodeFallback(!usePasscodeFallback)
                  setErrorMsg(null)
                }}
                className="text-[11px] text-amber-400/80 hover:text-amber-300 underline font-semibold"
              >
                {usePasscodeFallback
                  ? 'العودة لتسجيل الدخول بالبريد الإلكتروني'
                  : 'استخدام رمز المرور المؤقت (Passcode)'}
              </button>
            </div>
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
