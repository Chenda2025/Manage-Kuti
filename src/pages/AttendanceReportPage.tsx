import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, FileDown, Send, Trash2 } from 'lucide-react'
import { Sheet } from '../components/Sheet'
import { Spinner } from '../components/Spinner'
import { apiRequest } from '../lib/api'
import {
  REPORT_PERIODS,
  REPORT_PERIOD_LABELS,
  isReportPeriod,
  labelForType,
  type AttendanceType,
  type ReportPeriod,
} from '../lib/attendance'
import { uiForAttendanceType } from '../lib/attendanceTypeUi'
import { useAuth } from '../lib/auth'
import { hasPermission } from '../lib/roles'
import { useToast } from '../lib/toast'
import { useAttendanceTypes } from '../lib/useAttendanceTypes'
import {
  downloadMonthSheetPdf,
  downloadWeekSheetPdf,
  monthSheetPngDataUrl,
  weekSheetPngDataUrl,
  type WeekSheetData,
} from '../lib/weekSheetExport'

const PEOPLE_PAGE_SIZE = 5

type ReportPerson = {
  resident_id: number
  first_name: string
  last_name: string
  days: number
  note: string | null
}

type ReportData = {
  from: string
  to: string
  present: number
  absent: number
  excused: number
  total: number
  rate: number
  kuti: string
  text: string
  absent_people: ReportPerson[]
  excused_people: ReportPerson[]
}

