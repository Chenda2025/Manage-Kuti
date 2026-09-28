import { Camera } from 'lucide-react'
import { mediaUrl } from '../lib/api'
import { initials } from '../lib/format'

type Props = {
  name: string
  src?: string | null
  size?: number
  badge?: boolean
}

export function ProfilePhoto({ name, src, size = 40, badge = false }: Props) {
  const url = mediaUrl(src)
  const fontSize = Math.max(12, Math.round(size * 0.32))

  return (
    <span
      className="relative inline-flex shrink-0 overflow-visible"
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
    >
      <span
        className="box-border block overflow-hidden rounded-full bg-gradient-to-b from-[#f6e2a8] via-[#d4a017] to-[#7a4c0e] p-[2px] shadow-[0_4px_10px_rgba(0,0,0,0.28)]"
        style={{ width: size, height: size }}
      >
        <span
          className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-[#2a0f09] font-bold text-gold"
          style={{ fontSize }}
        >
          {url ? (
            <img
              src={url}
              alt=""
              width={size}
              height={size}
              className="block h-full w-full max-h-full max-w-full object-cover"
              decoding="async"
            />
          ) : (
            initials(name)
          )}
        </span>
      </span>
      {badge ? (
        <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-maroon bg-gold text-maroon shadow">
          <Camera size={11} strokeWidth={2.4} />
        </span>
      ) : null}
    </span>
  )
}
