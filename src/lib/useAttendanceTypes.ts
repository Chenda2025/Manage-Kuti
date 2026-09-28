import { useEffect, useState } from 'react'
import { apiRequest } from './api'
import type { AttendanceTypeDef } from './attendance'
import { useAuth } from './auth'
import { hasAttendanceTypeAccess } from './roles'

export function useAttendanceTypes(all = false, filterByAccess = true) {
  const token = useAuth((s) => s.token)
  const user = useAuth((s) => s.user)
  const [data, setData] = useState<AttendanceTypeDef[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    if (!token) {
      setData([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const rows = await apiRequest<AttendanceTypeDef[]>(
        `/api/attendance/types${all ? '?all=1' : ''}`,
        { token },
      )
      const list = Array.isArray(rows) ? rows : []
      setData(
        filterByAccess ? list.filter((item) => hasAttendanceTypeAccess(user, item.key)) : list,
      )
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'មិនអាចផ្ទុកប្រភេទវត្តមាន')
      setData([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, all, filterByAccess, user?.id, user?.role, JSON.stringify(user?.managed_attendance_types)])

  return { data, loading, error, reload }
}
