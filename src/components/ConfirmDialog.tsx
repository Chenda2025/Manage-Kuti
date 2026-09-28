import { createPortal } from 'react-dom'

type Props = {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'បញ្ជាក់',
  danger,
  onConfirm,
  onClose,
}: Props) {
  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={onClose} aria-label="បិទ" />
      <div className="relative z-10 w-full max-w-[22rem] rounded-[24px] border border-line bg-paper p-5 shadow-[0_20px_50px_rgba(42,26,18,0.28)]">
        <h2 className="text-[17px] font-bold text-maroon">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted">{message}</p>
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <button type="button" onClick={onClose} className="rounded-2xl bg-cream px-4 py-3 font-bold text-muted">
            បោះបង់
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-2xl px-4 py-3 font-bold text-white ${danger ? 'bg-danger' : 'bg-saffron'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
