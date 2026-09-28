import 'dotenv/config'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { Hono } from 'hono'
import { ensureSchema, getPool } from './db'
import { hashPassword, newToken, verifyPassword } from './auth'
import { readMedia, removeAvatarFiles, saveAvatar } from './uploads'
import {
  createPagodaMonk,
  ensurePagodaSynced,
  hasKutiApiToken,
  livingStatusFromLocal,
  pagodaReady,
  patchPagodaLivingStatus,
  resolveHomeKutiId,
  syncFromPagoda,
  updatePagodaMonk,
} from './pagoda'
import {
  buildDailyText,
  buildReport,
  isoDate,
  listDayAttendance,
  sendDailyTelegram,
  sendReminder,
  sendReportTelegram,
  clearDayActions,
  buildWeekSheet,
  buildMonthSheet,
  listBonPartyTripCounts,
  removeReportPerson,
  updateReportPerson,
  upsertExcuseRange,
  upsertMarks,
} from './attendance'
import { isReportPeriod, slugifyTypeKey, type AttendanceStatus, ALMS_DAILY_TEMPLATE, BON_PARTY_DAILY_TEMPLATE, BON_PARTY_TYPE_KEY, DEFAULT_DAILY_TEMPLATE, KUTI_WORK_DAILY_TEMPLATE, SALA_CHAN_DAILY_TEMPLATE, SALA_CHAN_TYPE_KEY, TRASH_DAILY_TEMPLATE, WORSHIP_MEAL_DAILY_TEMPLATE } from './attendanceTypes'
import {
  getSetting,
  isValidAttendanceType,
  listAttendanceTypes,
  setSetting,
  type SettingsMap,
} from './settings'
import { handleTelegramUpdate, sendTelegramMessage, sendTelegramPhoto, startTelegramPolling } from './telegram'

type Role = 'admin' | 'manager'

type Permission =
  | 'users.view'
  | 'users.manage'
  | 'roles.manage'
  | 'kutis.view'
  | 'kutis.manage'
  | 'residents.view'
  | 'residents.assign'
  | 'reports.view'
  | 'attendance.view'
  | 'attendance.manage'
  | 'settings.manage'

type AuthUser = {
  id: number
  username: string
  role: string
  teacher_id: number | null
  student_id: number | null
  is_active: boolean
  avatar_url: string | null
  display_name: string | null
  managed_pages?: unknown
  managed_attendance_types?: unknown
}

const MANAGER_PAGE_KEYS = ['home', 'attendance', 'kutis', 'residents'] as const

function parseManagedPages(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const allowed = new Set<string>(MANAGER_PAGE_KEYS)
  return value.filter((item): item is string => typeof item === 'string' && allowed.has(item))
}

function normalizeManagedPagesForRole(role: string, pages: unknown): string[] {
  if (normalizeRole(role) === 'admin') return []
  const list = parseManagedPages(pages)
  return list.length ? list : [...MANAGER_PAGE_KEYS]
}

function parseManagedAttendanceTypes(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ]
}

function normalizeManagedAttendanceForRole(
  role: string,
  pages: unknown,
  types: unknown,
): string[] {
  if (normalizeRole(role) === 'admin') return []
  const pageList = normalizeManagedPagesForRole(role, pages)
  if (!pageList.includes('attendance')) return []
  return parseManagedAttendanceTypes(types)
}

const ALL_PERMISSIONS: Permission[] = [
  'users.view',
  'users.manage',
  'roles.manage',
  'kutis.view',
  'kutis.manage',
  'residents.view',
  'residents.assign',
  'reports.view',
  'attendance.view',
  'attendance.manage',
  'settings.manage',
]

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: ALL_PERMISSIONS,
  manager: [
    'kutis.view',
    'kutis.manage',
    'residents.view',
    'residents.assign',
    'reports.view',
    'attendance.view',
    'attendance.manage',
  ],
}

const LEGACY_ROLE_MAP: Record<string, Role> = {
  principal: 'manager',
  kuti_head: 'manager',
  staff: 'manager',
  teacher: 'manager',
  monitor: 'manager',
  user: 'manager',
}

function normalizeRole(role: string): Role {
  if (role === 'admin' || role === 'manager') return role
  if (role in LEGACY_ROLE_MAP) return LEGACY_ROLE_MAP[role]
  return 'manager'
}

const app = new Hono({ strict: false })

app.use(
  '*',
  cors({
    origin: '*',
    allowHeaders: ['Authorization', 'Content-Type', 'Accept'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
)

app.get('/api/health', (c) => c.json({ ok: true }))

app.get('/media/*', async (c) => {
  const file = await readMedia(c.req.path)
  if (!file) return c.json({ error: 'រកមិនឃើញ' }, 404)
  return new Response(file.data, {
    status: 200,
    headers: {
      'Content-Type': file.mime,
      'Cache-Control': 'no-cache',
    },
  })
})

app.use('*', async (c, next) => {
  try {
    await ensureSchema()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/DATABASE_URL is not set/i.test(message)) {
      return c.json({ error: 'មិនទាន់កំណត់ DATABASE_URL' }, 500)
    }
    if (/ECONNREFUSED|ENOTFOUND|timeout|connection refused/i.test(message)) {
      return c.json({ error: 'ភ្ជាប់ PostgreSQL មិនបាន' }, 500)
    }
    return c.json({ error: 'មិនអាចភ្ជាប់មូលដ្ឋានទិន្នន័យបានទេ' }, 500)
  }
  await next()
})

function can(role: string, permission: Permission) {
  return ROLE_PERMISSIONS[normalizeRole(role)].includes(permission)
}

function bearer(c: { req: { header: (name: string) => string | undefined } }) {
  const header = c.req.header('authorization') || ''
  return header.replace(/^Token\s+/i, '').trim()
}

async function currentUser(c: { req: { header: (name: string) => string | undefined } }) {
  const token = bearer(c)
  if (!token) return null
  const { rows } = await getPool().query<AuthUser>(
    `SELECT u.id, u.username, u.role, u.teacher_id, u.student_id, u.is_active, u.avatar_url, u.display_name,
            u.managed_pages, u.managed_attendance_types
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = $1 AND u.is_active = true`,
    [token],
  )
  return rows[0] || null
}

async function requireUser(c: { req: { header: (name: string) => string | undefined } }, permission?: Permission) {
  const user = await currentUser(c)
  if (!user) throw new HTTPException(401, { message: 'ត្រូវការចូលគណនី' })
  if (permission && !can(user.role, permission)) {
    throw new HTTPException(403, { message: 'គ្មានសិទ្ធិ' })
  }
  return user
}

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    return c.json({ error: error.message }, error.status)
  }
  console.error(error)
  return c.json({ error: 'មានបញ្ហាម៉ាស៊ីនមេ' }, 500)
})

function mapAuth(row: AuthUser) {
  const managed_pages = normalizeManagedPagesForRole(row.role, row.managed_pages)
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    teacher_id: row.teacher_id,
    student_id: row.student_id,
    is_active: row.is_active,
    avatar_url: row.avatar_url,
    display_name: row.display_name,
    managed_pages,
    managed_attendance_types: normalizeManagedAttendanceForRole(
      row.role,
      managed_pages,
      row.managed_attendance_types,
    ),
  }
}

