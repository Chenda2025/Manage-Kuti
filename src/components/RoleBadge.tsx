import { roleMeta } from '../lib/roles'

const TONE: Record<string, string> = {
  admin: 'bg-maroon text-white',
  manager: 'bg-saffron text-white',
}

export function RoleBadge({ role }: { role?: string | null }) {
  const meta = roleMeta(role)
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${
        TONE[meta.key] || TONE.manager
      }`}
    >
      {meta.label}
    </span>
  )
}
