import type { ReactNode } from 'react'

type Props = {
  label: string
  children: ReactNode
  hint?: string
}

export function Field({ label, children, hint }: Props) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-bold text-muted">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  )
}

export const inputClass =
  'w-full rounded-2xl border border-line bg-white px-4 py-3 text-base outline-none focus:border-saffron'
