import { getPool } from './db'
import { getSetting, labelForAttendanceType } from './settings'
import {
  ALMS_DAILY_TEMPLATE,
  DEFAULT_DAILY_TEMPLATE,
  EXCUSE_PERIOD_LABELS,
  KUTI_WORK_DAILY_TEMPLATE,
  BON_PARTY_DAILY_TEMPLATE,
  BON_PARTY_TYPE_KEY,
  SALA_CHAN_DAILY_TEMPLATE,
  SALA_CHAN_TYPE_KEY,
  STUDY_IN_KUTI_TYPE_KEY,
  STUDY_SEED_DAILY_TEMPLATE,
  TRASH_DAILY_TEMPLATE,
  WORSHIP_MEAL_DAILY_TEMPLATE,
  REPORT_PERIOD_LABELS,
  formatAttendanceClockTime,
  formatKhmerClockFromHHMM,
  parseBonPartyNote,
  resolveSalaChanShift,
  resolveWorshipMealShift,
  type AttendanceStatus,
  type AttendanceType,
  type ExcusePeriod,
  type ReportPeriod,
} from './attendanceTypes'
import { sendTelegramMessage } from './telegram'

export type AttendanceRow = {
  id: number
  kuti_id: number
  resident_id: number
  attendance_type: AttendanceType
  attend_date: string
  status: AttendanceStatus
  marked_by: number | null
  note: string | null
  first_name?: string
  last_name?: string
  monk_status?: string | null
  education_level?: string | null
}

const KHMER_DIGITS = ['០', '១', '២', '៣', '៤', '៥', '៦', '៧', '៨', '៩']

function toKhmerNumber(value: number) {
  return String(value)
    .split('')
    .map((digit) => KHMER_DIGITS[Number(digit)] ?? digit)
    .join('')
}

/** ISO `YYYY-MM-DD` → `-២៨-០៩- ២០២៦` (study daily report). */
function formatKhmerStudyDate(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!match) return iso
  const [, year, month, day] = match
  const kh = (s: string) =>
    s
      .split('')
      .map((d) => KHMER_DIGITS[Number(d)] ?? d)
      .join('')
  return `-${kh(day)}-${kh(month)}- ${kh(year)}`
}

function isStudyDailyType(type: string) {
  /** Only វត្តមានរៀនក្នុងកុដិ — not seed `study` / ទៅរៀន */
  return type === STUDY_IN_KUTI_TYPE_KEY
}

function isMiddleSchool(level?: string | null) {
  const text = (level || '').trim()
  if (!text) return false
  return /អនុវិទ្យាល័យ|អនុ\s*វិទ្យាល័យ|មធ្យមសិក្សាបឋម|middle/i.test(text)
}

function isUniversity(level?: string | null) {
  const text = (level || '').trim()
  if (!text) return false
  return /មហាវិទ្យាល័យ|university|college/i.test(text)
}

/** High school only — excludes អនុវិទ្យាល័យ and មហាវិទ្យាល័យ */
function isHighSchool(level?: string | null) {
  const text = (level || '').trim()
  if (!text) return false
  if (isMiddleSchool(text) || isUniversity(text)) return false
  if (text === 'វិទ្យាល័យ') return true
  if (/មធ្យមសិក្សាទុតិយ|^high(\s|-)?school$/i.test(text)) return true
  return /វិទ្យាល័យ/.test(text) && !/អនុ|មហា/.test(text)
}

function educationLabel(level?: string | null) {
  return (level || '').trim() || '—'
}

function fullMonkName(row: { last_name?: string; first_name?: string }) {
  return `${row.last_name || ''} ${row.first_name || ''}`.trim() || '—'
}

const ATTENDANCE_TZ = 'Asia/Phnom_Penh'

/** Calendar date in kuti timezone (not UTC). */
export function isoDate(d = new Date(), timeZone = ATTENDANCE_TZ) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const get = (type: string) => parts.find((p) => p.type === type)?.value || ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function periodRange(period: ReportPeriod, end = new Date()) {
  const toIso = isoDate(end)
  const cursor = new Date(`${toIso}T12:00:00Z`)
  if (period === 'today') {
    return { from: toIso, to: toIso }
  }
  if (period === 'week') cursor.setUTCDate(cursor.getUTCDate() - 6)
  else if (period === 'month') cursor.setUTCMonth(cursor.getUTCMonth() - 1)
  return { from: cursor.toISOString().slice(0, 10), to: toIso }
}

function shiftIsoDate(iso: string, deltaDays: number) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return d.toISOString().slice(0, 10)
}

function daysInclusive(from: string, to: string) {
  const start = new Date(`${from}T00:00:00Z`).getTime()
  const end = new Date(`${to}T00:00:00Z`).getTime()
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 1
  return Math.round((end - start) / 86_400_000) + 1
}

/** Contiguous excused leave block that includes `day`. */
function leaveRangeContaining(dates: string[], day: string) {
  const set = new Set(dates)
  if (!set.has(day)) return null
  let from = day
  let to = day
  while (set.has(shiftIsoDate(from, -1))) from = shiftIsoDate(from, -1)
  while (set.has(shiftIsoDate(to, 1))) to = shiftIsoDate(to, 1)
  const total = daysInclusive(from, to)
  const remaining = daysInclusive(day, to)
  return {
    excuse_from: from,
    excuse_to: to,
    excuse_days: total,
    excuse_remaining: remaining,
  }
}

