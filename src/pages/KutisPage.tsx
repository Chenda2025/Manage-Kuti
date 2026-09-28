import { Link, Navigate } from 'react-router-dom'
import { Building2 } from 'lucide-react'
import { EmptyState } from '../components/EmptyState'
import { Spinner } from '../components/Spinner'
import type { Kuti } from '../lib/types'
import { useApiList } from '../lib/useApiList'

/** Skip the kuti list — this app focuses on a single home kuti. */
export function KutisPage() {
  const kutis = useApiList<Kuti>('/api/core/kutis')

  if (kutis.loading) return <Spinner />

  const home = kutis.data[0]
  if (home) return <Navigate to={`/kutis/${home.id}`} replace />

  return (
    <EmptyState
      icon={Building2}
      title="មិនទាន់មានកុដិ"
      hint="បញ្ចូល Token នៅការកំណត់ ដើម្បីទាញទិន្នន័យកុដិ"
      action={
        <Link to="/settings" className="rounded-2xl bg-saffron px-5 py-3 font-bold text-white">
          ទៅការកំណត់
        </Link>
      }
    />
  )
}