function mapUser(row: {
  id: number
  username: string
  role: string
  teacher_id: number | null
  student_id: number | null
  is_active: boolean
  managed_pages?: unknown
  managed_attendance_types?: unknown
  created_at?: Date
  updated_at?: Date
}) {
  const managed_pages = normalizeManagedPagesForRole(row.role, row.managed_pages)
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    teacher: row.teacher_id,
    student: row.student_id,
    is_active: row.is_active,
    managed_pages,
    managed_attendance_types: normalizeManagedAttendanceForRole(
      row.role,
      managed_pages,
      row.managed_attendance_types,
    ),
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  }
}

function mapKuti(row: {
  id: number
  pagoda_id: number
  kuti_name: string
  manager_name: string
  created_at: Date
  room_count?: string | number
  share_token?: string | null
  token_linked?: boolean
}) {
  return {
    id: row.id,
    pagoda: row.pagoda_id,
    kuti_name: row.kuti_name,
    manager_name: row.manager_name,
    created_at: row.created_at,
    room_count: Number(row.room_count || 0),
    token_linked: Boolean(row.token_linked),
  }
}

function mapRoom(row: {
  id: number
  kuti_id: number
  room_name: string
  manager_name: string
  created_at: Date
}) {
  return {
    id: row.id,
    kuti_id: row.kuti_id,
    room_name: row.room_name,
    manager_name: row.manager_name,
    created_at: row.created_at,
  }
}

function mapResident(row: {
  id: number
  student_code: string
  first_name: string
  last_name: string
  latin_name: string | null
  gender: string | null
  monk_status: string | null
  position?: string | null
  vassa_years?: number | null
  phone: string | null
  kuti_id: number | null
  room_id?: number | null
  pagoda_id: number | null
  status: string
  image_url: string | null
}) {
  return {
    id: row.id,
    student_code: row.student_code,
    first_name: row.first_name,
    last_name: row.last_name,
    latin_name: row.latin_name,
    gender: row.gender,
    monk_status: row.monk_status,
    position: row.position ?? null,
    vassa_years: row.vassa_years ?? null,
    phone: row.phone,
    kuti: row.kuti_id,
    room_id: row.room_id ?? null,
    current_pagoda: row.pagoda_id,
    status: row.status,
    image_url: row.image_url,
  }
}

app.post('/api/login', async (c) => {
  const body = await c.req.json<{ username?: string; password?: string }>().catch(() => ({}))
  const username = body.username?.trim() || ''
  const password = body.password || ''
  if (!username || !password) {
    return c.json({ error: 'សូមបញ្ចូលឈ្មោះគណនី និងលេខសម្ងាត់' }, 400)
  }
  const { rows } = await getPool().query<{
    id: number
    username: string
    password_hash: string
    role: string
    teacher_id: number | null
    student_id: number | null
    is_active: boolean
    avatar_url: string | null
    display_name: string | null
    managed_pages: unknown
    managed_attendance_types: unknown
  }>(
    `SELECT id, username, password_hash, role, teacher_id, student_id, is_active, avatar_url, display_name,
            managed_pages, managed_attendance_types
     FROM users WHERE lower(username) = lower($1)`,
    [username],
  )
  const row = rows[0]
  if (!row?.is_active || !(await verifyPassword(password, row.password_hash))) {
    return c.json({ error: 'ឈ្មោះគណនី ឬលេខសម្ងាត់មិនត្រឹមត្រូវ' }, 401)
  }
  const token = newToken()
  await getPool().query('INSERT INTO sessions (token, user_id) VALUES ($1, $2)', [token, row.id])
  return c.json({
    token,
    user: mapAuth({
      id: row.id,
      username: row.username,
      role: row.role,
      teacher_id: row.teacher_id,
      student_id: row.student_id,
      is_active: row.is_active,
      avatar_url: row.avatar_url,
      display_name: row.display_name,
      managed_pages: row.managed_pages,
      managed_attendance_types: row.managed_attendance_types,
    }),
  })
})

app.get('/api/me', async (c) => {
  const me = await requireUser(c)
  return c.json(mapAuth(me))
})

app.post('/api/me/avatar', async (c) => {
  const me = await requireUser(c)
  const form = await c.req.formData()
  const uploaded = form.get('avatar')
  const file =
    uploaded instanceof File
      ? uploaded
      : uploaded && typeof uploaded === 'object' && 'arrayBuffer' in uploaded && 'type' in uploaded
        ? (uploaded as File)
        : null
  if (!file) {
    return c.json({ error: 'សូមជ្រើសរូបភាព' }, 400)
  }
  try {
    const avatarUrl = await saveAvatar(me.id, file)
    await getPool().query(`UPDATE users SET avatar_url = $2, updated_at = now() WHERE id = $1`, [me.id, avatarUrl])
    return c.json({ ...mapAuth(me), avatar_url: avatarUrl })
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
    if (code === 'TYPE') return c.json({ error: 'ប្រភេទរូបភាពមិនត្រឹមត្រូវ (JPG, PNG, WEBP)' }, 400)
    if (code === 'SIZE') return c.json({ error: 'រូបភាពធំពេក (អតិបរមា ៣MB)' }, 400)
    throw error
  }
})

app.delete('/api/me/avatar', async (c) => {
  const me = await requireUser(c)
  await removeAvatarFiles(me.id)
  await getPool().query(`UPDATE users SET avatar_url = NULL, updated_at = now() WHERE id = $1`, [me.id])
  return c.json({ ...mapAuth(me), avatar_url: null })
})

app.patch('/api/me', async (c) => {
  const me = await requireUser(c)
  const body = await c.req.json<{ display_name?: string }>().catch(() => ({}))
  const name = body.display_name?.trim() || ''
  if (!name) return c.json({ error: 'សូមបញ្ចូលឈ្មោះ' }, 400)
  if (name.length > 80) return c.json({ error: 'ឈ្មោះវែងពេក' }, 400)
  await getPool().query(`UPDATE users SET display_name = $2, updated_at = now() WHERE id = $1`, [me.id, name])
  return c.json({ ...mapAuth(me), display_name: name })
})

app.post('/api/me/password', async (c) => {
  const me = await requireUser(c)
  const body = await c.req.json<{ current_password?: string; new_password?: string }>().catch(() => ({}))
  const current = body.current_password || ''
  const next = body.new_password || ''
  if (!current || !next) return c.json({ error: 'សូមបញ្ចូលលេខសម្ងាត់បច្ចុប្បន្ន និងលេខសម្ងាត់ថ្មី' }, 400)
  if (next.length < 6) return c.json({ error: 'លេខសម្ងាត់ថ្មីត្រូវមានយ៉ាងតិច ៦ តួ' }, 400)
  const { rows } = await getPool().query<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = $1`,
    [me.id],
  )
  const hash = rows[0]?.password_hash
  if (!hash || !(await verifyPassword(current, hash))) {
    return c.json({ error: 'លេខសម្ងាត់បច្ចុប្បន្នមិនត្រឹមត្រូវ' }, 400)
  }
  await getPool().query(`UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, [
    me.id,
    await hashPassword(next),
  ])
  return c.json({ ok: true })
})

