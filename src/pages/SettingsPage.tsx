import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bell,
  DoorOpen,
  FileText,
  KeyRound,
  LayoutList,
  Pencil,
  Plus,
  Send,
  Trash2,
  UserMinus,
  UserPlus,
  Loader2,
  Eye,
  EyeOff,
  CheckSquare,
} from 'lucide-react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Field, inputClass } from '../components/Field'
import { KhmerTimePicker } from '../components/KhmerTimePicker'
import { SearchBar } from '../components/SearchBar'
import { SearchableSelect } from '../components/SearchableSelect'
import { Sheet } from '../components/Sheet'
import { Spinner } from '../components/Spinner'
import { apiRequest } from '../lib/api'
import { useAuth } from '../lib/auth'
import { fullName, monkLabel } from '../lib/format'
import { hasPermission } from '../lib/roles'
import { useToast } from '../lib/toast'
import type { AppSettings, Kuti, Resident, Room } from '../lib/types'
import { useApiList } from '../lib/useApiList'

const TABS = [
  { id: 'rooms', label: 'បន្ទប់', Icon: DoorOpen },
  { id: 'types', label: 'ប្រភេទវត្តមាន', Icon: LayoutList },
  { id: 'telegram', label: 'Telegram', Icon: Send },
  { id: 'kuti_api', label: 'API កុដិ', Icon: KeyRound },
  { id: 'formats', label: 'ទម្រង់សារ', Icon: FileText },
  { id: 'reminders', label: 'ម៉ោងរំលឹក', Icon: Bell },
] as const

type TabId = (typeof TABS)[number]['id']

type RoomForm = { room_name: string; manager_name: string }

