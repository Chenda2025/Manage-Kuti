import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, ChevronDown, ChevronUp, Clock, FileText, List, Pencil, Plus, Send, Trash2, Users, X } from 'lucide-react'
import { DatePicker } from '../components/DatePicker'
import { Field, inputClass } from '../components/Field'
import { SearchBar } from '../components/SearchBar'
import { Sheet } from '../components/Sheet'
import { Spinner } from '../components/Spinner'
import { apiRequest } from '../lib/api'
import {
  BON_PARTY_TYPE_KEY,
  composeHHMMFromKhmerParts,
  encodeBonPartyNote,
  EXCUSE_PERIOD_LABELS,
  formatBonPartyAssign,
  labelForType,
  parseBonPartyNote,
  pickDutyGroup,
  resolveSalaChanShift,
  resolveWorshipMealShift,
  SALA_CHAN_TYPE_KEY,
  splitHHMMToKhmerParts,
  toKhmerClockDigits,
  type AttendanceType,
  type ExcusePeriod,
} from '../lib/attendance'
import { uiForAttendanceType, excusePeriodLabelForType, shouldClearExcuseActionIcon } from '../lib/attendanceTypeUi'
import { useAuth } from '../lib/auth'
import { hasPermission } from '../lib/roles'
import { useToast } from '../lib/toast'
import type { AttendanceDayRow } from '../lib/types'
import { useAttendanceTypes } from '../lib/useAttendanceTypes'

type AttendanceGroup = {
  id: number
  attendance_type: string
  name: string
  sort_order: number
  member_count: number
  member_ids: number[]
}

const SAVE_COOLDOWN_MS = 2 * 60 * 1000
const SEND_COOLDOWN_MS = 3 * 60 * 1000

type OptionListKind = 'multi' | 'reason' | 'party_place' | 'party_kind'

function multiDayOptionsStorageKey(type: string, kind: OptionListKind = 'multi') {
  if (kind === 'reason') return `kuti_excuse_reason_options:${type}`
  if (kind === 'party_place') return `kuti_party_place_options:${type}`
  if (kind === 'party_kind') return `kuti_party_kind_options:${type}`
  return `kuti_excuse_multi_options:${type}`
}

function loadMultiDayOptions(
  type: string,
  defaults: string[],
  kind: OptionListKind = 'multi',
) {
  try {
    const raw = localStorage.getItem(multiDayOptionsStorageKey(type, kind))
    if (!raw) return [...defaults]
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return [...defaults]
    const cleaned = parsed
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
    return cleaned.length > 0 ? cleaned : [...defaults]
  } catch {
    return [...defaults]
  }
}

function saveMultiDayOptions(
  type: string,
  options: string[],
  kind: OptionListKind = 'multi',
) {
  try {
    localStorage.setItem(multiDayOptionsStorageKey(type, kind), JSON.stringify(options))
  } catch {
    // ignore quota / private mode
  }
}

function todayIso() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Phnom_Penh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const get = (type: string) => parts.find((p) => p.type === type)?.value || ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function nowTimeHHMM() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Phnom_Penh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  const hour = parts.find((p) => p.type === 'hour')?.value || '00'
  const minute = parts.find((p) => p.type === 'minute')?.value || '00'
  return `${hour}:${minute}`
}

