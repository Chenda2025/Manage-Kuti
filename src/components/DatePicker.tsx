import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, ChevronLeft, ChevronRight, Pencil } from 'lucide-react'

const WEEKDAYS = ['អា', 'ច', 'អ', 'ព', 'ព្រ', 'សុ', 'ស'] as const
const MONTHS = [
  'មករា',
  'កុម្ភៈ',
  'មីនា',
  'មេសា',
  'ឧសភា',
  'មិថុនា',
  'កក្កដា',
  'សីហា',
  'កញ្ញា',
  'តុលា',
  'វិច្ឆិកា',
  'ធ្នូ',
] as const
const WEEKDAY_FULL = ['អាទិត្យ', 'ច័ន្ទ', 'អង្គារ', 'ពុធ', 'ព្រហស្បតិ៍', 'សុក្រ', 'សៅរ៍'] as const

function parseIso(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null
  return date
}

function toIso(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1)
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function formatHeader(date: Date) {
  return `${WEEKDAY_FULL[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`
}

function formatShort(date: Date) {
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`
}

function parseTypedDate(raw: string): Date | null {
  const text = raw.trim()
  const iso = parseIso(text)
  if (iso) return iso
  const match = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/)
  if (!match) return null
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }
  return date
}

type DatePickerProps = {
  value: string
  onChange: (next: string) => void
  label?: string
  min?: string
  max?: string
  disabled?: boolean
  align?: 'left' | 'center'
}

export function DatePicker({
  value,
  onChange,
  label,
  min,
  max,
  disabled,
  align = 'left',
}: DatePickerProps) {
  const selected = parseIso(value) || new Date()
  const [open, setOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(selected))
  const [draft, setDraft] = useState(selected)
  const [manual, setManual] = useState(false)
  const [typed, setTyped] = useState(formatShort(selected))

  useEffect(() => {
    if (!open) return
    const next = parseIso(value) || new Date()
    setDraft(next)
    setViewMonth(startOfMonth(next))
    setTyped(formatShort(next))
    setManual(false)
  }, [open, value])

  useEffect(() => {
    if (!open) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [open])

  const minDate = parseIso(min || null)
  const maxDate = parseIso(max || null)

  const cells = useMemo(() => {
    const first = startOfMonth(viewMonth)
    const startWeekday = first.getDay()
    const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate()
    const items: Array<Date | null> = []
    for (let i = 0; i < startWeekday; i += 1) items.push(null)
    for (let day = 1; day <= daysInMonth; day += 1) {
      items.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day))
    }
    while (items.length % 7 !== 0) items.push(null)
    return items
  }, [viewMonth])

  function isDisabled(date: Date) {
    if (minDate && date < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate())) {
      return true
    }
    if (maxDate && date > new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate())) {
      return true
    }
    return false
  }

  function confirm() {
    if (manual) {
      const parsed = parseTypedDate(typed)
      if (!parsed || isDisabled(parsed)) return
      onChange(toIso(parsed))
    } else {
      if (isDisabled(draft)) return
      onChange(toIso(draft))
    }
    setOpen(false)
  }

  if (typeof document === 'undefined') return null

  return (
    <>
      <label className={`block ${align === 'center' ? 'text-center' : ''}`}>
        {label ? (
          <span
            className={`mb-1.5 block text-sm font-bold text-muted ${
              align === 'center' ? 'text-center' : ''
            }`}
          >
            {label}
          </span>
        ) : null}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          className={`flex w-full items-center gap-2 rounded-2xl border border-line bg-white px-4 py-3 text-base outline-none transition hover:border-saffron focus:border-saffron disabled:opacity-60 ${
            align === 'center' ? 'justify-center text-center' : 'justify-between text-left'
          }`}
        >
          <span className="truncate font-bold text-ink">{formatShort(selected)}</span>
          <CalendarDays size={18} className="shrink-0 text-saffron" />
        </button>
      </label>

      {open
        ? createPortal(
            <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
              <button
                type="button"
                className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]"
                onClick={() => setOpen(false)}
                aria-label="បិទ"
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-label="ជ្រើសរើសកាលបរិច្ឆេទ"
                className="relative z-10 w-full max-w-[20rem] overflow-hidden rounded-[24px] bg-paper shadow-[0_24px_60px_rgba(42,26,18,0.28)]"
              >
                <div className="px-4 pb-1.5 pt-3.5">
                  <p className="text-[12px] font-bold text-muted">ជ្រើសរើសកាលបរិច្ឆេទ</p>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <p className="font-title text-[18px] leading-[1.35] text-ink">
                      {formatHeader(manual ? parseTypedDate(typed) || draft : draft)}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setManual((prev) => !prev)
                        setTyped(formatShort(draft))
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-ink/80 hover:bg-cream"
                      aria-label={manual ? 'បើកប្រតិទិន' : 'បញ្ចូលកាលបរិច្ឆេទ'}
                    >
                      {manual ? <CalendarDays size={16} /> : <Pencil size={15} />}
                    </button>
                  </div>
                </div>

                {manual ? (
                  <div className="px-4 py-3">
                    <label className="relative block rounded-xl border-2 border-saffron px-3 pb-2 pt-2.5">
                      <span className="absolute -top-2 left-3 bg-paper px-1 text-[10px] font-bold text-saffron">
                        បញ្ចូលកាលបរិច្ឆេទ
                      </span>
                      <input
                        className="w-full bg-transparent text-sm font-bold text-ink outline-none"
                        value={typed}
                        onChange={(e) => setTyped(e.target.value)}
                        placeholder="ថ្ងៃ/ខែ/ឆ្នាំ"
                        autoFocus
                      />
                    </label>
                  </div>
                ) : (
                  <div className="px-2.5 pb-1 pt-0.5">
                    <div className="mb-1 flex items-center justify-between px-1.5">
                      <p className="rounded-lg px-1.5 py-1 text-xs font-bold text-ink">
                        {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
                      </p>
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => setViewMonth((m) => addMonths(m, -1))}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-ink hover:bg-cream"
                          aria-label="ខែមុន"
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewMonth((m) => addMonths(m, 1))}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-ink hover:bg-cream"
                          aria-label="ខែបន្ទាប់"
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-7 px-0.5 text-center text-[11px] font-bold text-muted">
                      {WEEKDAYS.map((day, index) => (
                        <span key={`${day}-${index}`} className="py-1">
                          {day}
                        </span>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 px-0.5 pb-0.5">
                      {cells.map((day, index) => {
                        if (!day) return <span key={`empty-${index}`} className="h-9" />
                        const selectedDay = sameDay(day, draft)
                        const disabledDay = isDisabled(day)
                        return (
                          <button
                            key={toIso(day)}
                            type="button"
                            disabled={disabledDay}
                            onClick={() => setDraft(day)}
                            className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-bold transition ${
                              selectedDay
                                ? 'bg-saffron text-white'
                                : disabledDay
                                  ? 'text-muted/35'
                                  : 'text-ink hover:bg-cream'
                            }`}
                          >
                            {day.getDate()}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end gap-5 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="text-xs font-bold text-saffron"
                  >
                    បោះបង់
                  </button>
                  <button
                    type="button"
                    onClick={confirm}
                    className="text-xs font-bold text-saffron"
                  >
                    យល់ព្រម
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