app.get('/api/leaders', async (c) => {
  const { rows } = await getPool().query<{ value: unknown }>(
    `SELECT value FROM settings WHERE key = 'leaders'`,
  )
  return c.json(rows[0]?.value || [])
})

app.get('/api/core/pagodas', async (c) => {
  await requireUser(c, 'kutis.view')
  await ensurePagodaSynced().catch((error) => console.warn('pagoda sync skipped', error))
  const { rows } = await getPool().query('SELECT id, name, abbot_name, phone FROM pagodas ORDER BY id')
  return c.json(rows)
})

app.post('/api/core/sync-pagoda', async (c) => {
  await requireUser(c, 'kutis.manage')
  if (!(await pagodaReady())) {
    return c.json({ error: 'មិនទាន់កំណត់ Pagoda Base URL (Settings ឬ .env)' }, 400)
  }
  try {
    const result = await syncFromPagoda(true)
    return c.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'មិនអាចធ្វើសមកាលកម្មបានទេ'
    return c.json({ error: message }, 502)
  }
})

app.get('/api/core/kutis', async (c) => {
  await requireUser(c, 'kutis.view')
  if (!(await hasKutiApiToken())) return c.json([])
  await ensurePagodaSynced().catch((error) => console.warn('pagoda sync skipped', error))
  const homeId = await resolveHomeKutiId()
  if (!homeId) return c.json([])
  const { rows } = await getPool().query(
    `SELECT k.id, k.pagoda_id, k.kuti_name, k.manager_name, k.created_at, k.share_token,
            COUNT(r.id)::text AS room_count
     FROM kutis k
     LEFT JOIN rooms r ON r.kuti_id = k.id
     WHERE k.id = $1
     GROUP BY k.id
     ORDER BY k.id`,
    [homeId],
  )
  return c.json(rows.map((row) => mapKuti({ ...row, token_linked: true })))
})

app.post('/api/core/kutis', async (c) => {
  await requireUser(c, 'kutis.manage')
  const body = await c.req.json<{ kuti_name?: string; manager_name?: string; pagoda?: number }>()
  const name = body.kuti_name?.trim()
  if (!name) return c.json({ error: 'សូមបញ្ចូលឈ្មោះកុដិ' }, 400)
  let pagodaId = Number(body.pagoda)
  if (!pagodaId) {
    const first = await getPool().query<{ id: number }>('SELECT id FROM pagodas ORDER BY id LIMIT 1')
    pagodaId = first.rows[0]?.id
  }
  if (!pagodaId) return c.json({ error: 'មិនមានវត្ត' }, 400)
  const { rows } = await getPool().query(
    `INSERT INTO kutis (pagoda_id, kuti_name, manager_name)
     VALUES ($1, $2, $3)
     RETURNING id, pagoda_id, kuti_name, manager_name, created_at`,
    [pagodaId, name, body.manager_name?.trim() || ''],
  )
  return c.json(mapKuti({ ...rows[0], room_count: 0 }), 201)
})

