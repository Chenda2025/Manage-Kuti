import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, DoorOpen, Eye, UsersRound } from 'lucide-react'
import { EmptyState } from '../components/EmptyState'
import { Sheet } from '../components/Sheet'
import { Spinner } from '../components/Spinner'
import { fullName, monkLabel } from '../lib/format'
import type { Kuti, Pagoda, Resident, Room } from '../lib/types'
import { useApiList } from '../lib/useApiList'

export function KutiDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const kutis = useApiList<Kuti>('/api/core/kutis')
  const pagodas = useApiList<Pagoda>('/api/core/pagodas')
  const residents = useApiList<Resident>('/api/students/list')

  const kutiId = Number(id)
  const rooms = useApiList<Room>(Number.isFinite(kutiId) ? `/api/core/kutis/${kutiId}/rooms` : null)
  const [viewRoom, setViewRoom] = useState<Room | null>(null)

  const kuti = kutis.data.find((item) => item.id === kutiId)
  const pagoda = pagodas.data.find((item) => item.id === kuti?.pagoda)

  const members = useMemo(
    () => residents.data.filter((item) => item.kuti === kutiId && item.status !== 'dropped'),
    [residents.data, kutiId],
  )

  const roomOccupancy = useMemo(() => {
    const map = new Map<number, number>()
    for (const member of members) {
      if (!member.room_id) continue
      map.set(member.room_id, (map.get(member.room_id) || 0) + 1)
    }
    return map
  }, [members])

  const viewRoomMembers = useMemo(() => {
    if (!viewRoom) return [] as Resident[]
    const manager = (viewRoom.manager_name || '').trim().replace(/\s+/g, ' ')
    return members
      .filter((monk) => monk.room_id === viewRoom.id)
      .slice()
      .sort((a, b) => {
        const aName = fullName(a.last_name, a.first_name).trim().replace(/\s+/g, ' ')
        const bName = fullName(b.last_name, b.first_name).trim().replace(/\s+/g, ' ')
        const aMgr = Boolean(manager) && aName === manager
        const bMgr = Boolean(manager) && bName === manager
        if (aMgr !== bMgr) return aMgr ? -1 : 1
        return aName.localeCompare(bName, 'km')
      })
  }, [members, viewRoom])

  const byStatus = useMemo(() => {
    return members.reduce<Record<string, number>>((acc, item) => {
      const key = item.monk_status || 'ផ្សេងទៀត'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
  }, [members])

  if (kutis.loading || residents.loading || rooms.loading) return <Spinner />
  if (!kuti) {
    const home = kutis.data[0]
    if (home) return <Navigate to={`/kutis/${home.id}`} replace />
    return (
      <EmptyState
        icon={UsersRound}
        title="មិនទាន់មានកុដិ"
        action={
          <button
            type="button"
            className="rounded-2xl bg-saffron px-4 py-2.5 font-bold text-white"
            onClick={() => navigate('/')}
          >
            ត្រឡប់ទំព័រដើម
          </button>
        }
      />
    )
  }

  const tokenLinked = Boolean(kuti.token_linked)
  const displayKutiName = tokenLinked ? kuti.kuti_name || 'កុដិ.........' : 'កុដិ.........'

  return (
    <div className="rise space-y-4">
      <section className="rounded-[22px] border border-line bg-paper px-4 py-3.5 shadow-[inset_3px_0_0_0_var(--color-saffron)]">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cream text-maroon"
            aria-label="ត្រឡប់ទំព័រដើម"
          >
            <ArrowLeft size={17} />
          </button>
          <div className="min-w-0 flex-1">
            {tokenLinked ? (
              <p className="text-[11px] font-bold text-muted">{pagoda?.name || 'វត្ត'}</p>
            ) : null}
            <h1 className="font-title text-[20px] leading-[1.6] text-maroon">{displayKutiName}</h1>
            {tokenLinked ? (
              <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
                <UsersRound size={13} className="shrink-0" />
                អ្នកគ្រប់គ្រង៖ {kuti.manager_name || '—'}
              </p>
            ) : (
              <p className="mt-1 text-[12px] text-muted">
                បញ្ចូល Token នៅ{' '}
                <Link to="/settings" className="font-bold text-saffron">
                  ការកំណត់
                </Link>{' '}
                ដើម្បីទាញឈ្មោះកុដិ
              </p>
            )}
          </div>
        </div>

        {tokenLinked ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-cream px-3 py-1 text-[11px] font-bold text-ink">
              {rooms.data.length} បន្ទប់
            </span>
            <span className="rounded-full bg-cream px-3 py-1 text-[11px] font-bold text-ink">
              {members.length} អ្នកស្នាក់
            </span>
            {Object.entries(byStatus).map(([label, count]) => (
              <span
                key={label}
                className="rounded-full border border-line bg-paper px-3 py-1 text-[11px] font-bold text-muted"
              >
                {label} · {count}
              </span>
            ))}
          </div>
        ) : null}
      </section>

      {!tokenLinked ? (
        <EmptyState
          icon={DoorOpen}
          title="មិនទាន់មានកុដិ"
          hint="បញ្ចូល Token នៅការកំណត់ជាមុនសិន — បន្ទាប់មកទើបបង្កើតបន្ទប់បាន"
          action={
            <Link to="/settings" className="rounded-2xl bg-saffron px-5 py-3 font-bold text-white">
              ទៅការកំណត់
            </Link>
          }
        />
      ) : rooms.data.length === 0 ? (
        <EmptyState
          icon={DoorOpen}
          title="មិនទាន់មានបន្ទប់"
          hint="បង្កើតបន្ទប់នៅការកំណត់ → ផ្ទាំងបន្ទប់"
          action={
            <Link to="/settings" className="rounded-2xl bg-saffron px-5 py-3 font-bold text-white">
              ទៅការកំណត់
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rooms.data.map((room, index) => (
            <article key={room.id} className="rounded-[20px] border border-line bg-paper p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold text-muted">បន្ទប់ទី {index + 1}</p>
                  <h2 className="truncate text-lg font-bold">{room.room_name}</h2>
                  <p className="mt-1 text-sm text-muted">អ្នកគ្រប់គ្រង៖ {room.manager_name || '—'}</p>
                  <p className="mt-1 text-xs font-bold text-ink">
                    {roomOccupancy.get(room.id) || 0} នាក់
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setViewRoom(room)}
                  className="settings-press flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cream text-maroon"
                  aria-label="មើលបញ្ជីព្រះសង្ឃ"
                  title="មើលបញ្ជីព្រះសង្ឃ"
                >
                  <Eye size={18} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Sheet
        open={viewRoom !== null}
        title={viewRoom ? viewRoom.room_name : 'បន្ទប់'}
        subtitle={`បញ្ជីព្រះសង្ឃ · ${viewRoomMembers.length} អង្គ`}
        onClose={() => setViewRoom(null)}
      >
        {viewRoomMembers.length === 0 ? (
          <p className="rounded-2xl bg-cream px-3 py-5 text-center text-sm text-muted">
            មិនទាន់មានព្រះសង្ឃក្នុងបន្ទប់
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
            {viewRoomMembers.map((monk, index) => {
              const name = fullName(monk.last_name, monk.first_name)
              const manager = (viewRoom?.manager_name || '').trim().replace(/\s+/g, ' ')
              const isManager =
                Boolean(manager) && name.trim().replace(/\s+/g, ' ') === manager
              return (
                <li
                  key={monk.id}
                  className={`flex items-center gap-3 px-3 py-2.5 ${
                    isManager ? 'bg-saffron/10' : 'bg-paper'
                  }`}
                >
                  <span
                    className={`w-5 shrink-0 text-xs font-bold ${
                      isManager ? 'text-saffron' : 'text-muted'
                    }`}
                  >
                    {index + 1}.
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-sm font-bold ${
                        isManager ? 'text-saffron' : 'text-ink'
                      }`}
                    >
                      {name}
                    </p>
                    <p className="truncate text-[11px] text-muted">
                      {monkLabel(monk.monk_status)}
                      {isManager ? ' · អ្នកគ្រប់គ្រងបន្ទប់' : ''}
                    </p>
                  </div>
                  {isManager ? (
                    <span className="shrink-0 rounded-full bg-saffron/15 px-2 py-0.5 text-[10px] font-bold text-saffron">
                      មេបន្ទប់
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </Sheet>
    </div>
  )
}
