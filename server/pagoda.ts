import { getPool } from './db'
import { getSetting, normalizeShareToken } from './settings'

export type PagodaResidence = {
  id: number
  label: string
  value: string
  is_active?: boolean
}

export type PagodaMonk = {
  id: number
  fullname: string
  monk_type?: string
  position?: string
  vassa_years?: number
  living_status?: string
  education_level?: string
  academic_year?: string
  residence?: string
  residence_label?: string
  created_at?: string
}

export type PagodaMonksResponse = {
  success?: boolean
  count?: number
  label?: string
  residence?: string
  residence_label?: string
  monks?: PagodaMonk[]
  message?: string
}

function pagodaBaseUrl() {
  return (process.env.PAGODA_BASE_URL || '').replace(/\/$/, '')
}

export function pagodaConfigured() {
  return Boolean(pagodaBaseUrl())
}

export async function pagodaReady() {
  const base = await resolvePagodaBaseUrl()
  return Boolean(base)
}

function parseTokenMapEnv(): Record<string, string> {
  const raw = process.env.PAGODA_KUTI_TOKENS || '{}'
  try {
    const parsed = JSON.parse(raw) as Record<string, string>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    console.warn('PAGODA_KUTI_TOKENS is not valid JSON')
    return {}
  }
}

export async function resolvePagodaBaseUrl() {
  try {
    const api = await getSetting('kuti_api')
    const fromSettings = (api.base_url || '').replace(/\/$/, '')
    if (fromSettings) return fromSettings
  } catch {
    // schema may not be ready yet during early boot
  }
  return pagodaBaseUrl()
}

/** Single share token for the home kuti (Settings → API កុដិ). */
export async function resolveKutiShareToken() {
  try {
    const api = await getSetting('kuti_api')
    const fromSettings = normalizeShareToken(api.token)
    if (fromSettings) return fromSettings
  } catch {
    // ignore
  }
  const single = normalizeShareToken(process.env.PAGODA_KUTI_TOKEN)
  if (single) return single
  const map = parseTokenMapEnv()
  for (const item of Object.values(map)) {
    const token = normalizeShareToken(item)
    if (token) return token
  }
  return null
}

export async function hasKutiApiToken() {
  return Boolean(await resolveKutiShareToken())
}

/** Home kuti id linked to the Settings token — null when no token / not synced yet. */
export async function resolveHomeKutiId(): Promise<number | null> {
  const token = await resolveKutiShareToken()
  if (!token) return null
  const { rows } = await getPool().query<{ id: number }>(
    `SELECT id FROM kutis WHERE share_token = $1 ORDER BY id LIMIT 1`,
    [token],
  )
  return rows[0]?.id ?? null
}

async function pagodaFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = await resolvePagodaBaseUrl()
  if (!base) throw new Error('PAGODA_BASE_URL is not set')
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
    cache: 'no-store',
  })
  const data = (await response.json().catch(() => null)) as T
  if (!response.ok) {
    const message =
      data && typeof data === 'object' && data !== null && 'message' in data
        ? String((data as { message?: string }).message)
        : `Pagoda request failed (${response.status})`
    throw new Error(message)
  }
  return data
}

export async function fetchResidences(): Promise<PagodaResidence[]> {
  const data = await pagodaFetch<{
    options?: { residence?: Array<PagodaResidence & { field_key?: string }> }
  }>('/api/form-options')
  return (data.options?.residence || [])
    .filter((item) => item.is_active !== false)
    .map((item) => ({
      id: item.id,
      label: item.label,
      value: item.value,
      is_active: item.is_active,
    }))
}

export async function fetchKutiMonks(token: string): Promise<PagodaMonksResponse> {
  return pagodaFetch<PagodaMonksResponse>(`/api/kuti/${encodeURIComponent(token)}/monks`)
}

export async function createPagodaMonk(
  token: string,
  payload: Record<string, unknown>,
) {
  return pagodaFetch<{ success?: boolean; message?: string; id?: number }>(
    `/api/kuti/${encodeURIComponent(token)}/monks`,
    { method: 'POST', body: JSON.stringify(payload) },
  )
}

export async function updatePagodaMonk(
  token: string,
  monkId: number,
  payload: Record<string, unknown>,
) {
  return pagodaFetch<{ success?: boolean; message?: string }>(
    `/api/kuti/${encodeURIComponent(token)}/monks/${monkId}`,
    { method: 'PUT', body: JSON.stringify(payload) },
  )
}

export async function patchPagodaLivingStatus(
  token: string,
  monkId: number,
  living_status: string,
) {
  return pagodaFetch<{ success?: boolean; message?: string }>(
    `/api/kuti/${encodeURIComponent(token)}/monks/${monkId}/living-status`,
    { method: 'PATCH', body: JSON.stringify({ living_status }) },
  )
}

export function splitFullName(fullname: string) {
  const parts = fullname.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { last_name: '—', first_name: '—' }
  if (parts.length === 1) return { last_name: parts[0], first_name: parts[0] }
  return { last_name: parts[0], first_name: parts.slice(1).join(' ') }
}

export function mapLivingStatus(living?: string | null) {
  if (!living) return 'active'
  if (living === 'កំពុងស្នាក់នៅ') return 'active'
  if (living === 'ឈប់ស្នាក់នៅ') return 'inactive'
  return 'active'
}

export function livingStatusFromLocal(status?: string | null) {
  if (status === 'inactive' || status === 'dropped') return 'ឈប់ស្នាក់នៅ'
  return 'កំពុងស្នាក់នៅ'
}

