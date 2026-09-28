import { ChevronDown, ChevronUp } from 'lucide-react'
import {
  composeHHMMFromKhmerParts,
  formatKhmerClockFromHHMM,
  splitHHMMToKhmerParts,
  toKhmerClockDigits,
} from '../lib/attendance'

type Props = {
  value: string
  onChange: (hhmm: string) => void
  /** Minute step size (default 5). */
  minuteStep?: number
  className?: string
}

export function KhmerTimePicker({
  value,
  onChange,
  minuteStep = 5,
  className = '',
}: Props) {
  const parts = splitHHMMToKhmerParts(value || '07:00')
  const step = Math.max(1, Math.min(30, minuteStep))

  function setParts(hour12: number, minute: number, period: 'ព្រឹក' | 'ល្ងាច') {
    onChange(composeHHMMFromKhmerParts(hour12, minute, period))
  }

  return (
    <div className={`rounded-[18px] border border-line bg-paper px-3 py-2.5 ${className}`}>
      <p className="text-center font-title text-[22px] leading-none tracking-tight text-maroon">
        {formatKhmerClockFromHHMM(value || '07:00')}
      </p>

      <div className="mt-2 grid grid-cols-2 gap-1 rounded-[12px] bg-cream p-0.5">
        {(['ព្រឹក', 'ល្ងាច'] as const).map((period) => (
          <button
            key={period}
            type="button"
            onClick={() => setParts(parts.hour12, parts.minute, period)}
            className={`rounded-[10px] py-1.5 text-[11px] font-bold transition-colors ${
              parts.period === period
                ? 'bg-saffron text-white shadow-sm'
                : 'bg-transparent text-muted'
            }`}
          >
            {period}
          </button>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="flex flex-col items-center gap-1">
          <p className="text-[10px] font-bold text-muted">ម៉ោង</p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="បន្ថយម៉ោង"
              onClick={() => {
                const next = parts.hour12 <= 1 ? 12 : parts.hour12 - 1
                setParts(next, parts.minute, parts.period)
              }}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-cream text-maroon"
            >
              <ChevronDown size={16} />
            </button>
            <span className="min-w-[2rem] text-center font-title text-[16px] text-ink">
              {toKhmerClockDigits(String(parts.hour12).padStart(2, '0'))}
            </span>
            <button
              type="button"
              aria-label="បង្កើនម៉ោង"
              onClick={() => {
                const next = parts.hour12 >= 12 ? 1 : parts.hour12 + 1
                setParts(next, parts.minute, parts.period)
              }}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-cream text-maroon"
            >
              <ChevronUp size={16} />
            </button>
          </div>
        </div>
        <div className="flex flex-col items-center gap-1">
          <p className="text-[10px] font-bold text-muted">នាទី</p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="បន្ថយនាទី"
              onClick={() => {
                const next = (parts.minute - step + 60) % 60
                setParts(parts.hour12, next, parts.period)
              }}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-cream text-maroon"
            >
              <ChevronDown size={16} />
            </button>
            <span className="min-w-[2rem] text-center font-title text-[16px] text-ink">
              {toKhmerClockDigits(String(parts.minute).padStart(2, '0'))}
            </span>
            <button
              type="button"
              aria-label="បង្កើននាទី"
              onClick={() => {
                const next = (parts.minute + step) % 60
                setParts(parts.hour12, next, parts.period)
              }}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-cream text-maroon"
            >
              <ChevronUp size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