export function AttendanceReportPage() {
  const { type: typeParam = '' } = useParams()
  const navigate = useNavigate()
  const user = useAuth((s) => s.user)
  const token = useAuth((s) => s.token)
  const canManage = hasPermission(user?.role, 'attendance.manage')
  const types = useAttendanceTypes()
  const toast = useToast((s) => s.push)

  const [period, setPeriod] = useState<ReportPeriod>('today')
  const [report, setReport] = useState<ReportData | null>(null)
  const [weekSheet, setWeekSheet] = useState<WeekSheetData | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [absentPage, setAbsentPage] = useState(0)
  const [excusedPage, setExcusedPage] = useState(0)
  const exportMenuRef = useRef<HTMLDivElement>(null)

  const valid = !types.loading && types.data.some((item) => item.key === typeParam)
  const type = (valid ? typeParam : types.data[0]?.key || '') as AttendanceType
  const typeLabel = labelForType(types.data, type)
  const typeUi = uiForAttendanceType(type, typeLabel)
  const reportPeriods = typeUi.reportPeriods.length > 0 ? typeUi.reportPeriods : [...REPORT_PERIODS]
  const showPeriodTabs = reportPeriods.length > 1
  const activePeriod = reportPeriods.includes(period) ? period : reportPeriods[0] || 'month'

  useEffect(() => {
    if (!exportMenuOpen) return
    function onPointerDown(e: MouseEvent) {
      if (!exportMenuRef.current?.contains(e.target as Node)) setExportMenuOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setExportMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [exportMenuOpen])

  useEffect(() => {
    if (!reportPeriods.includes(period)) {
      setPeriod(reportPeriods[0] || 'month')
    }
  }, [period, reportPeriods])

  async function load() {
    if (!token || !valid) return
    setLoading(true)
    setPreviewUrl('')
    setWeekSheet(null)
    try {
      const q = new URLSearchParams({ type, period: activePeriod })
      const data = await apiRequest<ReportData>(`/api/attendance/report?${q}`, { token })
      setReport(data)
      // ថ្ងៃនេះ = lists from today's marks only (same as mark page). No week/month sheet.
      if (activePeriod === 'today') return
      const sheetPath =
        activePeriod === 'month'
          ? `/api/attendance/report/month-sheet?type=${encodeURIComponent(type)}&date=${encodeURIComponent(data.to)}`
          : `/api/attendance/report/week-sheet?type=${encodeURIComponent(type)}&date=${encodeURIComponent(data.to)}`
      const sheet = await apiRequest<WeekSheetData>(sheetPath, { token })
      setWeekSheet(sheet)
      setPreviewUrl(
        activePeriod === 'month' ? await monthSheetPngDataUrl(sheet) : await weekSheetPngDataUrl(sheet),
      )
    } catch (err) {
      toast(err instanceof Error ? err.message : 'មិនអាចផ្ទុករបាយការណ៍', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, activePeriod, token, valid])

  useEffect(() => {
    setAbsentPage(0)
    setExcusedPage(0)
  }, [type, activePeriod])

  if (!types.loading && !valid) return <Navigate to="/attendance" replace />

  async function downloadPdf() {
    if (!weekSheet) return
    setExportingPdf(true)
    try {
      if (activePeriod === 'month') await downloadMonthSheetPdf(weekSheet)
      else await downloadWeekSheetPdf(weekSheet)
      toast('បានទាញ PDF')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'ទាញ PDF មិនបាន', 'error')
    } finally {
      setExportingPdf(false)
    }
  }

  function openSendPreview() {
    if (!canManage || !previewUrl) {
      toast('មិនទាន់មានរូបភាពមើលមុន', 'error')
      return
    }
    setPreviewOpen(true)
  }

  async function confirmSendTelegram() {
    if (!canManage || !previewUrl || !weekSheet) return
    setSending(true)
    try {
      const caption = `របាយការណ៍វត្តមាន ${weekSheet.type_label}\n${weekSheet.kuti}\n${weekSheet.from} → ${weekSheet.to}`
      await apiRequest('/api/attendance/report/send-week-sheet', {
        method: 'POST',
        token,
        body: {
          image_base64: previewUrl,
          caption,
          filename:
            activePeriod === 'month'
              ? `attendance-month-${weekSheet.from}.png`
              : `attendance-week-${weekSheet.from}.png`,
        },
      })
      setPreviewOpen(false)
      toast('បានផ្ញើ PNG ទៅ Telegram')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'ផ្ញើមិនបាន', 'error')
    } finally {
      setSending(false)
    }
  }

  async function removePerson(status: 'absent' | 'excused', person: ReportPerson) {
    if (!canManage || activePeriod !== 'today') return
    const name = `${person.last_name} ${person.first_name}`.trim()
    const label = status === 'absent' ? 'អវត្តមាន' : 'សូមច្បាប់'
    if (!window.confirm(`លុប${label}របស់ ${name}?`)) return
    setBusyId(person.resident_id)
    try {
      const data = await apiRequest<ReportData>('/api/attendance/report/person', {
        method: 'DELETE',
        token,
        body: {
          type,
          period: 'today',
          resident_id: person.resident_id,
          status,
        },
      })
      setReport(data)
      toast(`បានលុប${label}`)
      // refresh sheet preview (delete only allowed for today → week sheet)
      const sheetPath = `/api/attendance/report/week-sheet?type=${encodeURIComponent(type)}&date=${encodeURIComponent(data.to)}`
      const sheet = await apiRequest<WeekSheetData>(sheetPath, { token })
      setWeekSheet(sheet)
      setPreviewUrl(await weekSheetPngDataUrl(sheet))
    } catch (err) {
      toast(err instanceof Error ? err.message : 'លុបមិនបាន', 'error')
    } finally {
      setBusyId(null)
    }
  }

  if (types.loading) return <Spinner />

  const absentPeople = report?.absent_people || []
  const excusedPeople = report?.excused_people || []

  const absentPageCount = Math.max(1, Math.ceil(absentPeople.length / PEOPLE_PAGE_SIZE))
  const excusedPageCount = Math.max(1, Math.ceil(excusedPeople.length / PEOPLE_PAGE_SIZE))
  const safeAbsentPage = Math.min(absentPage, absentPageCount - 1)
  const safeExcusedPage = Math.min(excusedPage, excusedPageCount - 1)
  const absentPageItems = absentPeople.slice(
    safeAbsentPage * PEOPLE_PAGE_SIZE,
    safeAbsentPage * PEOPLE_PAGE_SIZE + PEOPLE_PAGE_SIZE,
  )
  const excusedPageItems = excusedPeople.slice(
    safeExcusedPage * PEOPLE_PAGE_SIZE,
    safeExcusedPage * PEOPLE_PAGE_SIZE + PEOPLE_PAGE_SIZE,
  )

  function PeoplePager({
    page,
    pageCount,
    total,
    onPage,
  }: {
    page: number
    pageCount: number
    total: number
    onPage: (next: number) => void
  }) {
    if (total <= PEOPLE_PAGE_SIZE) return null
    return (
      <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2.5">
        <button
          type="button"
          disabled={page <= 0}
          onClick={() => onPage(page - 1)}
          className="flex h-8 w-8 items-center justify-center rounded-xl bg-cream text-maroon disabled:opacity-40"
          aria-label="ទំព័រមុន"
        >
          <ChevronLeft size={16} />
        </button>
        <p className="text-[11px] font-bold text-muted">
          ទំព័រ {page + 1}/{pageCount}
        </p>
        <button
          type="button"
          disabled={page >= pageCount - 1}
          onClick={() => onPage(page + 1)}
          className="flex h-8 w-8 items-center justify-center rounded-xl bg-cream text-maroon disabled:opacity-40"
          aria-label="ទំព័របន្ទាប់"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    )
  }

  function PersonRow({
    status,
    person,
    index,
  }: {
    status: 'absent' | 'excused'
    person: ReportPerson
    index: number
  }) {
    const busy = busyId === person.resident_id
    return (
      <li className="flex items-start gap-3 px-4 py-3">
        <span className="mt-0.5 w-5 shrink-0 text-xs font-bold text-muted">{index + 1}.</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-ink">
            {person.last_name} {person.first_name}
          </p>
          {person.days > 1 || person.note ? (
            <p className="mt-0.5 text-xs text-muted">
              {person.days > 1 ? `${person.days} ថ្ងៃ` : ''}
              {person.days > 1 && person.note ? ' · ' : ''}
              {person.note || ''}
            </p>
          ) : null}
        </div>
        {canManage && activePeriod === 'today' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void removePerson(status, person)}
            className="settings-press flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#fde8e6] text-danger disabled:opacity-50"
            aria-label="លុប"
          >
            <Trash2 size={15} />
          </button>
        ) : null}
      </li>
    )
  }

  return (
    <div className="rise space-y-4">
      <section className="rounded-[22px] border border-line bg-paper px-4 py-3.5 shadow-[inset_3px_0_0_0_var(--color-saffron)]">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => navigate(`/attendance/${type}`)}
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cream text-maroon"
            aria-label="ត្រឡប់"
          >
            <ArrowLeft size={17} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-title text-[18px] text-maroon">របាយការណ៍វត្តមាន</h1>
            <p className="mt-0.5 text-[12px] font-bold text-saffron">{typeLabel}</p>
          </div>
        </div>
      </section>

      {showPeriodTabs ? (
      <div className="rounded-[20px] border border-line bg-paper p-1.5 shadow-[0_1px_0_rgba(42,26,18,0.04)]">
        <div
          className="relative grid w-full"
          style={{ gridTemplateColumns: `repeat(${reportPeriods.length}, minmax(0, 1fr))` }}
          role="tablist"
          aria-label="រយៈពេលរបាយការណ៍"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 rounded-[14px] bg-saffron shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
            style={{
              width: `${100 / reportPeriods.length}%`,
              transform: `translate3d(${Math.max(0, reportPeriods.indexOf(activePeriod)) * 100}%, 0, 0)`,
            }}
          />
          {reportPeriods.map((item) => {
            const active = activePeriod === item
            return (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setPeriod(item)}
                className={`settings-tab relative z-[1] flex w-full items-center justify-center rounded-[14px] px-2 py-2.5 text-center text-[12px] font-bold transition-colors duration-300 ${
                  active ? 'text-white' : 'text-muted hover:text-ink'
                }`}
              >
                {REPORT_PERIOD_LABELS[item]}
              </button>
            )
          })}
        </div>
      </div>
      ) : null}

      {loading ? (
        <Spinner />
      ) : report ? (
        <div key={activePeriod} className="settings-panel space-y-4">
          {typeUi.showReportAbsentExcusedLists ? (
            <>
          <section className="overflow-hidden rounded-[22px] border border-line bg-paper">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-sm font-bold text-danger">អវត្តមាន</h2>
              <span className="text-xs font-bold text-muted">{absentPeople.length} អង្គ</span>
            </div>
            {absentPeople.length === 0 ? (
              <p className="px-4 py-5 text-sm text-muted">មិនមានអវត្តមាន</p>
            ) : (
              <>
                <ul className="divide-y divide-line">
                  {absentPageItems.map((person, index) => (
                    <PersonRow
                      key={`a-${person.resident_id}`}
                      status="absent"
                      person={person}
                      index={safeAbsentPage * PEOPLE_PAGE_SIZE + index}
                    />
                  ))}
                </ul>
                <PeoplePager
                  page={safeAbsentPage}
                  pageCount={absentPageCount}
                  total={absentPeople.length}
                  onPage={setAbsentPage}
                />
              </>
            )}
          </section>

          <section className="overflow-hidden rounded-[22px] border border-line bg-paper">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-sm font-bold text-saffron">សូមច្បាប់</h2>
              <span className="text-xs font-bold text-muted">{excusedPeople.length} អង្គ</span>
            </div>
            {excusedPeople.length === 0 ? (
              <p className="px-4 py-5 text-sm text-muted">មិនមានសូមច្បាប់</p>
            ) : (
              <>
                <ul className="divide-y divide-line">
                  {excusedPageItems.map((person, index) => (
                    <PersonRow
                      key={`e-${person.resident_id}`}
                      status="excused"
                      person={person}
                      index={safeExcusedPage * PEOPLE_PAGE_SIZE + index}
                    />
                  ))}
                </ul>
                <PeoplePager
                  page={safeExcusedPage}
                  pageCount={excusedPageCount}
                  total={excusedPeople.length}
                  onPage={setExcusedPage}
                />
              </>
            )}
          </section>
            </>
          ) : null}

          {activePeriod === 'today' ? (
            <section className="rounded-[22px] border border-line bg-paper px-4 py-3">
              <p className="text-center text-[12px] font-bold text-muted">
                {report.from} · {report.kuti} · ទិន្នន័យពីកត់ត្រាថ្ងៃនេះ
              </p>
            </section>
          ) : (
          <section className="rounded-[22px] border border-line bg-paper p-4">
            <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
              <div className="relative shrink-0" ref={exportMenuRef}>
                <button
                  type="button"
                  disabled={!weekSheet && !previewUrl}
                  onClick={() => setExportMenuOpen((open) => !open)}
                  className="inline-flex items-center gap-1.5 rounded-2xl bg-saffron px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
                  aria-haspopup="menu"
                  aria-expanded={exportMenuOpen}
                >
                  ទាញយក
                  <ChevronDown
                    size={15}
                    className={`transition-transform ${exportMenuOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {exportMenuOpen ? (
                  <div
                    role="menu"
                    className="absolute right-0 z-20 mt-1.5 min-w-[10.5rem] overflow-hidden rounded-2xl border border-line bg-paper py-1 shadow-[0_12px_28px_rgba(42,26,18,0.16)]"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      disabled={exportingPdf || !weekSheet}
                      onClick={() => {
                        setExportMenuOpen(false)
                        void downloadPdf()
                      }}
                      className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm font-bold text-maroon hover:bg-cream disabled:opacity-50"
                    >
                      <FileDown size={15} />
                      {exportingPdf ? 'កំពុងទាញ...' : 'PDF'}
                    </button>
                    {canManage ? (
                      <button
                        type="button"
                        role="menuitem"
                        disabled={!previewUrl}
                        onClick={() => {
                          setExportMenuOpen(false)
                          openSendPreview()
                        }}
                        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm font-bold text-saffron hover:bg-cream disabled:opacity-50"
                      >
                        <Send size={15} />
                        ផ្ញើ Telegram
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
            {previewUrl ? (
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="block w-full overflow-hidden rounded-2xl bg-cream p-2 text-left"
              >
                {weekSheet?.variant === 'bon_party' ? null : (
                  <p className="mb-2 text-center text-[11px] font-bold text-muted">
                    {weekSheet
                      ? `${weekSheet.from} → ${weekSheet.to} · ${weekSheet.kuti} · ${
                          activePeriod === 'month' ? `A4 ផ្តេក · ថ្ងៃទី១–${weekSheet.days.length}` : 'Mon–Sun'
                        }`
                      : `${report.from} → ${report.to} · ${report.kuti} · ${
                          isReportPeriod(activePeriod) ? REPORT_PERIOD_LABELS[activePeriod] : activePeriod
                        }`}
                  </p>
                )}
                <img
                  src={previewUrl}
                  alt={activePeriod === 'month' ? 'មើលមុនរបាយការណ៍ A4 ផ្តេក' : 'មើលមុនរបាយការណ៍ A4'}
                  className="mx-auto max-h-[420px] w-auto max-w-full rounded-xl border border-line shadow-sm"
                />
                {weekSheet?.variant === 'bon_party' ? null : (
                  <p className="mt-2 text-center text-[11px] font-bold text-muted">
                    ចុចដើម្បីមើលពេញ · ✓ មក · ✗ អវត្តមាន · P សូមច្បាប់
                  </p>
                )}
              </button>
            ) : (
              <p className="rounded-2xl bg-cream p-4 text-sm text-muted">កំពុងបង្កើតមើលមុន…</p>
            )}
          </section>
          )}
        </div>
      ) : null}

      <Sheet
        open={previewOpen}
        title="មើលមុន PNG"
        wide
        onClose={() => !sending && setPreviewOpen(false)}
      >
        <div className="space-y-3">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={activePeriod === 'month' ? 'A4 month sheet' : 'A4 week sheet'}
              className="mx-auto max-h-[min(58dvh,520px)] w-auto max-w-full rounded-xl border border-line"
            />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={exportingPdf || !weekSheet}
              onClick={() => void downloadPdf()}
              className="settings-press inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-cream py-3 text-sm font-bold text-maroon disabled:opacity-50"
            >
              <FileDown size={15} />
              ទាញ PDF
            </button>
            {canManage ? (
              <button
                type="button"
                disabled={sending || !previewUrl}
                onClick={() => void confirmSendTelegram()}
                className="settings-press inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-saffron py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                <Send size={15} />
                {sending ? 'កំពុងផ្ញើ...' : 'ផ្ញើ Telegram'}
              </button>
            ) : null}
          </div>
        </div>
      </Sheet>
    </div>
  )
}