let lastSyncAt = 0
const SYNC_COOLDOWN_MS = 30_000

export type SyncResult = {
  residences: number
  kutis: number
  monks: number
  linked: number
}

export async function syncFromPagoda(force = false): Promise<SyncResult> {
  const base = await resolvePagodaBaseUrl()
  if (!base && !pagodaConfigured()) {
    throw new Error('PAGODA_BASE_URL is not set')
  }
  const now = Date.now()
  if (!force && now - lastSyncAt < SYNC_COOLDOWN_MS) {
    return { residences: 0, kutis: 0, monks: 0, linked: 0 }
  }

  const token = await resolveKutiShareToken()
  if (!token) {
    return { residences: 0, kutis: 0, monks: 0, linked: 0 }
  }

  const pool = getPool()
  const pagodaRow = await pool.query<{ id: number }>('SELECT id FROM pagodas ORDER BY id LIMIT 1')
  const pagodaId = pagodaRow.rows[0]?.id
  if (!pagodaId) throw new Error('មិនមានវត្តក្នុងមូលដ្ឋានទិន្នន័យ')

  const payload = await fetchKutiMonks(token)
  const monks = payload.monks || []
  const externalKey = (payload.residence || '').trim() || `token:${token}`
  const kutiName =
    (payload.residence_label || payload.residence || '').trim() || 'កុដិ'
  const headMonk = monks.find((monk) => (monk.position || '').includes('មេកុដិ'))
  // Pagoda share label is the kuti manager shown on the token page
  const managerName = (payload.label || headMonk?.fullname || '').trim()

  // Match by residence key first (canonical). Token alone may sit on the wrong local row.
  let kutiId: number | null = null
  const byKey = await pool.query<{ id: number }>(
    `SELECT id FROM kutis WHERE external_key = $1 ORDER BY id LIMIT 1`,
    [externalKey],
  )
  if (byKey.rows[0]) {
    kutiId = byKey.rows[0].id
  } else {
    const byToken = await pool.query<{ id: number; external_key: string | null }>(
      `SELECT id, external_key FROM kutis WHERE share_token = $1 ORDER BY id LIMIT 1`,
      [token],
    )
    const tokenRow = byToken.rows[0]
    // Only reuse token row when it has no other residence identity
    if (tokenRow && (!tokenRow.external_key || tokenRow.external_key === externalKey)) {
      kutiId = tokenRow.id
    }
  }

  // Detach this token from every other kuti before binding the correct one
  await pool.query(`UPDATE kutis SET share_token = NULL WHERE share_token = $1`, [token])

  if (kutiId) {
    await pool.query(
      `UPDATE kutis SET
         kuti_name = $2,
         manager_name = $3,
         share_token = $4,
         external_key = $5,
         pagoda_id = $6
       WHERE id = $1`,
      [kutiId, kutiName, managerName, token, externalKey, pagodaId],
    )
  } else {
    const inserted = await pool.query<{ id: number }>(
      `INSERT INTO kutis (pagoda_id, kuti_name, manager_name, external_key, share_token)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [pagodaId, kutiName, managerName, externalKey, token],
    )
    kutiId = inserted.rows[0].id
  }

  // Single home kuti: drop leftover share tokens from other local rows
  await pool.query(`UPDATE kutis SET share_token = NULL WHERE id <> $1 AND share_token IS NOT NULL`, [
    kutiId,
  ])

  const syncedExternalIds: number[] = []
  for (const monk of monks) {
    const { first_name, last_name } = splitFullName(monk.fullname || '')
    const code = `PGD${monk.id}`
    const status = mapLivingStatus(monk.living_status)
    syncedExternalIds.push(monk.id)
    await pool.query(
      `INSERT INTO residents
        (student_code, first_name, last_name, monk_status, position, vassa_years, education_level, kuti_id, pagoda_id, status, external_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (external_id) DO UPDATE SET
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         monk_status = EXCLUDED.monk_status,
         position = EXCLUDED.position,
         vassa_years = EXCLUDED.vassa_years,
         education_level = EXCLUDED.education_level,
         kuti_id = EXCLUDED.kuti_id,
         pagoda_id = EXCLUDED.pagoda_id,
         status = EXCLUDED.status,
         student_code = EXCLUDED.student_code`,
      [
        code,
        first_name,
        last_name,
        monk.monk_type || null,
        monk.position || null,
        Number.isFinite(Number(monk.vassa_years)) ? Number(monk.vassa_years) : null,
        monk.education_level || null,
        kutiId,
        pagodaId,
        status,
        monk.id,
      ],
    )
  }

  // Detach monks that belong to other kutis / old syncs from this home kuti
  if (syncedExternalIds.length > 0) {
    await pool.query(
      `UPDATE residents SET kuti_id = NULL
       WHERE kuti_id = $1 AND (external_id IS NULL OR NOT (external_id = ANY($2::int[])))`,
      [kutiId, syncedExternalIds],
    )
  } else {
    await pool.query(`UPDATE residents SET kuti_id = NULL WHERE kuti_id = $1`, [kutiId])
  }

  lastSyncAt = Date.now()
  return {
    residences: 1,
    kutis: 1,
    monks: syncedExternalIds.length,
    linked: 1,
  }
}

export async function ensurePagodaSynced() {
  if (!(await pagodaReady())) return
  const token = await resolveKutiShareToken()
  if (!token) return
  // Re-bind token → residence when local row is wrong (cooldown inside sync)
  await syncFromPagoda(false)
}
