import { type FormEvent, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ShieldPlus, Users } from 'lucide-react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyState } from '../components/EmptyState'
import { Field, inputClass } from '../components/Field'
import { RoleBadge } from '../components/RoleBadge'
import { SearchBar } from '../components/SearchBar'
import { Sheet } from '../components/Sheet'
import { Spinner } from '../components/Spinner'
import { apiRequest } from '../lib/api'
import { useAuth } from '../lib/auth'
import {
  DEFAULT_MANAGER_PAGES,
  MANAGER_PAGES,
  ROLE_ORDER,
  ROLES,
  hasPermission,
  normalizeManagedAttendanceTypes,
  normalizeManagedPages,
  normalizeRole,
  roleMeta,
} from '../lib/roles'
import { useToast } from '../lib/toast'
import type { Account, AppPageKey, Role } from '../lib/types'
import { useApiList } from '../lib/useApiList'
import { useAttendanceTypes } from '../lib/useAttendanceTypes'

type FormState = {
  username: string
  password: string
  role: Role
  is_active: boolean
  managed_pages: AppPageKey[]
  managed_attendance_types: string[]
}

const emptyForm: FormState = {
  username: '',
  password: '',
  role: 'manager',
  is_active: true,
  managed_pages: [...DEFAULT_MANAGER_PAGES],
  managed_attendance_types: [],
}