export async function listDayAttendance(params: {
  type: AttendanceType
  date: string
  kutiId?: number | null
}) {
  const { hasKutiApiToken, resolveHomeKutiId } = await import('./pagoda')
  if (!(await hasKutiApiToken())) return []
  const homeId = await resolveHomeKutiId()
  if (!homeId) return []
  const kutiId = params.kutiId || homeId

  const residents = await getPool().query<{
    id: number
    first_name: string
    last_name: string
    monk_status: string | null
    education_level: string | null
    room_id: number | null
    room_name: string | null
    kuti_id: number
    kuti_name: string | null
  }>(
    `SELECT r.id, r.first_name, r.last_name, r.monk_status, r.education_level,
            r.room_id, rm.room_name, r.kuti_id, k.kuti_name
     FROM residents r
     LEFT JOIN kutis k ON k.id = r.kuti_id
     LEFT JOIN rooms rm ON rm.id = r.room_id
     WHERE r.kuti_id = $1 AND r.status <> 'dropped'
     ORDER BY
       CASE
         WHEN r.position ILIKE '%ចៅធិការ%' THEN 0
         WHEN r.position ILIKE '%សូត្រឆ្វេង%' THEN 1
         WHEN r.position ILIKE '%សូត្រស្តាំ%' THEN 2
         WHEN r.position ILIKE '%វិន័យធរ%' THEN 3
         WHEN r.position ILIKE '%លេខា%' THEN 4
         WHEN r.position ILIKE '%មន្ត្រីសង្ឃ%' THEN 5
         WHEN r.position ILIKE '%មេកុដិ%' THEN 6
         WHEN r.position ILIKE '%អនុកុដិ%' THEN 7
         ELSE 8
       END,
       COALESCE(r.vassa_years, 0) DESC,
       r.last_name,
       r.first_name`,
    [kutiId],
  )

  const marks = await getPool().query<{
    resident_id: number
    status: AttendanceStatus
    id: number
    note: string | null
    excuse_period: ExcusePeriod | null
  }>(
    `SELECT id, resident_id, status, note, excuse_period FROM attendance_kuti
     WHERE kuti_id = $1 AND attendance_type = $2 AND attend_date = $3::date`,
    [kutiId, params.type, params.date],
  )

  const excusedIds = marks.rows
    .filter((row) => row.status === 'excused')
    .map((row) => row.resident_id)

  const leaveByResident = new Map<
    number,
    {
      excuse_from: string
      excuse_to: string
      excuse_days: number
      excuse_remaining: number
    }
  >()

  if (excusedIds.length > 0) {
    const leaveDates = await getPool().query<{ resident_id: number; d: string }>(
      `SELECT resident_id, attend_date::text AS d
       FROM attendance_kuti
       WHERE kuti_id = $1
         AND attendance_type = $2
         AND status = 'excused'
         AND resident_id = ANY($3::int[])
       ORDER BY resident_id, attend_date`,
      [kutiId, params.type, excusedIds],
    )
    const datesByResident = new Map<number, string[]>()
    for (const row of leaveDates.rows) {
      const list = datesByResident.get(row.resident_id) || []
      list.push(row.d)
      datesByResident.set(row.resident_id, list)
    }
    for (const [residentId, dates] of datesByResident) {
      const range = leaveRangeContaining(dates, params.date)
      if (range) leaveByResident.set(residentId, range)
    }
  }

  const byResident = new Map(marks.rows.map((row) => [row.resident_id, row]))
  const { groupMapForType } = await import('./attendanceGroups')
  const groupByResident = await groupMapForType(params.type)

  return residents.rows.map((resident) => {
    const mark = byResident.get(resident.id)
    const leave = leaveByResident.get(resident.id)
    const group = groupByResident.get(resident.id)
    return {
      resident_id: resident.id,
      kuti_id: resident.kuti_id,
      kuti_name: resident.kuti_name,
      first_name: resident.first_name,
      last_name: resident.last_name,
      monk_status: resident.monk_status,
      education_level: resident.education_level,
      room_id: resident.room_id,
      room_name: resident.room_name,
      group_id: group?.group_id || null,
      group_name: group?.group_name || null,
      group_sort: group?.sort_order ?? null,
      // Default present when no mark yet
      status: (mark?.status || 'present') as AttendanceStatus,
      excuse_period: (mark?.excuse_period || null) as ExcusePeriod | null,
      attendance_id: mark?.id || null,
      note: mark?.note || null,
      excuse_from: leave?.excuse_from || null,
      excuse_to: leave?.excuse_to || null,
      excuse_days: leave?.excuse_days || null,
      excuse_remaining: leave?.excuse_remaining || null,
    }
  })
}

export async function upsertMarks(params: {
  type: AttendanceType
  date: string
  kutiId?: number | null
  markedBy: number
  marks: Array<{
    resident_id: number
    status: AttendanceStatus
    note?: string
    kuti_id?: number
    excuse_period?: ExcusePeriod | null
  }>
}) {
  for (const mark of params.marks) {
    let kutiId = mark.kuti_id || params.kutiId || null
    if (!kutiId) {
      const found = await getPool().query<{ kuti_id: number | null }>(
        `SELECT kuti_id FROM residents WHERE id = $1`,
        [mark.resident_id],
      )
      kutiId = found.rows[0]?.kuti_id || null
    }
    if (!kutiId) continue

    const excusePeriod = mark.status === 'excused' ? mark.excuse_period || null : null
    // Keep note for excused/absent (reason) and present (e.g. ចាត់លោកទៅបុណ្យ assign JSON)
    const note =
      mark.status === 'excused' || mark.status === 'absent' || mark.status === 'present'
        ? (mark.note || '').trim() || null
        : null

    await getPool().query(
      `INSERT INTO attendance_kuti
        (kuti_id, resident_id, attendance_type, attend_date, status, excuse_period, marked_by, note, updated_at)
       VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8, now())
       ON CONFLICT (kuti_id, resident_id, attendance_type, attend_date)
       DO UPDATE SET status = EXCLUDED.status, excuse_period = EXCLUDED.excuse_period,
         marked_by = EXCLUDED.marked_by, note = EXCLUDED.note, updated_at = now()`,
      [
        kutiId,
        mark.resident_id,
        params.type,
        params.date,
        mark.status,
        excusePeriod,
        params.markedBy,
        note,
      ],
    )
  }
  return listDayAttendance({ type: params.type, date: params.date, kutiId: params.kutiId || null })
}

/**
 * @deprecated Absents/excuses must stay in DB for reports.
 * Mark page clears absent UI locally after save instead.
 */
export async function clearDayActions(params: {
  type: AttendanceType
  date: string
  kutiId?: number | null
}) {
  return listDayAttendance({ type: params.type, date: params.date, kutiId: params.kutiId || null })
}

