import type { AppPageKey, AuthUser, Permission, Role } from './types'

/** Roles shown in UI / assignable to users. */
export const ROLE_ORDER: Role[] = ['admin', 'manager']

/** Legacy DB roles → current role (kept for existing accounts). */
const LEGACY_ROLE_MAP: Record<string, Role> = {
  principal: 'manager',
  kuti_head: 'manager',
  staff: 'manager',
  teacher: 'manager',
  monitor: 'manager',
  user: 'manager',
}

export const ROLES: Record<
  Role,
  { key: Role; label: string; labelEn: string; description: string }
> = {
  admin: {
    key: 'admin',
    label: 'រដ្ឋបាល',
    labelEn: 'Admin',
    description: 'គ្រប់គ្រងអ្នកប្រើ តួនាទី កុដិ ការកំណត់ និងព្រះសង្ឃទាំងអស់',
  },
  manager: {
    key: 'manager',
    label: 'អ្នកគ្រប់គ្រង',
    labelEn: 'Manager',
    description: 'គ្រប់គ្រងកុដិ ព្រះសង្ឃ វត្តមាន និងរបាយការណ៍',
  },
}

/** Pages assignable to managers. */
export const MANAGER_PAGES: Array<{
  key: AppPageKey
  label: string
  path: string
  permission: Permission
}> = [
  { key: 'home', label: 'ទំព័រដើម', path: '/', permission: 'reports.view' },
  { key: 'attendance', label: 'វត្តមាន', path: '/attendance', permission: 'attendance.view' },
  { key: 'kutis', label: 'កុដិ', path: '/kutis', permission: 'kutis.view' },
  { key: 'residents', label: 'ព្រះសង្ឃ', path: '/residents', permission: 'residents.view' },
]

export const DEFAULT_MANAGER_PAGES: AppPageKey[] = MANAGER_PAGES.map((p) => p.key)

export const PERMISSIONS: { key: Permission; label: string; group: string }[] = [
  { key: 'users.view', label: 'មើលអ្នកប្រើ', group: 'អ្នកប្រើប្រាស់' },
  { key: 'users.manage', label: 'បង្កើត / កែ / លុបអ្នកប្រើ', group: 'អ្នកប្រើប្រាស់' },
  { key: 'roles.manage', label: 'កំណត់តួនាទី', group: 'អ្នកប្រើប្រាស់' },
  { key: 'kutis.view', label: 'មើលកុដិ', group: 'កុដិ' },
  { key: 'kutis.manage', label: 'បង្កើត / កែកុដិ', group: 'កុដិ' },
  { key: 'residents.view', label: 'មើលព្រះសង្ឃ', group: 'ព្រះសង្ឃ' },
  { key: 'residents.assign', label: 'ចាត់តាំងកុដិ', group: 'ព្រះសង្ឃ' },
  { key: 'attendance.view', label: 'មើលវត្តមាន', group: 'វត្តមាន' },
  { key: 'attendance.manage', label: 'កត់ត្រា / ផ្ញើវត្តមាន', group: 'វត្តមាន' },
  { key: 'reports.view', label: 'មើលស្ថិតិ', group: 'របាយការណ៍' },
  { key: 'settings.manage', label: 'កែការកំណត់ប្រព័ន្ធ', group: 'ការកំណត់' },
]

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: PERMISSIONS.map((item) => item.key),
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

export function normalizeRole(role?: string | null): Role {
  if (!role) return 'manager'
  if (role === 'admin' || role === 'manager') return role
  if (role in LEGACY_ROLE_MAP) return LEGACY_ROLE_MAP[role]
  return 'manager'
}

export function roleMeta(role?: string | null) {
  return ROLES[normalizeRole(role)]
}

export function hasPermission(role: string | undefined | null, permission: Permission) {
  return ROLE_PERMISSIONS[normalizeRole(role)].includes(permission)
}

export function canAccess(role: string | undefined | null, allowed: Permission[]) {
  return allowed.some((permission) => hasPermission(role, permission))
}

export function normalizeManagedPages(pages?: string[] | null): AppPageKey[] {
  const allowed = new Set(MANAGER_PAGES.map((p) => p.key))
  const list = (pages || []).filter((p): p is AppPageKey => allowed.has(p as AppPageKey))
  return list.length ? list : [...DEFAULT_MANAGER_PAGES]
}

/** Admin = all pages. Manager = assigned pages (default all if unset). */
export function hasPageAccess(
  user: Pick<AuthUser, 'role' | 'managed_pages'> | null | undefined,
  page: AppPageKey,
) {
  if (!user) return false
  if (normalizeRole(user.role) === 'admin') return true
  return normalizeManagedPages(user.managed_pages).includes(page)
}

export function normalizeManagedAttendanceTypes(types?: string[] | null): string[] {
  if (!Array.isArray(types)) return []
  return [...new Set(types.map((t) => String(t).trim()).filter(Boolean))]
}

/**
 * Admin = all types.
 * Manager without attendance page = none.
 * Manager with attendance + empty type list = all types (legacy / full).
 * Manager with explicit list = only those keys.
 */
export function hasAttendanceTypeAccess(
  user: Pick<AuthUser, 'role' | 'managed_pages' | 'managed_attendance_types'> | null | undefined,
  typeKey: string,
) {
  if (!user) return false
  if (normalizeRole(user.role) === 'admin') return true
  if (!hasPageAccess(user, 'attendance')) return false
  const allowed = normalizeManagedAttendanceTypes(user.managed_attendance_types)
  if (allowed.length === 0) return true
  return allowed.includes(typeKey)
}

export function pageKeyFromPath(pathname: string): AppPageKey | null {
  if (pathname === '/' || pathname === '') return 'home'
  if (pathname.startsWith('/attendance')) return 'attendance'
  if (pathname.startsWith('/kutis')) return 'kutis'
  if (pathname.startsWith('/residents')) return 'residents'
  return null
}