app.patch('/api/core/kutis/:id', async (c) => {
  await requireUser(c, 'kutis.manage')
  const id = Number(c.req.param('id'))
  const body = await c.req.json<{ kuti_name?: string; manager_name?: string; pagoda?: number }>()
  const { rows } = await getPool().query(
    `UPDATE kutis SET
       kuti_name = COALESCE($2, kuti_name),
       manager_name = COALESCE($3, manager_name),
       pagoda_id = COALESCE($4, pagoda_id)
     WHERE id = $1
     RETURNING id, pagoda_id, kuti_name, manager_name, created_at`,
    [id, body.kuti_name?.trim() || null, body.manager_name?.trim() ?? null, body.pagoda || null],
  )
  if (!rows[0]) return c.json({ error: 'រកមិនឃើញកុដិ' }, 404)
  const count = await getPool().query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM rooms WHERE kuti_id = $1`,
    [id],
  )
  return c.json(mapKuti({ ...rows[0], room_count: count.rows[0]?.n || 0 }))
})

app.delete('/api/core/kutis/:id', async (c) => {
  await requireUser(c, 'kutis.manage')
  const id = Number(c.req.param('id'))
  await getPool().query('DELETE FROM kutis WHERE id = $1', [id])
  return c.body(null, 204)
})

app.get('/api/core/kutis/:id/rooms', async (c) => {
  await requireUser(c, 'kutis.view')
  if (!(await hasKutiApiToken())) return c.json([])
  const kutiId = Number(c.req.param('id'))
  const homeId = await resolveHomeKutiId()
  if (!homeId || kutiId !== homeId) return c.json([])
  const { rows } = await getPool().query(
    `SELECT id, kuti_id, room_name, manager_name, created_at
     FROM rooms WHERE kuti_id = $1 ORDER BY id`,
    [kutiId],
  )
  return c.json(rows.map(mapRoom))
})

app.post('/api/core/kutis/:id/rooms', async (c) => {
  await requireUser(c, 'kutis.manage')
  const kutiId = Number(c.req.param('id'))
  const exists = await getPool().query<{ id: number; share_token: string | null }>(
    `SELECT id, share_token FROM kutis WHERE id = $1`,
    [kutiId],
  )
  if (!exists.rows[0]) return c.json({ error: 'រកមិនឃើញកុដិ' }, 404)
  const api = await getSetting('kuti_api')
  if (!(api.token || '').trim() || !exists.rows[0].share_token) {
    return c.json({ error: 'សូមបញ្ចូល Token កុដិជាមុនសិន' }, 400)
  }
  const body = await c.req.json<{ room_name?: string; manager_name?: string }>()
  const name = body.room_name?.trim()
  if (!name) return c.json({ error: 'សូមបញ្ចូលឈ្មោះបន្ទប់' }, 400)
  const { rows } = await getPool().query(
    `INSERT INTO rooms (kuti_id, room_name, manager_name)
     VALUES ($1, $2, $3)
     RETURNING id, kuti_id, room_name, manager_name, created_at`,
    [kutiId, name, body.manager_name?.trim() || ''],
  )
  return c.json(mapRoom(rows[0]), 201)
})

app.patch('/api/core/rooms/:id', async (c) => {
  await requireUser(c, 'kutis.manage')
  const id = Number(c.req.param('id'))
  const body = await c.req.json<{ room_name?: string; manager_name?: string }>()
  const { rows } = await getPool().query(
    `UPDATE rooms SET
       room_name = COALESCE($2, room_name),
       manager_name = COALESCE($3, manager_name)
     WHERE id = $1
     RETURNING id, kuti_id, room_name, manager_name, created_at`,
    [id, body.room_name?.trim() || null, body.manager_name?.trim() ?? null],
  )
  if (!rows[0]) return c.json({ error: 'រកមិនឃើញបន្ទប់' }, 404)
  return c.json(mapRoom(rows[0]))
})

app.delete('/api/core/rooms/:id', async (c) => {
  await requireUser(c, 'kutis.manage')
  const id = Number(c.req.param('id'))
  await getPool().query('DELETE FROM rooms WHERE id = $1', [id])
  return c.body(null, 204)
})

app.get('/api/students/list', async (c) => {
  await requireUser(c, 'residents.view')
  if (!(await hasKutiApiToken())) return c.json([])
  await ensurePagodaSynced().catch((error) => console.warn('pagoda sync skipped', error))
  const homeId = await resolveHomeKutiId()
  if (!homeId) return c.json([])
  // Keep list scoped to home kuti only (do not auto-attach unrelated orphans)
  const { rows } = await getPool().query(
    `SELECT id, student_code, first_name, last_name, latin_name, gender, monk_status,
            position, vassa_years, phone, kuti_id, room_id, pagoda_id, status, image_url
     FROM residents
     WHERE kuti_id = $1
     ORDER BY
       CASE
         WHEN position ILIKE '%ចៅធិការ%' THEN 0
         WHEN position ILIKE '%សូត្រឆ្វេង%' THEN 1
         WHEN position ILIKE '%សូត្រស្តាំ%' THEN 2
         WHEN position ILIKE '%វិន័យធរ%' THEN 3
         WHEN position ILIKE '%លេខា%' THEN 4
         WHEN position ILIKE '%មន្ត្រីសង្ឃ%' THEN 5
         WHEN position ILIKE '%មេកុដិ%' THEN 6
         WHEN position ILIKE '%អនុកុដិ%' THEN 7
         ELSE 8
       END,
       COALESCE(vassa_years, 0) DESC,
       last_name,
       first_name`,
    [homeId],
  )
  return c.json(rows.map(mapResident))
})

app.post('/api/students/list', async (c) => {
  await requireUser(c, 'residents.assign')
  if (!(await hasKutiApiToken())) {
    return c.json({ error: 'សូមបញ្ចូល Token កុដិជាមុនសិន' }, 400)
  }
  const homeId = await resolveHomeKutiId()
  if (!homeId) return c.json({ error: 'មិនទាន់មានកុដិ' }, 400)

  const body = await c.req.json<{
    first_name?: string
    last_name?: string
    latin_name?: string
    gender?: string
    monk_status?: string
    phone?: string
    kuti?: number | null
  }>()
  const first = body.first_name?.trim()
  const last = body.last_name?.trim()
  if (!first || !last) return c.json({ error: 'សូមបញ្ចូលឈ្មោះ' }, 400)

  let externalId: number | null = null
  const targetKutiId = body.kuti || homeId
  const kuti = await getPool().query<{
    share_token: string | null
    external_key: string | null
  }>(`SELECT share_token, external_key FROM kutis WHERE id = $1`, [targetKutiId])
  const shareToken = kuti.rows[0]?.share_token
  const home = kuti.rows[0]?.external_key
  if (shareToken && home) {
    try {
      const created = await createPagodaMonk(shareToken, {
        fullname: `${last} ${first}`.trim(),
        type: body.monk_status || 'សាមណេរ',
        home,
        position: 'សមណសិស្ស',
        education_level: '',
        academic_level: '',
        living_status: 'កំពុងស្នាក់នៅ',
      })
      if (created && typeof created === 'object' && 'id' in created && created.id) {
        externalId = Number(created.id)
      } else {
        await syncFromPagoda(true).catch(() => null)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'មិនអាចរក្សាទុកលើវត្តបានទេ'
      return c.json({ error: message }, 502)
    }
  }

  const latest = await getPool().query<{ student_code: string }>(
    `SELECT student_code FROM residents ORDER BY id DESC LIMIT 1`,
  )
  let next = 1
  const lastCode = latest.rows[0]?.student_code?.replace(/^(STU|PGD)/, '')
  if (lastCode && /^\d+$/.test(lastCode)) next = Number(lastCode) + 1
  const code = externalId ? `PGD${externalId}` : `STU${String(next).padStart(6, '0')}`
  const pagoda = await getPool().query<{ id: number }>('SELECT id FROM pagodas ORDER BY id LIMIT 1')

  if (externalId) {
    const existing = await getPool().query(
      `SELECT id FROM residents WHERE external_id = $1`,
      [externalId],
    )
    if (existing.rows[0]) {
      await syncFromPagoda(true).catch(() => null)
      const { rows } = await getPool().query(
        `SELECT id, student_code, first_name, last_name, latin_name, gender, monk_status,
                phone, kuti_id, room_id, pagoda_id, status, image_url
         FROM residents WHERE external_id = $1`,
        [externalId],
      )
      return c.json(mapResident(rows[0]), 201)
    }
  }

  const { rows } = await getPool().query(
    `INSERT INTO residents
      (student_code, first_name, last_name, latin_name, gender, monk_status, phone, kuti_id, pagoda_id, status, external_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',$10)
     RETURNING id, student_code, first_name, last_name, latin_name, gender, monk_status,
               phone, kuti_id, room_id, pagoda_id, status, image_url`,
    [
      code,
      first,
      last,
      body.latin_name?.trim() || null,
      body.gender || 'ប្រុស',
      body.monk_status || 'ភិក្ខុ',
      body.phone?.trim() || null,
      targetKutiId,
      pagoda.rows[0]?.id || null,
      externalId,
    ],
  )
  return c.json(mapResident(rows[0]), 201)
})

app.patch('/api/students/list/:id', async (c) => {
  await requireUser(c, 'residents.assign')
  const id = Number(c.req.param('id'))
  const body = await c.req.json<{ kuti?: number | null; room_id?: number | null }>()

  const current = await getPool().query<{
    id: number
    first_name: string
    last_name: string
    monk_status: string | null
    status: string
    external_id: number | null
    kuti_id: number | null
    room_id: number | null
    vassa_years: number | null
    position: string | null
  }>(
    `SELECT id, first_name, last_name, monk_status, status, external_id, kuti_id, room_id,
            vassa_years, position
     FROM residents WHERE id = $1`,
    [id],
  )
  const resident = current.rows[0]
  if (!resident) return c.json({ error: 'រកមិនឃើញ' }, 404)

  const nextKutiId = body.kuti !== undefined ? body.kuti : resident.kuti_id
  let nextRoomId = body.room_id !== undefined ? body.room_id : resident.room_id

  if (nextKutiId === null) {
    nextRoomId = null
  } else if (nextRoomId) {
    const room = await getPool().query<{ kuti_id: number }>(
      `SELECT kuti_id FROM rooms WHERE id = $1`,
      [nextRoomId],
    )
    if (!room.rows[0] || room.rows[0].kuti_id !== nextKutiId) {
      return c.json({ error: 'បន្ទប់មិនស្ថិតក្នុងកុដិនេះ' }, 400)
    }
  }

  /** Rooms are local-only; sync Pagoda only when kuti membership actually changes. */
  const kutiChanged = nextKutiId !== resident.kuti_id
  if (resident.external_id && kutiChanged) {
    const source = resident.kuti_id
      ? await getPool().query<{ share_token: string | null; external_key: string | null }>(
          `SELECT share_token, external_key FROM kutis WHERE id = $1`,
          [resident.kuti_id],
        )
      : { rows: [] as { share_token: string | null; external_key: string | null }[] }
    const target = nextKutiId
      ? await getPool().query<{ share_token: string | null; external_key: string | null }>(
          `SELECT share_token, external_key FROM kutis WHERE id = $1`,
          [nextKutiId],
        )
      : { rows: [] as { share_token: string | null; external_key: string | null }[] }

    const sourceToken = source.rows[0]?.share_token
    const targetToken = target.rows[0]?.share_token
    const targetHome = target.rows[0]?.external_key

    try {
      if (nextKutiId === null && sourceToken) {
        await patchPagodaLivingStatus(sourceToken, resident.external_id, 'ឈប់ស្នាក់នៅ')
      } else if (nextKutiId !== null && targetToken && targetHome) {
        const token = targetToken || sourceToken
        if (token) {
          const vassa =
            resident.vassa_years != null && Number.isFinite(Number(resident.vassa_years))
              ? Number(resident.vassa_years)
              : 0
          await updatePagodaMonk(token, resident.external_id, {
            fullname: `${resident.last_name} ${resident.first_name}`.trim(),
            type: resident.monk_status || 'សាមណេរ',
            home: targetHome,
            living_status: livingStatusFromLocal(resident.status),
            vassa_years: vassa,
            position: resident.position || undefined,
          })
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'មិនអាចធ្វើបច្ចុប្បន្នភាពលើវត្តបានទេ'
      return c.json({ error: message }, 502)
    }
  }

  const { rows } = await getPool().query(
    `UPDATE residents SET
       kuti_id = $2,
       room_id = $3,
       status = CASE WHEN $2::int IS NULL THEN 'inactive' ELSE status END
     WHERE id = $1
     RETURNING id, student_code, first_name, last_name, latin_name, gender, monk_status,
               phone, kuti_id, room_id, pagoda_id, status, image_url`,
    [id, nextKutiId, nextRoomId],
  )
  return c.json(mapResident(rows[0]))
})

app.get('/api/users/users', async (c) => {
  await requireUser(c, 'users.view')
  const { rows } = await getPool().query(
    `SELECT id, username, role, teacher_id, student_id, is_active, managed_pages, managed_attendance_types,
            created_at, updated_at
     FROM users ORDER BY id`,
  )
  return c.json(rows.map(mapUser))
})

app.post('/api/users/users', async (c) => {
  await requireUser(c, 'users.manage')
  const body = await c.req.json<{
    username?: string
    password?: string
    role?: string
    related_id?: number | null
    is_active?: boolean
    managed_pages?: string[]
    managed_attendance_types?: string[]
  }>()
  const username = body.username?.trim()
  if (!username || !body.password) return c.json({ error: 'សូមបញ្ចូលឈ្មោះគណនី និងលេខសម្ងាត់' }, 400)
  const role = normalizeRole(body.role || 'manager')
  const managedPages = normalizeManagedPagesForRole(role, body.managed_pages)
  const managedAttendance = normalizeManagedAttendanceForRole(
    role,
    managedPages,
    body.managed_attendance_types,
  )
  try {
    const { rows } = await getPool().query(
      `INSERT INTO users (username, password_hash, role, teacher_id, student_id, is_active, managed_pages, managed_attendance_types)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)
       RETURNING id, username, role, teacher_id, student_id, is_active, managed_pages, managed_attendance_types,
                 created_at, updated_at`,
      [
        username,
        await hashPassword(body.password),
        role,
        null,
        null,
        body.is_active !== false,
        JSON.stringify(role === 'admin' ? [] : managedPages),
        JSON.stringify(role === 'admin' ? [] : managedAttendance),
      ],
    )
    return c.json(mapUser(rows[0]), 201)
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
    if (code === '23505') return c.json({ error: 'ឈ្មោះគណនីនេះមានរួចហើយ' }, 400)
    throw error
  }
})

app.put('/api/users/users/:id', async (c) => {
  await requireUser(c, 'users.manage')
  const id = Number(c.req.param('id'))
  const body = await c.req.json<{
    password?: string
    role?: string
    related_id?: number | null
    is_active?: boolean
    managed_pages?: string[]
    managed_attendance_types?: string[]
  }>()
  const current = await getPool().query(`SELECT * FROM users WHERE id = $1`, [id])
  const row = current.rows[0]
  if (!row) return c.json({ error: 'រកមិនឃើញគណនី' }, 404)
  const role = normalizeRole(body.role || row.role)
  const managedPages = normalizeManagedPagesForRole(
    role,
    body.managed_pages !== undefined ? body.managed_pages : row.managed_pages,
  )
  const managedAttendance = normalizeManagedAttendanceForRole(
    role,
    managedPages,
    body.managed_attendance_types !== undefined
      ? body.managed_attendance_types
      : row.managed_attendance_types,
  )
  const passwordHash = body.password ? await hashPassword(body.password) : row.password_hash
  const { rows } = await getPool().query(
    `UPDATE users SET
       password_hash = $2,
       role = $3,
       teacher_id = NULL,
       student_id = NULL,
       is_active = COALESCE($4, is_active),
       managed_pages = $5::jsonb,
       managed_attendance_types = $6::jsonb,
       updated_at = now()
     WHERE id = $1
     RETURNING id, username, role, teacher_id, student_id, is_active, managed_pages, managed_attendance_types,
               created_at, updated_at`,
    [
      id,
      passwordHash,
      role,
      body.is_active,
      JSON.stringify(role === 'admin' ? [] : managedPages),
      JSON.stringify(role === 'admin' ? [] : managedAttendance),
    ],
  )
  return c.json(mapUser(rows[0]))
})

app.delete('/api/users/users/:id', async (c) => {
  const me = await requireUser(c, 'users.manage')
  if (!me) return
  const id = Number(c.req.param('id'))
  if (id === me.id) return c.json({ error: 'មិនអាចលុបគណនីខ្លួនឯងបានទេ' }, 400)
  await getPool().query('DELETE FROM users WHERE id = $1', [id])
  return c.body(null, 204)
})

app.get('/api/users/teachers', async (c) => {
  await requireUser(c, 'users.view')
  const { rows } = await getPool().query(
    `SELECT id, username AS first_name, '' AS last_name, NULL AS phone, 'active' AS status
     FROM users WHERE role = 'teacher' ORDER BY id`,
  )
  return c.json(rows)
})

app.get('/api/settings', async (c) => {
  await requireUser(c, 'settings.manage')
  const [telegram, kuti_api, attendance_types, attendance_text_formats, attendance_reminders] =
    await Promise.all([
      getSetting('telegram'),
      getSetting('kuti_api'),
      getSetting('attendance_types'),
      getSetting('attendance_text_formats'),
      getSetting('attendance_reminders'),
    ])
  return c.json({
    telegram,
    kuti_api,
    attendance_types,
    attendance_text_formats,
    attendance_reminders,
  })
})

app.put('/api/settings/:key', async (c) => {
  await requireUser(c, 'settings.manage')
  const key = c.req.param('key') as keyof SettingsMap
  const allowed: (keyof SettingsMap)[] = [
    'telegram',
    'kuti_api',
    'attendance_types',
    'attendance_text_formats',
    'attendance_reminders',
  ]
  if (!allowed.includes(key)) return c.json({ error: 'គន្លឹះមិនត្រឹមត្រូវ' }, 400)
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ error: 'ទិន្នន័យមិនត្រឹមត្រូវ' }, 400)

  if (key === 'attendance_types') {
    const rawItems = Array.isArray((body as { items?: unknown }).items)
      ? (body as { items: unknown[] }).items
      : Array.isArray(body)
        ? body
        : null
    if (!rawItems) return c.json({ error: 'សូមផ្ញើបញ្ជីប្រភេទវត្តមាន' }, 400)
    const items = rawItems
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const row = item as { key?: string; label?: string; enabled?: boolean }
        const label = String(row.label || '').trim()
        if (!label) return null
        const keyValue = String(row.key || slugifyTypeKey(label)).trim()
        if (!keyValue) return null
        return { key: keyValue, label, enabled: row.enabled !== false }
      })
      .filter(Boolean) as Array<{ key: string; label: string; enabled: boolean }>

    const keys = new Set<string>()
    for (const item of items) {
      if (keys.has(item.key)) return c.json({ error: `សោស្ទួន៖ ${item.key}` }, 400)
      keys.add(item.key)
    }

    const next = { items }
    await setSetting('attendance_types', next)

    const formats = await getSetting('attendance_text_formats')
    const reminders = await getSetting('attendance_reminders')
    for (const item of items) {
      if (!formats.daily[item.key]) {
        formats.daily[item.key] =
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
                      : DEFAULT_DAILY_TEMPLATE
      }
      if (!formats.report[item.key]) {
        formats.report[item.key] =
          `របាយការណ៍${item.label}\nរយៈពេល៖ {period}\nពី {from} ដល់ {to}\nកុដិ៖ {kuti}\n\nសរុប៖ {total}\nមក៖ {present_count} | អវត្តមាន៖ {absent_count}\nអត្រា៖ {rate}%`
      }
      if (!reminders.items.some((r) => r.type === item.key)) {
        reminders.items.push({
          type: item.key,
          time:
            item.key === 'trash'
              ? '16:50'
              : item.key === 'alms'
                ? '08:40'
                : item.key === 'study'
                  ? '06:30'
                  : '07:00',
          enabled: item.key === 'trash' || item.key === 'alms',
        })
      }
    }
    reminders.items = reminders.items.filter((r) => items.some((t) => t.key === r.type))
    await setSetting('attendance_text_formats', formats)
    await setSetting('attendance_reminders', reminders)
    return c.json(next)
  }

  const current = await getSetting(key)
  const next = { ...current, ...body } as SettingsMap[typeof key]
  await setSetting(key, next)

  if (key === 'kuti_api') {
    const api = next as SettingsMap['kuti_api']
    const shareToken = (api.token || '').trim()
    if (shareToken) {
      // Clear old links, then sync creates/updates the correct kuti for this token
      await getPool().query(`UPDATE kutis SET share_token = NULL WHERE share_token IS NOT NULL`)
      try {
        await syncFromPagoda(true)
      } catch (error) {
        console.warn('kuti token sync failed', error)
        return c.json(
          { error: error instanceof Error ? error.message : 'សមកាលកម្មពី Token មិនបាន' },
          502,
        )
      }
    }
  }

  return c.json(next)
})

app.post('/api/settings/telegram/test', async (c) => {
  await requireUser(c, 'settings.manage')
  const result = await sendTelegramMessage('✅ សារសាកល្បងពីប្រព័ន្ធគ្រប់គ្រងកុដិ')
  if (!result.ok) return c.json({ error: result.error || 'ផ្ញើមិនបាន' }, 502)
  return c.json({ ok: true, message_id: result.message_id })
})

app.get('/api/attendance/types', async (c) => {
  await requireUser(c, 'attendance.view')
  const all = c.req.query('all') === '1'
  const items = await listAttendanceTypes({ enabledOnly: !all })
  return c.json(items)
})

app.get('/api/attendance/groups', async (c) => {
  await requireUser(c, 'attendance.view')
  const type = c.req.query('type') || ''
  if (!(await isValidAttendanceType(type))) return c.json({ error: 'ប្រភេទវត្តមានមិនត្រឹមត្រូវ' }, 400)
  const { listAttendanceGroups } = await import('./attendanceGroups')
  const groups = await listAttendanceGroups(type)
  return c.json({ type, groups })
})

app.post('/api/attendance/groups', async (c) => {
  await requireUser(c, 'attendance.manage')
  const body = await c.req.json<{ type?: string; name?: string | null }>()
  const type = body.type || ''
  try {
    const { createAttendanceGroup } = await import('./attendanceGroups')
    const group = await createAttendanceGroup({ type, name: body.name })
    return c.json({ ok: true, group })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'មិនអាចបង្កើតក្រុមបានទេ' }, 400)
  }
})

app.patch('/api/attendance/groups/:id', async (c) => {
  await requireUser(c, 'attendance.manage')
  const id = Number(c.req.param('id'))
  const body = await c.req.json<{ name?: string }>()
  if (!Number.isFinite(id)) return c.json({ error: 'ក្រុមមិនត្រឹមត្រូវ' }, 400)
  try {
    const { renameAttendanceGroup } = await import('./attendanceGroups')
    await renameAttendanceGroup({ id, name: body.name || '' })
    return c.json({ ok: true })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'មិនអាចកែឈ្មោះបានទេ' }, 400)
  }
})

app.delete('/api/attendance/groups/:id', async (c) => {
  await requireUser(c, 'attendance.manage')
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.json({ error: 'ក្រុមមិនត្រឹមត្រូវ' }, 400)
  try {
    const { deleteAttendanceGroup } = await import('./attendanceGroups')
    await deleteAttendanceGroup(id)
    return c.json({ ok: true })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'មិនអាចលុបក្រុមបានទេ' }, 400)
  }
})

app.put('/api/attendance/groups/:id/members', async (c) => {
  await requireUser(c, 'attendance.manage')
  const id = Number(c.req.param('id'))
  const body = await c.req.json<{ type?: string; resident_ids?: number[] }>()
  const type = body.type || ''
  if (!Number.isFinite(id)) return c.json({ error: 'ក្រុមមិនត្រឹមត្រូវ' }, 400)
  if (!Array.isArray(body.resident_ids)) return c.json({ error: 'សូមផ្ញើបញ្ជីព្រះសង្ឃ' }, 400)
  try {
    const { setGroupMembers } = await import('./attendanceGroups')
    const groups = await setGroupMembers({
      type,
      groupId: id,
      residentIds: body.resident_ids,
    })
    return c.json({ ok: true, type, groups })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'មិនអាចចាត់ក្រុមបានទេ' }, 400)
  }
})

app.get('/api/attendance/day', async (c) => {
  await requireUser(c, 'attendance.view')
  const type = c.req.query('type') || ''
  const date = c.req.query('date') || isoDate()
  const kutiRaw = c.req.query('kuti_id')
  const kutiId = kutiRaw ? Number(kutiRaw) : null
  if (!(await isValidAttendanceType(type))) return c.json({ error: 'ប្រភេទវត្តមានមិនត្រឹមត្រូវ' }, 400)
  const rows = await listDayAttendance({ type, date, kutiId })
  return c.json({ type, date, kuti_id: kutiId, rows })
})

/** ចាត់លោកទៅបុណ្យ: month trip counts per monk + who has the least. */
app.get('/api/attendance/party-counts', async (c) => {
  await requireUser(c, 'attendance.view')
  const type = c.req.query('type') || BON_PARTY_TYPE_KEY
  const date = c.req.query('date') || isoDate()
  const kutiRaw = c.req.query('kuti_id')
  const kutiId = kutiRaw ? Number(kutiRaw) : null
  if (!(await isValidAttendanceType(type))) return c.json({ error: 'ប្រភេទវត្តមានមិនត្រឹមត្រូវ' }, 400)
  if (type !== BON_PARTY_TYPE_KEY) {
    return c.json({ error: 'ប្រភេទនេះមិនប្រើចំនួនទៅបុណ្យទេ' }, 400)
  }
  const data = await listBonPartyTripCounts({ type, date, kutiId })
  return c.json(data)
})

app.put('/api/attendance/day', async (c) => {
  const me = await requireUser(c, 'attendance.manage')
  const body = await c.req.json<{
    type?: string
    date?: string
    kuti_id?: number | null
    marks?: Array<{
      resident_id: number
      status: AttendanceStatus
      note?: string
      kuti_id?: number
      excuse_period?: 'morning' | 'afternoon' | 'day' | null
    }>
  }>()
  const type = body.type || ''
  const date = body.date || isoDate()
  const kutiId = body.kuti_id ? Number(body.kuti_id) : null
  if (!(await isValidAttendanceType(type))) return c.json({ error: 'ប្រភេទវត្តមានមិនត្រឹមត្រូវ' }, 400)
  if (!Array.isArray(body.marks)) return c.json({ error: 'សូមផ្ញើបញ្ជីវត្តមាន' }, 400)
  const rows = await upsertMarks({
    type,
    date,
    kutiId,
    markedBy: me.id,
    marks: body.marks.filter(
      (m) => m.status === 'present' || m.status === 'absent' || m.status === 'excused',
    ),
  })
  return c.json({ type, date, kuti_id: kutiId, rows })
})

app.post('/api/attendance/clear-day-actions', async (c) => {
  await requireUser(c, 'attendance.manage')
  const body = await c.req.json<{ type?: string; date?: string; kuti_id?: number | null }>()
  const type = body.type || ''
  const date = body.date || isoDate()
  const kutiId = body.kuti_id ? Number(body.kuti_id) : null
  if (!(await isValidAttendanceType(type))) return c.json({ error: 'ប្រភេទវត្តមានមិនត្រឹមត្រូវ' }, 400)
  try {
    const rows = await clearDayActions({ type, date, kutiId })
    return c.json({ type, date, kuti_id: kutiId, rows })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'មិនអាចសម្អាតបានទេ' }, 400)
  }
})

app.post('/api/attendance/excuse-range', async (c) => {
  const me = await requireUser(c, 'attendance.manage')
  const body = await c.req.json<{
    type?: string
    from?: string
    to?: string
    resident_id?: number
    kuti_id?: number | null
    excuse_period?: 'morning' | 'afternoon' | 'day'
    note?: string | null
  }>()
  const type = body.type || ''
  const from = (body.from || '').trim()
  const to = (body.to || body.from || '').trim()
  const residentId = Number(body.resident_id)
  const period = body.excuse_period
  if (!(await isValidAttendanceType(type))) return c.json({ error: 'ប្រភេទវត្តមានមិនត្រឹមត្រូវ' }, 400)
  if (!from || !to) return c.json({ error: 'សូមជ្រើសកាលបរិច្ឆេទ' }, 400)
  if (!Number.isFinite(residentId)) return c.json({ error: 'ព្រះសង្ឃមិនត្រឹមត្រូវ' }, 400)
  if (period !== 'morning' && period !== 'afternoon' && period !== 'day') {
    return c.json({ error: 'រយៈពេលសូមច្បាប់មិនត្រឹមត្រូវ' }, 400)
  }
  try {
    const result = await upsertExcuseRange({
      type,
      from,
      to,
      residentId,
      kutiId: body.kuti_id ? Number(body.kuti_id) : null,
      markedBy: me.id,
      excuse_period: period,
      note: body.note || null,
    })
    return c.json({ ok: true, ...result })
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'មិនអាចរក្សាទុកសូមច្បាប់បានទេ' },
      400,
    )
  }
})

app.get('/api/attendance/preview', async (c) => {
  await requireUser(c, 'attendance.view')
  const type = c.req.query('type') || ''
  const date = c.req.query('date') || isoDate()
  const kutiRaw = c.req.query('kuti_id')
  const kutiId = kutiRaw ? Number(kutiRaw) : null
  if (!(await isValidAttendanceType(type))) return c.json({ error: 'ប្រភេទវត្តមានមិនត្រឹមត្រូវ' }, 400)
  const text = await buildDailyText({ type, date, kutiId })
  return c.json({ text })
})

app.post('/api/attendance/send-telegram', async (c) => {
  await requireUser(c, 'attendance.manage')
  const body = await c.req.json<{
    type?: string
    date?: string
    kuti_id?: number | null
    text?: string
  }>()
  const type = body.type || ''
  const date = body.date || isoDate()
  const kutiId = body.kuti_id ? Number(body.kuti_id) : null
  if (!(await isValidAttendanceType(type))) return c.json({ error: 'ប្រភេទវត្តមានមិនត្រឹមត្រូវ' }, 400)
  const result = await sendDailyTelegram({
    type,
    date,
    kutiId,
    text: typeof body.text === 'string' ? body.text : null,
  })
  if (!result.ok) return c.json({ error: result.error || 'ផ្ញើមិនបាន' }, 502)
  return c.json({ ok: true, message_id: result.message_id })
})

app.get('/api/attendance/report', async (c) => {
  await requireUser(c, 'attendance.view')
  const type = c.req.query('type') || ''
  const period = c.req.query('period') || 'week'
  const kutiRaw = c.req.query('kuti_id')
  const kutiId = kutiRaw ? Number(kutiRaw) : null
  if (!(await isValidAttendanceType(type))) return c.json({ error: 'ប្រភេទវត្តមានមិនត្រឹមត្រូវ' }, 400)
  if (!isReportPeriod(period)) return c.json({ error: 'រយៈពេលមិនត្រឹមត្រូវ' }, 400)
  const report = await buildReport({ type, period, kutiId })
  return c.json(report)
})

app.get('/api/attendance/report/week-sheet', async (c) => {
  await requireUser(c, 'attendance.view')
  const type = c.req.query('type') || ''
  const date = c.req.query('date') || isoDate()
  const kutiRaw = c.req.query('kuti_id')
  const kutiId = kutiRaw ? Number(kutiRaw) : null
  if (!(await isValidAttendanceType(type))) return c.json({ error: 'ប្រភេទវត្តមានមិនត្រឹមត្រូវ' }, 400)
  const sheet = await buildWeekSheet({ type, date, kutiId })
  return c.json(sheet)
})

app.get('/api/attendance/report/month-sheet', async (c) => {
  await requireUser(c, 'attendance.view')
  const type = c.req.query('type') || ''
  const date = c.req.query('date') || isoDate()
  const kutiRaw = c.req.query('kuti_id')
  const kutiId = kutiRaw ? Number(kutiRaw) : null
  if (!(await isValidAttendanceType(type))) return c.json({ error: 'ប្រភេទវត្តមានមិនត្រឹមត្រូវ' }, 400)
  const sheet = await buildMonthSheet({ type, date, kutiId })
  return c.json(sheet)
})

app.patch('/api/attendance/report/person', async (c) => {
  await requireUser(c, 'attendance.manage')
  const body = await c.req.json<{
    type?: string
    period?: string
    resident_id?: number
    status?: 'absent' | 'excused'
    note?: string
    kuti_id?: number | null
  }>()
  const type = body.type || ''
  const period = body.period || 'today'
  const residentId = Number(body.resident_id)
  const status = body.status
  if (!(await isValidAttendanceType(type))) return c.json({ error: 'ប្រភេទវត្តមានមិនត្រឹមត្រូវ' }, 400)
  if (!isReportPeriod(period)) return c.json({ error: 'រយៈពេលមិនត្រឹមត្រូវ' }, 400)
  if (!Number.isFinite(residentId)) return c.json({ error: 'ព្រះសង្ឃមិនត្រឹមត្រូវ' }, 400)
  if (status !== 'absent' && status !== 'excused') {
    return c.json({ error: 'ស្ថានភាពមិនត្រឹមត្រូវ' }, 400)
  }
  try {
    const report = await updateReportPerson({
      type,
      period,
      residentId,
      status,
      note: body.note || '',
      kutiId: body.kuti_id ? Number(body.kuti_id) : null,
    })
    return c.json(report)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'កែប្រែមិនបាន' }, 400)
  }
})

app.delete('/api/attendance/report/person', async (c) => {
  await requireUser(c, 'attendance.manage')
  const body = await c.req.json<{
    type?: string
    period?: string
    resident_id?: number
    status?: 'absent' | 'excused'
    kuti_id?: number | null
  }>()
  const type = body.type || ''
  const period = body.period || 'today'
  const residentId = Number(body.resident_id)
  const status = body.status
  if (!(await isValidAttendanceType(type))) return c.json({ error: 'ប្រភេទវត្តមានមិនត្រឹមត្រូវ' }, 400)
  if (period !== 'today') return c.json({ error: 'លុបបានតែថ្ងៃនេះ' }, 400)
  if (!Number.isFinite(residentId)) return c.json({ error: 'ព្រះសង្ឃមិនត្រឹមត្រូវ' }, 400)
  if (status !== 'absent' && status !== 'excused') {
    return c.json({ error: 'ស្ថានភាពមិនត្រឹមត្រូវ' }, 400)
  }
  try {
    const report = await removeReportPerson({
      type,
      period: 'today',
      residentId,
      status,
      kutiId: body.kuti_id ? Number(body.kuti_id) : null,
    })
    return c.json(report)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'លុបមិនបាន' }, 400)
  }
})

app.post('/api/attendance/report/send-telegram', async (c) => {
  await requireUser(c, 'attendance.manage')
  const body = await c.req.json<{ type?: string; period?: string; kuti_id?: number | null }>()
  const type = body.type || ''
  const period = body.period || 'week'
  if (!(await isValidAttendanceType(type))) return c.json({ error: 'ប្រភេទវត្តមានមិនត្រឹមត្រូវ' }, 400)
  if (!isReportPeriod(period)) return c.json({ error: 'រយៈពេលមិនត្រឹមត្រូវ' }, 400)
  const result = await sendReportTelegram({
    type,
    period,
    kutiId: body.kuti_id ? Number(body.kuti_id) : null,
  })
  if (!result.ok) return c.json({ error: result.error || 'ផ្ញើមិនបាន' }, 502)
  return c.json({ ok: true, message_id: result.message_id, report: result.report })
})

/** Send A4 week-sheet PNG (base64) to Telegram after client preview. */
app.post('/api/attendance/report/send-week-sheet', async (c) => {
  await requireUser(c, 'attendance.manage')
  const body = await c.req.json<{
    image_base64?: string
    caption?: string
    filename?: string
  }>()
  const raw = (body.image_base64 || '').trim()
  if (!raw) return c.json({ error: 'មិនមានរូបភាព' }, 400)
  const b64 = raw.includes(',') ? raw.split(',')[1] : raw
  let bytes: Buffer
  try {
    bytes = Buffer.from(b64, 'base64')
  } catch {
    return c.json({ error: 'រូបភាពមិនត្រឹមត្រូវ' }, 400)
  }
  if (bytes.length < 100 || bytes.length > 8_000_000) {
    return c.json({ error: 'ទំហំរូបភាពមិនត្រឹមត្រូវ' }, 400)
  }
  const result = await sendTelegramPhoto(bytes, {
    caption: body.caption || '',
    filename: body.filename || 'attendance-week.png',
  })
  if (!result.ok) return c.json({ error: result.error || 'ផ្ញើមិនបាន' }, 502)
  return c.json({ ok: true, message_id: result.message_id })
})

app.post('/api/attendance/reminder/send', async (c) => {
  await requireUser(c, 'attendance.manage')
  const body = await c.req.json<{ type?: string; date?: string; kuti_id?: number | null }>()
  const type = body.type || ''
  if (!(await isValidAttendanceType(type))) return c.json({ error: 'ប្រភេទវត្តមានមិនត្រឹមត្រូវ' }, 400)
  const result = await sendReminder({
    type,
    date: body.date,
    kutiId: body.kuti_id ? Number(body.kuti_id) : null,
  })
  if (!result.ok) return c.json({ error: result.error || 'ផ្ញើមិនបាន' }, 502)
  return c.json({ ok: true, message_id: result.message_id })
})

app.post('/api/telegram/webhook', async (c) => {
  const update = await c.req.json().catch(() => null)
  if (!update) return c.json({ ok: false }, 400)
  await handleTelegramUpdate(update)
  return c.json({ ok: true })
})

/** Production: serve Vite `dist/` + SPA fallback (same origin as /api). */
const distDir = path.join(process.cwd(), 'dist')
if (existsSync(path.join(distDir, 'index.html'))) {
  app.use(
    '/*',
    serveStatic({
      root: './dist',
      rewriteRequestPath: (p) => (p === '/' ? '/index.html' : p),
    }),
  )
  app.get('*', async (c, next) => {
    if (c.req.path.startsWith('/api') || c.req.path.startsWith('/media')) return next()
    return serveStatic({ root: './dist', path: 'index.html' })(c, next)
  })
  console.log('Serving frontend from ./dist')
}

const port = Number(process.env.PORT || process.env.API_PORT || 8787)
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, () => {
  console.log(`Kuti API running on http://127.0.0.1:${port}`)
  startTelegramPolling()
  startReminderScheduler()
})

const reminderSent = new Set<string>()

function localTimeParts(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  const get = (type: string) => parts.find((p) => p.type === type)?.value || ''
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  }
}

function startReminderScheduler() {
  const tick = async () => {
    try {
      const reminders = await getSetting('attendance_reminders')
      const { date, time } = localTimeParts(reminders.timezone || 'Asia/Phnom_Penh')
      for (const item of reminders.items || []) {
        if (!item.enabled || item.time !== time) continue
        const key = `${date}:${item.type}:${item.time}`
        if (reminderSent.has(key)) continue
        const result = await sendReminder({ type: item.type, date })
        if (result.ok) reminderSent.add(key)
      }
      if (reminderSent.size > 500) reminderSent.clear()
    } catch (error) {
      console.warn('reminder scheduler failed', error)
    } finally {
      setTimeout(tick, 30_000)
    }
  }
  void tick()
}