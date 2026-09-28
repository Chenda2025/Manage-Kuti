export const DEFAULT_ATTENDANCE_TYPE_DEFS = [
  { key: 'study', label: 'ទៅរៀន', enabled: true },
  { key: 'kuti_work', label: 'ការងារកុដិ', enabled: true },
  { key: 'trash', label: 'យកធុងសម្រាម', enabled: true },
  { key: 'worship_meal', label: 'ថ្វាយបង្គំ', enabled: true },
  { key: 'alms', label: 'បិណ្ឌបាត', enabled: true },
] as const

export const ATTENDANCE_TYPES = DEFAULT_ATTENDANCE_TYPE_DEFS.map((item) => item.key)

export type AttendanceType = string
export type AttendanceStatus = 'present' | 'absent' | 'excused'
export type ExcusePeriod = 'morning' | 'afternoon' | 'day'

export const EXCUSE_PERIOD_LABELS: Record<ExcusePeriod, string> = {
  morning: 'ព្រឹក',
  afternoon: 'រសៀល',
  day: 'មួយថ្ងៃ',
}

export type AttendanceTypeDef = {
  key: string
  label: string
  enabled: boolean
}

export const ATTENDANCE_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  DEFAULT_ATTENDANCE_TYPE_DEFS.map((item) => [item.key, item.label]),
)

export const REPORT_PERIODS = ['today', 'week', 'month'] as const
export type ReportPeriod = (typeof REPORT_PERIODS)[number]

export const REPORT_PERIOD_LABELS: Record<ReportPeriod, string> = {
  today: 'ថ្ងៃនេះ',
  week: '១ សប្តាហ៍',
  month: '១ ខែ',
}

export function isReportPeriod(value: string): value is ReportPeriod {
  return (REPORT_PERIODS as readonly string[]).includes(value)
}

export function labelForType(types: AttendanceTypeDef[], key: string) {
  return types.find((item) => item.key === key)?.label || ATTENDANCE_TYPE_LABELS[key] || key
}

/**
 * Rotate groups by calendar day. Day N → group N % count (loops).
 */
export function dutyGroupIndexForDate(dateIso: string, groupCount: number) {
  if (groupCount <= 0) return 0
  const parts = dateIso.split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return 0
  const [y, m, d] = parts
  const dayIndex = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000)
  return ((dayIndex % groupCount) + groupCount) % groupCount
}

export function pickDutyGroup<T>(groups: T[], dateIso: string): T | null {
  if (!groups.length) return null
  return groups[dutyGroupIndexForDate(dateIso, groups.length)] ?? null
}

export const STUDY_HOURS_MORNING = '7:00 - 9:00 នាទីព្រឹក'
export const STUDY_HOURS_AFTERNOON = '2:00 - 5:00 នាទីល្ងាច'

/** Pick morning or afternoon study hours from current time (Asia/Phnom_Penh). */
export function resolveStudyHours(now = new Date(), timeZone = 'Asia/Phnom_Penh') {
  const hourText = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    hour12: false,
  }).format(now)
  const hour = Number(hourText)
  return hour < 12 ? STUDY_HOURS_MORNING : STUDY_HOURS_AFTERNOON
}

const KHMER_CLOCK_DIGITS = ['០', '១', '២', '៣', '៤', '៥', '៦', '៧', '៨', '៩']

export function toKhmerClockDigits(value: string | number) {
  return String(value).replace(/\d/g, (d) => KHMER_CLOCK_DIGITS[Number(d)] || d)
}

/** Format HH:mm (24h) as Khmer clock, e.g. ៩-២៣ ល្ងាច */
export function formatKhmerClockFromHHMM(hhmm: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!match) return hhmm
  const hour24 = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isFinite(hour24) || !Number.isFinite(minute)) return hhmm
  if (hour24 < 0 || hour24 > 23 || minute < 0 || minute > 59) return hhmm
  const displayHour = hour24 % 12 === 0 ? 12 : hour24 % 12
  const hh = String(displayHour).padStart(2, '0')
  const mm = String(minute).padStart(2, '0')
  const period = hour24 < 12 ? 'ព្រឹក' : 'ល្ងាច'
  return `${toKhmerClockDigits(`${hh}-${mm}`)} ${period}`
}

