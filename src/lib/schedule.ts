import { supabase } from './supabase'

export const BUSINESS_TIMEZONE = 'Africa/Cairo'

export interface ScheduleWindow {
  open: string // "10:00"
  close: string // "02:00"
}

export interface OperatingHoursResult {
  isOpen: boolean
  reason: string
  currentWindow?: ScheduleWindow
  nextOpening?: string
  timezone: string
}

export interface WeeklyOperatingHour {
  id?: string
  day_of_week: number
  open_time: string
  close_time: string
  is_closed: boolean
}

export interface SpecialClosure {
  id?: string
  closure_date: string
  reason: string
}

export interface ScheduleOverride {
  id?: string
  override_date: string
  open_time: string
  close_time: string
  is_closed: boolean
  reason?: string
}

// يحول التاريخ إلى أجزاء التوقيت الرسمي لمصر (Africa/Cairo)
export function getCairoDateInfo(date: Date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  const parts = formatter.formatToParts(date)
  const map: Record<string, string> = {}
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value
  }

  const dateStr = `${map.year}-${map.month}-${map.day}`
  
  // لحساب اليوم في الأسبوع (0 = الأحد .. 6 = السبت) بتوقيت القاهرة
  const cairoUtc = new Date(Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day)))
  const dayOfWeek = cairoUtc.getUTCDay()

  const currentSeconds = Number(map.hour) * 3600 + Number(map.minute) * 60 + Number(map.second)
  const timeStr = `${map.hour.padStart(2, '0')}:${map.minute.padStart(2, '0')}:${map.second.padStart(2, '0')}`

  // تاريخ اليوم السابق (YYYY-MM-DD) للحسابات بعد منتصف الليل
  const prevDateObj = new Date(Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day) - 1))
  const prevDateStr = prevDateObj.toISOString().split('T')[0]
  const prevDayOfWeek = prevDateObj.getUTCDay()

  return {
    dateStr,
    dayOfWeek,
    prevDateStr,
    prevDayOfWeek,
    timeStr,
    currentSeconds,
  }
}

// تحويل نص الوقت (HH:MM:SS أو HH:MM) إلى ثوانٍ من منتصف الليل
export function parseTimeToSeconds(timeStr: string): number {
  if (!timeStr) return 0
  const parts = timeStr.split(':').map(Number)
  const h = parts[0] || 0
  const m = parts[1] || 0
  const s = parts[2] || 0
  return h * 3600 + m * 60 + s
}

/**
 * الدالة المركزية الفائقة الأمان للتحقق من حالة فتح/إغلاق المطعم
 * تأخذ في الاعتبار:
 * 1. التوقيت الرسمي لمصر Africa/Cairo
 * 2. المواعيد الممتدة بعد منتصف الليل (Overnight Schedule 10:00 -> 02:00)
 * 3. العطلات والإغلاقات الاستثنائية
 * 4. التجاوزات الخاصة للمواعيد
 */