export function UsersPage() {
  const current = useAuth((s) => s.user)
  const token = useAuth((s) => s.token)
  const canManage = hasPermission(current?.role, 'users.manage')
  const accounts = useApiList<Account>('/api/users/users')
  const attendanceTypes = useAttendanceTypes(true, false)
  const toast = useToast((s) => s.push)
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [busy, setBusy] = useState(false)
  const [removeId, setRemoveId] = useState<number | null>(null)
  const [pagesOpen, setPagesOpen] = useState(false)

  const filtered = useMemo(() => {
    return accounts.data.filter((item) => {
      if (roleFilter !== 'all' && normalizeRole(item.role) !== roleFilter) return false
      return item.username.toLowerCase().includes(query.trim().toLowerCase())
    })
  }, [accounts.data, query, roleFilter])

  const pageSummary = useMemo(() => {
    if (form.managed_pages.length === MANAGER_PAGES.length) return 'ទំព័រទាំងអស់'
    if (form.managed_pages.length === 0) return 'មិនទាន់ជ្រើស'
    return form.managed_pages
      .map((key) => MANAGER_PAGES.find((p) => p.key === key)?.label || key)
      .join(' · ')
  }, [form.managed_pages])

  const allAttendanceKeys = useMemo(
    () => attendanceTypes.data.filter((t) => t.enabled !== false).map((t) => t.key),
    [attendanceTypes.data],
  )

  function startCreate() {
    setEditing(null)
    setForm({
      ...emptyForm,
      managed_attendance_types: allAttendanceKeys,
    })
    setPagesOpen(false)
    setOpen(true)
  }

  function startEdit(account: Account) {
    setEditing(account)
    const pages = normalizeManagedPages(account.managed_pages)
    const attTypes = normalizeManagedAttendanceTypes(account.managed_attendance_types)
    setForm({
      username: account.username,
      password: '',
      role: normalizeRole(account.role),
      is_active: account.is_active,
      managed_pages: pages,
      managed_attendance_types:
        pages.includes('attendance') && attTypes.length === 0 ? allAttendanceKeys : attTypes,
    })
    setPagesOpen(false)
    setOpen(true)
  }

  function togglePage(key: AppPageKey) {
    setForm((prev) => {
      const has = prev.managed_pages.includes(key)
      const nextPages = has
        ? prev.managed_pages.filter((item) => item !== key)
        : [...prev.managed_pages, key]
      let nextAtt = prev.managed_attendance_types
      if (key === 'attendance') {
        nextAtt = has ? [] : allAttendanceKeys.length ? allAttendanceKeys : nextAtt
      }
      return { ...prev, managed_pages: nextPages, managed_attendance_types: nextAtt }
    })
  }

  function toggleAttendanceType(key: string) {
    setForm((prev) => {
      const has = prev.managed_attendance_types.includes(key)
      const next = has
        ? prev.managed_attendance_types.filter((item) => item !== key)
        : [...prev.managed_attendance_types, key]
      return { ...prev, managed_attendance_types: next }
    })
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (form.role === 'manager' && form.managed_pages.length === 0) {
      toast('សូមជ្រើសទំព័រយ៉ាងហោចណាស់មួយ', 'error')
      return
    }
    if (
      form.role === 'manager' &&
      form.managed_pages.includes('attendance') &&
      form.managed_attendance_types.length === 0
    ) {
      toast('សូមជ្រើសប្រភេទវត្តមានយ៉ាងហោចណាស់មួយ', 'error')
      return
    }
    setBusy(true)
    try {
      const managed_pages = form.role === 'manager' ? form.managed_pages : []
      const managed_attendance_types =
        form.role === 'manager' && managed_pages.includes('attendance')
          ? form.managed_attendance_types
          : []
      if (editing) {
        await apiRequest(`/api/users/users/${editing.id}`, {
          method: 'PUT',
          token,
          body: {
            role: form.role,
            password: form.password,
            is_active: form.is_active,
            managed_pages,
            managed_attendance_types,
          },
        })
        toast('បានកែគណនី និងតួនាទី')
      } else {
        await apiRequest('/api/users/users', {
          method: 'POST',
          token,
          body: {
            username: form.username.trim(),
            password: form.password,
            role: form.role,
            is_active: form.is_active,
            managed_pages,
            managed_attendance_types,
          },
        })
        toast('បានបង្កើតគណនីថ្មី')
      }
      setOpen(false)
      await accounts.reload()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'មិនអាចរក្សាទុកបានទេ', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!removeId) return
    try {
      await apiRequest(`/api/users/users/${removeId}`, { method: 'DELETE', token })
      toast('បានលុបគណនី')
      setRemoveId(null)
      await accounts.reload()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'មិនអាចលុបបានទេ', 'error')
    }
  }

  if (accounts.loading) return <Spinner />

  return (
    <div className="rise space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-title text-xl text-maroon">អ្នកប្រើ និងតួនាទី</h1>
          <p className="text-sm text-muted">មានតែរដ្ឋបាលទើបអាចបង្កើតគណនី និងកំណត់សិទ្ធិ</p>
          <Link to="/roles" className="mt-1 inline-block text-sm font-bold text-saffron">
            មើលតារាងសិទ្ធិ
          </Link>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={startCreate}
            className="flex items-center gap-2 rounded-2xl bg-saffron px-4 py-3 font-bold text-white"
          >
            <ShieldPlus size={18} />
            បន្ថែម
          </button>
        ) : null}
      </div>

      <SearchBar value={query} onChange={setQuery} placeholder="ស្វែងរកឈ្មោះគណនី" />
      <select className={inputClass} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
        <option value="all">តួនាទីទាំងអស់</option>
        {ROLE_ORDER.map((role) => (
          <option key={role} value={role}>
            {ROLES[role].label}
          </option>
        ))}
      </select>

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="មិនមានគណនី" />
      ) : (
        <div className="space-y-2">
          {filtered.map((account) => (
            <button
              key={account.id}
              type="button"
              onClick={() => canManage && startEdit(account)}
              className="flex w-full items-center justify-between gap-3 rounded-[22px] border border-line bg-paper p-4 text-left"
            >
              <div className="min-w-0">
                <p className="font-bold">{account.username}</p>
                <p className="text-xs text-muted">
                  {account.is_active ? 'កំពុងប្រើ' : 'បានបិទ'}
                  {account.id === current?.id ? ' · គណនីអ្នក' : ''}
                </p>
                {normalizeRole(account.role) === 'manager' ? (
                  <p className="mt-1 truncate text-[11px] font-bold text-saffron">
                    {normalizeManagedPages(account.managed_pages)
                      .map((key) => {
                        const label = MANAGER_PAGES.find((p) => p.key === key)?.label || key
                        if (key !== 'attendance') return label
                        const att = normalizeManagedAttendanceTypes(account.managed_attendance_types)
                        if (!att.length) return label
                        const attLabels = att
                          .map(
                            (t) =>
                              attendanceTypes.data.find((item) => item.key === t)?.label || t,
                          )
                          .join(', ')
                        return `${label} (${attLabels})`
                      })
                      .join(' · ')}
                  </p>
                ) : null}
              </div>
              <RoleBadge role={account.role} />
            </button>
          ))}
        </div>
      )}

      <Sheet open={open} title={editing ? 'កែគណនី និងតួនាទី' : 'បង្កើតគណនីថ្មី'} onClose={() => setOpen(false)}>
        <form onSubmit={save} className="space-y-4">
          <Field label="ឈ្មោះគណនី">
            <input
              className={inputClass}
              value={form.username}
              disabled={Boolean(editing)}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
            />
          </Field>
          <Field label="តួនាទី" hint={roleMeta(form.role).description}>
            <select
              className={inputClass}
              value={form.role}
              onChange={(e) => {
                const role = e.target.value as Role
                setForm({
                  ...form,
                  role,
                  managed_pages:
                    role === 'manager'
                      ? form.managed_pages.length
                        ? form.managed_pages
                        : [...DEFAULT_MANAGER_PAGES]
                      : form.managed_pages,
                  managed_attendance_types:
                    role === 'manager'
                      ? form.managed_attendance_types.length
                        ? form.managed_attendance_types
                        : allAttendanceKeys
                      : [],
                })
                setPagesOpen(role === 'manager')
              }}
            >
              {ROLE_ORDER.map((role) => (
                <option key={role} value={role}>
                  {ROLES[role].label} ({ROLES[role].labelEn})
                </option>
              ))}
            </select>
          </Field>

          {form.role === 'manager' ? (
            <div>
              <p className="mb-1.5 text-sm font-bold text-muted">ទំព័រដែលគ្រប់គ្រង</p>
              <button
                type="button"
                onClick={() => setPagesOpen((v) => !v)}
                className={`${inputClass} flex items-center justify-between gap-2 text-left`}
              >
                <span className="min-w-0 truncate text-sm font-bold">{pageSummary}</span>
                <ChevronDown
                  size={16}
                  className={`shrink-0 text-muted transition-transform ${pagesOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {pagesOpen ? (
                <div className="mt-2 overflow-hidden rounded-2xl border border-line">
                  {MANAGER_PAGES.map((page, index) => {
                    const checked = form.managed_pages.includes(page.key)
                    return (
                      <div key={page.key} className={index > 0 ? 'border-t border-line' : ''}>
                        <label
                          className={`flex cursor-pointer items-center gap-3 px-3.5 py-3 ${
                            checked ? 'bg-[#fff8ec]' : 'bg-paper'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-[var(--color-saffron)]"
                            checked={checked}
                            onChange={() => togglePage(page.key)}
                          />
                          <span className="text-sm font-bold text-ink">{page.label}</span>
                        </label>
                        {page.key === 'attendance' && checked ? (
                          <div className="space-y-1 border-t border-line/70 bg-cream/40 px-3 py-2.5">
                            <p className="px-1 text-[11px] font-bold text-muted">ប្រភេទវត្តមាន</p>
                            {attendanceTypes.loading ? (
                              <p className="px-1 py-1 text-xs text-muted">កំពុងផ្ទុក...</p>
                            ) : attendanceTypes.data.length === 0 ? (
                              <p className="px-1 py-1 text-xs text-muted">មិនទាន់មានប្រភេទ</p>
                            ) : (
                              attendanceTypes.data.map((item) => {
                                const on = form.managed_attendance_types.includes(item.key)
                                return (
                                  <label
                                    key={item.key}
                                    className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 ${
                                      on ? 'bg-[#fff8ec]' : 'bg-transparent'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      className="h-3.5 w-3.5 accent-[var(--color-saffron)]"
                                      checked={on}
                                      onChange={() => toggleAttendanceType(item.key)}
                                    />
                                    <span className="text-xs font-bold text-ink">{item.label}</span>
                                  </label>
                                )
                              })
                            )}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          <Field label={editing ? 'លេខសម្ងាត់ថ្មី (ទុកចោលបើមិនប្តូរ)' : 'លេខសម្ងាត់'}>
            <input
              className={inputClass}
              type="password"
              value={form.password}
              required={!editing}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>
          <label className="flex items-center justify-between rounded-2xl bg-cream px-4 py-3">
            <span className="font-bold">គណនីសកម្ម</span>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="h-5 w-5"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            {editing && editing.id !== current?.id ? (
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  setRemoveId(editing.id)
                }}
                className="rounded-2xl bg-red-50 py-3 font-bold text-danger"
              >
                លុប
              </button>
            ) : (
              <button type="button" onClick={() => setOpen(false)} className="rounded-2xl bg-cream py-3 font-bold">
                បោះបង់
              </button>
            )}
            <button type="submit" disabled={busy} className="rounded-2xl bg-saffron py-3 font-bold text-white">
              {busy ? 'កំពុងរក្សាទុក...' : 'រក្សាទុក'}
            </button>
          </div>
        </form>
      </Sheet>

      <ConfirmDialog
        open={removeId !== null}
        title="លុបគណនី"
        message="គណនីនេះនឹងលុបចេញពីប្រព័ន្ធ។ សកម្មភាពនេះមិនអាចត្រឡប់វិញបានទេ។"
        confirmLabel="លុប"
        danger
        onClose={() => setRemoveId(null)}
        onConfirm={() => void remove()}
      />
    </div>
  )
}
