import { useToast } from '../lib/toast'

export function Toasts() {
  const items = useToast((s) => s.items)
  const dismiss = useToast((s) => s.dismiss)

  if (!items.length) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[80] flex flex-col items-center gap-2 px-4 pt-[max(16px,env(safe-area-inset-top))]">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => dismiss(item.id)}
          className={`pointer-events-auto max-w-md rounded-2xl px-4 py-3 text-sm font-bold shadow-lg ${
            item.kind === 'error'
              ? 'bg-danger text-white'
              : item.kind === 'info'
                ? 'bg-maroon text-white'
                : 'bg-ok text-white'
          }`}
        >
          {item.message}
        </button>
      ))}
    </div>
  )
}
