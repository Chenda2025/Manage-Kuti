export function fullName(last?: string | null, first?: string | null) {
  return `${last || ''} ${first || ''}`.trim() || 'មិនមានឈ្មោះ'
}

export function monkLabel(status?: string | null) {
  return status || 'គ្រហស្ថ'
}

/** Sort: មន្ត្រីសង្ឃ (ordered) → មេកុដិ → អនុកុដិ → others by វស្សា (desc). */
const SANGHA_OFFICER_ORDER = ['ចៅធិការ', 'សូត្រឆ្វេង', 'សូត្រស្តាំ', 'វិន័យធរ', 'លេខា'] as const

export function residentPositionRank(position?: string | null) {
  const key = (position || '').trim()
  for (let i = 0; i < SANGHA_OFFICER_ORDER.length; i++) {
    if (key.includes(SANGHA_OFFICER_ORDER[i])) return i
  }
  if (key.includes('មន្ត្រីសង្ឃ')) return SANGHA_OFFICER_ORDER.length
  if (key.includes('មេកុដិ')) return SANGHA_OFFICER_ORDER.length + 1
  if (key.includes('អនុកុដិ')) return SANGHA_OFFICER_ORDER.length + 2
  return SANGHA_OFFICER_ORDER.length + 3
}

export function compareResidentsByPosition(
  a: { position?: string | null; vassa_years?: number | null; last_name?: string; first_name?: string },
  b: { position?: string | null; vassa_years?: number | null; last_name?: string; first_name?: string },
) {
  const byPos = residentPositionRank(a.position) - residentPositionRank(b.position)
  if (byPos !== 0) return byPos
  const byVassa = (b.vassa_years || 0) - (a.vassa_years || 0)
  if (byVassa !== 0) return byVassa
  return fullName(a.last_name, a.first_name).localeCompare(fullName(b.last_name, b.first_name), 'km')
}

export function statusLabel(status?: string | null) {
  if (status === 'active') return 'សកម្ម'
  if (status === 'inactive' || status === 'dropped') return 'អសកម្ម'
  return status || '—'
}

export function initials(text?: string | null) {
  const value = (text || '').trim()
  if (!value) return 'ក'
  return value.slice(0, 1)
}

export function displayName(user?: { display_name?: string | null; username?: string | null } | null) {
  return user?.display_name?.trim() || user?.username?.trim() || 'គណនី'
}
