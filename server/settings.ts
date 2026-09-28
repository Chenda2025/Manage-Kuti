import { getPool } from './db'
import {
  ATTENDANCE_TYPE_LABELS,
  DEFAULT_ATTENDANCE_TYPE_DEFS,
  ALMS_DAILY_TEMPLATE,
  BON_PARTY_DAILY_TEMPLATE,
  BON_PARTY_TYPE_KEY,
  DEFAULT_DAILY_TEMPLATE,
  DEFAULT_REPORT_TEMPLATE,
  KUTI_WORK_DAILY_TEMPLATE,
  SALA_CHAN_DAILY_TEMPLATE,
  SALA_CHAN_TYPE_KEY,
  STUDY_IN_KUTI_TYPE_KEY,
  STUDY_SEED_DAILY_TEMPLATE,
  TRASH_DAILY_TEMPLATE,
  WORSHIP_MEAL_DAILY_TEMPLATE,
  type AttendanceType,
  type AttendanceTypeDef,
} from './attendanceTypes'

export type TelegramSettings = {
  enabled: boolean
  bot_token: string
  chat_id: string
}

export type KutiApiSettings = {
  base_url: string
  token: string
}

export type TextFormatSettings = {
  daily: Record<string, string>
  report: Record<string, string>
}

export type ReminderItem = {
  type: AttendanceType
  time: string
  enabled: boolean
}

export type ReminderSettings = {
  timezone: string
  items: ReminderItem[]
}

export type AttendanceTypesSettings = {
  items: AttendanceTypeDef[]
}

function defaultTypeItems(): AttendanceTypeDef[] {
  return DEFAULT_ATTENDANCE_TYPE_DEFS.map((item) => ({
    key: item.key,
    label: item.label,
    enabled: item.enabled,
  }))
}

function defaultFormats(items: AttendanceTypeDef[] = defaultTypeItems()): TextFormatSettings {
  const daily: Record<string, string> = {}
  const report: Record<string, string> = {}
  for (const item of items) {
    daily[item.key] =
      item.key === 'kuti_work'
        ? KUTI_WORK_DAILY_TEMPLATE
        : item.key === 'trash'
          ? TRASH_DAILY_TEMPLATE
          : item.key === 'alms'
            ? ALMS_DAILY_TEMPLATE
            : item.key === 'worship_meal'
              ? WORSHIP_MEAL_DAILY_TEMPLATE
              : item.key === SALA_CHAN_TYPE_KEY
                ? SALA_CHAN_DAILY_TEMPLATE
                : item.key === BON_PARTY_TYPE_KEY
                  ? BON_PARTY_DAILY_TEMPLATE
                  : item.key === STUDY_IN_KUTI_TYPE_KEY
                    ? DEFAULT_DAILY_TEMPLATE
                    : item.key === 'study'
                      ? STUDY_SEED_DAILY_TEMPLATE
                      : DEFAULT_DAILY_TEMPLATE
    report[item.key] = DEFAULT_REPORT_TEMPLATE.replaceAll('{type_label}', item.label)
  }
  return { daily, report }
}

function defaultReminders(items: AttendanceTypeDef[] = defaultTypeItems()): ReminderSettings {
  return {
    timezone: 'Asia/Phnom_Penh',
    items: items.map((item) => ({
      type: item.key,
      time:
        item.key === 'study'
          ? '06:30'
          : item.key === 'trash'
            ? '16:50'
            : item.key === 'alms'
              ? '08:40'
              : '07:00',
      enabled: item.key === 'trash' || item.key === 'alms',
    })),
  }
}

export const SETTINGS_DEFAULTS = {
  telegram: {
    enabled: false,
    bot_token: '',
    chat_id: '',
  } satisfies TelegramSettings,
  kuti_api: {
    base_url: process.env.PAGODA_BASE_URL || '',
    token: process.env.PAGODA_KUTI_TOKEN || '',
  } satisfies KutiApiSettings,
  attendance_types: {
    items: defaultTypeItems(),
  } satisfies AttendanceTypesSettings,
  attendance_text_formats: defaultFormats(),
  attendance_reminders: defaultReminders(),
}

