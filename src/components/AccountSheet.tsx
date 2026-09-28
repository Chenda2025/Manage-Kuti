import { type FormEvent, useEffect, useRef, useState } from 'react'
import {
  Camera,
  ChevronRight,
  Eye,
  EyeOff,
  ImagePlus,
  LockKeyhole,
  LogOut,
  Trash2,
  UserRound,
} from 'lucide-react'
import { apiRequest } from '../lib/api'
import { useAuth } from '../lib/auth'
import { displayName } from '../lib/format'
import { roleMeta } from '../lib/roles'
import { useToast } from '../lib/toast'
import type { AuthUser } from '../lib/types'
import { Field, inputClass } from './Field'
import { ProfilePhoto } from './ProfilePhoto'
import { Sheet } from './Sheet'

type Panel = 'menu' | 'name' | 'password'

type Props = {
  open: boolean
  onClose: () => void
  onSignOut: () => void
}

export function AccountSheet({ open, onClose, onSignOut }: Props) {
  const user = useAuth((s) => s.user)
  const token = useAuth((s) => s.token)
  const setUser = useAuth((s) => s.setUser)
  const toast = useToast((s) => s.push)
  const fileRef = useRef<HTMLInputElement>(null)
  const [panel, setPanel] = useState<Panel>('menu')
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)

  useEffect(() => {
    if (!open) {
      setPanel('menu')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      return
    }
    setName(user?.display_name || '')
  }, [open, user?.display_name])

  const label = displayName(user)

  async function onPick(file?: File | null) {
    if (!file || !token || !user) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('avatar', file)
      const next = await apiRequest<AuthUser>('/api/me/avatar', { method: 'POST', token, body: form })
      setUser({ ...user, ...next })
      toast('បានផ្ទុករូបភាព')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'មិនអាចផ្ទុករូបភាពបានទេ', 'error')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function removePhoto() {
    if (!token || !user?.avatar_url) return
    setUploading(true)
    try {
      const next = await apiRequest<AuthUser>('/api/me/avatar', { method: 'DELETE', token })
      setUser({ ...user, ...next, avatar_url: null })
      toast('បានលុបរូបភាព')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'មិនអាចលុបរូបភាពបានទេ', 'error')
    } finally {
      setUploading(false)
    }
  }

  async function saveName(e: FormEvent) {
    e.preventDefault()
    if (!token || !user) return
    setBusy(true)
    try {
      const next = await apiRequest<AuthUser>('/api/me', { method: 'PATCH', token, body: { display_name: name } })
      setUser({ ...user, ...next })
      toast('បានរក្សាទុកឈ្មោះ')
      setPanel('menu')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'មិនអាចរក្សាទុកឈ្មោះបានទេ', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault()
    if (!token) return
    if (newPassword !== confirmPassword) {
      toast('លេខសម្ងាត់ថ្មីមិនដូចគ្នា', 'error')
      return
    }
    setBusy(true)
    try {
      await apiRequest('/api/me/password', {
        method: 'POST',
        token,
        body: { current_password: currentPassword, new_password: newPassword },
      })
      toast('បានប្តូរលេខសម្ងាត់')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPanel('menu')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'មិនអាចប្តូរលេខសម្ងាត់បានទេ', 'error')
    } finally {
      setBusy(false)
    }
  }

  const titles: Record<Panel, string> = {
    menu: 'គណនី',
    name: user?.display_name ? 'កែឈ្មោះ' : 'បន្ថែមឈ្មោះ',
    password: 'ប្តូរលេខសម្ងាត់',
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => void onPick(e.target.files?.[0])}
      />

      <Sheet open={open} title={titles[panel]} onClose={onClose}>
        {panel === 'menu' ? (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-[24px] bg-maroon px-5 py-6 text-center text-cream">
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                className="mx-auto block disabled:opacity-60"
                aria-label="ផ្ទុករូបភាព"
              >
                <ProfilePhoto name={label} src={user?.avatar_url} size={96} badge />
              </button>
              <p className="mt-4 truncate font-title text-[18px] leading-[1.8] text-gold">{label}</p>
              <p className="mt-1 truncate text-[13px] text-cream/75">@{user?.username}</p>
              <span className="mt-3 inline-flex rounded-full border border-gold/40 bg-black/20 px-3 py-1 text-[12px] font-bold text-gold">
                {roleMeta(user?.role).label}
              </span>
            </div>

            <div className="overflow-hidden rounded-[22px] border border-line bg-paper">
              <MenuRow
                icon={user?.avatar_url ? Camera : ImagePlus}
                label={user?.avatar_url ? 'ប្តូររូបភាព' : 'ផ្ទុករូបភាព'}
                hint="Add photo"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              />
              <MenuRow
                icon={UserRound}
                label={user?.display_name ? 'កែឈ្មោះ' : 'បន្ថែមឈ្មោះ'}
                hint="Add name"
                onClick={() => setPanel('name')}
              />
              <MenuRow
                icon={LockKeyhole}
                label="ប្តូរលេខសម្ងាត់"
                hint="Change password"
                last
                onClick={() => setPanel('password')}
              />
            </div>

            {user?.avatar_url ? (
              <button
                type="button"
                disabled={uploading}
                onClick={() => void removePhoto()}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-cream py-3 font-bold text-muted disabled:opacity-60"
              >
                <Trash2 size={16} />
                លុបរូបភាព
              </button>
            ) : null}

            <button
              type="button"
              onClick={onSignOut}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-maroon py-3 font-bold text-white"
            >
              <LogOut size={16} />
              ចេញពីគណនី
            </button>
          </div>
        ) : null}

        {panel === 'name' ? (
          <form onSubmit={(e) => void saveName(e)} className="space-y-4">
            <Field label="ឈ្មោះពេញ" hint="ឈ្មោះនេះនឹងបង្ហាញនៅលើគណនី">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                placeholder="បញ្ចូលឈ្មោះ"
                required
                maxLength={80}
              />
            </Field>
            <button
              type="button"
              onClick={() => setPanel('menu')}
              className="w-full rounded-2xl bg-cream py-3 font-bold text-muted"
            >
              ត្រឡប់
            </button>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-2xl bg-saffron py-3 font-bold text-white disabled:opacity-60"
            >
              {busy ? 'កំពុងរក្សាទុក...' : 'រក្សាទុក'}
            </button>
          </form>
        ) : null}

        {panel === 'password' ? (
          <form onSubmit={(e) => void savePassword(e)} className="space-y-4">
            <Field label="លេខសម្ងាត់បច្ចុប្បន្ន">
              <span className="flex items-center gap-2">
                <input
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  type={showCurrent ? 'text' : 'password'}
                  className={inputClass}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((v) => !v)}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cream text-muted"
                  aria-label={showCurrent ? 'លាក់លេខសម្ងាត់' : 'បង្ហាញលេខសម្ងាត់'}
                >
                  {showCurrent ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </Field>
            <Field label="លេខសម្ងាត់ថ្មី" hint="យ៉ាងតិច ៦ តួ">
              <span className="flex items-center gap-2">
                <input
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  type={showNew ? 'text' : 'password'}
                  className={inputClass}
                  autoComplete="new-password"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cream text-muted"
                  aria-label={showNew ? 'លាក់លេខសម្ងាត់' : 'បង្ហាញលេខសម្ងាត់'}
                >
                  {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </Field>
            <Field label="បញ្ជាក់លេខសម្ងាត់ថ្មី">
              <input
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                type={showNew ? 'text' : 'password'}
                className={inputClass}
                autoComplete="new-password"
                required
                minLength={6}
              />
            </Field>
            <button
              type="button"
              onClick={() => setPanel('menu')}
              className="w-full rounded-2xl bg-cream py-3 font-bold text-muted"
            >
              ត្រឡប់
            </button>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-2xl bg-saffron py-3 font-bold text-white disabled:opacity-60"
            >
              {busy ? 'កំពុងរក្សាទុក...' : 'ប្តូរលេខសម្ងាត់'}
            </button>
          </form>
        ) : null}
      </Sheet>
    </>
  )
}

function MenuRow({
  icon: Icon,
  label,
  hint,
  onClick,
  disabled,
  last,
}: {
  icon: typeof Camera
  label: string
  hint: string
  onClick: () => void
  disabled?: boolean
  last?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3.5 text-left disabled:opacity-60 ${
        last ? '' : 'border-b border-line'
      }`}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#fff1d6] text-saffron">
        <Icon size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-ink">{label}</span>
        <span className="block text-[12px] text-muted">{hint}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-muted" />
    </button>
  )
}
