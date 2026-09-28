import { getPool } from './db'
import { isValidAttendanceType } from './settings'

export type AttendanceGroup = {
  id: number
  attendance_type: string
  name: string
  sort_order: number
  member_count: number
  member_ids: number[]
}

const KHMER_DIGITS = ['០', '១', '២', '៣', '៤', '៥', '៦', '៧', '៨', '៩']

export function toKhmerDigits(value: number | string) {
  return String(value).replace(/\d/g, (d) => KHMER_DIGITS[Number(d)] || d)
}

export function defaultGroupName(index1Based: number) {
  return `ក្រុមទី${toKhmerDigits(index1Based)}`
}

/**
 * Rotate groups by calendar day (Asia/Phnom_Penh ISO date).
 * Day 0 → group 0, … last → wrap to group 0.
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

export async function listAttendanceGroups(type: string): Promise<AttendanceGroup[]> {
  if (!(await isValidAttendanceType(type))) return []

  const groups = await getPool().query<{
    id: number
    attendance_type: string
    name: string
    sort_order: number
  }>(
    `SELECT id, attendance_type, name, sort_order
     FROM attendance_groups
     WHERE attendance_type = $1
     ORDER BY sort_order ASC, id ASC`,
    [type],
  )

  if (groups.rows.length === 0) return []

  const members = await getPool().query<{ group_id: number; resident_id: number }>(
    `SELECT group_id, resident_id
     FROM attendance_group_members
     WHERE attendance_type = $1
     ORDER BY group_id, resident_id`,
    [type],
  )

  const byGroup = new Map<number, number[]>()
  for (const row of members.rows) {
    const list = byGroup.get(row.group_id) || []
    list.push(row.resident_id)
    byGroup.set(row.group_id, list)
  }

  return groups.rows.map((g) => {
    const ids = byGroup.get(g.id) || []
    return {
      id: g.id,
      attendance_type: g.attendance_type,
      name: g.name,
      sort_order: g.sort_order,
      member_count: ids.length,
      member_ids: ids,
    }
  })
}

export async function createAttendanceGroup(params: {
  type: string
  name?: string | null
}) {
  if (!(await isValidAttendanceType(params.type))) throw new Error('ប្រភេទវត្តមានមិនត្រឹមត្រូវ')

  const count = await getPool().query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM attendance_groups WHERE attendance_type = $1`,
    [params.type],
  )
  const next = (Number(count.rows[0]?.n) || 0) + 1
  const name = (params.name || '').trim() || defaultGroupName(next)

  const inserted = await getPool().query<{
    id: number
    attendance_type: string
    name: string
    sort_order: number
  }>(
    `INSERT INTO attendance_groups (attendance_type, name, sort_order)
     VALUES ($1, $2, $3)
     RETURNING id, attendance_type, name, sort_order`,
    [params.type, name, next],
  )
  const row = inserted.rows[0]
  return {
    id: row.id,
    attendance_type: row.attendance_type,
    name: row.name,
    sort_order: row.sort_order,
    member_count: 0,
    member_ids: [] as number[],
  }
}

export async function renameAttendanceGroup(params: { id: number; name: string }) {
  const name = params.name.trim()
  if (!name) throw new Error('សូមបញ្ចូលឈ្មោះក្រុម')
  const updated = await getPool().query<{ id: number }>(
    `UPDATE attendance_groups SET name = $2 WHERE id = $1 RETURNING id`,
    [params.id, name],
  )
  if (!updated.rowCount) throw new Error('រកមិនឃើញក្រុម')
}

export async function deleteAttendanceGroup(id: number) {
  const deleted = await getPool().query(`DELETE FROM attendance_groups WHERE id = $1`, [id])
  if (!deleted.rowCount) throw new Error('រកមិនឃើញក្រុម')
}

/** Replace members of a group. Residents move out of any other group of the same type. */
export async function setGroupMembers(params: {
  type: string
  groupId: number
  residentIds: number[]
}) {
  if (!(await isValidAttendanceType(params.type))) throw new Error('ប្រភេទវត្តមានមិនត្រឹមត្រូវ')

  const group = await getPool().query<{ id: number; attendance_type: string }>(
    `SELECT id, attendance_type FROM attendance_groups WHERE id = $1`,
    [params.groupId],
  )
  if (!group.rows[0] || group.rows[0].attendance_type !== params.type) {
    throw new Error('រកមិនឃើញក្រុម')
  }

  const ids = Array.from(
    new Set(params.residentIds.filter((id) => Number.isFinite(id) && id > 0)),
  )

  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `DELETE FROM attendance_group_members WHERE group_id = $1 AND attendance_type = $2`,
      [params.groupId, params.type],
    )
    if (ids.length > 0) {
      await client.query(
        `DELETE FROM attendance_group_members
         WHERE attendance_type = $1 AND resident_id = ANY($2::int[])`,
        [params.type, ids],
      )
      for (const residentId of ids) {
        await client.query(
          `INSERT INTO attendance_group_members (attendance_type, group_id, resident_id)
           VALUES ($1, $2, $3)`,
          [params.type, params.groupId, residentId],
        )
      }
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }

  return listAttendanceGroups(params.type)
}

/** Map resident_id → { group_id, group_name, sort_order } for a type. */
export async function groupMapForType(type: string) {
  const rows = await getPool().query<{
    resident_id: number
    group_id: number
    group_name: string
    sort_order: number
  }>(
    `SELECT m.resident_id, g.id AS group_id, g.name AS group_name, g.sort_order
     FROM attendance_group_members m
     JOIN attendance_groups g ON g.id = m.group_id
     WHERE m.attendance_type = $1`,
    [type],
  )
  return new Map(rows.rows.map((r) => [r.resident_id, r]))
}
