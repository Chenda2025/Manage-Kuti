import {
  Building2,
  ClipboardList,
  Settings,
  ShieldCheck,
  Users,
  UsersRound,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Spinner } from '../components/Spinner'
import { useAttendanceTypes } from '../lib/useAttendanceTypes'
import { useAuth } from '../lib/auth'
import { displayName } from '../lib/format'
import { hasPermission } from '../lib/roles'
import type { Account, Kuti, Permission, Resident } from '../lib/types'
import { useApiList } from '../lib/useApiList'

type MenuItem = {
  to: string
  label: string
  icon: typeof Building2
  permission: Permission
  tone: string
}

const MAIN_MENU: MenuItem[] = [
  {
    to: '/attendance',
    label: 'វត្តមាន',
    icon: ClipboardList,
    permission: 'attendance.view',
    tone: 'bg-[#fff1d6] text-saffron',
  },
  {
    to: '/kutis',
    label: 'កុដិ',
    icon: Building2,
    permission: 'kutis.view',
    tone: 'bg-[#e8f6ee] text-ok',
  },
  {
    to: '/residents',
    label: 'ព្រះសង្ឃ',
    icon: UsersRound,
    permission: 'residents.view',
    tone: 'bg-[#fde8e6] text-danger',
  },
  {
    to: '/settings',
    label: 'កំណត់',
    icon: Settings,
    permission: 'settings.manage',
    tone: 'bg-[#eee7ff] text-[#4338ca]',
  },
  {
    to: '/users',
    label: 'អ្នកប្រើ',
    icon: Users,
    permission: 'users.view',
    tone: 'bg-cream text-maroon',
  },
  {
    to: '/roles',
    label: 'តួនាទី',
    icon: ShieldCheck,
    permission: 'roles.manage',
    tone: 'bg-cream text-maroon',
  },
]

export function DashboardPage() {
  const user = useAuth((s) => s.user)
  const kutis = useApiList<Kuti>('/api/core/kutis')
  const residents = useApiList<Resident>('/api/students/list')
  const accounts = useApiList<Account>(hasPermission(user?.role, 'users.view') ? '/api/users/users' : null)
  const loading = kutis.loading || residents.loading || accounts.loading

  const activeMonks = residents.data.filter((item) => item.status !== 'dropped')
  const unassigned = activeMonks.filter((item) => !item.kuti)
  const byStatus = Object.entries(
    activeMonks.reduce<Record<string, number>>((acc, item) => {
      const key = item.monk_status || 'ផ្សេងទៀត'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {}),
  )

  const menus = MAIN_MENU.filter((item) => hasPermission(user?.role, item.permission))
  const canAttendance = hasPermission(user?.role, 'attendance.view')
  const attendanceTypes = useAttendanceTypes()

  if (loading || (canAttendance && attendanceTypes.loading)) return <Spinner />

  return (
    <div className="rise space-y-4">
      <section className="rounded-[20px] border border-line bg-paper px-4 py-3 shadow-[inset_3px_0_0_0_var(--color-saffron)]">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-muted">សួស្តី</p>
            <h1 className="truncate font-title text-[18px] leading-[1.5] text-maroon">{displayName(user)}</h1>
          </div>
          {unassigned.length > 0 ? (
            <Link
              to="/residents"
              className="shrink-0 rounded-full bg-[#fde8e6] px-2.5 py-1 text-[11px] font-bold text-danger"
            >
              {unassigned.length} មិនទាន់កុដិ
            </Link>
          ) : null}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <MiniStat
            to="/kutis"
            value={kutis.data[0]?.room_count || 0}
            label="បន្ទប់"
          />
          <MiniStat to="/residents" value={activeMonks.length} label="ព្រះសង្ឃ" />
          <MiniStat
            to={hasPermission(user?.role, 'users.view') ? '/users' : '/roles'}
            value={hasPermission(user?.role, 'users.view') ? accounts.data.length : byStatus.length}
            label={hasPermission(user?.role, 'users.view') ? 'អ្នកប្រើ' : 'ឋានៈ'}
          />
        </div>
        {byStatus.length ? (
          <div
            className="mt-2 grid gap-2"
            style={{ gridTemplateColumns: `repeat(${Math.min(byStatus.length, 4)}, minmax(0, 1fr))` }}
          >
            {byStatus.map(([label, count]) => (
              <Link
                key={label}
                to="/residents"
                className="rounded-2xl border border-line/80 bg-gradient-to-b from-cream to-[#f3ebe0] px-2.5 py-2 text-center"
              >
                <p className="text-base font-bold leading-none text-maroon">{count}</p>
                <p className="mt-1 truncate text-[10px] font-bold text-muted">{label}</p>
              </Link>
            ))}
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="mb-2 px-0.5 text-[12px] font-bold text-muted">ម៉ឺនុយ</h2>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {menus.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex flex-col items-center gap-2 rounded-[18px] border border-line bg-paper px-2 py-3 text-center active:scale-[0.98]"
            >
              <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${item.tone}`}>
                <item.icon size={18} />
              </div>
              <span className="text-[12px] font-bold leading-4 text-ink">{item.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {canAttendance && attendanceTypes.data.length ? (
        <section className="rounded-[20px] border border-line bg-paper p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-[12px] font-bold text-muted">វត្តមាន</h2>
            <Link to="/attendance" className="text-[11px] font-bold text-saffron">
              ទាំងអស់
            </Link>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {attendanceTypes.data.map((item) => (
              <Link
                key={item.key}
                to={`/attendance/${item.key}`}
                className="rounded-full border border-line bg-cream px-3 py-2 text-[12px] font-bold text-ink"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

function MiniStat({ to, value, label }: { to: string; value: number; label: string }) {
  return (
    <Link to={to} className="rounded-2xl bg-cream px-2.5 py-2 text-center">
      <p className="text-lg font-bold leading-none text-ink">{value}</p>
      <p className="mt-1 text-[11px] text-muted">{label}</p>
    </Link>
  )
}
