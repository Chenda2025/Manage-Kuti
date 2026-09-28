import { Search } from 'lucide-react'

type Props = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function SearchBar({ value, onChange, placeholder = 'ស្វែងរក...' }: Props) {
  return (
    <label className="flex items-center gap-2 rounded-2xl border border-line bg-paper px-3 py-3">
      <Search size={18} className="shrink-0 text-muted" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-base outline-none"
      />
    </label>
  )
}
