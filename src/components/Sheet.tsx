import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useEffect } from 'react'

type Props = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
  /** Narrower dialog, tighter padding — for short forms like សូមច្បាប់ */
  compact?: boolean
  subtitle?: ReactNode
  centerHeader?: boolean
  /** Stack above another open sheet */
  elevated?: boolean
}

export function Sheet({ open, title, onClose, children, wide, compact, subtitle, centerHeader, elevated }: Props) {
  useEffect(() => {
    if (!open) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [open])

  if (!open || typeof document === 'undefined') return null

  const maxW = wide ? 'max-w-xl' : compact ? 'max-w-[17.5rem]' : 'max-w-[22rem]'
  const z = elevated ? 'z-[90]' : 'z-[80]'

  return createPortal(
    <div className={`fixed inset-0 ${z} flex items-center justify-center ${compact ? 'p-6' : 'p-4'}`}>
      <button
        type="button"
        className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="បិទ"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        className={`relative z-10 flex w-full flex-col overflow-hidden rounded-[20px] border border-line bg-paper shadow-[0_20px_50px_rgba(42,26,18,0.28)] ${maxW} ${
          compact ? 'max-h-[min(70dvh,420px)]' : 'max-h-[min(82dvh,640px)] rounded-[24px]'
        }`}
      >
        <div
          className={`relative flex shrink-0 gap-2 ${
            compact ? 'px-3 pb-2 pt-3' : 'gap-3 px-4 pb-3 pt-4'
          } ${centerHeader ? 'flex-col items-center text-center' : 'items-start justify-between'}`}
        >
          <div className={`min-w-0 ${centerHeader ? 'w-full' : 'flex-1'}`}>
            <h2
              id="sheet-title"
              className={`font-bold text-maroon ${
                compact ? 'text-[14px]' : 'text-[17px]'
              } ${centerHeader ? 'text-center' : ''}`}
            >
              {title}
            </h2>
            {subtitle ? <div className={compact ? 'mt-1.5' : 'mt-2'}>{subtitle}</div> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`flex shrink-0 items-center justify-center rounded-full bg-cream text-muted ${
              compact ? 'h-7 w-7' : 'h-8 w-8'
            } ${centerHeader ? 'absolute right-2.5 top-2.5' : ''}`}
            aria-label="បិទ"
          >
            <X size={compact ? 14 : 16} />
          </button>
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto ${compact ? 'px-3 pb-3' : 'px-4 pb-4'}`}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}
