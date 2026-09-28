import { useMemo, useState } from 'react'
import { Check, Minus, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PERMISSIONS, ROLE_ORDER, ROLE_PERMISSIONS, ROLES, hasPermission } from '../lib/roles'
import { useAuth } from '../lib/auth'

export function RolesPage() {
  const user = useAuth((s) => s.user)
  const [selectedRole, setSelectedRole] = useState<(typeof ROLE_ORDER)[number]>('admin')
  const groups = useMemo(() => [...new Set(PERMISSIONS.map((item) => item.group))], [])
  const meta = ROLES[selectedRole]
  const allowed = ROLE_PERMISSIONS[selectedRole]
  const allowedCount = allowed.length

  return (
    <div className="rise space-y-4">
      <section className="rounded-[22px] border border-line bg-paper px-4 py-3.5 shadow-[inset_3px_0_0_0_var(--color-saffron)]">
        <h1 className="font-title text-[18px] text-maroon">តួនាទី និងសិទ្ធិ</h1>
        <p className="mt-0.5 text-[12px] text-muted">មើលសិទ្ធិតាមតួនាទី · កំណត់តួនាទីនៅទំព័រអ្នកប្រើ</p>
      </section>

      <section className="space-y-2">
        <p className="text-sm font-bold text-muted">តួនាទី</p>
        <div className="overflow-hidden rounded-2xl border border-line bg-paper">
          {ROLE_ORDER.map((role, index) => {
            const selected = selectedRole === role
            const count = ROLE_PERMISSIONS[role].length
            return (
              <button
                key={role}
                type="button"
                onClick={() => setSelectedRole(role)}
                className={`flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors ${
                  index > 0 ? 'border-t border-line' : ''
                } ${
                  selected
                    ? 'bg-[#fff8ec] text-maroon shadow-[inset_3px_0_0_0_var(--color-saffron)]'
                    : 'bg-paper text-ink hover:bg-cream/70'
                }`}
              >
                <span
                  className={`flex h-2 w-2 shrink-0 rounded-full ${
                    selected ? 'bg-saffron' : 'bg-line'
                  }`}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{ROLES[role].label}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted">
                    {ROLES[role].labelEn}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-lg px-2 py-0.5 text-[11px] font-bold ${
                    selected ? 'bg-saffron text-white' : 'bg-cream text-muted'
                  }`}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="space-y-3 rounded-[22px] border border-line bg-paper p-4">
        <div>
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-title text-[17px] text-maroon">{meta.label}</h2>
            <span className="shrink-0 rounded-lg bg-cream px-2 py-0.5 text-[11px] font-bold text-muted">
              {allowedCount} / {PERMISSIONS.length}
            </span>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-muted">{meta.description}</p>
        </div>

        <div className="space-y-3">
          {groups.map((group) => {
            const items = PERMISSIONS.filter((item) => item.group === group)
            const groupAllowed = items.filter((item) => allowed.includes(item.key)).length
            return (
              <div key={group} className="overflow-hidden rounded-2xl border border-line">
                <div className="flex items-center justify-between gap-2 border-b border-line bg-cream/50 px-3 py-2">
                  <p className="text-sm font-bold text-maroon">{group}</p>
                  <span className="text-[11px] font-bold text-muted">
                    {groupAllowed}/{items.length}
                  </span>
                </div>
                <ul className="divide-y divide-line">
                  {items.map((permission) => {
                    const ok = allowed.includes(permission.key)
                    return (
                      <li
                        key={permission.key}
                        className={`flex items-center gap-3 px-3 py-2.5 ${
                          ok ? 'bg-paper' : 'bg-cream/30'
                        }`}
                      >
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ${
                            ok ? 'bg-[#e8f5ee] text-ok' : 'bg-cream text-line'
                          }`}
                        >
                          {ok ? <Check size={15} strokeWidth={2.5} /> : <Minus size={15} />}
                        </span>
                        <span
                          className={`min-w-0 flex-1 text-sm font-bold ${
                            ok ? 'text-ink' : 'text-muted'
                          }`}
                        >
                          {permission.label}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      </section>

      {hasPermission(user?.role, 'users.manage') ? (
        <Link
          to="/users"
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-maroon px-4 py-3.5 text-sm font-bold text-cream"
        >
          <Users size={16} />
          កំណត់តួនាទីឲ្យអ្នកប្រើ
        </Link>
      ) : null}
    </div>
  )
}
