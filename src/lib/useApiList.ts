import { useCallback, useEffect, useState } from 'react'
import { apiRequest, unwrapList } from './api'
import { useAuth } from './auth'

export function useApiList<T>(path: string | null) {
  const token = useAuth((s) => s.token)
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(Boolean(path))
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!path) {
      setData([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const raw = await apiRequest<unknown>(path, { token })
      setData(unwrapList<T>(raw))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'មិនអាចទាញទិន្នន័យបានទេ')
    } finally {
      setLoading(false)
    }
  }, [path, token])

  useEffect(() => {
    void reload()
  }, [reload])

  return { data, loading, error, reload, setData }
}
