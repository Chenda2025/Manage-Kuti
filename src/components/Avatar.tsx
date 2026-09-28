import { mediaUrl } from '../lib/api'
import { initials } from '../lib/format'

type Props = {
  name: string
  src?: string | null
  size?: number
}

export function Avatar({ name, src, size = 44 }: Props) {
  const url = mediaUrl(src)
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-maroon text-sm font-bold text-gold"
      style={{ width: size, height: size }}
    >
      {url ? <img src={url} alt={name} className="h-full w-full object-cover" /> : initials(name)}
    </div>
  )
}