export function splitHHMMToKhmerParts(hhmm: string): {
  hour12: number
  minute: number
  period: 'ព្រឹក' | 'ល្ងាច'
} {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  const hour24 = match ? Number(match[1]) : 0
  const minute = match ? Number(match[2]) : 0
  const safeH = Number.isFinite(hour24) ? Math.min(23, Math.max(0, hour24)) : 0
  const safeM = Number.isFinite(minute) ? Math.min(59, Math.max(0, minute)) : 0
  return {
    hour12: safeH % 12 === 0 ? 12 : safeH % 12,
    minute: safeM,
    period: safeH < 12 ? 'ព្រឹក' : 'ល្ងាច',
  }
}

export function composeHHMMFromKhmerParts(
  hour12: number,
  minute: number,
  period: 'ព្រឹក' | 'ល្ងាច',
) {
  const h12 = Math.min(12, Math.max(1, hour12))
  const m = Math.min(59, Math.max(0, minute))
  let hour24 = h12 % 12
  if (period === 'ល្ងាច') hour24 += 12
  return `${String(hour24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Current clock for non-study attendance, e.g. ១០-៥០ ព្រឹក */
export function formatAttendanceClockTime(now = new Date(), timeZone = 'Asia/Phnom_Penh') {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || '0')
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || '0')
  return formatKhmerClockFromHHMM(
    `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  )
}

/**
 * ថ្វាយបង្គំ shift from real clock (Asia/Phnom_Penh):
 * 00:00–11:59 → ព្រឹក · 12:00–23:59 → យប់
 */
export function resolveWorshipMealShift(now = new Date(), timeZone = 'Asia/Phnom_Penh') {
  const hourText = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    hour12: false,
  }).format(now)
  const hour = Number(hourText)
  return hour < 12 ? 'ព្រឹក' : 'យប់'
}

/**
 * សាលាឆាន់ shift from real clock (Asia/Phnom_Penh):
 * ព្រឹក 05:00–09:00 · ថ្ងៃត្រង់ 10:00–12:59
 */
export function resolveSalaChanShift(now = new Date(), timeZone = 'Asia/Phnom_Penh') {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || '0')
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || '0')
  const mins = hour * 60 + minute
  if (mins >= 5 * 60 && mins <= 9 * 60) return 'ព្រឹក'
  if (mins >= 10 * 60 && mins <= 12 * 60 + 59) return 'ថ្ងៃត្រង់'
  return mins < 10 * 60 ? 'ព្រឹក' : 'ថ្ងៃត្រង់'
}

/** Custom type key for សាលាឆាន់ (settings-created). */
export const SALA_CHAN_TYPE_KEY = 'type_mu9vvfdt'

/** Custom type key for ចាត់លោកទៅបុណ្យ (settings-created). */
export const BON_PARTY_TYPE_KEY = 'type_mubb78mp'

/** Custom type key for វត្តមានរៀនក្នុងកុដិ (study-in-kuti; distinct from seed `study`). */
export const STUDY_IN_KUTI_TYPE_KEY = 'type_mul2fl2z'

export type BonPartyAssign = {
  time: string
  place: string
  kind: string
}

export function encodeBonPartyNote(assign: BonPartyAssign): string {
  return JSON.stringify({
    v: 1,
    time: assign.time.trim(),
    place: assign.place.trim(),
    kind: assign.kind.trim(),
  })
}

export function parseBonPartyNote(note: string | null | undefined): BonPartyAssign | null {
  if (!note?.trim()) return null
  try {
    const parsed = JSON.parse(note) as {
      time?: unknown
      place?: unknown
      kind?: unknown
    }
    if (
      typeof parsed.time === 'string' &&
      typeof parsed.place === 'string' &&
      typeof parsed.kind === 'string' &&
      parsed.time.trim() &&
      parsed.place.trim() &&
      parsed.kind.trim()
    ) {
      return {
        time: parsed.time.trim(),
        place: parsed.place.trim(),
        kind: parsed.kind.trim(),
      }
    }
  } catch {
    /* plain-text notes from other types */
  }
  return null
}