export type SettingsMap = {
  telegram: TelegramSettings
  kuti_api: KutiApiSettings
  attendance_types: AttendanceTypesSettings
  attendance_text_formats: TextFormatSettings
  attendance_reminders: ReminderSettings
}

export async function getSetting<K extends keyof SettingsMap>(key: K): Promise<SettingsMap[K]> {
  const { rows } = await getPool().query<{ value: unknown }>(
    `SELECT value FROM settings WHERE key = $1`,
    [key],
  )
  const fallback = SETTINGS_DEFAULTS[key]
  const value = rows[0]?.value
  if (!value || typeof value !== 'object') return structuredClone(fallback)
  const merged = deepMerge(structuredClone(fallback), value as Record<string, unknown>) as SettingsMap[K]
  if (key === 'kuti_api') return normalizeKutiApi(merged as KutiApiSettings) as SettingsMap[K]
  return merged
}

function normalizeKutiApi(value: KutiApiSettings & { tokens?: Record<string, string> }): KutiApiSettings {
  let token = (value.token || '').trim()
  if (!token && value.tokens && typeof value.tokens === 'object') {
    for (const item of Object.values(value.tokens)) {
      if (typeof item === 'string' && item.trim()) {
        token = item.trim()
        break
      }
    }
  }
  return {
    base_url: (value.base_url || '').trim().replace(/\/$/, ''),
    token: normalizeShareToken(token),
  }
}