function eachDateInclusive(from: string, to: string): string[] {
  const start = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return []
  const dates: string[] = []
  for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(cursor.toISOString().slice(0, 10))
  }
  return dates
}

export async function upsertExcuseRange(params: {
  type: AttendanceType
  from: string
  to: string
  residentId: number
  kutiId?: number | null
  markedBy: number
  excuse_period: ExcusePeriod
  note?: string | null
}) {
  const { hasKutiApiToken, resolveHomeKutiId } = await import('./pagoda')
  if (!(await hasKutiApiToken())) throw new Error('សូមបញ្ចូល Token កុដិជាមុនសិន')

  let kutiId = params.kutiId || null
  if (!kutiId) {
    const found = await getPool().query<{ kuti_id: number | null }>(
      `SELECT kuti_id FROM residents WHERE id = $1`,
      [params.residentId],
    )
    kutiId = found.rows[0]?.kuti_id || (await resolveHomeKutiId())
  }
  if (!kutiId) throw new Error('មិនទាន់មានកុដិ')

  const from = params.from <= params.to ? params.from : params.to
  const to = params.from <= params.to ? params.to : params.from
  const dates = eachDateInclusive(from, to)
  if (dates.length === 0) throw new Error('កាលបរិច្ឆេទមិនត្រឹមត្រូវ')
  if (dates.length > 62) throw new Error('រយៈពេលសូមច្បាប់វែងពេក (អតិបរមា ៦២ ថ្ងៃ)')

  const note = (params.note || '').trim() || null
  for (const attendDate of dates) {
    await getPool().query(
      `INSERT INTO attendance_kuti
        (kuti_id, resident_id, attendance_type, attend_date, status, excuse_period, marked_by, note, updated_at)
       VALUES ($1,$2,$3,$4::date,'excused',$5,$6,$7, now())
       ON CONFLICT (kuti_id, resident_id, attendance_type, attend_date)
       DO UPDATE SET status = 'excused', excuse_period = EXCLUDED.excuse_period,
         marked_by = EXCLUDED.marked_by, note = EXCLUDED.note, updated_at = now()`,
      [
        kutiId,
        params.residentId,
        params.type,
        attendDate,
        params.excuse_period,
        params.markedBy,
        note,
      ],
    )
  }

  return { from, to, days: dates.length, kuti_id: kutiId }
}

function applyTemplate(template: string, vars: Record<string, string | number>) {
  let out = template
  const keys = Object.keys(vars).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    out = out.replaceAll(`{${key}}`, String(vars[key]))
  }
  return out
}

function roomLabel(row: { room_name?: string | null }) {
  return (row.room_name || '').trim() || '—'
}

function excuseReasonLabel(row: {
  note?: string | null
  excuse_period?: ExcusePeriod | null
}) {
  const note = (row.note || '').trim()
  if (note) return note
  if (row.excuse_period && EXCUSE_PERIOD_LABELS[row.excuse_period]) {
    return EXCUSE_PERIOD_LABELS[row.excuse_period]
  }
  return '—'
}

function defaultDailyTemplateForType(type: string) {
  if (type === 'kuti_work') return KUTI_WORK_DAILY_TEMPLATE
  if (type === 'trash') return TRASH_DAILY_TEMPLATE
  if (type === 'alms') return ALMS_DAILY_TEMPLATE
  if (type === 'worship_meal') return WORSHIP_MEAL_DAILY_TEMPLATE
  if (type === SALA_CHAN_TYPE_KEY) return SALA_CHAN_DAILY_TEMPLATE
  if (type === BON_PARTY_TYPE_KEY) return BON_PARTY_DAILY_TEMPLATE
  if (type === STUDY_IN_KUTI_TYPE_KEY) return DEFAULT_DAILY_TEMPLATE
  if (type === 'study') return STUDY_SEED_DAILY_TEMPLATE
  return DEFAULT_DAILY_TEMPLATE
}

function groupDutyNumber(group: { name: string; sort_order: number }) {
  const match = group.name.match(/ទី\s*([០១២៣៤៥៦៧៨៩0-9]+)/)
  if (match?.[1]) return match[1]
  return toKhmerNumber(group.sort_order || 1)
}

function formatGroupMembersBlock(
  group: { name: string; sort_order: number; member_ids: number[] },
  byId: Map<number, { resident_id: number; first_name: string; last_name: string }>,
) {
  const members = group.member_ids
    .map((id) => byId.get(id))
    .filter((r): r is { resident_id: number; first_name: string; last_name: string } => Boolean(r))
  const lines =
    members.length > 0
      ? members.map((r, i) => `      ${toKhmerNumber(i + 1)}​ -  ${fullMonkName(r)}`).join('\n')
      : '      —'
  return `📄 ក្រុមវេនទី ${groupDutyNumber(group)}:\n${lines}`
}

async function buildDutyGroupsList(
  type: string,
  rows: Array<{ resident_id: number; first_name: string; last_name: string }>,
  dateIso: string,
) {
  const { listAttendanceGroups, pickDutyGroup } = await import('./attendanceGroups')
  const groups = await listAttendanceGroups(type)
  if (groups.length === 0) return 'មិនទាន់មានក្រុម'
  const duty = pickDutyGroup(groups, dateIso)
  if (!duty) return 'មិនទាន់មានក្រុម'
  const byId = new Map(rows.map((r) => [r.resident_id, r]))
  return formatGroupMembersBlock(duty, byId)
}

