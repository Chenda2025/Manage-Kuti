import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search } from 'lucide-react'
import { inputClass } from './Field'

export type SearchableOption = {
  value: string
  label: string
}

type Props = {
  value: string
  onChange: (value: string) => void
  options: SearchableOption[]
  placeholder?: string
  searchPlaceholder?: string
  required?: boolean
  /** Visible name rows before scrolling. */
  visibleCount?: number
}

const ROW_PX = 44
const SEARCH_BLOCK_PX = 52
const GAP_PX = 6

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'ជ្រើសរើស...',
  searchPlaceholder = 'ស្វែងរកឈ្មោះ...',
  required,
  visibleCount = 5,
}: Props) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null)

  const selected = options.find((item) => item.value === value)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (item) => item.label.toLowerCase().includes(q) || item.value.toLowerCase().includes(q),
    )
  }, [options, query])

  function updatePosition() {
    const el = rootRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setCoords({
      top: rect.bottom + GAP_PX,
      left: rect.left,
      width: rect.width,
    })
  }

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
      setQuery('')
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        setQuery('')
      }
    }
    const onReposition = () => updatePosition()
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onReposition)
    // Reposition when the sheet body scrolls
    document.addEventListener('scroll', onReposition, true)
    const t = window.setTimeout(() => searchRef.current?.focus(), 0)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onReposition)
      document.removeEventListener('scroll', onReposition, true)
      window.clearTimeout(t)
    }
  }, [open])

  function pick(next: string) {
    onChange(next)
    setOpen(false)
    setQuery('')
  }

  const panel =
    open && coords && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={panelRef}
            id={listId}
            role="listbox"
            className="fixed z-[90] overflow-hidden rounded-2xl border border-line bg-white shadow-[0_12px_28px_rgba(42,26,18,0.16)]"
            style={{ top: coords.top, left: coords.left, width: coords.width }}
          >
            <div className="border-b border-line p-2" style={{ height: SEARCH_BLOCK_PX }}>
              <div className="flex h-full items-center gap-2 rounded-xl bg-cream px-3">
                <Search size={16} className="shrink-0 text-muted" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full bg-transparent text-sm outline-none"
                />
              </div>
            </div>
            <div
              className="overflow-y-auto overscroll-contain"
              style={{ maxHeight: ROW_PX * visibleCount }}
            >
              {filtered.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted">រកមិនឃើញឈ្មោះ</p>
              ) : (
                filtered.map((item) => {
                  const active = item.value === value
                  return (
                    <button
                      key={item.value}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`flex w-full items-center px-4 text-left text-sm ${
                        active ? 'bg-[#fff1d6] font-bold text-saffron' : 'text-ink hover:bg-cream'
                      }`}
                      style={{ height: ROW_PX }}
                      onClick={() => pick(item.value)}
                    >
                      <span className="truncate">{item.label}</span>
                    </button>
                  )
                })
              )}
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={`${inputClass} flex items-center justify-between gap-2 text-left`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={selected ? 'truncate text-ink' : 'truncate text-muted'}>
          {selected?.label || placeholder}
        </span>
        <ChevronDown size={18} className={`shrink-0 text-muted transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {required ? (
        <input
          tabIndex={-1}
          className="pointer-events-none absolute h-px w-px opacity-0"
          value={value}
          onChange={() => {}}
          required
          aria-hidden
        />
      ) : null}

      {panel}
    </div>
  )
}