/** Accept raw token, `kuti/TOKEN`, or full share URL. */
export function normalizeShareToken(raw?: string | null) {
  let value = (raw || '').trim().replace(/^['"]+|['"]+$/g, '')
  if (!value) return ''
  try {
    if (/^https?:\/\//i.test(value)) {
      const url = new URL(value)
      value = url.pathname
    }
  } catch {
    // keep as-is
  }
  value = value.replace(/^\/+/, '').replace(/\/+$/, '')
  // paths like kuti/TOKEN or api/kuti/TOKEN/monks
  const parts = value.split('/').filter(Boolean)
  const kutiIndex = parts.findIndex((part) => part.toLowerCase() === 'kuti')
  if (kutiIndex >= 0 && parts[kutiIndex + 1]) {
    return parts[kutiIndex + 1]
  }
  return parts[parts.length - 1] || value
}

export async function setSetting<K extends keyof SettingsMap>(key: K, value: SettingsMap[K]) {
  const stored =
    key === 'kuti_api'
      ? (normalizeKutiApi(value as KutiApiSettings) as SettingsMap[K])
      : value
  await getPool().query(
    `INSERT INTO settings (key, value) VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, JSON.stringify(stored)],
  )
  return stored
}

export async function ensureDefaultSettings() {
  for (const key of Object.keys(SETTINGS_DEFAULTS) as (keyof SettingsMap)[]) {
    const { rowCount } = await getPool().query(`SELECT 1 FROM settings WHERE key = $1`, [key])
    if (!rowCount) {
      await setSetting(key, SETTINGS_DEFAULTS[key])
    }
  }

  // Refresh daily message template to the ceremonial study report format
  try {
    const formats = await getSetting('attendance_text_formats')
    const types = await listAttendanceTypes({ enabledOnly: false })
    let changed = false
    for (const item of types) {
      const current = formats.daily[item.key] || ''
      if (item.key === 'kuti_work') {
        const needsKutiWork =
          !current.trim() ||
          current.includes('ម៉ោងសិក្សា') ||
          current.includes('ព្រះសង្ឃ​ទៅរៀន') ||
          !current.includes('ម៉ោងការងារ') ||
          !current.includes('{excused_list}') ||
          !current.includes('{absent_list}') ||
          current.includes('ឈ្មោះ | បន្ទប់') ||
          current.includes('ព្រឹក / ល្ងាច') ||
          current.includes('get currently time')
        if (needsKutiWork) {
          formats.daily[item.key] = KUTI_WORK_DAILY_TEMPLATE
          changed = true
        }
        continue
      }
      if (item.key === 'trash') {
        const needsTrash =
          !current.trim() ||
          current.includes('ម៉ោងសិក្សា') ||
          current.includes('ព្រះសង្ឃ​ទៅរៀន') ||
          current.includes('ម៉ោងការងារ') ||
          !current.includes('{groups_list}') ||
          !current.includes('វេនប្តូរធុងសម្រាម')
        if (needsTrash) {
          formats.daily[item.key] = TRASH_DAILY_TEMPLATE
          changed = true
        }
        continue
      }
      if (item.key === 'alms') {
        const needsAlms =
          !current.trim() ||
          current.includes('ម៉ោងសិក្សា') ||
          current.includes('ព្រះសង្ឃ​ទៅរៀន') ||
          current.includes('ម៉ោងការងារ') ||
          current.includes('វេនប្តូរធុងសម្រាម') ||
          !current.includes('{groups_list}') ||
          !current.includes('វេនបិណ្ឌបាត')
        if (needsAlms) {
          formats.daily[item.key] = ALMS_DAILY_TEMPLATE
          changed = true
        }
        continue
      }
      if (item.key === 'worship_meal') {
        const needsWorship =
          !current.trim() ||
          current.includes('ម៉ោងសិក្សា') ||
          current.includes('ព្រះសង្ឃ​ទៅរៀន') ||
          current.includes('ម៉ោងការងារ') ||
          current.includes('ថ្វាយបង្គំព្រះបិតាសង្ឃ') ||
          !current.includes('{shift}') ||
          !current.includes('{excused_list}') ||
          !current.includes('{absent_list}') ||
          !current.includes('កិច្ចវត្តថ្វាយបង្គំ')
        if (needsWorship) {
          formats.daily[item.key] = WORSHIP_MEAL_DAILY_TEMPLATE
          changed = true
        }
        continue
      }
      if (item.key === SALA_CHAN_TYPE_KEY || item.label === 'សាលាឆាន់') {
        const needsSala =
          !current.trim() ||
          current.includes('ម៉ោងសិក្សា') ||
          current.includes('ព្រះសង្ឃ​ទៅរៀន') ||
          current.includes('ម៉ោងការងារ') ||
          current.includes('ថ្វាយបង្គំព្រះបិតាសង្ឃ') ||
          !current.includes('{shift}') ||
          !current.includes('{excused_list}') ||
          !current.includes('{absent_list}') ||
          !current.includes('កិច្ចវត្តឆាន់')
        if (needsSala) {
          formats.daily[item.key] = SALA_CHAN_DAILY_TEMPLATE
          changed = true
        }
        continue
      }
      if (item.key === BON_PARTY_TYPE_KEY || item.label === 'ចាត់លោកទៅបុណ្យ') {
        const needsBonParty =
          !current.trim() ||
          current.includes('ម៉ោងសិក្សា') ||
          current.includes('ព្រះសង្ឃ​ទៅរៀន') ||
          current.includes('ម៉ោងការងារ') ||
          current.includes('ថ្វាយបង្គំព្រះបិតាសង្ឃ') ||
          current.includes('..................') ||
          !current.includes('{present_list}') ||
          !current.includes('{time}') ||
          !current.includes('លោកទៅបុណ្យ') ||
          !current.includes('{Total-Number}')
        if (needsBonParty) {
          formats.daily[item.key] = BON_PARTY_DAILY_TEMPLATE
          changed = true
        }
        continue
      }
      const isStudyInKuti =
        item.key === STUDY_IN_KUTI_TYPE_KEY || item.label === 'វត្តមានរៀនក្នុងកុដិ'
      if (isStudyInKuti) {
        const needsStudy =
          !current.trim() ||
          current.includes('ព្រះសង្ឃ​ទៅរៀន') ||
          !current.includes('ព្រះសង្ឃចេញរៀន') ||
          !current.includes('{excused_list}') ||
          !current.includes('{absent_list}') ||
          !current.includes('ម៉ោងសិក្សា')
        if (needsStudy) {
          formats.daily[item.key] = DEFAULT_DAILY_TEMPLATE
          changed = true
        }
        continue
      }
      if (item.key === 'study' || item.label === 'ទៅរៀន') {
        const needsSeedStudy =
          !current.trim() ||
          current.includes('ព្រះសង្ឃចេញរៀន') ||
          !current.includes('{excused_list}') ||
          !current.includes('{absent_list}') ||
          !current.includes('ព្រះសង្ឃ​ទៅរៀន')
        if (needsSeedStudy) {
          formats.daily[item.key] = STUDY_SEED_DAILY_TEMPLATE
          changed = true
        }
        continue
      }
      const isLegacy =
        !current.trim() ||
        current.startsWith('វត្តមាន') ||
        (current.includes('{present_list}') && !current.includes('ថ្វាយបង្គំព្រះបិតាសង្ឃ'))
      if (isLegacy) {
        formats.daily[item.key] = DEFAULT_DAILY_TEMPLATE
        changed = true
      } else if (
        current.includes('របាយការណ៍តាម') ||
        current.includes('ដាក់ច្បាប់ចំនួន( {excused_count}')
      ) {
        formats.daily[item.key] = current
          .replaceAll('របាយការណ៍តាម', 'របាយការណ៍')
          .replaceAll(
            'ដាក់ច្បាប់ចំនួន( {excused_count} អង្គ)',
            'ដាក់ច្បាប់ចំនួន( {total permission} អង្គ)',
          )
        changed = true
      }
    }
    if (changed) await setSetting('attendance_text_formats', formats)
  } catch {
    // settings table may not be ready yet
  }

  // យកធុងសម្រាម: auto Telegram at 16:50 with today's duty group
  // បិណ្ឌបាត: auto Telegram at 08:40 with today's rotating group
  try {
    const reminders = await getSetting('attendance_reminders')
    let remChanged = false
    const ensureReminder = (type: string, time: string) => {
      const item = reminders.items.find((r) => r.type === type)
      if (item) {
        if (item.time !== time || !item.enabled) {
          item.time = time
          item.enabled = true
          remChanged = true
        }
      } else {
        reminders.items.push({ type, time, enabled: true })
        remChanged = true
      }
    }
    ensureReminder('trash', '16:50')
    ensureReminder('alms', '08:40')
    if (remChanged) await setSetting('attendance_reminders', reminders)
  } catch {
    // ignore
  }
}

export async function listAttendanceTypes(options?: { enabledOnly?: boolean }) {
  const settings = await getSetting('attendance_types')
  const items = Array.isArray(settings.items) ? settings.items : defaultTypeItems()
  const cleaned = items
    .filter((item) => item && typeof item.key === 'string' && item.key.trim())
    .map((item) => ({
      key: item.key.trim(),
      label: (item.label || ATTENDANCE_TYPE_LABELS[item.key] || item.key).trim(),
      enabled: item.enabled !== false,
    }))
  if (options?.enabledOnly) return cleaned.filter((item) => item.enabled)
  return cleaned
}

export async function isValidAttendanceType(key: string) {
  if (!key) return false
  const items = await listAttendanceTypes({ enabledOnly: true })
  return items.some((item) => item.key === key)
}

export async function labelForAttendanceType(key: string) {
  const items = await listAttendanceTypes({ enabledOnly: false })
  return items.find((item) => item.key === key)?.label || ATTENDANCE_TYPE_LABELS[key] || key
}

function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>) {
  for (const [k, v] of Object.entries(patch)) {
    if (Array.isArray(v)) {
      base[k] = v
    } else if (
      v &&
      typeof v === 'object' &&
      typeof base[k] === 'object' &&
      base[k] &&
      !Array.isArray(base[k])
    ) {
      deepMerge(base[k] as Record<string, unknown>, v as Record<string, unknown>)
    } else if (v !== undefined) {
      base[k] = v
    }
  }
  return base
}