export async function buildDailyText(params: {
  type: AttendanceType
  date: string
  kutiId?: number | null
}) {
  const formats = await getSetting('attendance_text_formats')
  const reminders = await getSetting('attendance_reminders')
  const typeLabel = await labelForAttendanceType(params.type)
  const tz = reminders.timezone || 'Asia/Phnom_Penh'
  const { resolveHomeKutiId } = await import('./pagoda')
  const homeId = await resolveHomeKutiId()
  const kutiId = params.kutiId || homeId || null
  let kutiName = 'គ្រប់កុដិ'
  if (kutiId) {
    const kuti = await getPool().query<{ kuti_name: string }>(
      `SELECT kuti_name FROM kutis WHERE id = $1`,
      [kutiId],
    )
    kutiName = kuti.rows[0]?.kuti_name || String(kutiId)
  }
  const rows = await listDayAttendance({ ...params, kutiId })
  const isBonParty = params.type === BON_PARTY_TYPE_KEY
  const isStudy = isStudyDailyType(params.type)
  const partyAssigned = isBonParty
    ? rows
        .map((r) => ({ row: r, assign: parseBonPartyNote(r.note) }))
        .filter((x): x is { row: (typeof rows)[number]; assign: NonNullable<ReturnType<typeof parseBonPartyNote>> } =>
          Boolean(x.assign),
        )
    : []
  const present = isBonParty
    ? partyAssigned.map((x) => x.row)
    : rows.filter((r) => r.status === 'present' || !r.status)
  const absent = rows.filter((r) => r.status === 'absent')
  const excused = rows.filter((r) => r.status === 'excused')
  const middleSchool = rows.filter((r) => isMiddleSchool(r.education_level)).length
  const highSchool = rows.filter((r) => isHighSchool(r.education_level)).length

  const useRoomLists =
    params.type === 'kuti_work' ||
    params.type === 'worship_meal' ||
    params.type === SALA_CHAN_TYPE_KEY
  const presentList = isBonParty
    ? partyAssigned
        .map(
          (x, i) =>
            `      ${toKhmerNumber(i + 1)}​ -  ${fullMonkName(x.row)} | ${x.assign.place} | ${x.assign.kind}`,
        )
        .join('\n') || '—'
    : present.map((r, i) => `${i + 1}. ${fullMonkName(r)}`).join('\n') || '—'
  const absentList =
    absent
      .map((r, i) =>
        isStudy
          ? `      ${toKhmerNumber(i + 1)}​ -  ${fullMonkName(r)} | ${roomLabel(r)}`
          : useRoomLists
            ? `      ${toKhmerNumber(i + 1)}​ -  ${fullMonkName(r)} | ${roomLabel(r)}`
            : `     ${toKhmerNumber(i + 1)}​ -  ${fullMonkName(r)} | ${educationLabel(r.education_level)}`,
      )
      .join('\n') || '—'
  const excusedList =
    excused
      .map((r, i) =>
        isStudy
          ? `      ${toKhmerNumber(i + 1)}​ -  ${fullMonkName(r)} | ${excuseReasonLabel(r)} | ${roomLabel(r)}`
          : useRoomLists
            ? `      ${toKhmerNumber(i + 1)}​ -  ${fullMonkName(r)} | ${roomLabel(r)} | ${excuseReasonLabel(r)}`
            : `     ${toKhmerNumber(i + 1)}​ -  ${fullMonkName(r)} | ${excuseReasonLabel(r)} | ${educationLabel(r.education_level)}`,
      )
      .join('\n') || '—'

  const groupsList =
    params.type === 'trash' || params.type === 'alms'
      ? await buildDutyGroupsList(params.type, rows, params.date)
      : ''

  const shift =
    params.type === 'worship_meal'
      ? resolveWorshipMealShift(new Date(), tz)
      : params.type === SALA_CHAN_TYPE_KEY
        ? resolveSalaChanShift(new Date(), tz)
        : ''

  const partyTimes = isBonParty
    ? [
        ...new Set(
          partyAssigned.map((x) => formatKhmerClockFromHHMM(x.assign.time)).filter(Boolean),
        ),
      ]
    : []
  const timeText = isBonParty
    ? partyTimes.join(' · ') || '..................'
    : formatAttendanceClockTime(new Date(), tz)

  let template = formats.daily[params.type] || defaultDailyTemplateForType(params.type)
  // Broken paste templates keep example "ឈ្មោះ | បន្ទប់" lines instead of list placeholders
  if (
    params.type === 'kuti_work' &&
    (!template.includes('{excused_list}') ||
      !template.includes('{absent_list}') ||
      template.includes('ឈ្មោះ | បន្ទប់'))
  ) {
    template = KUTI_WORK_DAILY_TEMPLATE
  }
  if (
    params.type === 'trash' &&
    (!template.includes('{groups_list}') || !template.includes('វេនប្តូរធុងសម្រាម'))
  ) {
    template = TRASH_DAILY_TEMPLATE
  }
  if (
    params.type === 'alms' &&
    (!template.includes('{groups_list}') || !template.includes('វេនបិណ្ឌបាត'))
  ) {
    template = ALMS_DAILY_TEMPLATE
  }
  if (
    params.type === 'worship_meal' &&
    (!template.includes('{shift}') ||
      !template.includes('កិច្ចវត្តថ្វាយបង្គំ') ||
      template.includes('ម៉ោងសិក្សា') ||
      template.includes('ព្រះសង្ឃ​ទៅរៀន') ||
      template.includes('ថ្វាយបង្គំព្រះបិតាសង្ឃ'))
  ) {
    template = WORSHIP_MEAL_DAILY_TEMPLATE
  }
  if (
    params.type === SALA_CHAN_TYPE_KEY &&
    (!template.includes('{shift}') ||
      !template.includes('កិច្ចវត្តឆាន់') ||
      template.includes('ម៉ោងសិក្សា') ||
      template.includes('ព្រះសង្ឃ​ទៅរៀន') ||
      template.includes('ថ្វាយបង្គំព្រះបិតាសង្ឃ'))
  ) {
    template = SALA_CHAN_DAILY_TEMPLATE
  }
  if (
    params.type === BON_PARTY_TYPE_KEY &&
    (!template.includes('{present_list}') ||
      !template.includes('{time}') ||
      !template.includes('លោកទៅបុណ្យ') ||
      template.includes('..................') ||
      template.includes('ម៉ោងសិក្សា') ||
      template.includes('ព្រះសង្ឃ​ទៅរៀន') ||
      template.includes('ថ្វាយបង្គំព្រះបិតាសង្ឃ'))
  ) {
    template = BON_PARTY_DAILY_TEMPLATE
  }
  if (
    isStudy &&
    (!template.includes('{excused_list}') ||
      !template.includes('{absent_list}') ||
      !template.includes('ម៉ោងសិក្សា') ||
      template.includes('ព្រះសង្ឃ​ទៅរៀន') ||
      !template.includes('ព្រះសង្ឃចេញរៀន'))
  ) {
    template = DEFAULT_DAILY_TEMPLATE
  }
  if (
    params.type === 'study' &&
    (!template.includes('{excused_list}') ||
      !template.includes('{absent_list}') ||
      template.includes('ព្រះសង្ឃចេញរៀន') ||
      !template.includes('ព្រះសង្ឃ​ទៅរៀន'))
  ) {
    template = STUDY_SEED_DAILY_TEMPLATE
  }

  const n = (value: number) => (isStudy ? toKhmerNumber(value) : value)

  return applyTemplate(template, {
    type_label: typeLabel,
    date: isStudy ? formatKhmerStudyDate(params.date) : params.date,
    time: timeText,
    shift,
    'ព្រឹក / ល្ងាច': shift,
    'ព្រឹក / យប់': shift,
    'ព្រឹក / ថ្ងៃត្រង់': shift,
    kuti: kutiName,
    'name kuti': kutiName,
    kuti_name: kutiName,
    total_monk: n(rows.length),
    middle_school: n(middleSchool),
    'midle school': n(middleSchool),
    high_school: n(highSchool),
    'hight school': n(highSchool),
    'midle school + hight school': n(middleSchool + highSchool),
    middle_high: n(middleSchool + highSchool),
    present_count: n(present.length),
    'total-present': n(present.length),
    'total_present': n(present.length),
    'Total-Number': n(present.length),
    total_number: n(present.length),
    absent_count: n(absent.length),
    excused_count: n(excused.length),
    'total permission': n(excused.length),
    total_permission: n(excused.length),
    present_list: presentList,
    absent_list: absentList,
    excused_list: excusedList,
    groups_list: groupsList,
    'Group-Number': groupsList,
    group_number: groupsList,
    counts: `មក ${present.length} / អវត្តមាន ${absent.length} / សូមច្បាប់ ${excused.length}`,
  })
}