export function SettingsPage() {
  const token = useAuth((s) => s.token)
  const user = useAuth((s) => s.user)
  const canAssign = hasPermission(user?.role, 'residents.assign')
  const toast = useToast((s) => s.push)
  const [tab, setTab] = useState<TabId>('rooms')
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [formatType, setFormatType] = useState('study')
  const [formatShowDaily, setFormatShowDaily] = useState(false)
  const [formatShowReport, setFormatShowReport] = useState(false)
  const [formatEditDaily, setFormatEditDaily] = useState(false)
  const [formatEditReport, setFormatEditReport] = useState(false)
  const [newLabel, setNewLabel] = useState('')

  const kutis = useApiList<Kuti>('/api/core/kutis')
  const residents = useApiList<Resident>('/api/students/list')
  const home = kutis.data[0]
  const homeId = home?.token_linked ? home.id : null
  const rooms = useApiList<Room>(homeId ? `/api/core/kutis/${homeId}/rooms` : null)

  const [roomForm, setRoomForm] = useState<RoomForm>({ room_name: '', manager_name: '' })
  const [editingRoom, setEditingRoom] = useState<Room | null>(null)
  const [roomBusy, setRoomBusy] = useState(false)
  const [removeRoomId, setRemoveRoomId] = useState<number | null>(null)
  const [assignRoom, setAssignRoom] = useState<Room | null>(null)
  const [assignQuery, setAssignQuery] = useState('')
  const [assignBusyId, setAssignBusyId] = useState<number | null>(null)
  const tabBtnRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({})

  const typeItems = settings?.attendance_types?.items || []

  const roomMemberCounts = useMemo(() => {
    const map = new Map<number, number>()
    for (const monk of residents.data) {
      if (monk.status === 'dropped' || !monk.room_id) continue
      if (homeId && monk.kuti != null && monk.kuti !== homeId) continue
      map.set(monk.room_id, (map.get(monk.room_id) || 0) + 1)
    }
    return map
  }, [residents.data, homeId])

  const assignRoomMembers = useMemo(() => {
    if (!assignRoom) return [] as Resident[]
    return residents.data.filter(
      (monk) =>
        monk.status !== 'dropped' &&
        monk.room_id === assignRoom.id &&
        (!homeId || monk.kuti == null || monk.kuti === homeId),
    )
  }, [assignRoom, residents.data, homeId])

  const assignCandidates = useMemo(() => {
    if (!assignRoom) return [] as Resident[]
    const q = assignQuery.trim().toLowerCase()
    return residents.data
      .filter((monk) => monk.status !== 'dropped')
      // Only monks not yet assigned to any room
      .filter((monk) => !monk.room_id)
      .filter((monk) => {
        if (!q) return true
        const name = fullName(monk.last_name, monk.first_name).toLowerCase()
        const code = (monk.student_code || '').toLowerCase()
        return name.includes(q) || code.includes(q)
      })
      .slice(0, 40)
  }, [assignRoom, residents.data, assignQuery])

  useEffect(() => {
    const btn = tabBtnRefs.current[tab]
    btn?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [tab])

  useEffect(() => {
    setFormatShowDaily(false)
    setFormatShowReport(false)
    setFormatEditDaily(false)
    setFormatEditReport(false)
  }, [formatType])

  const managerOptions = residents.data
    .filter((item) => item.status !== 'dropped')
    .map((monk) => {
      const name = fullName(monk.last_name, monk.first_name)
      return { value: name, label: `${name} · ${monkLabel(monk.monk_status)}` }
    })
  const managerSelectOptions =
    roomForm.manager_name && !managerOptions.some((item) => item.value === roomForm.manager_name)
      ? [{ value: roomForm.manager_name, label: roomForm.manager_name }, ...managerOptions]
      : managerOptions

  function startEditRoom(room: Room) {
    setEditingRoom(room)
    setRoomForm({ room_name: room.room_name, manager_name: room.manager_name })
  }

  function resetRoomForm() {
    setEditingRoom(null)
    setRoomForm({ room_name: '', manager_name: '' })
  }

  function openAssignRoom(room: Room) {
    setAssignRoom(room)
    setAssignQuery('')
  }

  function closeAssignRoom() {
    if (assignBusyId !== null) return
    setAssignRoom(null)
    setAssignQuery('')
  }

  async function assignMonkToRoom(monk: Resident, roomId: number | null) {
    if (!canAssign || !homeId) {
      toast('គ្មានសិទ្ធិចាត់តាំង', 'error')
      return
    }
    if (assignBusyId !== null) return
    setAssignBusyId(monk.id)
    try {
      const body: { kuti?: number; room_id: number | null } = { room_id: roomId }
      // Only set kuti when joining this home — room changes are local and must not
      // re-sync Pagoda (that caused "ចំនួនវស្សាមិនត្រឹមត្រូវ").
      if (monk.kuti !== homeId) body.kuti = homeId
      const updated = await apiRequest<Resident>(`/api/students/list/${monk.id}`, {
        method: 'PATCH',
        token,
        body,
      })
      residents.setData((prev) =>
        prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
      )
      toast(
        roomId
          ? `បានដាក់ ${fullName(monk.last_name, monk.first_name)} ចូលបន្ទប់`
          : `បានដក ${fullName(monk.last_name, monk.first_name)} ចេញពីបន្ទប់`,
      )
    } catch (err) {
      toast(err instanceof Error ? err.message : 'ចាត់តាំងមិនបាន', 'error')
    } finally {
      setAssignBusyId(null)
    }
  }

  async function saveRoom(e: FormEvent) {
    e.preventDefault()
    if (!homeId) return
    setRoomBusy(true)
    try {
      const payload = {
        room_name: roomForm.room_name.trim(),
        manager_name: roomForm.manager_name.trim(),
      }
      if (editingRoom) {
        await apiRequest(`/api/core/rooms/${editingRoom.id}`, {
          method: 'PATCH',
          token,
          body: payload,
        })
        toast('បានកែបន្ទប់')
      } else {
        await apiRequest(`/api/core/kutis/${homeId}/rooms`, {
          method: 'POST',
          token,
          body: payload,
        })
        toast('បានបង្កើតបន្ទប់')
      }
      resetRoomForm()
      await rooms.reload()
      await kutis.reload()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'មិនអាចរក្សាទុកបានទេ', 'error')
    } finally {
      setRoomBusy(false)
    }
  }

  async function removeRoom() {
    if (!removeRoomId) return
    try {
      await apiRequest(`/api/core/rooms/${removeRoomId}`, { method: 'DELETE', token })
      toast('បានលុបបន្ទប់')
      if (editingRoom?.id === removeRoomId) resetRoomForm()
      setRemoveRoomId(null)
      await rooms.reload()
      await kutis.reload()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'មិនអាចលុបបានទេ', 'error')
    }
  }

  async function load() {
    setLoading(true)
    try {
      const data = await apiRequest<AppSettings>('/api/settings', { token })
      if (!data.attendance_types) data.attendance_types = { items: [] }
      setSettings(data)
      const first = data.attendance_types.items[0]?.key
      if (first) setFormatType(first)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'មិនអាចផ្ទុកការកំណត់', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function saveKey<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSaving(true)
    try {
      const next = await apiRequest<AppSettings[K]>(`/api/settings/${key}`, {
        method: 'PUT',
        token,
        body: value,
      })
      setSettings((prev) => (prev ? { ...prev, [key]: next } : prev))
      toast('បានរក្សាទុក')
      return next
    } catch (err) {
      toast(err instanceof Error ? err.message : 'រក្សាទុកមិនបាន', 'error')
      throw err
    } finally {
      setSaving(false)
    }
  }

  async function testTelegram() {
    setTesting(true)
    try {
      if (settings) await saveKey('telegram', settings.telegram)
      await apiRequest('/api/settings/telegram/test', { method: 'POST', token })
      toast('បានផ្ញើសារសាកល្បង')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'សាកល្បងមិនបាន', 'error')
    } finally {
      setTesting(false)
    }
  }

  async function sendReminderNow(type: string) {
    try {
      await apiRequest('/api/attendance/reminder/send', {
        method: 'POST',
        token,
        body: { type },
      })
      toast('បានផ្ញើរំលឹក Telegram')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'ផ្ញើរំលឹកមិនបាន', 'error')
    }
  }

  async function addType() {
    if (!settings || !newLabel.trim() || saving) return
    const label = newLabel.trim()
    const key = `type_${Date.now().toString(36)}`
    const items = [...typeItems, { key, label, enabled: true }]
    const payload = { items }
    setSettings({ ...settings, attendance_types: payload })
    setNewLabel('')
    setFormatType(key)
    try {
      await saveKey('attendance_types', payload)
    } catch {
      // keep local draft; user can press save again
    }
  }

  async function saveTypes() {
    if (!settings) return
    await saveKey('attendance_types', {
      items: typeItems
        .map((item) => ({
          key: item.key.trim(),
          label: item.label.trim(),
          enabled: item.enabled !== false,
        }))
        .filter((item) => item.key && item.label),
    })
  }

  if (loading || !settings || kutis.loading || (homeId && rooms.loading)) return <Spinner />

  return (
    <div className="rise space-y-4">
      <section className="rounded-[22px] border border-line bg-paper px-4 py-3.5 shadow-[inset_3px_0_0_0_var(--color-saffron)]">
        <h1 className="font-title text-[18px] text-maroon">ការកំណត់</h1>
        <p className="mt-0.5 text-[12px] text-muted">
          {TABS.find((item) => item.id === tab)?.label}
        </p>
      </section>

      <div className="rounded-[20px] border border-line bg-paper p-1.5 shadow-[0_1px_0_rgba(42,26,18,0.04)]">
        <div
          className="no-scrollbar flex gap-1 overflow-x-auto scroll-smooth"
          role="tablist"
          aria-label="ផ្ទាំងការកំណត់"
        >
          {TABS.map((item) => {
            const active = tab === item.id
            const Icon = item.Icon
            return (
              <button
                key={item.id}
                ref={(node) => {
                  tabBtnRefs.current[item.id] = node
                }}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(item.id)}
                className={`settings-tab flex shrink-0 items-center gap-1.5 rounded-[14px] px-3.5 py-2.5 text-[12px] font-bold ${
                  active
                    ? 'bg-saffron text-white shadow-sm'
                    : 'bg-transparent text-muted hover:bg-cream hover:text-ink'
                }`}
              >
                <Icon size={14} strokeWidth={2.25} className="shrink-0 opacity-90" />
                {item.label}
              </button>
            )
          })}
        </div>
      </div>

      <div key={tab} className="settings-panel">
      {tab === 'rooms' ? (
        <section className="overflow-hidden rounded-[24px] border border-line bg-paper">
          {!homeId ? (
            <div className="px-4 py-8 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-cream text-saffron">
                <DoorOpen size={22} />
              </div>
              <p className="text-sm font-bold text-ink">មិនទាន់ភ្ជាប់កុដិ</p>
              <p className="mt-1 text-xs text-muted">
                បញ្ចូល Token នៅផ្ទាំង «API កុដិ» ជាមុនសិន
              </p>
              <button
                type="button"
                onClick={() => setTab('kuti_api')}
                className="settings-press mt-4 rounded-2xl bg-saffron px-4 py-2.5 text-sm font-bold text-white"
              >
                ទៅ API កុដិ
              </button>
            </div>
          ) : (
            <>
              <div className="border-b border-line bg-[linear-gradient(135deg,#fffdf8_0%,#f6efe4_100%)] px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold tracking-wide text-muted">កុដិភ្ជាប់</p>
                    <h2 className="mt-0.5 truncate font-title text-[17px] leading-[1.5] text-maroon">
                      {home?.kuti_name}
                    </h2>
                    <p className="mt-0.5 text-[12px] text-muted">
                      មេកុដិ៖ {home?.manager_name || '—'}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-saffron/10 px-2.5 py-1 text-[11px] font-bold text-saffron">
                    {rooms.data.length} បន្ទប់
                  </span>
                </div>
              </div>

              <div className="space-y-4 p-4">
                <form
                  onSubmit={saveRoom}
                  className="space-y-3 rounded-[18px] border border-line bg-cream/70 p-3.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-saffron/10 text-saffron">
                      {editingRoom ? <Pencil size={15} /> : <Plus size={15} />}
                    </span>
                    <p className="text-sm font-bold text-maroon">
                      {editingRoom ? 'កែបន្ទប់' : 'បង្កើតបន្ទប់ថ្មី'}
                    </p>
                  </div>
                  <Field label="ឈ្មោះបន្ទប់">
                    <input
                      className={inputClass}
                      value={roomForm.room_name}
                      onChange={(e) => setRoomForm({ ...roomForm, room_name: e.target.value })}
                      placeholder="ឧ. បន្ទប់ទី១"
                      required
                    />
                  </Field>
                  <div className="block">
                    <span className="mb-1.5 block text-sm font-bold text-muted">អ្នកគ្រប់គ្រងបន្ទប់</span>
                    <SearchableSelect
                      value={roomForm.manager_name}
                      onChange={(manager_name) => setRoomForm({ ...roomForm, manager_name })}
                      options={managerSelectOptions}
                      placeholder="ជ្រើសរើសឈ្មោះព្រះសង្ឃ"
                      searchPlaceholder="ស្វែងរកឈ្មោះព្រះសង្ឃ..."
                      visibleCount={5}
                    />
                  </div>
                  <div className="flex gap-2 pt-0.5">
                    {editingRoom ? (
                      <button
                        type="button"
                        onClick={resetRoomForm}
                        className="settings-press flex-1 rounded-2xl bg-paper py-3 text-sm font-bold text-muted"
                      >
                        បោះបង់
                      </button>
                    ) : null}
                    <button
                      type="submit"
                      disabled={roomBusy || !roomForm.room_name.trim()}
                      className="settings-press flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-saffron py-3 text-sm font-bold text-white disabled:opacity-50"
                    >
                      {editingRoom ? null : <Plus size={16} />}
                      {roomBusy ? 'កំពុងរក្សាទុក...' : editingRoom ? 'រក្សាទុក' : 'បង្កើត'}
                    </button>
                  </div>
                </form>

                {rooms.data.length === 0 ? (
                  <div className="rounded-[18px] border border-dashed border-line px-4 py-8 text-center">
                    <DoorOpen size={22} className="mx-auto text-muted/70" />
                    <p className="mt-2 text-sm font-bold text-ink">មិនទាន់មានបន្ទប់</p>
                    <p className="mt-1 text-xs text-muted">បំពេញទម្រង់ខាងលើដើម្បីបង្កើត</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[11px] font-bold text-muted">បញ្ជីបន្ទប់</p>
                    {rooms.data.map((room, index) => (
                      <div
                        key={room.id}
                        className={`settings-room-row flex items-center gap-3 rounded-[18px] border border-line bg-cream/50 px-3 py-3 ${
                          editingRoom?.id === room.id ? 'border-saffron bg-saffron/5' : ''
                        }`}
                        style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-paper font-title text-sm text-saffron">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-bold">{room.room_name}</p>
                          <p className="truncate text-xs text-muted">
                            {room.manager_name || 'មិនទាន់មានអ្នកគ្រប់គ្រង'}
                            {' · '}
                            {roomMemberCounts.get(room.id) || 0} អង្គ
                          </p>
                        </div>
                        {canAssign ? (
                          <button
                            type="button"
                            onClick={() => openAssignRoom(room)}
                            className="settings-press flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-saffron/10 text-saffron"
                            aria-label="ចាត់តាំងព្រះសង្ឃ"
                            title="ចាត់តាំងព្រះសង្ឃ"
                          >
                            <UserPlus size={15} />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => startEditRoom(room)}
                          className="settings-press flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-paper text-maroon"
                          aria-label="កែបន្ទប់"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setRemoveRoomId(room.id)}
                          className="settings-press flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#fde8e6] text-danger"
                          aria-label="លុបបន្ទប់"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <Link
                  to={`/kutis/${homeId}`}
                  className="settings-press flex items-center justify-center gap-1 rounded-2xl bg-maroon/5 py-3 text-sm font-bold text-maroon"
                >
                  មើលកុដិ
                  <span aria-hidden>→</span>
                </Link>
              </div>
            </>
          )}
        </section>
      ) : null}

      {tab === 'types' ? (
        <section className="space-y-3 rounded-[24px] border border-line bg-paper p-4">
          <p className="text-xs text-muted">
            បន្ថែមរួចរក្សាទុកភ្លាមៗ · កែឈ្មោះ / បិទ បន្ទាប់មកចុច «រក្សាទុកប្រភេទ»
          </p>
          <div className="space-y-2">
            {typeItems.map((item, index) => (
              <div key={item.key} className="flex items-center gap-2 rounded-2xl bg-cream px-3 py-2.5">
                <input
                  className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-saffron"
                  value={item.label}
                  onChange={(e) => {
                    const items = typeItems.map((row, i) =>
                      i === index ? { ...row, label: e.target.value } : row,
                    )
                    setSettings({ ...settings, attendance_types: { items } })
                  }}
                />
                <label className="flex shrink-0 items-center gap-1.5 text-xs font-bold">
                  <input
                    type="checkbox"
                    checked={item.enabled}
                    onChange={(e) => {
                      const items = typeItems.map((row, i) =>
                        i === index ? { ...row, enabled: e.target.checked } : row,
                      )
                      setSettings({ ...settings, attendance_types: { items } })
                    }}
                  />
                  បើក
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const items = typeItems.filter((_, i) => i !== index)
                    setSettings({ ...settings, attendance_types: { items } })
                    if (formatType === item.key) setFormatType(items[0]?.key || '')
                  }}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#fde8e6] text-danger"
                  aria-label="លុប"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className={inputClass}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="ឈ្មោះប្រភេទថ្មី..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void addType()
                }
              }}
            />
            <button
              type="button"
              onClick={() => void addType()}
              disabled={saving || !newLabel.trim()}
              className="inline-flex shrink-0 items-center gap-1 rounded-2xl bg-saffron px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              <Plus size={16} />
              បន្ថែម
            </button>
          </div>
          <button
            type="button"
            disabled={saving || typeItems.length === 0}
            onClick={() => void saveTypes()}
            className="rounded-2xl bg-maroon px-4 py-3 text-sm font-bold text-cream disabled:opacity-60"
          >
            {saving ? 'កំពុងរក្សាទុក...' : 'រក្សាទុកប្រភេទ'}
          </button>
        </section>
      ) : null}

      {tab === 'telegram' ? (
        <section className="space-y-3 rounded-[24px] border border-line bg-paper p-4">
          <label className="flex items-center gap-2 text-sm font-bold">
            <input
              type="checkbox"
              checked={settings.telegram.enabled}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  telegram: { ...settings.telegram, enabled: e.target.checked },
                })
              }
            />
            បើកផ្ញើ Telegram
          </label>
          <Field label="Bot Token">
            <input
              className={inputClass}
              value={settings.telegram.bot_token}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  telegram: { ...settings.telegram, bot_token: e.target.value },
                })
              }
              placeholder="123456:ABC..."
            />
          </Field>
          <Field label="Chat / Channel ID">
            <input
              className={inputClass}
              value={settings.telegram.chat_id}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  telegram: { ...settings.telegram, chat_id: e.target.value },
                })
              }
              placeholder="-100..."
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveKey('telegram', settings.telegram)}
              className="rounded-2xl bg-maroon px-4 py-3 text-sm font-bold text-cream disabled:opacity-60"
            >
              រក្សាទុក
            </button>
            <button
              type="button"
              disabled={testing}
              onClick={() => void testTelegram()}
              className="inline-flex items-center gap-1.5 rounded-2xl bg-saffron px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              <Send size={15} />
              សាកល្បងផ្ញើ
            </button>
          </div>
        </section>
      ) : null}

      {tab === 'kuti_api' ? (
        <section className="space-y-3 rounded-[24px] border border-line bg-paper p-4">
          <Field label="Pagoda Base URL">
            <input
              className={inputClass}
              value={settings.kuti_api.base_url}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  kuti_api: { ...settings.kuti_api, base_url: e.target.value },
                })
              }
              placeholder="https://..."
            />
          </Field>
          <Field label="Token កុដិ">
            <input
              className={inputClass}
              value={settings.kuti_api.token || ''}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  kuti_api: { ...settings.kuti_api, token: e.target.value },
                })
              }
              placeholder="i9b5ePqnsuk… ឬ kuti/i9b5ePqnsuk…"
            />
          </Field>
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveKey('kuti_api', settings.kuti_api)}
            className="rounded-2xl bg-maroon px-4 py-3 text-sm font-bold text-cream disabled:opacity-60"
          >
            រក្សាទុក
          </button>
        </section>
      ) : null}

      {tab === 'formats' ? (
        <section className="space-y-3 rounded-[24px] border border-line bg-paper p-4">
          {typeItems.length === 0 ? (
            <p className="text-sm text-muted">សូមបន្ថែមប្រភេទវត្តមានជាមុន</p>
          ) : (
            <>
              <div>
                <p className="mb-2 text-sm font-bold text-muted">ប្រភេទវត្តមាន</p>
                <div className="overflow-hidden rounded-2xl border border-line">
                  {typeItems.map((item, index) => {
                    const selected = formatType === item.key
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setFormatType(item.key)}
                        className={`flex w-full items-center gap-3 px-3.5 py-3 text-left text-sm font-bold transition-colors ${
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
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {selected ? (
                          <span className="shrink-0 text-[11px] font-bold text-saffron">កំពុងកែ</span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 text-sm font-bold text-muted">
                    ទម្រង់ប្រចាំថ្ងៃ ·{' '}
                    {typeItems.find((item) => item.key === formatType)?.label || formatType}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setFormatShowDaily((v) => !v)
                      if (formatShowDaily) setFormatEditDaily(false)
                    }}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      formatShowDaily ? 'bg-saffron text-white' : 'bg-cream text-muted'
                    }`}
                    aria-label={formatShowDaily ? 'លាក់ទម្រង់' : 'មើលទម្រង់'}
                    title={formatShowDaily ? 'លាក់ទម្រង់' : 'មើលទម្រង់'}
                  >
                    {formatShowDaily ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                  <label
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-bold ${
                      formatEditDaily ? 'bg-saffron text-white' : 'bg-cream text-muted'
                    } ${!formatShowDaily ? 'pointer-events-none opacity-40' : ''}`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={formatEditDaily}
                      disabled={!formatShowDaily}
                      onChange={(e) => setFormatEditDaily(e.target.checked)}
                    />
                    <CheckSquare size={14} />
                    កែ
                  </label>
                </div>
                {formatShowDaily ? (
                  <textarea
                    className={`${inputClass} min-h-36 font-mono text-sm ${
                      formatEditDaily ? '' : 'cursor-default bg-cream/60 text-ink/80'
                    }`}
                    value={settings.attendance_text_formats.daily[formatType] || ''}
                    readOnly={!formatEditDaily}
                    onChange={(e) => {
                      if (!formatEditDaily) return
                      setSettings({
                        ...settings,
                        attendance_text_formats: {
                          ...settings.attendance_text_formats,
                          daily: {
                            ...settings.attendance_text_formats.daily,
                            [formatType]: e.target.value,
                          },
                        },
                      })
                    }}
                  />
                ) : (
                  <p className="rounded-2xl border border-dashed border-line bg-cream/40 px-3 py-3 text-xs text-muted">
                    ចុចរូបភ្នែកដើម្បីមើល · ធីក «កែ» ដើម្បីកែសម្រួល
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 text-sm font-bold text-muted">
                    ទម្រង់របាយការណ៍ ·{' '}
                    {typeItems.find((item) => item.key === formatType)?.label || formatType}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setFormatShowReport((v) => !v)
                      if (formatShowReport) setFormatEditReport(false)
                    }}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      formatShowReport ? 'bg-saffron text-white' : 'bg-cream text-muted'
                    }`}
                    aria-label={formatShowReport ? 'លាក់ទម្រង់' : 'មើលទម្រង់'}
                    title={formatShowReport ? 'លាក់ទម្រង់' : 'មើលទម្រង់'}
                  >
                    {formatShowReport ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                  <label
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-bold ${
                      formatEditReport ? 'bg-saffron text-white' : 'bg-cream text-muted'
                    } ${!formatShowReport ? 'pointer-events-none opacity-40' : ''}`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={formatEditReport}
                      disabled={!formatShowReport}
                      onChange={(e) => setFormatEditReport(e.target.checked)}
                    />
                    <CheckSquare size={14} />
                    កែ
                  </label>
                </div>
                {formatShowReport ? (
                  <textarea
                    className={`${inputClass} min-h-28 font-mono text-sm ${
                      formatEditReport ? '' : 'cursor-default bg-cream/60 text-ink/80'
                    }`}
                    value={settings.attendance_text_formats.report[formatType] || ''}
                    readOnly={!formatEditReport}
                    onChange={(e) => {
                      if (!formatEditReport) return
                      setSettings({
                        ...settings,
                        attendance_text_formats: {
                          ...settings.attendance_text_formats,
                          report: {
                            ...settings.attendance_text_formats.report,
                            [formatType]: e.target.value,
                          },
                        },
                      })
                    }}
                  />
                ) : (
                  <p className="rounded-2xl border border-dashed border-line bg-cream/40 px-3 py-3 text-xs text-muted">
                    ចុចរូបភ្នែកដើម្បីមើល · ធីក «កែ» ដើម្បីកែសម្រួល
                  </p>
                )}
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveKey('attendance_text_formats', settings.attendance_text_formats)}
                className="rounded-2xl bg-maroon px-4 py-3 text-sm font-bold text-cream disabled:opacity-60"
              >
                រក្សាទុកទម្រង់
              </button>
            </>
          )}
        </section>
      ) : null}

      {tab === 'reminders' ? (
        <section className="space-y-3 rounded-[24px] border border-line bg-paper p-4">
          <Field label="តំបន់ម៉ោង">
            <input
              className={inputClass}
              value={settings.attendance_reminders.timezone}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  attendance_reminders: {
                    ...settings.attendance_reminders,
                    timezone: e.target.value,
                  },
                })
              }
            />
          </Field>
          {typeItems.map((typeDef) => {
            const item =
              settings.attendance_reminders.items.find((row) => row.type === typeDef.key) || {
                type: typeDef.key,
                time: '07:00',
                enabled: false,
              }
            return (
              <div key={typeDef.key} className="rounded-2xl border border-line bg-cream/50 p-3">
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-bold text-maroon">{typeDef.label}</p>
                  <label
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold ${
                      item.enabled ? 'bg-saffron text-white' : 'bg-paper text-muted'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={item.enabled}
                      onChange={(e) => {
                        const items = settings.attendance_reminders.items.filter(
                          (row) => row.type !== typeDef.key,
                        )
                        items.push({ ...item, enabled: e.target.checked })
                        setSettings({
                          ...settings,
                          attendance_reminders: { ...settings.attendance_reminders, items },
                        })
                      }}
                    />
                    {item.enabled ? 'បើក' : 'បិទ'}
                  </label>
                </div>
                <KhmerTimePicker
                  value={item.time}
                  onChange={(time) => {
                    const items = settings.attendance_reminders.items.filter(
                      (row) => row.type !== typeDef.key,
                    )
                    items.push({ ...item, time })
                    setSettings({
                      ...settings,
                      attendance_reminders: { ...settings.attendance_reminders, items },
                    })
                  }}
                />
                <button
                  type="button"
                  onClick={() => void sendReminderNow(typeDef.key)}
                  className="mt-2.5 w-full rounded-2xl bg-saffron px-3 py-2.5 text-xs font-bold text-white"
                >
                  ផ្ញើឥឡូវ
                </button>
              </div>
            )
          })}
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveKey('attendance_reminders', settings.attendance_reminders)}
            className="rounded-2xl bg-maroon px-4 py-3 text-sm font-bold text-cream disabled:opacity-60"
          >
            រក្សាទុកម៉ោងរំលឹក
          </button>
        </section>
      ) : null}
      </div>

      <Sheet
        open={assignRoom !== null}
        title={assignRoom ? `ចាត់តាំង · ${assignRoom.room_name}` : 'ចាត់តាំង'}
        subtitle="ជ្រើសព្រះសង្ឃដើម្បីដាក់ចូលបន្ទប់នេះ"
        onClose={closeAssignRoom}
      >
        <div className="space-y-4">
          <section className="space-y-2">
            <p className="text-[11px] font-bold text-muted">
              ក្នុងបន្ទប់ · {assignRoomMembers.length} អង្គ
            </p>
            {assignRoomMembers.length === 0 ? (
              <p className="rounded-2xl bg-cream px-3 py-4 text-sm text-muted">មិនទាន់មានព្រះសង្ឃក្នុងបន្ទប់</p>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
                {assignRoomMembers.map((monk) => {
                  const busy = assignBusyId === monk.id
                  const locked = assignBusyId !== null && !busy
                  return (
                    <li
                      key={monk.id}
                      className={`flex items-center gap-3 bg-paper px-3 py-2.5 ${
                        busy ? 'bg-saffron/5' : locked ? 'opacity-50' : ''
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-ink">
                          {fullName(monk.last_name, monk.first_name)}
                        </p>
                        <p className="truncate text-[11px] text-muted">
                          {busy ? 'កំពុងដកចេញ...' : monkLabel(monk.monk_status)}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={assignBusyId !== null}
                        onClick={() => void assignMonkToRoom(monk, null)}
                        className="settings-press flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#fde8e6] text-danger disabled:opacity-50"
                        aria-label="ដកចេញពីបន្ទប់"
                      >
                        {busy ? <Loader2 size={15} className="animate-spin" /> : <UserMinus size={15} />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <p className="text-[11px] font-bold text-muted">បន្ថែមព្រះសង្ឃ · មិនទាន់បន្ទប់</p>
            <SearchBar
              value={assignQuery}
              onChange={setAssignQuery}
              placeholder="ស្វែងរកឈ្មោះ ឬកូដ"
            />
            {assignCandidates.length === 0 ? (
              <p className="rounded-2xl bg-cream px-3 py-4 text-sm text-muted">
                មិនមានព្រះសង្ឃដែលមិនទាន់បន្ទប់
              </p>
            ) : (
              <ul className="max-h-[40dvh] divide-y divide-line overflow-y-auto rounded-2xl border border-line">
                {assignCandidates.map((monk) => {
                  const busy = assignBusyId === monk.id
                  const locked = assignBusyId !== null && !busy
                  return (
                    <li
                      key={monk.id}
                      className={`flex items-center gap-3 bg-paper px-3 py-2.5 ${
                        busy ? 'bg-saffron/5' : locked ? 'opacity-50' : ''
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-ink">
                          {fullName(monk.last_name, monk.first_name)}
                        </p>
                        <p className="truncate text-[11px] text-muted">
                          {busy ? 'កំពុងដាក់ចូល...' : monkLabel(monk.monk_status)}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={assignBusyId !== null || !assignRoom}
                        onClick={() => assignRoom && void assignMonkToRoom(monk, assignRoom.id)}
                        className="settings-press flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-saffron/10 text-saffron disabled:opacity-50"
                        aria-label="ដាក់ចូលបន្ទប់"
                      >
                        {busy ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      </Sheet>

      <ConfirmDialog
        open={removeRoomId !== null}
        title="លុបបន្ទប់"
        message="តើអ្នកពិតជាចង់លុបបន្ទប់នេះមែនទេ?"
        confirmLabel="លុប"
        danger
        onClose={() => setRemoveRoomId(null)}
        onConfirm={() => void removeRoom()}
      />
    </div>
  )
}