export async function isRestaurantOpen(targetDate: Date = new Date()): Promise<OperatingHoursResult> {
  const cairo = getCairoDateInfo(targetDate)

  try {
    // 1) فحص الإغلاقات الاستثنائية لليوم الحالي
    const { data: specialClosure } = await supabase
      .from('restaurant_special_closures')
      .select('reason')
      .eq('closure_date', cairo.dateStr)
      .maybeSingle()

    if (specialClosure) {
      return {
        isOpen: false,
        reason: `إغلاق استثنائي: ${specialClosure.reason}`,
        timezone: BUSINESS_TIMEZONE,
      }
    }

    // 2) فحص التجاوزات الاستثنائية للمواعيد لليوم الحالي
    const { data: overrideToday } = await supabase
      .from('restaurant_schedule_overrides')
      .select('open_time, close_time, is_closed, reason')
      .eq('override_date', cairo.dateStr)
      .maybeSingle()

    if (overrideToday) {
      if (overrideToday.is_closed) {
        return {
          isOpen: false,
          reason: `مغلق بتجاوز استثنائي: ${overrideToday.reason || 'إجازة خاصة'}`,
          timezone: BUSINESS_TIMEZONE,
        }
      }

      const openSec = parseTimeToSeconds(overrideToday.open_time)
      const closeSec = parseTimeToSeconds(overrideToday.close_time)

      if (openSec >= closeSec) {
        // ممتد بعد منتصف الليل
        if (cairo.currentSeconds >= openSec) {
          return {
            isOpen: true,
            reason: 'المطعم مفتوح حالياً (جدول استثنائي ممتد)',
            currentWindow: { open: overrideToday.open_time.substring(0, 5), close: overrideToday.close_time.substring(0, 5) },
            timezone: BUSINESS_TIMEZONE,
          }
        }
      } else {
        if (cairo.currentSeconds >= openSec && cairo.currentSeconds < closeSec) {
          return {
            isOpen: true,
            reason: 'المطعم مفتوح حالياً (جدول استثنائي)',
            currentWindow: { open: overrideToday.open_time.substring(0, 5), close: overrideToday.close_time.substring(0, 5) },
            timezone: BUSINESS_TIMEZONE,
          }
        }
      }
    }

    // 3) فحص الجدول الأسبوعي الدوري لليوم الحالي
    const { data: todayWeekly } = await supabase
      .from('restaurant_operating_hours')
      .select('open_time, close_time, is_closed')
      .eq('day_of_week', cairo.dayOfWeek)
      .maybeSingle()

    if (todayWeekly && !todayWeekly.is_closed) {
      const openSec = parseTimeToSeconds(todayWeekly.open_time)
      const closeSec = parseTimeToSeconds(todayWeekly.close_time)

      if (openSec >= closeSec) {
        // وردية ممتدة بعد منتصف الليل (مثال: 10:00 ص إلى 02:00 ص اليوم التالي)
        if (cairo.currentSeconds >= openSec) {
          return {
            isOpen: true,
            reason: 'المطعم مفتوح حالياً',
            currentWindow: { open: todayWeekly.open_time.substring(0, 5), close: todayWeekly.close_time.substring(0, 5) },
            timezone: BUSINESS_TIMEZONE,
          }
        }
      } else {
        // وردية عادية في نفس اليوم (مثال: 10:00 ص إلى 11:00 م)
        if (cairo.currentSeconds >= openSec && cairo.currentSeconds < closeSec) {
          return {
            isOpen: true,
            reason: 'المطعم مفتوح حالياً',
            currentWindow: { open: todayWeekly.open_time.substring(0, 5), close: todayWeekly.close_time.substring(0, 5) },
            timezone: BUSINESS_TIMEZONE,
          }
        }
      }
    }

    // 4) فحص الوردية الممتدة من اليوم السابق (Overnight shift from yesterday)
    // إذا كانت الساعة الآن 01:00 صباح الأحد، وكانت وردية السبت 10:00 ص إلى 02:00 ص الأحد
    const { data: prevClosure } = await supabase
      .from('restaurant_special_closures')
      .select('id')
      .eq('closure_date', cairo.prevDateStr)
      .maybeSingle()

    if (!prevClosure) {
      const { data: prevWeekly } = await supabase
        .from('restaurant_operating_hours')
        .select('open_time, close_time, is_closed')
        .eq('day_of_week', cairo.prevDayOfWeek)
        .maybeSingle()

      if (prevWeekly && !prevWeekly.is_closed) {
        const prevOpenSec = parseTimeToSeconds(prevWeekly.open_time)
        const prevCloseSec = parseTimeToSeconds(prevWeekly.close_time)

        // تكون ممتدة فقط إذا كان وقت الإغلاق أصغر من وقت الفتح (مثال: 10:00 ص إلى 02:00 ص)
        if (prevOpenSec >= prevCloseSec) {
          if (cairo.currentSeconds < prevCloseSec) {
            return {
              isOpen: true,
              reason: 'المطعم مفتوح حالياً (وردية اليوم السابق الممتدة)',
              currentWindow: { open: prevWeekly.open_time.substring(0, 5), close: prevWeekly.close_time.substring(0, 5) },
              timezone: BUSINESS_TIMEZONE,
            }
          }
        }
      }
    }

    return {
      isOpen: false,
      reason: 'المطعم مغلق حالياً خارج مواعيد العمل الرسمية',
      timezone: BUSINESS_TIMEZONE,
    }
  } catch (err) {
    console.error('خطأ في حساب مواعيد عمل المطعم:', err)
    return {
      isOpen: true, // افتراضي أمان عند حدوث استثناء
      reason: 'تعذر التحقق من الجدول التشغيلي',
      timezone: BUSINESS_TIMEZONE,
    }
  }
}
