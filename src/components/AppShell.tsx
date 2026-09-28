import {
  Building2,
  ClipboardList,
  Home,
  LogOut,
  Settings,
  ShieldCheck,
  Users,
  UsersRound,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { apiRequest } from '../lib/api'
import { useAuth } from '../lib/auth'
import { displayName } from '../lib/format'
import { hasPageAccess, hasPermission } from '../lib/roles'
import type { AppPageKey, AuthUser, Permission } from '../lib/types'
import { AccountSheet } from './AccountSheet'
import { ProfilePhoto } from './ProfilePhoto'
import { RoleBadge } from './RoleBadge'

const NAV: Array<{
  to: string
  label: string
  icon: typeof Home
  permission: Permission
  page?: AppPageKey
}> = [
  { to: '/', label: 'ទំព័រដើម', icon: Home, permission: 'reports.view', page: 'home' },
  {
    to: '/attendance',
    label: 'វត្តមាន',
    icon: ClipboardList,
    permission: 'attendance.view',
    page: 'attendance',
  },
  { to: '/kutis', label: 'កុដិ', icon: Building2, permission: 'kutis.view', page: 'kutis' },
  {
    to: '/residents',
    label: 'ព្រះសង្ឃ',
    icon: UsersRound,
    permission: 'residents.view',
    page: 'residents',
  },
  { to: '/settings', label: 'ការកំណត់', icon: Settings, permission: 'settings.manage' },
  { to: '/users', label: 'អ្នកប្រើ', icon: Users, permission: 'users.view' },
  { to: '/roles', label: 'តួនាទី', icon: ShieldCheck, permission: 'roles.manage' },
]

function titleForPath(pathname: string) {
  if (pathname.startsWith('/attendance')) return 'វត្តមាន'
  if (pathname.startsWith('/kutis')) return 'កុដិ'
  if (pathname.startsWith('/residents')) return 'ព្រះសង្ឃ'
  if (pathname.startsWith('/settings')) return 'ការកំណត់'
  if (pathname.startsWith('/users')) return 'អ្នកប្រើ'
  if (pathname.startsWith('/roles')) return 'តួនាទី'
  return 'គ្រប់គ្រងកុដិ'
}

function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <div
      className="shrink-0 rounded-full bg-gradient-to-b from-[#f6e2a8] via-[#d4a017] to-[#7a4c0e] p-[2px] shadow-[0_4px_10px_rgba(0,0,0,0.28)]"
      style={{ width: size, height: size }}
    >
      <div className="h-full w-full overflow-hidden rounded-full bg-[#2a0f09] p-[1.5px]">
        <img src="/logo.svg" alt="" className="h-full w-full rounded-full" />
      </div>
    </div>
  )
}

export function AppShell() {
  const user = useAuth((s) => s.user)
  const token = useAuth((s) => s.token)
  const setUser = useAuth((s) => s.setUser)
  const logout = useAuth((s) => s.logout)
  const navigate = useNavigate()
  const location = useLocation()
  const [accountOpen, setAccountOpen] = useState(false)
  const items = NAV.filter(
    (item) =>
      hasPermission(user?.role, item.permission) &&
      (!item.page || hasPageAccess(user, item.page)),
  )

  useEffect(() => {
    if (!token) return
    void apiRequest<AuthUser>('/api/me', { token })
      .then(setUser)
      .catch(() => undefined)
  }, [token, setUser])

  function signOut() {
    logout()
    navigate('/login', { replace: true })
  }

  const label = displayName(user)
  const mobileNav = items
    .filter((item) => item.to !== '/roles' && item.to !== '/users')
    .slice(0, 5)

  return (
    <div className="min-h-dvh bg-cream text-ink md:grid md:grid-cols-[260px_1fr]">
      <aside className="hidden flex-col border-r border-line bg-maroon text-cream md:flex">
        <div className="safe-top px-5 pb-4 pt-6">
          <div className="flex items-center gap-3">
            <LogoMark size={44} />
            <div>
              <p className="font-title text-sm text-gold">គ្រប់គ្រងកុដិ</p>
              <p className="text-xs text-cream/70">វត្តនិរោធរង្សី</p>
            </div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-bold ${
                  isActive ? 'bg-saffron text-white' : 'text-cream/80 hover:bg-white/10'
                }`
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4">
          <button
            type="button"
            onClick={() => setAccountOpen(true)}
            className="mb-3 flex w-full items-center gap-3 rounded-2xl bg-black/20 p-2 text-left"
          >
            <ProfilePhoto name={label} src={user?.avatar_url} size={44} badge />
            <div className="min-w-0">
              <p className="truncate font-bold">{label}</p>
              <RoleBadge role={user?.role} />
            </div>
          </button>
          <button
            type="button"
            onClick={signOut}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white/10 px-3 py-3 text-sm font-bold"
          >
            <LogOut size={16} />
            ចេញពីគណនី
          </button>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-20 md:hidden">
          <div className="relative overflow-hidden bg-maroon px-3.5 pb-5 pt-[max(1.25rem,calc(env(safe-area-inset-top)+1rem))] text-cream">
            <div className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-gold/25 blur-2xl" />
            <div className="relative flex items-center gap-3">
              <LogoMark size={44} />
              <div className="flex min-h-11 min-w-0 flex-1 flex-col justify-center gap-0.5">
                <p className="truncate font-title text-[16px] leading-[1.85] text-gold">
                  {titleForPath(location.pathname)}
                </p>
                <p className="truncate text-[13px] font-bold leading-5 text-cream/90">វត្តនិរោធរង្សី</p>
              </div>
              <button
                type="button"
                onClick={() => setAccountOpen(true)}
                aria-label="គណនី"
                className="flex h-11 w-11 shrink-0 items-center justify-center overflow-visible rounded-full"
              >
                <ProfilePhoto name={label} src={user?.avatar_url} size={40} badge />
              </button>
            </div>
          </div>
          <div className="login-ornament" />
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:px-8 md:py-8 md:pb-8">
          <Outlet />
        </main>

        <nav
          className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 backdrop-blur md:hidden"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
        >
          <div
            className="mx-auto grid h-[3.75rem] max-w-lg px-1"
            style={{ gridTemplateColumns: `repeat(${Math.max(mobileNav.length, 1)}, minmax(0, 1fr))` }}
          >
            {mobileNav.map((item) => {
              const active =
                item.to === '/'
                  ? location.pathname === '/'
                  : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className="relative flex h-full min-w-0 flex-col items-center justify-center gap-0.5 px-0.5"
                >
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-xl transition-colors ${
                      active ? 'bg-[#fff1d6] text-saffron' : 'text-muted'
                    }`}
                  >
                    <item.icon size={18} strokeWidth={active ? 2.4 : 2} />
                  </span>
                  <span
                    className={`max-w-full truncate text-[10px] font-bold leading-none ${
                      active ? 'text-saffron' : 'text-muted'
                    }`}
                  >
                    {item.label}
                  </span>
                </NavLink>
              )
            })}
          </div>
        </nav>
      </div>

      <AccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} onSignOut={signOut} />
    </div>
  )
}