function parsePartyKinds(kind: string | null | undefined): string[] {
  if (!kind?.trim()) return []
  return kind
    .split(/\s*[·,|]\s*/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function joinPartyKinds(kinds: string[]): string {
  return kinds.map((item) => item.trim()).filter(Boolean).join(' · ')
}

function formatRemain(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function cooldownStorageKey(
  kind: 'save' | 'send' | 'ready' | 'clearAt' | 'cleared',
  type: string,
  date: string,
) {
  return `attendance:${kind}:${type}:${date}`
}

function readCooldownUntil(kind: 'save' | 'send', type: string, date: string) {
  try {
    const raw = localStorage.getItem(cooldownStorageKey(kind, type, date))
    const until = raw ? Number(raw) : 0
    return Number.isFinite(until) ? until : 0
  } catch {
    return 0
  }
}

function writeCooldownUntil(kind: 'save' | 'send', type: string, date: string, until: number) {
  try {
    localStorage.setItem(cooldownStorageKey(kind, type, date), String(until))
  } catch {
    /* ignore */
  }
}

function readClearAt(type: string, date: string) {
  try {
    const raw = localStorage.getItem(cooldownStorageKey('clearAt', type, date))
    const at = raw ? Number(raw) : 0
    return Number.isFinite(at) ? at : 0
  } catch {
    return 0
  }
}

function writeClearAt(type: string, date: string, at: number) {
  try {
    const key = cooldownStorageKey('clearAt', type, date)
    if (at > 0) localStorage.setItem(key, String(at))
    else localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

function readActionsCleared(type: string, date: string) {
  try {
    return localStorage.getItem(cooldownStorageKey('cleared', type, date)) === '1'
  } catch {
    return false
  }
}

function writeActionsCleared(type: string, date: string, cleared: boolean) {
  try {
    const key = cooldownStorageKey('cleared', type, date)
    if (cleared) localStorage.setItem(key, '1')
    else localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

function readSendReady(type: string, date: string) {
  try {
    return localStorage.getItem(cooldownStorageKey('ready', type, date)) === '1'
  } catch {
    return false
  }
}

function writeSendReady(type: string, date: string, ready: boolean) {
  try {
    const key = cooldownStorageKey('ready', type, date)
    if (ready) localStorage.setItem(key, '1')
    else localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

export function AttendanceMarkPage() {
  const { type: typeParam = '' } = useParams()
  const navigate = useNavigate()
  const user = useAuth((s) => s.user)
  const token = useAuth((s) => s.token)
  const canManage = hasPermission(user?.role, 'attendance.manage')
  const types = useAttendanceTypes()
  const toast = useToast((s) => s.push)

  const [date, setDate] = useState(todayIso)
  const [rows, setRows] = useState<AttendanceDayRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [preview, setPreview] = useState('')
  const [savedPreview, setSavedPreview] = useState('')
  const [canSend, setCanSend] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [saveCooldownUntil, setSaveCooldownUntil] = useState(0)
  const [sendCooldownUntil, setSendCooldownUntil] = useState(0)
  const [excuseFor, setExcuseFor] = useState<AttendanceDayRow | null>(null)
  const [excusePeriod, setExcusePeriod] = useState<ExcusePeriod>('morning')
  const [excuseFrom, setExcuseFrom] = useState(todayIso)
  const [excuseTo, setExcuseTo] = useState(todayIso)
  const [excuseReason, setExcuseReason] = useState('')
  const [excuseBusy, setExcuseBusy] = useState(false)
  const [excuseMultiOptions, setExcuseMultiOptions] = useState<string[]>([])
  const [excuseMultiSelected, setExcuseMultiSelected] = useState('')
  const [excuseMultiDraft, setExcuseMultiDraft] = useState('')
  const [excuseMultiManageOpen, setExcuseMultiManageOpen] = useState(false)
  const [excuseMultiEditIndex, setExcuseMultiEditIndex] = useState<number | null>(null)
  const [excuseMultiEditDraft, setExcuseMultiEditDraft] = useState('')
  const [partyFor, setPartyFor] = useState<AttendanceDayRow | null>(null)
  const [partyTime, setPartyTime] = useState(nowTimeHHMM)
  const [partyPlace, setPartyPlace] = useState('')
  const [partyKinds, setPartyKinds] = useState<string[]>([])
  const [partyPlaceOptions, setPartyPlaceOptions] = useState<string[]>([])
  const [partyKindOptions, setPartyKindOptions] = useState<string[]>([])
  const [partyManageKind, setPartyManageKind] = useState<'place' | 'kind' | null>(null)
  const [partyDraft, setPartyDraft] = useState('')
  const [partyEditIndex, setPartyEditIndex] = useState<number | null>(null)
  const [partyEditDraft, setPartyEditDraft] = useState('')
  const [partyTripCounts, setPartyTripCounts] = useState<Record<string, number>>({})
  /** Absents/excuses kept in DB for reports after UI icons were cleared */
  const [preservedAbsentIds, setPreservedAbsentIds] = useState<number[]>([])
  const [preservedExcusedIds, setPreservedExcusedIds] = useState<number[]>([])
  const [preservedPartyIds, setPreservedPartyIds] = useState<number[]>([])
  const [clearActionsAt, setClearActionsAt] = useState(0)
  const [actionsCleared, setActionsCleared] = useState(false)
  const [groups, setGroups] = useState<AttendanceGroup[]>([])
  const [groupsOpen, setGroupsOpen] = useState(false)
  const [groupsBusy, setGroupsBusy] = useState(false)
  const [assignGroup, setAssignGroup] = useState<AttendanceGroup | null>(null)
  const [assignIds, setAssignIds] = useState<number[]>([])
  const [assignSearch, setAssignSearch] = useState('')
  const [assignBusy, setAssignBusy] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [renameGroupId, setRenameGroupId] = useState<number | null>(null)
  const [renameGroupName, setRenameGroupName] = useState('')

  const valid = !types.loading && types.data.some((item) => item.key === typeParam)
  const type = (valid ? typeParam : types.data[0]?.key || '') as AttendanceType
  const typeLabel = labelForType(types.data, type)
  const typeUi = uiForAttendanceType(type, typeLabel)

  useEffect(() => {
    const syncToday = () => {
      const next = todayIso()
      setDate((prev) => (prev === next ? prev : next))
    }
    syncToday()
    const id = window.setInterval(syncToday, 60_000)
    window.addEventListener('focus', syncToday)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', syncToday)
    }
  }, [])

  useEffect(() => {
    if (!valid || !type) return
    setSaveCooldownUntil(readCooldownUntil('save', type, date))
    setSendCooldownUntil(readCooldownUntil('send', type, date))
    setCanSend(readSendReady(type, date))
    const clearAt = readClearAt(type, date)
    setClearActionsAt(clearAt)
    setActionsCleared(readActionsCleared(type, date))
    try {
      // Live {shift} types — never restore a stale snapped study template
      if (type === 'worship_meal' || type === SALA_CHAN_TYPE_KEY) {
        try {
          localStorage.removeItem(`attendance:preview:${type}:${date}`)
        } catch {
          // ignore
        }
        setSavedPreview('')
      } else {
        const snap = localStorage.getItem(`attendance:preview:${type}:${date}`)
        if (snap) {
          setSavedPreview(snap)
          setPreview((prev) => prev || snap)
        } else {
          setSavedPreview('')
        }
      }
    } catch {
      setSavedPreview('')
    }
  }, [type, date, valid])

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!valid || loading || actionsCleared || !clearActionsAt) return
    const delayMs = typeUi.clearActionsDelayMs
    if (delayMs == null || delayMs <= 0) return

    const fireClear = () => {
      setRows((prev) => {
        const absentIds = prev
          .filter((row) => row.status === 'absent')
          .map((row) => row.resident_id)
        const excusedIds = prev
          .filter((row) => shouldClearExcuseActionIcon(typeUi, row))
          .map((row) => row.resident_id)
        const partyIds = typeUi.clearPartyAssignActions
          ? prev
              .filter((row) => Boolean(parseBonPartyNote(row.note)))
              .map((row) => row.resident_id)
          : []
        const clearAbsentOrExcuse = (row: AttendanceDayRow) =>
          row.status === 'absent' || shouldClearExcuseActionIcon(typeUi, row)
        const clearParty = (row: AttendanceDayRow) =>
          typeUi.clearPartyAssignActions && Boolean(parseBonPartyNote(row.note))
        const next = prev.map((row) => {
          if (clearAbsentOrExcuse(row)) {
            return {
              ...row,
              status: 'present' as const,
              note: null,
              excuse_period: null,
              excuse_from: null,
              excuse_to: null,
              excuse_days: null,
              excuse_remaining: null,
            }
          }
          if (clearParty(row)) {
            return { ...row, note: null }
          }
          return row
        })
        queueMicrotask(() => {
          setPreservedAbsentIds(absentIds)
          setPreservedExcusedIds(excusedIds)
          setPreservedPartyIds(partyIds)
          setActionsCleared(true)
          writeActionsCleared(type, date, true)
          writeClearAt(type, date, 0)
          setClearActionsAt(0)
          if (absentIds.length || excusedIds.length || partyIds.length) {
            toast(
              partyIds.length && !absentIds.length && !excusedIds.length
                ? 'បានសម្អាតរូបតំណាងចាត់លោកទៅបុណ្យ'
                : typeUi.clearActionsKeepMultiDayExcused
                  ? 'បានសម្អាតរូបតំណាងអវត្តមាន និងសូមច្បាប់ថ្ងៃនេះ'
                  : 'បានសម្អាតរូបតំណាងអវត្តមាន និងសូមច្បាប់',
            )
          }
        })
        return next
      })
    }

    const remaining = clearActionsAt - Date.now()
    if (remaining <= 0) {
      fireClear()
      return
    }
    const id = window.setTimeout(fireClear, remaining)
    return () => window.clearTimeout(id)
  }, [
    actionsCleared,
    clearActionsAt,
    date,
    loading,
    toast,
    type,
    typeUi.clearActionsDelayMs,
    typeUi.clearActionsIncludeExcused,
    typeUi.clearActionsKeepMultiDayExcused,
    typeUi.clearPartyAssignActions,
    valid,
  ])

  const saveRemainMs = Math.max(0, saveCooldownUntil - now)
  const sendRemainMs = Math.max(0, sendCooldownUntil - now)
  const clearRemainMs = Math.max(0, clearActionsAt - now)
  const saveLocked = saveRemainMs > 0
  const sendLocked = sendRemainMs > 0
  const showClearCountdown =
    Boolean(typeUi.clearActionsDelayMs && typeUi.clearActionsDelayMs > 0) &&
    clearActionsAt > 0 &&
    clearRemainMs > 0 &&
    !actionsCleared

  async function loadPartyTripCounts() {
    if (!token || type !== BON_PARTY_TYPE_KEY || !typeUi.showPartyAssignAction) {
      setPartyTripCounts({})
      return
    }
    try {
      const data = await apiRequest<{
        counts: Record<string, number>
      }>(`/api/attendance/party-counts?type=${encodeURIComponent(type)}&date=${encodeURIComponent(date)}`, {
        token,
      })
      setPartyTripCounts(data.counts || {})
    } catch {
      /* keep previous counts */
    }
  }

  async function load() {
    if (!valid || !token) return
    setLoading(true)
    try {
      const data = await apiRequest<{ rows: AttendanceDayRow[] }>(
        `/api/attendance/day?type=${type}&date=${date}`,
        { token },
      )
      const alreadyCleared = readActionsCleared(type, date)
      const clearAt = readClearAt(type, date)
      const shouldClearNow =
        alreadyCleared ||
        (Boolean(typeUi.clearActionsDelayMs && typeUi.clearActionsDelayMs > 0) &&
          clearAt > 0 &&
          clearAt <= Date.now())

      if (shouldClearNow) {
        const absentIds = data.rows
          .filter((row) => row.status === 'absent')
          .map((row) => row.resident_id)
        const excusedIds = data.rows
          .filter((row) => shouldClearExcuseActionIcon(typeUi, row))
          .map((row) => row.resident_id)
        const partyIds = typeUi.clearPartyAssignActions
          ? data.rows
              .filter((row) => Boolean(parseBonPartyNote(row.note)))
              .map((row) => row.resident_id)
          : []
        setPreservedAbsentIds(absentIds)
        setPreservedExcusedIds(excusedIds)
        setPreservedPartyIds(partyIds)
        setRows(
          data.rows.map((row) => {
            if (row.status === 'absent' || shouldClearExcuseActionIcon(typeUi, row)) {
              return {
                ...row,
                status: 'present' as const,
                note: null,
                excuse_period: null,
                excuse_from: null,
                excuse_to: null,
                excuse_days: null,
                excuse_remaining: null,
              }
            }
            if (typeUi.clearPartyAssignActions && parseBonPartyNote(row.note)) {
              return { ...row, note: null }
            }
            return row
          }),
        )
        setActionsCleared(true)
        writeActionsCleared(type, date, true)
        writeClearAt(type, date, 0)
        setClearActionsAt(0)
      } else {
        setRows(data.rows)
        setPreservedAbsentIds([])
        setPreservedExcusedIds([])
        setPreservedPartyIds([])
      }
      let snap = ''
      try {
        // Fresh preview for group-send types and shift-based templates
        if (!typeUi.sendWithoutSave && type !== 'worship_meal' && type !== SALA_CHAN_TYPE_KEY) {
          snap = localStorage.getItem(`attendance:preview:${type}:${date}`) || ''
        }
      } catch {
        snap = ''
      }
      if (snap) {
        setSavedPreview(snap)
        setPreview(snap)
      } else {
        const text = await apiRequest<{ text: string }>(
          `/api/attendance/preview?type=${type}&date=${date}`,
          { token },
        )
        setPreview(text.text)
        setSavedPreview(text.text)
        if (type === 'worship_meal' || type === SALA_CHAN_TYPE_KEY) {
          try {
            localStorage.setItem(`attendance:preview:${type}:${date}`, text.text)
          } catch {
            // ignore
          }
        }
        if (typeUi.sendWithoutSave) {
          setCanSend(true)
          writeSendReady(type, date, true)
        }
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'មិនអាចផ្ទុកបានទេ', 'error')
    } finally {
      setLoading(false)
      void loadPartyTripCounts()
    }
  }

  useEffect(() => {
    void load()
    void loadGroups()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, date, token, valid])

  const counts = useMemo(() => {
    const present = rows.filter((r) => !r.status || r.status === 'present').length
    const absent = rows.filter((r) => r.status === 'absent').length
    const excused = rows.filter((r) => r.status === 'excused').length
    return { present, absent, excused }
  }, [rows])

  const partyTripMeta = useMemo(() => {
    if (!typeUi.showPartyAssignAction || rows.length === 0) {
      return {
        min: 0,
        max: 0,
        hasVariation: false,
        leastNames: [] as string[],
        leastIds: new Set<number>(),
      }
    }
    const values = rows.map((r) => partyTripCounts[String(r.resident_id)] ?? 0)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const hasVariation = max > min
    const leastRows = hasVariation
      ? rows.filter((r) => (partyTripCounts[String(r.resident_id)] ?? 0) === min)
      : []
    return {
      min,
      max,
      hasVariation,
      leastNames: leastRows.map((r) => `${r.last_name} ${r.first_name}`.trim()),
      leastIds: new Set(leastRows.map((r) => r.resident_id)),
    }
  }, [rows, partyTripCounts, typeUi.showPartyAssignAction])

  const groupedSections = useMemo(() => {
    if (!typeUi.markGrouped) return null
    const byId = new Map(rows.map((r) => [r.resident_id, r]))
    const duty = typeUi.groupDutyRotate ? pickDutyGroup(groups, date) : null
    const sections: Array<{
      key: string
      title: string
      sort: number
      rows: AttendanceDayRow[]
      isDuty: boolean
    }> = []
    for (const group of groups) {
      const members = group.member_ids
        .map((id) => byId.get(id))
        .filter((row): row is AttendanceDayRow => Boolean(row))
      sections.push({
        key: `g-${group.id}`,
        title: group.name,
        sort: group.sort_order,
        rows: members,
        isDuty: Boolean(duty && duty.id === group.id),
      })
    }
    const assigned = new Set(groups.flatMap((g) => g.member_ids))
    const unassigned = rows.filter((r) => !assigned.has(r.resident_id))
    if (unassigned.length > 0 || groups.length === 0) {
      sections.push({
        key: 'unassigned',
        title: groups.length === 0 ? 'មិនទាន់មានក្រុម' : 'មិនទាន់ចាត់ក្រុម',
        sort: 9999,
        rows: unassigned,
        isDuty: false,
      })
    }
    return sections.sort((a, b) => a.sort - b.sort)
  }, [date, groups, rows, typeUi.groupDutyRotate, typeUi.markGrouped])

  const assignCandidates = useMemo(() => {
    if (!assignGroup) return []
    const takenElse = new Set(
      groups.filter((g) => g.id !== assignGroup.id).flatMap((g) => g.member_ids),
    )
    const q = assignSearch.trim().toLowerCase()
    return rows.filter((r) => {
      if (takenElse.has(r.resident_id)) return false
      if (!q) return true
      const name = `${r.last_name} ${r.first_name}`.toLowerCase()
      return name.includes(q)
    })
  }, [assignGroup, assignSearch, groups, rows])

  async function loadGroups() {
    if (!valid || !token || !typeUi.markGrouped) {
      setGroups([])
      return
    }
    try {
      const data = await apiRequest<{ groups: AttendanceGroup[] }>(
        `/api/attendance/groups?type=${encodeURIComponent(type)}`,
        { token },
      )
      setGroups(data.groups)
    } catch {
      setGroups([])
    }
  }

  async function createGroup() {
    if (!canManage || groupsBusy) return
    const name = newGroupName.trim()
    if (typeUi.groupCreateNamed && !name) {
      toast('សូមបញ្ចូលឈ្មោះក្រុម', 'error')
      return
    }
    setGroupsBusy(true)
    try {
      await apiRequest('/api/attendance/groups', {
        method: 'POST',
        token,
        body: { type, name: name || null },
      })
      setNewGroupName('')
      await loadGroups()
      toast('បានបង្កើតក្រុម')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'បង្កើតក្រុមមិនបាន', 'error')
    } finally {
      setGroupsBusy(false)
    }
  }

  async function removeGroup(group: AttendanceGroup) {
    if (!canManage || groupsBusy) return
    if (!window.confirm(`លុប${group.name}?`)) return
    setGroupsBusy(true)
    try {
      await apiRequest(`/api/attendance/groups/${group.id}`, { method: 'DELETE', token })
      if (renameGroupId === group.id) {
        setRenameGroupId(null)
        setRenameGroupName('')
      }
      await loadGroups()
      await load()
      toast('បានលុបក្រុម')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'លុបក្រុមមិនបាន', 'error')
    } finally {
      setGroupsBusy(false)
    }
  }

  function startRename(group: AttendanceGroup) {
    setRenameGroupId(group.id)
    setRenameGroupName(group.name)
  }

  function cancelRename() {
    setRenameGroupId(null)
    setRenameGroupName('')
  }

  async function saveRename() {
    if (!canManage || groupsBusy || renameGroupId == null) return
    const name = renameGroupName.trim()
    if (!name) {
      toast('សូមបញ្ចូលឈ្មោះក្រុម', 'error')
      return
    }
    setGroupsBusy(true)
    try {
      await apiRequest(`/api/attendance/groups/${renameGroupId}`, {
        method: 'PATCH',
        token,
        body: { name },
      })
      setRenameGroupId(null)
      setRenameGroupName('')
      await loadGroups()
      await load()
      toast('បានប្តូរឈ្មោះក្រុម')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'ប្តូរឈ្មោះមិនបាន', 'error')
    } finally {
      setGroupsBusy(false)
    }
  }

  function openAssign(group: AttendanceGroup) {
    setAssignGroup(group)
    setAssignIds([...group.member_ids])
    setAssignSearch('')
  }

  function toggleAssign(residentId: number) {
    setAssignIds((prev) =>
      prev.includes(residentId) ? prev.filter((id) => id !== residentId) : [...prev, residentId],
    )
  }

  async function saveAssign() {
    if (!assignGroup || !canManage || assignBusy) return
    setAssignBusy(true)
    try {
      const data = await apiRequest<{ groups: AttendanceGroup[] }>(
        `/api/attendance/groups/${assignGroup.id}/members`,
        {
          method: 'PUT',
          token,
          body: { type, resident_ids: assignIds },
        },
      )
      setGroups(data.groups)
      setAssignGroup(null)
      setAssignSearch('')
      await load()
      toast('បានចាត់ក្រុម')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'ចាត់ក្រុមមិនបាន', 'error')
    } finally {
      setAssignBusy(false)
    }
  }

  const excuseDayCount = useMemo(() => {
    if (!excuseFrom || !excuseTo) return 1
    const from = excuseFrom <= excuseTo ? excuseFrom : excuseTo
    const to = excuseFrom <= excuseTo ? excuseTo : excuseFrom
    const ms =
      new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()
    return Math.max(1, Math.round(ms / 86_400_000) + 1)
  }, [excuseFrom, excuseTo])

  const excuseUseMultiDropdown =
    typeUi.excuseMultiDayDropdown && typeUi.excuseShowDateRange && excuseDayCount > 1
  const excusePeriodLocked =
    typeUi.excuseDisablePeriodWhenMultiDay &&
    typeUi.excuseShowDateRange &&
    excuseDayCount > 1
  const partyTimeParts = splitHHMMToKhmerParts(partyTime)

  useEffect(() => {
    if (!excuseFor) return
    const lockPeriod =
      (typeUi.excuseMultiDayDropdown || typeUi.excuseDisablePeriodWhenMultiDay) &&
      excuseDayCount > 1
    if (lockPeriod) {
      setExcusePeriod('day')
      if (typeUi.excuseMultiDayDropdown) {
        setExcuseMultiSelected((prev) => prev || excuseMultiOptions[0] || '')
      }
    } else if (excusePeriod === 'day') {
      if (type === 'worship_meal') {
        const shift = resolveWorshipMealShift()
        setExcusePeriod(shift === 'យប់' ? 'afternoon' : 'morning')
      } else if (type === SALA_CHAN_TYPE_KEY) {
        const shift = resolveSalaChanShift()
        setExcusePeriod(shift === 'ថ្ងៃត្រង់' ? 'afternoon' : 'morning')
      } else {
        setExcusePeriod(typeUi.excuseDefault)
      }
    }
  }, [
    excuseDayCount,
    excuseFor,
    excuseMultiOptions,
    excusePeriod,
    type,
    typeUi.excuseDefault,
    typeUi.excuseDisablePeriodWhenMultiDay,
    typeUi.excuseMultiDayDropdown,
  ])

  if (!types.loading && !valid) return <Navigate to="/attendance" replace />

  function setAbsent(residentId: number) {
    setPreservedAbsentIds((prev) => prev.filter((id) => id !== residentId))
    setPreservedExcusedIds((prev) => prev.filter((id) => id !== residentId))
    setRows((prev) =>
      prev.map((row) =>
        row.resident_id === residentId
          ? {
              ...row,
              status: row.status === 'absent' ? 'present' : 'absent',
              excuse_period: null,
              note: null,
              excuse_from: null,
              excuse_to: null,
              excuse_days: null,
              excuse_remaining: null,
            }
          : row,
      ),
    )
  }

  function openExcuse(row: AttendanceDayRow) {
    setExcuseFor(row)
    const allowed = typeUi.excusePeriods
    const existing =
      row.excuse_period && allowed.includes(row.excuse_period) ? row.excuse_period : null
    if (existing) {
      setExcusePeriod(existing)
    } else if (type === 'worship_meal') {
      const shift = resolveWorshipMealShift()
      setExcusePeriod(shift === 'យប់' ? 'afternoon' : 'morning')
    } else if (type === SALA_CHAN_TYPE_KEY) {
      const shift = resolveSalaChanShift()
      setExcusePeriod(shift === 'ថ្ងៃត្រង់' ? 'afternoon' : 'morning')
    } else {
      setExcusePeriod(typeUi.excuseDefault)
    }
    setExcuseFrom(row.excuse_from || date)
    setExcuseTo(row.excuse_to || date)
    setExcuseReason(row.note || '')
    if (typeUi.excuseMultiDayDropdown || typeUi.excuseReasonDropdown) {
      const defaults = typeUi.excuseReasonDropdown
        ? typeUi.excuseReasonOptions
        : typeUi.excuseMultiDayOptions
      const kind: OptionListKind = typeUi.excuseReasonDropdown ? 'reason' : 'multi'
      const options = loadMultiDayOptions(type, defaults, kind)
      setExcuseMultiOptions(options)
      const note = (row.note || '').trim()
      setExcuseMultiSelected(note && options.includes(note) ? note : options[0] || '')
      setExcuseMultiDraft('')
    }
  }

  function openPartyAssign(row: AttendanceDayRow) {
    const places = loadMultiDayOptions(type, typeUi.partyPlaceOptions, 'party_place')
    const kinds = loadMultiDayOptions(type, typeUi.partyKindOptions, 'party_kind')
    setPartyPlaceOptions(places)
    setPartyKindOptions(kinds)
    const existing = parseBonPartyNote(row.note)
    setPartyTime(existing?.time || nowTimeHHMM())
    setPartyPlace(
      existing?.place && places.includes(existing.place) ? existing.place : places[0] || '',
    )
    const parsedKinds = parsePartyKinds(existing?.kind)
    const kept = parsedKinds.filter((item) => kinds.includes(item))
    setPartyKinds(kept.length > 0 ? kept : kinds[0] ? [kinds[0]] : [])
    setPartyDraft('')
    setPartyEditIndex(null)
    setPartyEditDraft('')
    setPartyManageKind(null)
    setPartyFor(row)
  }

  function togglePartyKind(item: string) {
    setPartyKinds((prev) =>
      prev.includes(item) ? prev.filter((k) => k !== item) : [...prev, item],
    )
  }

  function applyPartyAssign() {
    if (!partyFor) return
    const time = partyTime.trim()
    const place = partyPlace.trim()
    const kind = joinPartyKinds(partyKinds)
    if (!time) {
      toast('សូមកំណត់ម៉ោង', 'error')
      return
    }
    if (!place) {
      toast('សូមជ្រើសរើសទីកន្លែង', 'error')
      return
    }
    if (!kind) {
      toast('សូមជ្រើសរើសប្រភេទ', 'error')
      return
    }
    const note = encodeBonPartyNote({ time, place, kind })
    const hadAssign = Boolean(parseBonPartyNote(partyFor.note))
    setRows((prev) =>
      prev.map((row) =>
        row.resident_id === partyFor.resident_id
          ? {
              ...row,
              status: 'present',
              note,
              excuse_period: null,
              excuse_from: null,
              excuse_to: null,
              excuse_days: null,
              excuse_remaining: null,
            }
          : row,
      ),
    )
    if (!hadAssign) {
      const key = String(partyFor.resident_id)
      setPartyTripCounts((prev) => ({
        ...prev,
        [key]: (prev[key] || 0) + 1,
      }))
    }
    setPreservedPartyIds((prev) => prev.filter((id) => id !== partyFor.resident_id))
    setPartyFor(null)
    toast('បានកំណត់ចាត់លោកទៅបុណ្យ')
  }

  function clearPartyAssign() {
    if (!partyFor) return
    const hadAssign = Boolean(parseBonPartyNote(partyFor.note))
    setRows((prev) =>
      prev.map((row) =>
        row.resident_id === partyFor.resident_id
          ? {
              ...row,
              note: null,
            }
          : row,
      ),
    )
    if (hadAssign) {
      const key = String(partyFor.resident_id)
      setPartyTripCounts((prev) => ({
        ...prev,
        [key]: Math.max(0, (prev[key] || 0) - 1),
      }))
    }
    setPreservedPartyIds((prev) => prev.filter((id) => id !== partyFor.resident_id))
    setPartyFor(null)
    toast('បានលុបការកំណត់')
  }

  function partyOptionsFor(manage: 'place' | 'kind') {
    return manage === 'place' ? partyPlaceOptions : partyKindOptions
  }

  function setPartyOptionsPersist(manage: 'place' | 'kind', next: string[]) {
    const storageKind: OptionListKind = manage === 'place' ? 'party_place' : 'party_kind'
    if (manage === 'place') {
      setPartyPlaceOptions(next)
      setPartyPlace((prev) => (next.includes(prev) ? prev : next[0] || ''))
    } else {
      setPartyKindOptions(next)
      setPartyKinds((prev) => {
        const kept = prev.filter((item) => next.includes(item))
        if (kept.length > 0) return kept
        return next[0] ? [next[0]] : []
      })
    }
    saveMultiDayOptions(type, next, storageKind)
  }

  function addPartyOption() {
    if (!partyManageKind) return
    const label = partyDraft.trim()
    if (!label) {
      toast('សូមបញ្ចូលឈ្មោះ', 'error')
      return
    }
    const current = partyOptionsFor(partyManageKind)
    if (current.some((item) => item === label)) {
      if (partyManageKind === 'place') setPartyPlace(label)
      else setPartyKinds((prev) => (prev.includes(label) ? prev : [...prev, label]))
      setPartyDraft('')
      return
    }
    setPartyOptionsPersist(partyManageKind, [...current, label])
    if (partyManageKind === 'place') setPartyPlace(label)
    else setPartyKinds((prev) => (prev.includes(label) ? prev : [...prev, label]))
    setPartyDraft('')
  }

  function removePartyOption(index: number) {
    if (!partyManageKind) return
    const current = partyOptionsFor(partyManageKind)
    const next = current.filter((_, i) => i !== index)
    setPartyOptionsPersist(partyManageKind, next)
    if (partyEditIndex === index) {
      setPartyEditIndex(null)
      setPartyEditDraft('')
    } else if (partyEditIndex != null && partyEditIndex > index) {
      setPartyEditIndex(partyEditIndex - 1)
    }
  }

  function startEditPartyOption(index: number) {
    if (!partyManageKind) return
    setPartyEditIndex(index)
    setPartyEditDraft(partyOptionsFor(partyManageKind)[index] || '')
  }

  function saveEditPartyOption() {
    if (!partyManageKind || partyEditIndex == null) return
    const label = partyEditDraft.trim()
    if (!label) {
      toast('សូមបញ្ចូលឈ្មោះ', 'error')
      return
    }
    const current = partyOptionsFor(partyManageKind)
    if (current.some((item, i) => i !== partyEditIndex && item === label)) {
      toast('មានឈ្មោះនេះរួចហើយ', 'error')
      return
    }
    const prev = current[partyEditIndex]
    const next = current.map((item, i) => (i === partyEditIndex ? label : item))
    setPartyOptionsPersist(partyManageKind, next)
    if (partyManageKind === 'place' && partyPlace === prev) setPartyPlace(label)
    if (partyManageKind === 'kind') {
      setPartyKinds((prevKinds) =>
        prevKinds.map((item) => (item === prev ? label : item)),
      )
    }
    setPartyEditIndex(null)
    setPartyEditDraft('')
  }

  function setExcuseMultiOptionsPersist(next: string[]) {
    const kind: OptionListKind = typeUi.excuseReasonDropdown ? 'reason' : 'multi'
    setExcuseMultiOptions(next)
    saveMultiDayOptions(type, next, kind)
    setExcuseMultiSelected((prev) => {
      if (next.includes(prev)) return prev
      return next[0] || ''
    })
  }

  function addExcuseMultiOption() {
    const label = excuseMultiDraft.trim()
    if (!label) {
      toast('សូមបញ្ចូលឈ្មោះ', 'error')
      return
    }
    if (excuseMultiOptions.some((item) => item === label)) {
      setExcuseMultiSelected(label)
      setExcuseMultiDraft('')
      return
    }
    setExcuseMultiOptionsPersist([...excuseMultiOptions, label])
    setExcuseMultiSelected(label)
    setExcuseMultiDraft('')
  }

  function removeExcuseMultiOption(index: number) {
    const next = excuseMultiOptions.filter((_, i) => i !== index)
    setExcuseMultiOptionsPersist(next)
    if (excuseMultiEditIndex === index) {
      setExcuseMultiEditIndex(null)
      setExcuseMultiEditDraft('')
    } else if (excuseMultiEditIndex != null && excuseMultiEditIndex > index) {
      setExcuseMultiEditIndex(excuseMultiEditIndex - 1)
    }
  }

  function startEditExcuseMultiOption(index: number) {
    setExcuseMultiEditIndex(index)
    setExcuseMultiEditDraft(excuseMultiOptions[index] || '')
  }

  function saveEditExcuseMultiOption() {
    if (excuseMultiEditIndex == null) return
    const label = excuseMultiEditDraft.trim()
    if (!label) {
      toast('សូមបញ្ចូលឈ្មោះ', 'error')
      return
    }
    const dup = excuseMultiOptions.some(
      (item, i) => i !== excuseMultiEditIndex && item === label,
    )
    if (dup) {
      toast('មានឈ្មោះនេះរួចហើយ', 'error')
      return
    }
    const prev = excuseMultiOptions[excuseMultiEditIndex]
    const next = excuseMultiOptions.map((item, i) =>
      i === excuseMultiEditIndex ? label : item,
    )
    setExcuseMultiOptions(next)
    saveMultiDayOptions(type, next, typeUi.excuseReasonDropdown ? 'reason' : 'multi')
    setExcuseMultiSelected((cur) => (cur === prev ? label : cur))
    setExcuseMultiEditIndex(null)
    setExcuseMultiEditDraft('')
  }

  async function applyExcuse() {
    if (!excuseFor) return
    const from = typeUi.excuseShowDateRange
      ? excuseFrom <= excuseTo
        ? excuseFrom
        : excuseTo
      : date
    const to = typeUi.excuseShowDateRange
      ? excuseFrom <= excuseTo
        ? excuseTo
        : excuseFrom
      : date
    const multiDay =
      typeUi.excuseShowDateRange && from !== to
    const period: ExcusePeriod =
      multiDay && (typeUi.excuseMultiDayDropdown || typeUi.excuseDisablePeriodWhenMultiDay)
        ? 'day'
        : excusePeriod
    let note = ''
    if (typeUi.excuseReasonDropdown || (typeUi.excuseMultiDayDropdown && multiDay)) {
      note = excuseMultiSelected.trim()
      if (!note) {
        toast(
          typeUi.excuseReasonDropdown ? 'សូមជ្រើសរើសមូលហេតុ' : 'សូមជ្រើសរើសប្រភេទសូមច្បាប់',
          'error',
        )
        return
      }
    } else if (typeUi.excuseShowReason) {
      note = excuseReason.trim()
      if (!note) {
        toast('សូមបញ្ចូលមូលហេតុ', 'error')
        return
      }
    }
    setExcuseBusy(true)
    try {
      const result = await apiRequest<{ days: number; from: string; to: string }>(
        '/api/attendance/excuse-range',
        {
          method: 'POST',
          token,
          body: {
            type,
            from,
            to,
            resident_id: excuseFor.resident_id,
            kuti_id: excuseFor.kuti_id || undefined,
            excuse_period: period,
            note: note || null,
          },
        },
      )
      setPreservedExcusedIds((prev) => prev.filter((id) => id !== excuseFor.resident_id))
      setPreservedAbsentIds((prev) => prev.filter((id) => id !== excuseFor.resident_id))
      if (date >= result.from && date <= result.to) {
        setRows((prev) =>
          prev.map((row) =>
            row.resident_id === excuseFor.resident_id
              ? {
                  ...row,
                  status: 'excused',
                  excuse_period: period,
                  note: note || null,
                  excuse_from: result.from,
                  excuse_to: result.to,
                  excuse_days: result.days,
                  excuse_remaining: result.days,
                }
              : row,
          ),
        )
      }
      setExcuseFor(null)
      toast(
        result.days > 1
          ? `បានសូមច្បាប់ ${result.days} ថ្ងៃ (${result.from} → ${result.to})`
          : `បានសូមច្បាប់ថ្ងៃ ${result.from}`,
      )
      const text = await apiRequest<{ text: string }>(
        `/api/attendance/preview?type=${type}&date=${date}`,
        { token },
      )
      setPreview(text.text)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'មិនអាចរក្សាទុកសូមច្បាប់បានទេ', 'error')
    } finally {
      setExcuseBusy(false)
    }
  }

  function clearExcuse(residentId: number) {
    setPreservedExcusedIds((prev) => prev.filter((id) => id !== residentId))
    setRows((prev) =>
      prev.map((row) =>
        row.resident_id === residentId
          ? {
              ...row,
              status: 'present',
              excuse_period: null,
              note: null,
              excuse_from: null,
              excuse_to: null,
              excuse_days: null,
              excuse_remaining: null,
            }
          : row,
      ),
    )
  }

  function clearActionIcons(savedRows: AttendanceDayRow[], includeExcused: boolean) {
    const absentIds = savedRows
      .filter((row) => row.status === 'absent')
      .map((row) => row.resident_id)
    const excusedIds = includeExcused
      ? savedRows
          .filter((row) =>
            shouldClearExcuseActionIcon(
              { ...typeUi, clearActionsIncludeExcused: true },
              row,
            ),
          )
          .map((row) => row.resident_id)
      : []
    setPreservedAbsentIds(absentIds)
    setPreservedExcusedIds(excusedIds)
    // Keep records in DB for reports — only reset button icons in the UI.
    setRows(
      savedRows.map((row) =>
        row.status === 'absent' ||
        (includeExcused &&
          shouldClearExcuseActionIcon(
            { ...typeUi, clearActionsIncludeExcused: true },
            row,
          ))
          ? {
              ...row,
              status: 'present',
              note: null,
              excuse_period: null,
              excuse_from: null,
              excuse_to: null,
              excuse_days: null,
              excuse_remaining: null,
            }
          : row,
      ),
    )
    setActionsCleared(true)
    writeActionsCleared(type, date, true)
    writeClearAt(type, date, 0)
    setClearActionsAt(0)
  }

  function clearActionsAfterReport(savedRows: AttendanceDayRow[]) {
    clearActionIcons(savedRows, false)
    writeActionsCleared(type, date, false)
  }

  async function save() {
    if (!canManage || saveLocked) return
    setSaving(true)
    try {
      const lockedIds = new Set([
        ...preservedAbsentIds,
        ...preservedExcusedIds,
        ...preservedPartyIds,
      ])
      const data = await apiRequest<{ rows: AttendanceDayRow[] }>('/api/attendance/day', {
        method: 'PUT',
        token,
        body: {
          type,
          date,
          marks: rows
            .filter((r) => !lockedIds.has(r.resident_id))
            .map((r) => ({
              resident_id: r.resident_id,
              status: r.status || 'present',
              kuti_id: r.kuti_id || undefined,
              excuse_period: r.status === 'excused' ? r.excuse_period : null,
              note: r.note || undefined,
            })),
        },
      })
      const text = await apiRequest<{ text: string }>(
        `/api/attendance/preview?type=${type}&date=${date}`,
        { token },
      )
      setPreview(text.text)
      setSavedPreview(text.text)
      try {
        localStorage.setItem(`attendance:preview:${type}:${date}`, text.text)
      } catch {
        /* ignore */
      }

      const delay = typeUi.clearActionsDelayMs
      if (delay == null) {
        // no auto-clear
      } else if (delay <= 0) {
        clearActionsAfterReport(data.rows)
      } else {
        // ថ្វាយបង្គំ / kuti_work / ចាត់លោកទៅបុណ្យ: keep icons until delay after save, then clear
        setPreservedAbsentIds([])
        setPreservedExcusedIds([])
        setPreservedPartyIds([])
        setActionsCleared(false)
        writeActionsCleared(type, date, false)
        setRows(data.rows)
        const clearAt = Date.now() + delay
        setClearActionsAt(clearAt)
        writeClearAt(type, date, clearAt)
      }

      const until = Date.now() + SAVE_COOLDOWN_MS
      setSaveCooldownUntil(until)
      writeCooldownUntil('save', type, date, until)
      setCanSend(true)
      writeSendReady(type, date, true)
      toast('បានរក្សាទុកវត្តមាន')
      void loadPartyTripCounts()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'រក្សាទុកមិនបាន', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function sendTelegram() {
    if (!canManage || sendLocked) return
    if (!canSend && !typeUi.sendWithoutSave) {
      toast('សូមរក្សាទុកមុនសិន', 'error')
      return
    }
    const textToSend = savedPreview || preview
    if (!textToSend.trim()) {
      toast('មិនមានសារសម្រាប់ផ្ញើ', 'error')
      return
    }
    setSending(true)
    try {
      await apiRequest('/api/attendance/send-telegram', {
        method: 'POST',
        token,
        body: { type, date, text: textToSend },
      })
      const until = Date.now() + SEND_COOLDOWN_MS
      setSendCooldownUntil(until)
      writeCooldownUntil('send', type, date, until)
      if (!typeUi.sendWithoutSave) {
        setCanSend(false)
        writeSendReady(type, date, false)
      }
      // Refresh preview so clock/groups stay current after send
      try {
        const text = await apiRequest<{ text: string }>(
          `/api/attendance/preview?type=${type}&date=${date}`,
          { token },
        )
        setPreview(text.text)
        setSavedPreview(text.text)
      } catch {
        /* ignore */
      }
      toast('បានផ្ញើទៅ Telegram')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'ផ្ញើមិនបាន', 'error')
    } finally {
      setSending(false)
    }
  }

  if (types.loading) return <Spinner />

  return (
    <div className="rise space-y-4">
      <section className="rounded-[22px] border border-line bg-paper px-4 py-3.5 shadow-[inset_3px_0_0_0_var(--color-saffron)]">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => navigate('/attendance')}
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cream text-maroon"
            aria-label="ត្រឡប់"
          >
            <ArrowLeft size={17} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-title text-[18px] text-maroon">{typeLabel}</h1>
            <p className="mt-0.5 text-[12px] text-muted">{typeUi.markSubtitle}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {typeUi.markGrouped && canManage ? (
              <button
                type="button"
                onClick={() => setGroupsOpen(true)}
                className="inline-flex items-center gap-1 rounded-xl bg-cream px-2.5 py-2 text-xs font-bold text-maroon"
              >
                <Users size={14} />
                ក្រុម
              </button>
            ) : null}
            {typeUi.showReportLink ? (
              <Link
                to={`/attendance/${type}/reports`}
                className="rounded-xl bg-cream px-3 py-2 text-xs font-bold text-maroon"
              >
                របាយការណ៍
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      {typeUi.showStatusCounts ? (
        <section className="grid grid-cols-3 overflow-hidden rounded-[20px] border border-line bg-paper">
          <div className="px-3 py-3 text-center">
            <p className="font-title text-[26px] leading-none tracking-tight text-ok">{counts.present}</p>
            <p className="mt-1.5 text-[11px] font-bold text-muted">{typeUi.countPresent}</p>
          </div>
          <div className="border-x border-line px-3 py-3 text-center">
            <p className="font-title text-[26px] leading-none tracking-tight text-danger">{counts.absent}</p>
            <p className="mt-1.5 text-[11px] font-bold text-muted">{typeUi.countAbsent}</p>
          </div>
          <div className="px-3 py-3 text-center">
            <p className="font-title text-[26px] leading-none tracking-tight text-saffron">{counts.excused}</p>
            <p className="mt-1.5 text-[11px] font-bold text-muted">{typeUi.countExcused}</p>
          </div>
        </section>
      ) : null}

      {typeUi.showPartyAssignAction && partyTripMeta.leastNames.length > 0 ? (
        <section className="rounded-[20px] border border-saffron/40 bg-[#fff8ec] px-3.5 py-3">
          <p className="text-[11px] font-bold text-saffron">ឈ្មោះណាបានទៅបុណ្យតិចជាងគេ</p>
          <p className="mt-1 text-sm font-bold text-maroon">
            {partyTripMeta.leastNames.join(' · ')}
          </p>
          <p className="mt-0.5 text-[11px] font-bold text-muted">
            ចំនួន {partyTripMeta.min} ដង (ខែនេះ)
          </p>
        </section>
      ) : null}

      {canManage && typeUi.showSaveButton ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {showClearCountdown ? (
            <p className="mr-auto text-[11px] font-bold text-muted">
              សម្អាតរូបតំណាងក្នុង {formatRemain(clearRemainMs)}
            </p>
          ) : null}
          <button
            type="button"
            disabled={saving || saveLocked}
            onClick={() => void save()}
            className="rounded-2xl bg-maroon px-3 py-2 text-sm font-bold text-cream disabled:opacity-60"
          >
            {saving
              ? 'កំពុងរក្សាទុក...'
              : saveLocked
                ? `រង់ចាំ ${formatRemain(saveRemainMs)}`
                : 'រក្សាទុក'}
          </button>
        </div>
      ) : null}

      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <p className="rounded-[22px] border border-line bg-paper p-4 text-sm text-muted">
          មិនទាន់មានព្រះសង្ឃ — បញ្ចូល Token នៅការកំណត់ជាមុនសិន
        </p>
      ) : typeUi.markGrouped && groupedSections ? (
        <div className="space-y-3">
          {groupedSections.map((section) => (
            <section
              key={section.key}
              className={`overflow-hidden rounded-[20px] border bg-paper ${
                section.isDuty ? 'border-saffron shadow-[inset_3px_0_0_0_var(--color-saffron)]' : 'border-line'
              }`}
            >
              <div
                className={`flex items-center justify-between border-b border-line px-3 py-2.5 ${
                  section.isDuty ? 'bg-[#fff1d6]' : 'bg-cream/50'
                }`}
              >
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-maroon">{section.title}</h2>
                  {section.isDuty ? (
                    <p className="mt-0.5 text-[10px] font-bold text-saffron">
                      {type === 'alms' ? 'វេនថ្ងៃនេះ · ផ្ញើ ៨ៈ៤០' : 'វេនថ្ងៃនេះ · ផ្ញើ ១៦:៥០'}
                    </p>
                  ) : null}
                </div>
                <span className="text-[11px] font-bold text-muted">{section.rows.length} អង្គ</span>
              </div>
              {section.rows.length === 0 ? (
                <p className="px-3 py-4 text-xs text-muted">មិនទាន់មានសមាជិក</p>
              ) : (
                <ul className="divide-y divide-line">
                  {section.rows.map((row) => {
                    const isAbsent = row.status === 'absent'
                    const isExcused = row.status === 'excused'
                    return (
                      <li key={row.resident_id} className="flex items-center gap-2 px-3 py-2.5">
                        <span className="w-3 shrink-0 text-center text-muted">·</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-bold">
                            {row.last_name} {row.first_name}
                          </p>
                          <p className="truncate text-[11px] text-muted">
                            {[row.monk_status || '—', row.room_name || '—'].join(' | ')}
                            {typeUi.showExcuseAction && isExcused && row.excuse_period
                              ? ` · សូមច្បាប់${excusePeriodLabelForType(typeUi, row.excuse_period, EXCUSE_PERIOD_LABELS)}`
                              : ''}
                          </p>
                        </div>
                        {typeUi.showAbsentAction ? (
                          <button
                            type="button"
                            disabled={!canManage}
                            onClick={() => setAbsent(row.resident_id)}
                            className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                              isAbsent ? 'bg-danger text-white' : 'bg-cream text-muted'
                            }`}
                            aria-label="អវត្តមាន"
                          >
                            <X size={15} />
                          </button>
                        ) : null}
                        {typeUi.showExcuseAction ? (
                          <button
                            type="button"
                            disabled={!canManage}
                            onClick={() =>
                              isExcused ? clearExcuse(row.resident_id) : openExcuse(row)
                            }
                            className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                              isExcused ? 'bg-saffron text-white' : 'bg-cream text-muted'
                            }`}
                            aria-label="សូមច្បាប់"
                          >
                            <FileText size={15} />
                          </button>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
              const isAbsent = row.status === 'absent'
              const isExcused = row.status === 'excused'
              const multiDay = Boolean(isExcused && row.excuse_days && row.excuse_days > 1)
              const partyAssign =
                typeUi.showPartyAssignAction ? parseBonPartyNote(row.note) : null
              const tripCount = typeUi.showPartyAssignAction
                ? partyTripCounts[String(row.resident_id)] ?? 0
                : 0
              const isLeastTrips =
                typeUi.showPartyAssignAction && partyTripMeta.leastIds.has(row.resident_id)
              return (
                <div
                  key={row.resident_id}
                  className={`rounded-[20px] border px-3 py-2.5 ${
                    isLeastTrips
                      ? 'border-saffron bg-[#fff8ec] shadow-[inset_3px_0_0_0_var(--color-saffron)]'
                      : 'border-line bg-paper'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 truncate font-bold">
                          {row.last_name} {row.first_name}
                        </p>
                        {typeUi.showPartyAssignAction ? (
                          <span
                            className={`shrink-0 rounded-lg px-2 py-0.5 text-[11px] font-bold ${
                              isLeastTrips
                                ? 'bg-saffron text-white'
                                : 'bg-cream text-muted'
                            }`}
                          >
                            ចំនួន {tripCount}
                          </span>
                        ) : null}
                      </div>
                      {typeUi.showRowMeta ? (
                      <p className="text-xs leading-relaxed text-muted">
                        {[
                          row.monk_status || '—',
                          row.room_name || '—',
                          ...(typeUi.showEducation ? [row.education_level || '—'] : []),
                        ].join(' | ')}
                        {isExcused && row.excuse_period
                          ? ` · សូមច្បាប់${excusePeriodLabelForType(typeUi, row.excuse_period, EXCUSE_PERIOD_LABELS)}`
                          : ''}
                        {isExcused && row.note ? ` · ${row.note}` : ''}
                      </p>
                      ) : null}
                      {partyAssign ? (
                        <p className="mt-0.5 truncate text-xs font-bold text-saffron">
                          {formatBonPartyAssign(partyAssign)}
                        </p>
                      ) : null}
                      {multiDay ? (
                        <p className="mt-1 text-xs font-bold text-saffron">
                          {row.excuse_days} ថ្ងៃ ({row.excuse_from} → {row.excuse_to})
                          {' · '}
                          នៅសល់ {row.excuse_remaining} ថ្ងៃ
                        </p>
                      ) : null}
                    </div>
                    {typeUi.showPartyAssignAction ? (
                      <button
                        type="button"
                        disabled={!canManage}
                        onClick={() => openPartyAssign(row)}
                        className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                          partyAssign ? 'bg-saffron text-white' : 'bg-cream text-muted'
                        }`}
                        aria-label="កំណត់ចាត់លោកទៅបុណ្យ"
                      >
                        <Clock size={16} />
                      </button>
                    ) : null}
                    {typeUi.showAbsentAction ? (
                      <button
                        type="button"
                        disabled={!canManage}
                        onClick={() => setAbsent(row.resident_id)}
                        className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                          isAbsent ? 'bg-danger text-white' : 'bg-cream text-muted'
                        }`}
                        aria-label="អវត្តមាន"
                      >
                        <X size={16} />
                      </button>
                    ) : null}
                    {typeUi.showExcuseAction ? (
                      <button
                        type="button"
                        disabled={!canManage}
                        onClick={() => (isExcused ? clearExcuse(row.resident_id) : openExcuse(row))}
                        className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                          isExcused ? 'bg-saffron text-white' : 'bg-cream text-muted'
                        }`}
                        aria-label="សូមច្បាប់"
                      >
                        <FileText size={16} />
                      </button>
                    ) : null}
                  </div>
                </div>
              )
            })}
        </div>
      )}

      {preview ? (
        <section className="rounded-[22px] border border-line bg-paper p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-muted">ទម្រង់សារប្រចាំថ្ងៃ</h2>
            {canManage ? (
              <button
                type="button"
                disabled={sending || sendLocked || (!canSend && !typeUi.sendWithoutSave)}
                onClick={() => void sendTelegram()}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl bg-saffron px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                <Send size={15} />
                {sending
                  ? 'កំពុងផ្ញើ...'
                  : sendLocked
                    ? `រង់ចាំ ${formatRemain(sendRemainMs)}`
                    : !canSend && !typeUi.sendWithoutSave
                      ? 'រក្សាទុកមុន'
                      : 'ផ្ញើ'}
              </button>
            ) : null}
          </div>
          <pre className="whitespace-pre-wrap rounded-2xl bg-cream p-3 text-sm leading-6">{preview}</pre>
        </section>
      ) : null}

      <Sheet
        open={Boolean(excuseFor)}
        title="សូមច្បាប់"
        compact={typeUi.excuseCompact}
        centerHeader
        subtitle={
          excuseFor ? (
            <div className="flex flex-col items-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[linear-gradient(145deg,#c45c14,#8a3d0f)] font-title text-sm text-white">
                {(excuseFor.last_name || excuseFor.first_name || '—').trim().charAt(0)}
              </div>
              <p className="mt-1.5 font-title text-[16px] leading-[1.35] text-maroon">
                {excuseFor.last_name} {excuseFor.first_name}
              </p>
              <p className="mt-0.5 max-w-full truncate text-[10px] font-bold text-muted">
                {[excuseFor.monk_status, excuseFor.room_name]
                  .filter(Boolean)
                  .join(' · ') || 'ព្រះសង្ឃ'}
              </p>
            </div>
          ) : undefined
        }
        onClose={() => {
          if (excuseBusy) return
          setExcuseFor(null)
          setExcuseMultiManageOpen(false)
          setExcuseMultiEditIndex(null)
          setExcuseMultiEditDraft('')
          setExcuseMultiDraft('')
        }}
      >
        <div className={typeUi.excuseCompact ? 'space-y-3' : 'space-y-4'}>
          {typeUi.excuseShowDateRange ? (
            <section className="rounded-[18px] border border-line bg-cream/60 p-3">
              <p className="mb-2 text-center text-[11px] font-bold text-muted">រយៈពេលសូមច្បាប់</p>
              <div className="grid grid-cols-2 gap-2">
                <DatePicker
                  label="ចាប់ពីថ្ងៃទី"
                  align="center"
                  value={excuseFrom}
                  onChange={(next) => {
                    setExcuseFrom(next)
                    if (excuseTo < next) setExcuseTo(next)
                  }}
                />
                <DatePicker
                  label="មកដល់ថ្ងៃទី"
                  align="center"
                  value={excuseTo}
                  min={excuseFrom}
                  onChange={setExcuseTo}
                />
              </div>
              {excuseDayCount > 1 ? (
                <p className="mt-2 text-center text-[11px] font-bold text-saffron">
                  ចំនួន {excuseDayCount} ថ្ងៃ
                </p>
              ) : null}
            </section>
          ) : null}

          {typeUi.excuseShowPeriodPicker && !excusePeriodLocked ? (
            <section>
              <p className="mb-1.5 text-center text-[10px] font-bold text-muted">
                {excuseUseMultiDropdown ? 'ប្រភេទសូមច្បាប់' : 'ពេលវេលា'}
              </p>
              {excuseUseMultiDropdown ? (
                <div className="flex gap-2">
                  <select
                    className={`${inputClass} min-w-0 flex-1 py-2.5 text-sm`}
                    value={excuseMultiSelected}
                    onChange={(e) => setExcuseMultiSelected(e.target.value)}
                  >
                    {excuseMultiOptions.length === 0 ? (
                      <option value="">— មិនទាន់មាន —</option>
                    ) : (
                      excuseMultiOptions.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))
                    )}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      setExcuseMultiEditIndex(null)
                      setExcuseMultiEditDraft('')
                      setExcuseMultiDraft('')
                      setExcuseMultiManageOpen(true)
                    }}
                    className="settings-press flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cream text-maroon"
                    aria-label="មើលបញ្ជី"
                    title="មើល · កែ · លុប · បន្ថែម"
                  >
                    <List size={18} />
                  </button>
                </div>
              ) : (
                <div
                  className={`grid gap-1 rounded-[12px] bg-cream p-0.5 ${
                    typeUi.excusePeriods.length === 3 ? 'grid-cols-3' : 'grid-cols-2'
                  }`}
                >
                  {typeUi.excusePeriods.map((period) => (
                    <button
                      key={period}
                      type="button"
                      onClick={() => setExcusePeriod(period)}
                      className={`settings-press rounded-[10px] px-2 py-2 text-[12px] font-bold transition-colors ${
                        excusePeriod === period
                          ? 'bg-saffron text-white shadow-sm'
                          : 'bg-transparent text-muted'
                      }`}
                    >
                      {excusePeriodLabelForType(typeUi, period, EXCUSE_PERIOD_LABELS)}
                    </button>
                  ))}
                </div>
              )}
            </section>
          ) : typeUi.excuseShowPeriodPicker && excusePeriodLocked ? null : typeUi.markGrouped ? (
            <p className="rounded-[12px] bg-cream px-3 py-2 text-center text-[12px] font-bold text-muted">
              សូមច្បាប់មួយថ្ងៃ · {typeLabel}
            </p>
          ) : (
            <p className="rounded-[12px] bg-cream px-3 py-2 text-center text-[12px] font-bold text-muted">
              សូមច្បាប់មួយថ្ងៃ
            </p>
          )}

          {typeUi.excuseShowReason ? (
            typeUi.excuseReasonDropdown ? (
              <section>
                <p className="mb-1.5 text-center text-[10px] font-bold text-muted">មូលហេតុ</p>
                <div className="flex gap-2">
                  <select
                    className={`${inputClass} min-w-0 flex-1 py-2.5 text-sm`}
                    value={excuseMultiSelected}
                    onChange={(e) => setExcuseMultiSelected(e.target.value)}
                  >
                    {excuseMultiOptions.length === 0 ? (
                      <option value="">— មិនទាន់មាន —</option>
                    ) : (
                      excuseMultiOptions.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))
                    )}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      setExcuseMultiEditIndex(null)
                      setExcuseMultiEditDraft('')
                      setExcuseMultiDraft('')
                      setExcuseMultiManageOpen(true)
                    }}
                    className="settings-press flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cream text-maroon"
                    aria-label="មើលបញ្ជីមូលហេតុ"
                    title="មើល · កែ · លុប · បន្ថែម"
                  >
                    <List size={18} />
                  </button>
                </div>
              </section>
            ) : excuseUseMultiDropdown ? null : (
              <Field label="មូលហេតុ">
                <textarea
                  className={`${inputClass} min-h-[4.5rem] resize-none text-sm`}
                  value={excuseReason}
                  onChange={(e) => setExcuseReason(e.target.value)}
                  placeholder="ឧ. ឈឺ · ទៅផ្ទះ · ចូលរួមពិធី…"
                />
              </Field>
            )
          ) : null}

          <button
            type="button"
            disabled={excuseBusy}
            onClick={() => void applyExcuse()}
            className="settings-press w-full rounded-xl bg-saffron py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {excuseBusy ? 'កំពុងរក្សាទុក...' : 'បញ្ជាក់សូមច្បាប់'}
          </button>
        </div>
      </Sheet>

      <Sheet
        open={excuseMultiManageOpen}
        elevated
        title={typeUi.excuseReasonDropdown ? 'បញ្ជីមូលហេតុ' : 'បញ្ជីប្រភេទសូមច្បាប់'}
        onClose={() => {
          setExcuseMultiManageOpen(false)
          setExcuseMultiEditIndex(null)
          setExcuseMultiEditDraft('')
          setExcuseMultiDraft('')
        }}
      >
        <div className="space-y-3">
          {excuseMultiOptions.length === 0 ? (
            <p className="rounded-2xl bg-cream px-3 py-4 text-center text-sm text-muted">
              មិនទាន់មានធាតុ
            </p>
          ) : (
            <ul className="space-y-2">
              {excuseMultiOptions.map((item, index) => (
                <li
                  key={`${item}-${index}`}
                  className="rounded-2xl border border-line bg-cream/60 px-3 py-2"
                >
                  {excuseMultiEditIndex === index ? (
                    <div className="flex items-center gap-2">
                      <input
                        className={`${inputClass} min-w-0 flex-1 py-2 text-sm`}
                        value={excuseMultiEditDraft}
                        onChange={(e) => setExcuseMultiEditDraft(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            saveEditExcuseMultiOption()
                          }
                          if (e.key === 'Escape') {
                            setExcuseMultiEditIndex(null)
                            setExcuseMultiEditDraft('')
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={saveEditExcuseMultiOption}
                        className="settings-press flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-saffron text-white"
                        aria-label="រក្សាទុក"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setExcuseMultiEditIndex(null)
                          setExcuseMultiEditDraft('')
                        }}
                        className="settings-press flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-muted"
                        aria-label="បោះបង់"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setExcuseMultiSelected(item)
                          setExcuseMultiManageOpen(false)
                        }}
                        className={`min-w-0 flex-1 truncate rounded-xl px-2 py-1.5 text-left text-sm font-bold ${
                          excuseMultiSelected === item ? 'bg-[#fff1d6] text-maroon' : 'text-ink'
                        }`}
                      >
                        {item}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEditExcuseMultiOption(index)}
                        className="settings-press flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-muted"
                        aria-label="កែ"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeExcuseMultiOption(index)}
                        className="settings-press flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-danger"
                        aria-label="លុប"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-2 border-t border-line pt-3">
            <input
              className={`${inputClass} min-w-0 flex-1 py-2 text-sm`}
              value={excuseMultiDraft}
              onChange={(e) => setExcuseMultiDraft(e.target.value)}
              placeholder="បន្ថែមធាតុថ្មី..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addExcuseMultiOption()
                }
              }}
            />
            <button
              type="button"
              onClick={addExcuseMultiOption}
              className="settings-press flex h-11 shrink-0 items-center gap-1 rounded-2xl bg-saffron px-3 text-sm font-bold text-white"
            >
              <Plus size={16} />
              បន្ថែម
            </button>
          </div>
        </div>
      </Sheet>

      <Sheet
        open={Boolean(partyFor)}
        title="ចាត់លោកទៅបុណ្យ"
        centerHeader
        subtitle={
          partyFor ? (
            <p className="truncate text-center text-[13px] font-bold text-muted">
              {partyFor.last_name} {partyFor.first_name}
            </p>
          ) : undefined
        }
        onClose={() => {
          if (partyManageKind) return
          setPartyFor(null)
        }}
      >
        <div className="space-y-3.5">
          <section className="rounded-[18px] bg-cream px-3 py-3">
            <p className="text-center font-title text-[34px] leading-none tracking-tight text-maroon">
              {toKhmerClockDigits(String(partyTimeParts.hour12).padStart(2, '0'))}
              <span className="mx-1 text-saffron">-</span>
              {toKhmerClockDigits(String(partyTimeParts.minute).padStart(2, '0'))}
            </p>
            <p className="mt-1 text-center text-[12px] font-bold text-muted">
              {partyTimeParts.period}
            </p>

            <div className="mt-3 grid grid-cols-2 gap-1 rounded-[12px] bg-white/85 p-0.5">
              {(['ព្រឹក', 'ល្ងាច'] as const).map((period) => (
                <button
                  key={period}
                  type="button"
                  onClick={() =>
                    setPartyTime(
                      composeHHMMFromKhmerParts(
                        partyTimeParts.hour12,
                        partyTimeParts.minute,
                        period,
                      ),
                    )
                  }
                  className={`settings-press rounded-[10px] py-2 text-[12px] font-bold transition-colors ${
                    partyTimeParts.period === period
                      ? 'bg-saffron text-white shadow-sm'
                      : 'bg-transparent text-muted'
                  }`}
                >
                  {period}
                </button>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="flex flex-col items-center gap-1">
                <p className="text-[10px] font-bold text-muted">ម៉ោង</p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label="បន្ថយម៉ោង"
                    onClick={() => {
                      const next = partyTimeParts.hour12 <= 1 ? 12 : partyTimeParts.hour12 - 1
                      setPartyTime(
                        composeHHMMFromKhmerParts(
                          next,
                          partyTimeParts.minute,
                          partyTimeParts.period,
                        ),
                      )
                    }}
                    className="settings-press flex h-9 w-9 items-center justify-center rounded-xl bg-white text-maroon"
                  >
                    <ChevronDown size={18} />
                  </button>
                  <span className="min-w-[2.4rem] text-center font-title text-[18px] text-ink">
                    {toKhmerClockDigits(String(partyTimeParts.hour12).padStart(2, '0'))}
                  </span>
                  <button
                    type="button"
                    aria-label="បង្កើនម៉ោង"
                    onClick={() => {
                      const next = partyTimeParts.hour12 >= 12 ? 1 : partyTimeParts.hour12 + 1
                      setPartyTime(
                        composeHHMMFromKhmerParts(
                          next,
                          partyTimeParts.minute,
                          partyTimeParts.period,
                        ),
                      )
                    }}
                    className="settings-press flex h-9 w-9 items-center justify-center rounded-xl bg-white text-maroon"
                  >
                    <ChevronUp size={18} />
                  </button>
                </div>
              </div>
              <div className="flex flex-col items-center gap-1">
                <p className="text-[10px] font-bold text-muted">នាទី</p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label="បន្ថយនាទី"
                    onClick={() => {
                      const next = (partyTimeParts.minute + 55) % 60
                      setPartyTime(
                        composeHHMMFromKhmerParts(
                          partyTimeParts.hour12,
                          next,
                          partyTimeParts.period,
                        ),
                      )
                    }}
                    className="settings-press flex h-9 w-9 items-center justify-center rounded-xl bg-white text-maroon"
                  >
                    <ChevronDown size={18} />
                  </button>
                  <span className="min-w-[2.4rem] text-center font-title text-[18px] text-ink">
                    {toKhmerClockDigits(String(partyTimeParts.minute).padStart(2, '0'))}
                  </span>
                  <button
                    type="button"
                    aria-label="បង្កើននាទី"
                    onClick={() => {
                      const next = (partyTimeParts.minute + 5) % 60
                      setPartyTime(
                        composeHHMMFromKhmerParts(
                          partyTimeParts.hour12,
                          next,
                          partyTimeParts.period,
                        ),
                      )
                    }}
                    className="settings-press flex h-9 w-9 items-center justify-center rounded-xl bg-white text-maroon"
                  >
                    <ChevronUp size={18} />
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold text-muted">ទីកន្លែង</p>
              <button
                type="button"
                onClick={() => {
                  setPartyEditIndex(null)
                  setPartyEditDraft('')
                  setPartyDraft('')
                  setPartyManageKind('place')
                }}
                className="settings-press flex h-7 w-7 items-center justify-center rounded-lg bg-cream text-maroon"
                aria-label="មើលបញ្ជីទីកន្លែង"
                title="មើល · កែ · លុប · បន្ថែម"
              >
                <List size={14} />
              </button>
            </div>
            {partyPlaceOptions.length === 0 ? (
              <p className="rounded-2xl border border-line bg-cream px-3 py-3 text-center text-xs text-muted">
                — មិនទាន់មាន —
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {partyPlaceOptions.map((item) => {
                  const selected = partyPlace === item
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setPartyPlace(item)}
                      className={`settings-press rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors ${
                        selected ? 'bg-saffron text-white shadow-sm' : 'bg-cream text-ink'
                      }`}
                    >
                      {item}
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          <section>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold text-muted">ប្រភេទ · ជ្រើសបានច្រើន</p>
              <button
                type="button"
                onClick={() => {
                  setPartyEditIndex(null)
                  setPartyEditDraft('')
                  setPartyDraft('')
                  setPartyManageKind('kind')
                }}
                className="settings-press flex h-7 w-7 items-center justify-center rounded-lg bg-cream text-maroon"
                aria-label="មើលបញ្ជីប្រភេទ"
                title="មើល · កែ · លុប · បន្ថែម"
              >
                <List size={14} />
              </button>
            </div>
            {partyKindOptions.length === 0 ? (
              <p className="rounded-2xl border border-line bg-cream px-3 py-3 text-center text-xs text-muted">
                — មិនទាន់មាន —
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {partyKindOptions.map((item) => {
                  const selected = partyKinds.includes(item)
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => togglePartyKind(item)}
                      className={`settings-press rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors ${
                        selected ? 'bg-saffron text-white shadow-sm' : 'bg-cream text-ink'
                      }`}
                    >
                      {item}
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          <div className="space-y-2">
            <button
              type="button"
              onClick={applyPartyAssign}
              className="settings-press w-full rounded-xl bg-saffron py-2.5 text-sm font-bold text-white"
            >
              បញ្ជាក់
            </button>
            {partyFor && parseBonPartyNote(partyFor.note) ? (
              <button
                type="button"
                onClick={clearPartyAssign}
                className="settings-press w-full rounded-xl bg-cream py-2 text-sm font-bold text-danger"
              >
                លុបការកំណត់
              </button>
            ) : null}
          </div>
        </div>
      </Sheet>

      <Sheet
        open={Boolean(partyManageKind)}
        elevated
        title={partyManageKind === 'place' ? 'បញ្ជីទីកន្លែង' : 'បញ្ជីប្រភេទ'}
        onClose={() => {
          setPartyManageKind(null)
          setPartyEditIndex(null)
          setPartyEditDraft('')
          setPartyDraft('')
        }}
      >
        <div className="space-y-3">
          {(partyManageKind ? partyOptionsFor(partyManageKind) : []).length === 0 ? (
            <p className="rounded-2xl bg-cream px-3 py-4 text-center text-sm text-muted">
              មិនទាន់មានធាតុ
            </p>
          ) : (
            <ul className="space-y-2">
              {(partyManageKind ? partyOptionsFor(partyManageKind) : []).map((item, index) => (
                <li
                  key={`${item}-${index}`}
                  className="rounded-2xl border border-line bg-cream/60 px-3 py-2"
                >
                  {partyEditIndex === index ? (
                    <div className="flex items-center gap-2">
                      <input
                        className={`${inputClass} min-w-0 flex-1 py-2 text-sm`}
                        value={partyEditDraft}
                        onChange={(e) => setPartyEditDraft(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            saveEditPartyOption()
                          }
                          if (e.key === 'Escape') {
                            setPartyEditIndex(null)
                            setPartyEditDraft('')
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={saveEditPartyOption}
                        className="settings-press flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-saffron text-white"
                        aria-label="រក្សាទុក"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPartyEditIndex(null)
                          setPartyEditDraft('')
                        }}
                        className="settings-press flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-muted"
                        aria-label="បោះបង់"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (partyManageKind === 'place') {
                            setPartyPlace(item)
                            setPartyManageKind(null)
                          } else {
                            togglePartyKind(item)
                          }
                        }}
                        className={`min-w-0 flex-1 truncate rounded-xl px-2 py-1.5 text-left text-sm font-bold ${
                          (partyManageKind === 'place'
                            ? partyPlace === item
                            : partyKinds.includes(item))
                            ? 'bg-[#fff1d6] text-maroon'
                            : 'text-ink'
                        }`}
                      >
                        {item}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEditPartyOption(index)}
                        className="settings-press flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-muted"
                        aria-label="កែ"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removePartyOption(index)}
                        className="settings-press flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-danger"
                        aria-label="លុប"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-2 border-t border-line pt-3">
            <input
              className={`${inputClass} min-w-0 flex-1 py-2 text-sm`}
              value={partyDraft}
              onChange={(e) => setPartyDraft(e.target.value)}
              placeholder="បន្ថែមធាតុថ្មី..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addPartyOption()
                }
              }}
            />
            <button
              type="button"
              onClick={addPartyOption}
              className="settings-press flex h-11 shrink-0 items-center gap-1 rounded-2xl bg-saffron px-3 text-sm font-bold text-white"
            >
              <Plus size={16} />
              បន្ថែម
            </button>
          </div>
        </div>
      </Sheet>

      <Sheet
        open={groupsOpen && !assignGroup}
        title="គ្រប់គ្រងក្រុម"
        onClose={() => {
          if (groupsBusy) return
          setGroupsOpen(false)
          setNewGroupName('')
          cancelRename()
        }}
      >
        <div className="space-y-3">
          <Field label="ឈ្មោះក្រុម">
            <input
              className={inputClass}
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder={
                typeUi.groupCreateNamed ? 'ឧ. ក្រុមខាងកើត · ក្រុមខាងលិច…' : 'ទុកទទេ = ក្រុមទី១, ទី២…'
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void createGroup()
                }
              }}
            />
          </Field>
          <button
            type="button"
            disabled={groupsBusy || (typeUi.groupCreateNamed && !newGroupName.trim())}
            onClick={() => void createGroup()}
            className="settings-press inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-saffron py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            <Plus size={16} />
            {groupsBusy ? 'កំពុងបង្កើត...' : 'បង្កើតក្រុម'}
          </button>

          {groups.length === 0 ? (
            <p className="rounded-2xl bg-cream px-3 py-4 text-center text-sm text-muted">
              {typeUi.groupCreateNamed
                ? 'មិនទាន់មានក្រុម — បញ្ចូលឈ្មោះរួចបង្កើត'
                : 'មិនទាន់មានក្រុម — បង្កើតក្រុមទី១ រួចចាត់ព្រះសង្ឃ'}
            </p>
          ) : (
            <ul className="space-y-2">
              {groups.map((group) => {
                const editing = renameGroupId === group.id
                return (
                  <li
                    key={group.id}
                    className="rounded-2xl border border-line bg-paper px-3 py-2.5"
                  >
                    {editing ? (
                      <div className="space-y-2">
                        <input
                          className={inputClass}
                          value={renameGroupName}
                          onChange={(e) => setRenameGroupName(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              void saveRename()
                            }
                            if (e.key === 'Escape') cancelRename()
                          }}
                        />
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={groupsBusy}
                            onClick={cancelRename}
                            className="flex h-9 w-9 items-center justify-center rounded-xl bg-cream text-muted"
                            aria-label="បោះបង់"
                          >
                            <X size={15} />
                          </button>
                          <button
                            type="button"
                            disabled={groupsBusy || !renameGroupName.trim()}
                            onClick={() => void saveRename()}
                            className="flex h-9 w-9 items-center justify-center rounded-xl bg-saffron text-white disabled:opacity-50"
                            aria-label="រក្សាទុកឈ្មោះ"
                          >
                            <Check size={15} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-bold text-maroon">{group.name}</p>
                          <p className="text-[11px] font-bold text-muted">
                            {group.member_count} អង្គ
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={groupsBusy}
                          onClick={() => startRename(group)}
                          className="flex h-9 w-9 items-center justify-center rounded-xl bg-cream text-maroon"
                          aria-label="ប្តូរឈ្មោះ"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => openAssign(group)}
                          className="rounded-xl bg-cream px-2.5 py-2 text-[11px] font-bold text-maroon"
                        >
                          ចាត់ក្រុម
                        </button>
                        <button
                          type="button"
                          disabled={groupsBusy}
                          onClick={() => void removeGroup(group)}
                          className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#fde8e6] text-danger disabled:opacity-50"
                          aria-label="លុបក្រុម"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </Sheet>

      <Sheet
        open={Boolean(assignGroup)}
        title={assignGroup ? `ចាត់${assignGroup.name}` : 'ចាត់ក្រុម'}
        onClose={() => {
          if (assignBusy) return
          setAssignGroup(null)
          setAssignSearch('')
        }}
      >
        <div className="space-y-3">
          <p className="text-xs text-muted">ជ្រើសព្រះសង្ឃសម្រាប់ក្រុមនេះ (អាចផ្លាស់ពីក្រុមផ្សេង)</p>
          <SearchBar
            value={assignSearch}
            onChange={setAssignSearch}
            placeholder="ស្វែងរកឈ្មោះ"
          />
          {assignCandidates.length === 0 ? (
            <p className="rounded-2xl bg-cream px-3 py-4 text-center text-sm text-muted">
              {assignSearch.trim() ? 'រកមិនឃើញឈ្មោះ' : 'មិនមានព្រះសង្ឃសម្រាប់ចាត់'}
            </p>
          ) : (
            <ul className="max-h-[50dvh] space-y-1 overflow-y-auto">
              {assignCandidates.map((row) => {
                const checked = assignIds.includes(row.resident_id)
                return (
                  <li key={row.resident_id}>
                    <button
                      type="button"
                      onClick={() => toggleAssign(row.resident_id)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${
                        checked ? 'bg-[#fff1d6]' : 'bg-cream'
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold ${
                          checked
                            ? 'border-saffron bg-saffron text-white'
                            : 'border-line bg-white text-transparent'
                        }`}
                      >
                        ✓
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">
                          {row.last_name} {row.first_name}
                        </span>
                        <span className="block truncate text-[11px] text-muted">
                          {[row.monk_status, row.room_name].filter(Boolean).join(' · ') || '—'}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <button
            type="button"
            disabled={assignBusy}
            onClick={() => void saveAssign()}
            className="settings-press w-full rounded-xl bg-saffron py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {assignBusy ? 'កំពុងរក្សាទុក...' : `រក្សាទុក (${assignIds.length})`}
          </button>
        </div>
      </Sheet>
    </div>
  )
}