export async function buildReport(params: {
  type: AttendanceType
  period: ReportPeriod
  kutiId?: number | null
}) {
  const emptyLists = { absent_people: [] as ReportPerson[], excused_people: [] as ReportPerson[] }
  const { hasKutiApiToken, resolveHomeKutiId } = await import('./pagoda')
  if (!(await hasKutiApiToken())) {
    const { from, to } = periodRange(params.period)
    return {
      from,
      to,
      present: 0,
      absent: 0,
      excused: 0,
      total: 0,
      rate: 0,
      kuti: '—',
      text: '',
      ...emptyLists,
    }
  }
  const homeId = await resolveHomeKutiId()
  const kutiId = params.kutiId || homeId
  if (!kutiId) {
    const { from, to } = periodRange(params.period)
    return {
      from,
      to,
      present: 0,
      absent: 0,
      excused: 0,
      total: 0,
      rate: 0,
      kuti: '—',
      text: '',
      ...emptyLists,
    }
  }

  const { from, to } = periodRange(params.period)
  const values: unknown[] = [params.type, from, to, kutiId]
  const { rows } = await getPool().query<{
    status: AttendanceStatus
    count: string
  }>(
    `SELECT status, COUNT(*)::text AS count
     FROM attendance_kuti a
     WHERE a.attendance_type = $1
       AND a.attend_date BETWEEN $2::date AND $3::date
       AND a.kuti_id = $4
     GROUP BY status`,
    values,
  )
  const present = Number(rows.find((r) => r.status === 'present')?.count || 0)
  const absent = Number(rows.find((r) => r.status === 'absent')?.count || 0)
  const excused = Number(rows.find((r) => r.status === 'excused')?.count || 0)
  const total = present + absent + excused
  const rate = total ? Math.round((present / total) * 1000) / 10 : 0

  const people = await getPool().query<{
    resident_id: number
    first_name: string
    last_name: string
    status: AttendanceStatus
    days: string
    note: string | null
  }>(
    `SELECT a.resident_id, r.first_name, r.last_name, a.status,
            COUNT(*)::text AS days,
            MAX(a.note) AS note
     FROM attendance_kuti a
     JOIN residents r ON r.id = a.resident_id
     WHERE a.attendance_type = $1
       AND a.attend_date BETWEEN $2::date AND $3::date
       AND a.kuti_id = $4
       AND a.status IN ('absent', 'excused')
     GROUP BY a.resident_id, r.first_name, r.last_name, a.status
     ORDER BY r.last_name, r.first_name`,
    values,
  )

  const absent_people: ReportPerson[] = []
  const excused_people: ReportPerson[] = []
  for (const row of people.rows) {
    const item: ReportPerson = {
      resident_id: row.resident_id,
      first_name: row.first_name,
      last_name: row.last_name,
      days: Number(row.days) || 1,
      note: row.note || null,
    }
    if (row.status === 'absent') absent_people.push(item)
    else excused_people.push(item)
  }

  const kuti = await getPool().query<{ kuti_name: string }>(
    `SELECT kuti_name FROM kutis WHERE id = $1`,
    [kutiId],
  )
  const kutiName = kuti.rows[0]?.kuti_name || String(kutiId)

  const formats = await getSetting('attendance_text_formats')
  const typeLabel = await labelForAttendanceType(params.type)
  const template =
    formats.report[params.type] ||
    `របាយការណ៍វត្តមាន{type_label}\nរយៈពេល៖ {period}\nពី {from} ដល់ {to}\nកុដិ៖ {kuti}\n\nសរុប៖ {total}\nមក៖ {present_count} | អវត្តមាន៖ {absent_count} | សូមច្បាប់៖ {excused_count}\nអត្រា៖ {rate}%`
  const text = applyTemplate(template, {
    type_label: typeLabel,
    period: REPORT_PERIOD_LABELS[params.period],
    from,
    to,
    kuti: kutiName,
    total,
    present_count: present,
    absent_count: absent,
    excused_count: excused,
    rate,
  })

  return {
    from,
    to,
    present,
    absent,
    excused,
    total,
    rate,
    kuti: kutiName,
    text,
    absent_people,
    excused_people,
  }
}

