import { type FormEvent, useEffect, useState } from 'react'
import { Eye, EyeOff, LockKeyhole, UserRound } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'
import { apiRequest } from '../lib/api'
import { useAuth } from '../lib/auth'

export function LoginPage() {
  const user = useAuth((s) => s.user)
  const login = useAuth((s) => s.login)
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const message = await login(username.trim(), password)
    setBusy(false)
    if (message) {
      setError(message)
      return
    }
    navigate('/', { replace: true })
  }

  return (
    <div className="login-pattern relative flex min-h-dvh flex-col overflow-x-hidden text-cream lg:grid lg:grid-cols-[1.1fr_1fr]">
      <BrandPanel />

      <section className="relative z-10 mt-auto shrink-0 rounded-t-[28px] bg-paper px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-4 text-ink shadow-[0_-16px_40px_rgba(0,0,0,0.22)] lg:mt-0 lg:flex lg:min-h-dvh lg:items-center lg:rounded-none lg:px-16 lg:py-16 lg:shadow-none">
        <div className="mx-auto w-full max-w-md">
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-line lg:hidden" />

          <div className="mb-5 border-b border-line pb-4">
            <p className="text-xs font-bold tracking-wide text-saffron">ចូលប្រើប្រព័ន្ធ</p>
            <h2 className="mt-1 font-title text-xl text-maroon">សូមស្វាគមន៍</h2>
          </div>

          <form onSubmit={submit} className="space-y-3.5">
            {error ? (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-danger">{error}</div>
            ) : null}

            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-muted">ឈ្មោះគណនី</span>
              <span className="flex items-center gap-3 rounded-xl border border-line bg-cream/70 px-3.5 py-3 focus-within:border-saffron focus-within:bg-white">
                <UserRound size={18} className="shrink-0 text-saffron" />
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                  placeholder="បញ្ចូលឈ្មោះគណនី"
                  className="w-full bg-transparent text-[16px] outline-none"
                />
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-muted">លេខសម្ងាត់</span>
              <span className="flex items-center gap-3 rounded-xl border border-line bg-cream/70 px-3.5 py-3 focus-within:border-saffron focus-within:bg-white">
                <LockKeyhole size={18} className="shrink-0 text-saffron" />
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  placeholder="បញ្ចូលលេខសម្ងាត់"
                  className="w-full bg-transparent text-[16px] outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="shrink-0 text-muted"
                  aria-label={showPassword ? 'លាក់លេខសម្ងាត់' : 'បង្ហាញលេខសម្ងាត់'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>

            <button
              type="submit"
              disabled={busy}
              className="mt-1 w-full rounded-xl bg-saffron py-3.5 text-base font-bold text-white shadow-[0_8px_20px_rgba(196,92,20,0.28)] disabled:opacity-60"
            >
              {busy ? 'កំពុងចូល...' : 'ចូលគណនី'}
            </button>
          </form>
        </div>
      </section>
    </div>
  )
}

function BrandPanel() {
  const [leaders, setLeaders] = useState([
    { title: 'មេកុដិ', name: 'អ្នកដឹកនាំកុដិ' },
    { title: 'អនុកុដិ', name: 'អ្នកជួយដឹកនាំកុដិ' },
  ])

  useEffect(() => {
    void apiRequest<{ title: string; name: string }[]>('/api/leaders')
      .then((data) => {
        if (Array.isArray(data) && data.length) setLeaders(data)
      })
      .catch(() => undefined)
  }, [])

  return (
    <section className="relative flex flex-1 flex-col px-5 pb-5 pt-[max(20px,env(safe-area-inset-top))] text-center lg:min-h-dvh lg:justify-center lg:px-12 lg:py-10">
      <div className="pointer-events-none absolute inset-0 [background:radial-gradient(circle_at_50%_28%,rgba(243,193,107,0.2),transparent_46%)]" />

      <div className="relative flex flex-1 flex-col items-center justify-center">
        <div className="relative">
          <div className="absolute -inset-4 rounded-full bg-gold/25 blur-2xl" />
          <div className="relative h-[92px] w-[92px] rounded-full bg-gradient-to-b from-[#f6e2a8] via-[#d4a017] to-[#7a4c0e] p-[3px] shadow-[0_12px_28px_rgba(0,0,0,0.35)] md:h-24 md:w-24 lg:h-28 lg:w-28">
            <div className="h-full w-full overflow-hidden rounded-full bg-[#2a0f09] p-[3px]">
              <img src="/logo.svg" alt="" className="h-full w-full rounded-full" />
            </div>
          </div>
        </div>

        <h1 className="mt-3 max-w-[15rem] font-title text-[20px] leading-[1.7] text-gold md:max-w-none md:text-[28px] lg:text-[32px]">
          ប្រព័ន្ធគ្រប់គ្រងកុដិ
        </h1>
        <p className="mt-1.5 text-[13px] text-cream/85">សាលាពុទ្ធិក · វត្តនិរោធរង្សី</p>
        <span className="mt-2 inline-flex rounded-full border border-gold/35 bg-black/20 px-3 py-1 text-[12px] text-gold">
          ព.ស. ២៥៦៩
        </span>

        <div className="mt-5 grid w-full max-w-sm grid-cols-2 gap-2.5">
          {leaders.map((leader) => (
            <div
              key={leader.title}
              className="rounded-2xl border border-gold/25 bg-black/20 px-3 py-3 backdrop-blur-sm"
            >
              <p className="text-[11px] font-bold tracking-wide text-gold">{leader.title}</p>
              <p className="mt-1 text-[13px] leading-5 text-cream">{leader.name}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