export function formatBonPartyAssign(assign: BonPartyAssign): string {
  return [formatKhmerClockFromHHMM(assign.time), assign.place, assign.kind]
    .filter(Boolean)
    .join(' · ')
}

/** Daily message for ការងារកុដិ — uses live clock time, not study hours. */
export const KUTI_WORK_DAILY_TEMPLATE = `🙏 ✥◈ថ្វាយបង្គំព្រះបិតាសង្ឃ✥◈🙏
——∘◦❀◦∘——∘◦❀◦∘—∘◦❀◦∘———
🔔ប្រគេនរបាយការណ៍ការងារ {name kuti}
🗓កាលបរិច្ឆេទ៖ {date}
⏱️ម៉ោងការងារ៖ {time}
࿇ ══━━━━✥◈✥━━━━══ ࿇
ព្រះសង្ឃ​សរុប​ ( {total_monk} អង្គ)
✳️ព្រះសង្ឃធ្វើការងារ  ( {present_count} អង្គ)
❇️ព្រះសង្ឃ​ដាក់ច្បាប់ចំនួន( {total permission} អង្គ)
{excused_list}
🛑ព្រះសង្ឃ​អវត្តមាន​ចំនួន( {absent_count} អង្គ)
{absent_list}

───────· 𖥸· ───────
๛សេចក្តីដូចទូលប្រគេនខាងលើសូមព្រះបិតាសង្ឃ ទទួលនិមន្តជ្រាប សូមអរព្រះគុណ
🙏🏻🙏🏻🙏🏻`

/** Daily message for យកធុងសម្រាម — one duty group per day (rotates). */
export const TRASH_DAILY_TEMPLATE = `🗓កាលបរិច្ឆេទ ៖ {date}
⏱️ម៉ោង ៖ {time}
━✥| វេនប្តូរធុងសម្រាម |✥━

{groups_list}
✍️ ក្នុង១អង្គធុងមួយ គ្រប់ទាំង៤អង្គ។`

/** Daily message for បិណ្ឌបាត — one rotating group per day. */
export const ALMS_DAILY_TEMPLATE = `🗓កាលបរិច្ឆេទ ៖ {date}
⏱️ម៉ោង ៖ ៨ៈ៤០ ព្រឹក
━✥| វេនបិណ្ឌបាត |✥━

{groups_list}`

/** Daily message for ថ្វាយបង្គំ — shift from real time (ព្រឹក / យប់). */
export const WORSHIP_MEAL_DAILY_TEMPLATE = `🗓កាលបរិច្ឆេទ ៖ {date}
━✥ កិច្ចវត្តថ្វាយបង្គំពេល ៖ {shift} ✥━
🏡 កុដិសាលាពុទ្ធិក {total_monk}
───────☆☸️☆───────
🌟 ច្បាប់ចំនួន​​ {total permission}អង្គ
{excused_list}
❌ ព្រះសង្ឃអវត្តមាន​ {absent_count}អង្គ
{absent_list}

📝 សូមប្រគេនរបាយការណ៌ ព្រះសង្ឃឡើងថ្វាយបង្គំពេល {shift}  នេះមាន {present_count}អង្គ។`

/** Daily message for សាលាឆាន់ — shift from real time (ព្រឹក / ថ្ងៃត្រង់). */
export const SALA_CHAN_DAILY_TEMPLATE = `🗓កាលបរិច្ឆេទ ៖ {date}
━✥ កិច្ចវត្តឆាន់ប្រចាំពេល ៖ {shift} ✥━
🏡 កុដិសាលាពុទ្ធិកព្រះសង្ឃចំនួន {total_monk} អង្គ
───────☆☸️☆───────
🌟 ច្បាប់ចំនួន​​ {total permission}អង្គ
{excused_list}
❌ ព្រះសង្ឃអវត្តមាន​ {absent_count}អង្គ
{absent_list}

📝 សូមប្រគេនរបាយការណ៌ ព្រះសង្ឃឆាន់ប្រចាំពេល {shift}  នេះមាន {present_count}អង្គ។`