const WEEKDAY_LABELS_KM = ['ច័ន្ទ', 'អង្គារ', 'ពុធ', 'ព្រហ', 'សុក្រ', 'សៅរ៍', 'អាទិត្យ'] as const

/** Monday–Sunday dates for the week containing `iso` (UTC calendar day). */
export function weekMondayToSunday(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`)
  const day = d.getUTCDay() // 0=Sun … 6=Sat
  const mondayOffset = day === 0 ? -6 : 1 - day
  const monday = shiftIsoDate(iso, mondayOffset)
  return Array.from({ length: 7 }, (_, i) => ({
    date: shiftIsoDate(monday, i),
    label: WEEKDAY_LABELS_KM[i],
  }))
}

export type WeekSheetCell = 'present' | 'absent' | 'excused' | null

export type WeekSheetRow = {
  resident_id: number
  first_name: string
  last_name: string
  cells: WeekSheetCell[]
}

export type WeekSheetVariant = 'default' | 'bon_party'

/** ចាត់លោកទៅបុណ្យ: ✓ only when assigned (saved note from popup). */
function sheetCellForType(
  type: AttendanceType,
  status: AttendanceStatus | undefined,
  note?: string | null,
): WeekSheetCell {
  if (type === BON_PARTY_TYPE_KEY) {
    return note && String(note).trim() ? 'present' : null
  }
  if (status === 'present' || status === 'absent' || status === 'excused') return status
  return null
}

function emptyWeekSheet(
  type: AttendanceType,
  from: string,
  to: string,
  days: { date: string; label: string }[],
) {
  return {
    from,
    to,
    kuti: '—',
    type_label: type,
    days,
    rows: [] as WeekSheetRow[],
    variant: (type === BON_PARTY_TYPE_KEY ? 'bon_party' : 'default') as WeekSheetVariant,
  }
}

/** A4 week sheet data: each monk × Mon–Sun marks. */
export async function buildWeekSheet(params: {
  type: AttendanceType
  /** Any date inside the target week; defaults to today (Phnom Penh). */
  date?: string
  kutiId?: number | null
}) {
  const { hasKutiApiToken, resolveHomeKutiId } = await import('./pagoda')
  const anchor = params.date || isoDate()
  const days = weekMondayToSunday(anchor)
  const from = days[0].date
  const to = days[6].date
  const variant: WeekSheetVariant =
    params.type === BON_PARTY_TYPE_KEY ? 'bon_party' : 'default'

  if (!(await hasKutiApiToken())) {
    return emptyWeekSheet(params.type, from, to, days)
  }

  const homeId = await resolveHomeKutiId()
  const kutiId = params.kutiId || homeId
  if (!kutiId) {
    return emptyWeekSheet(params.type, from, to, days)
  }

  const residents = await getPool().query<{
    id: number
    first_name: string
    last_name: string
  }>(
    `SELECT r.id, r.first_name, r.last_name
     FROM residents r
     WHERE r.kuti_id = $1 AND r.status <> 'dropped'
     ORDER BY
       CASE
         WHEN r.position ILIKE '%ចៅធិការ%' THEN 0
         WHEN r.position ILIKE '%សូត្រឆ្វេង%' THEN 1
         WHEN r.position ILIKE '%សូត្រស្តាំ%' THEN 2
         WHEN r.position ILIKE '%វិន័យធរ%' THEN 3
         WHEN r.position ILIKE '%លេខា%' THEN 4
         WHEN r.position ILIKE '%មន្ត្រីសង្ឃ%' THEN 5
         WHEN r.position ILIKE '%មេកុដិ%' THEN 6
         WHEN r.position ILIKE '%អនុកុដិ%' THEN 7
         ELSE 8
       END,
       COALESCE(r.vassa_years, 0) DESC,
       r.last_name,
       r.first_name`,
    [kutiId],
  )

  const marks = await getPool().query<{
    resident_id: number
    attend_date: string
    status: AttendanceStatus
    note: string | null
  }>(
    `SELECT resident_id, attend_date::text AS attend_date, status, note
     FROM attendance_kuti
     WHERE kuti_id = $1
       AND attendance_type = $2
       AND attend_date BETWEEN $3::date AND $4::date`,
    [kutiId, params.type, from, to],
  )

  const markMap = new Map<string, { status: AttendanceStatus; note: string | null }>()
  for (const row of marks.rows) {
    markMap.set(`${row.resident_id}:${row.attend_date}`, {
      status: row.status,
      note: row.note,
    })
  }

  /** Off: show real attendance only (no fake present/absent/excused fill). */
  const WEEK_SHEET_TEST_FILL = false
  const testCycle: WeekSheetCell[] = ['present', 'absent', 'excused']

  const rows: WeekSheetRow[] = residents.rows.map((r, ri) => ({
    resident_id: r.id,
    first_name: r.first_name,
    last_name: r.last_name,
    cells: days.map((day, di) => {
      const mark = markMap.get(`${r.id}:${day.date}`)
      const cell = sheetCellForType(params.type, mark?.status, mark?.note)
      if (cell) return cell
      if (WEEK_SHEET_TEST_FILL && variant === 'default') return testCycle[(di + ri) % 3]
      return null
    }),
  }))

  // Keep full monk name list; ✓ only where assigned (បានចាត់ទៅបុណ្យ)

  const kuti = await getPool().query<{ kuti_name: string }>(
    `SELECT kuti_name FROM kutis WHERE id = $1`,
    [kutiId],
  )
  const typeLabel = await labelForAttendanceType(params.type)

  return {
    from,
    to,
    kuti: kuti.rows[0]?.kuti_name || String(kutiId),
    type_label: typeLabel,
    days,
    rows,
    variant,
  }
}

const SHEET_KHMER_DIGITS = ['០', '១', '២', '៣', '៤', '៥', '៦', '៧', '៨', '៩']

function sheetKhmerDigits(value: string | number) {
  return String(value).replace(/\d/g, (d) => SHEET_KHMER_DIGITS[Number(d)] || d)
}

/** Calendar days 1…last for the month containing `iso`. */
export function monthCalendarDays(iso: string) {
  const [y, m] = iso.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const mm = String(m).padStart(2, '0')
  return Array.from({ length: lastDay }, (_, i) => {
    const day = i + 1
    return {
      date: `${y}-${mm}-${String(day).padStart(2, '0')}`,
      label: sheetKhmerDigits(day),
    }
  })
}

/**
 * Month trip counts for ចាត់លោកទៅបុណ្យ (days with assign note).
 * Used on mark page to show ចំនួន + highlight តិចជាងគេ.
 */
export async function listBonPartyTripCounts(params: {
  type: AttendanceType
  date?: string
  kutiId?: number | null
}) {
  const { hasKutiApiToken, resolveHomeKutiId } = await import('./pagoda')
  const anchor = params.date || isoDate()
  const days = monthCalendarDays(anchor)
  const from = days[0]?.date || anchor
  const to = days[days.length - 1]?.date || anchor

  const empty = {
    from,
    to,
    counts: {} as Record<string, number>,
    min_count: 0,
    least: [] as Array<{
      resident_id: number
      first_name: string
      last_name: string
      count: number
    }>,
  }

  if (params.type !== BON_PARTY_TYPE_KEY) return empty
  if (!(await hasKutiApiToken())) return empty

  const homeId = await resolveHomeKutiId()
  const kutiId = params.kutiId || homeId
  if (!kutiId) return empty

  const residents = await getPool().query<{
    id: number
    first_name: string
    last_name: string
  }>(
    `SELECT r.id, r.first_name, r.last_name
     FROM residents r
     WHERE r.kuti_id = $1 AND r.status <> 'dropped'
     ORDER BY r.last_name, r.first_name`,
    [kutiId],
  )

  const marks = await getPool().query<{
    resident_id: number
    attend_date: string
  }>(
    `SELECT resident_id, attend_date::text AS attend_date
     FROM attendance_kuti
     WHERE kuti_id = $1
       AND attendance_type = $2
       AND attend_date BETWEEN $3::date AND $4::date
       AND note IS NOT NULL
       AND btrim(note) <> ''`,
    [kutiId, params.type, from, to],
  )

  const counts: Record<string, number> = {}
  for (const r of residents.rows) counts[String(r.id)] = 0
  for (const row of marks.rows) {
    const key = String(row.resident_id)
    counts[key] = (counts[key] || 0) + 1
  }

  const values = residents.rows.map((r) => counts[String(r.id)] || 0)
  const minCount = values.length ? Math.min(...values) : 0
  const least = residents.rows
    .filter((r) => (counts[String(r.id)] || 0) === minCount)
    .map((r) => ({
      resident_id: r.id,
      first_name: r.first_name,
      last_name: r.last_name,
      count: counts[String(r.id)] || 0,
    }))

  return { from, to, counts, min_count: minCount, least }
}

/** A4 landscape month sheet: each monk × day 1–28/29/30/31. */
export async function buildMonthSheet(params: {
  type: AttendanceType
  /** Any date inside the target month; defaults to today (Phnom Penh). */
  date?: string
  kutiId?: number | null
}) {
  const { hasKutiApiToken, resolveHomeKutiId } = await import('./pagoda')
  const anchor = params.date || isoDate()
  const days = monthCalendarDays(anchor)
  const from = days[0]?.date || anchor
  const to = days[days.length - 1]?.date || anchor
  const variant: WeekSheetVariant =
    params.type === BON_PARTY_TYPE_KEY ? 'bon_party' : 'default'

  if (!(await hasKutiApiToken())) {
    return emptyWeekSheet(params.type, from, to, days)
  }

  const homeId = await resolveHomeKutiId()
  const kutiId = params.kutiId || homeId
  if (!kutiId) {
    return emptyWeekSheet(params.type, from, to, days)
  }

  const residents = await getPool().query<{
    id: number
    first_name: string
    last_name: string
  }>(
    `SELECT r.id, r.first_name, r.last_name
     FROM residents r
     WHERE r.kuti_id = $1 AND r.status <> 'dropped'
     ORDER BY
       CASE
         WHEN r.position ILIKE '%ចៅធិការ%' THEN 0
         WHEN r.position ILIKE '%សូត្រឆ្វេង%' THEN 1
         WHEN r.position ILIKE '%សូត្រស្តាំ%' THEN 2
         WHEN r.position ILIKE '%វិន័យធរ%' THEN 3
         WHEN r.position ILIKE '%លេខា%' THEN 4
         WHEN r.position ILIKE '%មន្ត្រីសង្ឃ%' THEN 5
         WHEN r.position ILIKE '%មេកុដិ%' THEN 6
         WHEN r.position ILIKE '%អនុកុដិ%' THEN 7
         ELSE 8
       END,
       COALESCE(r.vassa_years, 0) DESC,
       r.last_name,
       r.first_name`,
    [kutiId],
  )

  const marks = await getPool().query<{
    resident_id: number
    attend_date: string
    status: AttendanceStatus
    note: string | null
  }>(
    `SELECT resident_id, attend_date::text AS attend_date, status, note
     FROM attendance_kuti
     WHERE kuti_id = $1
       AND attendance_type = $2
       AND attend_date BETWEEN $3::date AND $4::date`,
    [kutiId, params.type, from, to],
  )

  const markMap = new Map<string, { status: AttendanceStatus; note: string | null }>()
  for (const row of marks.rows) {
    markMap.set(`${row.resident_id}:${row.attend_date}`, {
      status: row.status,
      note: row.note,
    })
  }

  /** Off: show real attendance only (no fake present/absent/excused fill). */
  const MONTH_SHEET_TEST_FILL = false
  const testCycle: WeekSheetCell[] = ['present', 'absent', 'excused']

  const rows: WeekSheetRow[] = residents.rows.map((r, ri) => {
    // ចាត់លោកទៅបុណ្យ: pack ✓ from column 1…N by trip count (not calendar day).
    if (variant === 'bon_party') {
      const tripCount = days.filter((day) => {
        const mark = markMap.get(`${r.id}:${day.date}`)
        return Boolean(sheetCellForType(params.type, mark?.status, mark?.note))
      }).length
      return {
        resident_id: r.id,
        first_name: r.first_name,
        last_name: r.last_name,
        cells: days.map((_, di) => (di < tripCount ? ('present' as WeekSheetCell) : null)),
      }
    }

    return {
      resident_id: r.id,
      first_name: r.first_name,
      last_name: r.last_name,
      cells: days.map((day, di) => {
        const mark = markMap.get(`${r.id}:${day.date}`)
        const cell = sheetCellForType(params.type, mark?.status, mark?.note)
        if (cell) return cell
        if (MONTH_SHEET_TEST_FILL) return testCycle[(di + ri) % 3]
        return null
      }),
    }
  })

  // Keep full monk name list (ឈ្មោះ); bon_party ✓ packed left from column 1

  const kuti = await getPool().query<{ kuti_name: string }>(
    `SELECT kuti_name FROM kutis WHERE id = $1`,
    [kutiId],
  )
  const typeLabel = await labelForAttendanceType(params.type)

  return {
    from,
    to,
    kuti: kuti.rows[0]?.kuti_name || String(kutiId),
    type_label: typeLabel,
    days,
    rows,
    variant,
  }
}

type ReportPerson = {
  resident_id: number
  first_name: string
  last_name: string
  days: number
  note: string | null
}

/** Remove absent/excused marks for one monk within a report date range. */
export async function removeReportPerson(params: {
  type: AttendanceType
  period: ReportPeriod
  residentId: number
  status: 'absent' | 'excused'
  kutiId?: number | null
}) {
  const { hasKutiApiToken, resolveHomeKutiId } = await import('./pagoda')
  if (!(await hasKutiApiToken())) throw new Error('សូមបញ្ចូល Token កុដិជាមុនសិន')
  const homeId = await resolveHomeKutiId()
  const kutiId = params.kutiId || homeId
  if (!kutiId) throw new Error('មិនទាន់មានកុដិ')

  const { from, to } = periodRange(params.period)
  await getPool().query(
    `UPDATE attendance_kuti
     SET status = 'present', excuse_period = NULL, note = NULL, updated_at = now()
     WHERE kuti_id = $1
       AND resident_id = $2
       AND attendance_type = $3
       AND attend_date BETWEEN $4::date AND $5::date
       AND status = $6`,
    [kutiId, params.residentId, params.type, from, to, params.status],
  )
  return buildReport({ type: params.type, period: params.period, kutiId })
}

/** Update note (and keep status) for one monk within a report date range. */
export async function updateReportPerson(params: {
  type: AttendanceType
  period: ReportPeriod
  residentId: number
  status: 'absent' | 'excused'
  note: string
  kutiId?: number | null
}) {
  const { hasKutiApiToken, resolveHomeKutiId } = await import('./pagoda')
  if (!(await hasKutiApiToken())) throw new Error('សូមបញ្ចូល Token កុដិជាមុនសិន')
  const homeId = await resolveHomeKutiId()
  const kutiId = params.kutiId || homeId
  if (!kutiId) throw new Error('មិនទាន់មានកុដិ')

  const note = params.note.trim()
  if (params.status === 'excused' && !note) throw new Error('សូមបញ្ចូលមូលហេតុ')

  const { from, to } = periodRange(params.period)
  const result = await getPool().query(
    `UPDATE attendance_kuti
     SET note = $7, updated_at = now()
     WHERE kuti_id = $1
       AND resident_id = $2
       AND attendance_type = $3
       AND attend_date BETWEEN $4::date AND $5::date
       AND status = $6`,
    [kutiId, params.residentId, params.type, from, to, params.status, note || null],
  )
  if (!result.rowCount) throw new Error('រកមិនឃើញកំណត់ត្រា')
  return buildReport({ type: params.type, period: params.period, kutiId })
}

export async function sendDailyTelegram(params: {
  type: AttendanceType
  date: string
  kutiId?: number | null
  /** Optional client snapshot — ignored when empty; DB rebuild is preferred for live lists */
  text?: string | null
}) {
  // Always rebuild from DB so excused/absent names, kuti, and clock time stay correct
  // (client snapshots can embed broken templates or stale lists).
  const text = await buildDailyText(params)
  return sendTelegramMessage(text)
}

export async function sendReportTelegram(params: {
  type: AttendanceType
  period: ReportPeriod
  kutiId?: number | null
}) {
  const report = await buildReport(params)
  const result = await sendTelegramMessage(report.text)
  return { ...result, report }
}

export async function sendReminder(params: {
  type: AttendanceType
  date?: string
  kutiId?: number | null
}) {
  const date = params.date || isoDate()
  // យកធុងសម្រាម / បិណ្ឌបាត: auto-send today's duty group daily message
  if (params.type === 'trash' || params.type === 'alms') {
    return sendDailyTelegram({ type: params.type, date, kutiId: params.kutiId })
  }
  const label = await labelForAttendanceType(params.type)
  let kutiPart = 'គ្រប់កុដិ'
  if (params.kutiId) {
    const kuti = await getPool().query<{ kuti_name: string }>(
      `SELECT kuti_name FROM kutis WHERE id = $1`,
      [params.kutiId],
    )
    kutiPart = kuti.rows[0]?.kuti_name || String(params.kutiId)
  }
  const text = `⏰ រំលឹកវត្តមាន\nប្រភេទ៖ ${label}\nថ្ងៃ៖ ${date}\nកុដិ៖ ${kutiPart}\n\nសូមចុចប៊ូតុងខាងក្រោមដើម្បីបញ្ជាក់`
  return sendTelegramMessage(text, {
    replyMarkup: {
      inline_keyboard: [
        [
          {
            text: '✅ បញ្ជាក់',
            callback_data: `confirm:${params.type}:${date}:${params.kutiId || 0}`,
          },
        ],
      ],
    },
  })
}
