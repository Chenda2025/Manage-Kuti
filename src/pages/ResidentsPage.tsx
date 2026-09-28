import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { UsersRound } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { EmptyState } from '../components/EmptyState'
import { SearchBar } from '../components/SearchBar'
import { Spinner } from '../components/Spinner'
import { fullName, monkLabel, compareResidentsByPosition, statusLabel } from '../lib/format'
import type { Kuti, Resident } from '../lib/types'
import { useApiList } from '../lib/useApiList'

export function ResidentsPage() {
  const residents = useApiList<Resident>('/api/students/list')
  const kutis = useApiList<Kuti>('/api/core/kutis')
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return residents.data
      .filter((item) => {
        if (!q) return true
        const name = fullName(item.last_name, item.first_name)
        const haystack =
          `${name} ${item.latin_name || ''} ${item.student_code} ${item.monk_status || ''} ${item.position || ''}`.toLowerCase()
        return haystack.includes(q)
      })
      .sort(compareResidentsByPosition)
  }, [residents.data, query])

  if (residents.loading || kutis.loading) return <Spinner />

  const home = kutis.data[0]
  const homeName = home?.token_linked ? home.kuti_name || 'កុដិ.........' : 'កុដិ.........'
  const managerName = home?.token_linked ? home.manager_name || '—' : '—'
  const monkCount = residents.data.length

  return (
    <div className="rise space-y-4">
      <div>
        <h1 className="font-title text-xl leading-[1.5] text-maroon">
          ព្រះសង្ឃ {monkCount} / {homeName} / {managerName}
        </h1>
      </div>

      <SearchBar value={query} onChange={setQuery} placeholder="ស្វែងរកឈ្មោះ ឬកូដ" />

      {filtered.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title={kutis.data.length === 0 ? 'មិនទាន់មានទិន្នន័យ' : 'រកមិនឃើញ'}
          hint={
            kutis.data.length === 0
              ? 'បញ្ចូល Token នៅការកំណត់ ដើម្បីទាញព្រះសង្ឃ'
              : undefined
          }
          action={
            kutis.data.length === 0 ? (
              <Link to="/settings" className="rounded-2xl bg-saffron px-5 py-3 font-bold text-white">
                ទៅការកំណត់
              </Link>
            ) : null
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((resident) => {
            const name = fullName(resident.last_name, resident.first_name)
            return (
              <div
                key={resident.id}
                className="flex w-full items-center gap-3 rounded-[22px] border border-line bg-paper p-3 text-left"
              >
                <Avatar name={name} src={resident.image_url} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{name}</p>
                  <p className="text-xs text-muted">
                    {[
                      monkLabel(resident.monk_status),
                      resident.position || null,
                      resident.vassa_years != null ? `វស្សា ${resident.vassa_years}` : null,
                      statusLabel(resident.status),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