/** Daily message for ចាត់លោកទៅបុណ្យ — assigned monks for the day. */
export const BON_PARTY_DAILY_TEMPLATE = `🗓កាលបរិច្ឆេទ ៖ {date}
⏱️ម៉ោង ៖ {time}
━✥| លោកទៅបុណ្យ |✥━

📄 ព្រះនាមទៅបុណ្យ {Total-Number}:
{present_list}
✔️បើបានដឹងហើយ សូមឆ្លើយបញ្ជាក់។`

export const DEFAULT_STUDY_HOURS = STUDY_HOURS_MORNING

/** Daily message for seed `study` / ទៅរៀន — not the same as វត្តមានរៀនក្នុងកុដិ. */
export const STUDY_SEED_DAILY_TEMPLATE = `🙏 ✥◈ថ្វាយបង្គំព្រះបិតាសង្ឃ✥◈🙏
——∘◦❀◦∘——∘◦❀◦∘—∘◦❀◦∘———
🔔សេចក្តីទូលប្រគេនរបាយការណ៍ {kuti}
🗓កាលបរិច្ឆេទ៖ {date}
⏱️ម៉ោងសិក្សា៖ {time}
࿇ ══━━━━✥◈✥━━━━══ ࿇
ព្រះសង្ឃ​សរុប​ ( {total_monk} អង្គ)
សមណសិស្ស​ អនុវិទ្យាល័យ​ ( {middle_school} អង្គ) -|- វិទ្យាល័យ( {high_school} អង្គ)
✳️ព្រះសង្ឃ​ទៅរៀន  ( {present_count} អង្គ)
❇️ព្រះសង្ឃ​ដាក់ច្បាប់ចំនួន( {total permission} អង្គ)
{excused_list}
🛑ព្រះសង្ឃ​អវត្តមាន​ចំនួន( {absent_count} អង្គ)
{absent_list}

───────· 𖥸· ───────
๛សេចក្តីដូចទូលប្រគេនខាងលើសូមព្រះបិតាសង្ឃ ទទួលនិមន្តជ្រាប សូមអរព្រះគុណ
🙏🏻🙏🏻🙏🏻`

/** Daily message for វត្តមានរៀនក្នុងកុដិ only. */
export const DEFAULT_DAILY_TEMPLATE = `🙏 ✥◈ថ្វាយបង្គំព្រះបិតាសង្ឃ✥◈🙏
——∘◦❀◦∘——∘◦❀◦∘—∘◦❀◦∘———
🔔សេចក្តីទូលប្រគេនរបាយការណ៍ {kuti}
🗓កាលបរិច្ឆេទ៖{date}
⏱️ម៉ោងសិក្សា៖ {time}
࿇ ══━━━━✥◈✥━━━━══ ࿇
ព្រះសង្ឃ​សរុប​ ( {total_monk} អង្គ)
សមណសិស្ស​ អនុវិទ្យាល័យ​ ( {middle_school} អង្គ) -|- វិទ្យាល័យ( {high_school} អង្គ)
✳️ព្រះសង្ឃចេញរៀន  ( {present_count}អង្គ)
❇️ព្រះសង្ឃ​ដាក់ច្បាប់ចំនួន( {total permission} អង្គ)
{excused_list}
🛑ព្រះសង្ឃ​អវត្តមាន​ចំនួន( {absent_count} អង្គ)
{absent_list}

───────· 𖥸· ───────
๛សេចក្តីដូចទូលប្រគេនខាងលើសូមព្រះបិតាសង្ឃ ទទួលនិមន្តជ្រាប សូមអរព្រះគុណ
🙏🏻🙏🏻🙏🏻`

export const DEFAULT_REPORT_TEMPLATE = `របាយការណ៍វត្តមាន{type_label}
រយៈពេល៖ {period}
ពី {from} ដល់ {to}
កុដិ៖ {kuti}

សរុបកំណត់ត្រា៖ {total}
មក៖ {present_count} | អវត្តមាន៖ {absent_count} | សូមច្បាប់៖ {excused_count}
អត្រាមក៖ {rate}%`
