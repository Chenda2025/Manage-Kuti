import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { MANAGER_PAGES, canAccess, hasPageAccess, pageKeyFromPath } from '../lib/roles'
import type { AppPageKey, Permission } from '../lib/types'

type Props = {
  children: ReactNode
  permission?: Permission | Permission[]
  /** Optional explicit page key; otherwise inferred from the current path. */
  page?: AppPageKey
}

function firstAllowedPath(user: NonNullable<ReturnType<typeof useAuth.getState>['user']>) {
  const hit = MANAGER_PAGES.find((p) => hasPageAccess(user, p.key))
  return hit?.path || '/login'
}

export function Protected({ children, permission, page }: Props) {
  const user = useAuth((s) => s.user)
  const location = useLocation()
  if (!user) return <Navigate to="/login" replace />
  if (permission) {
    const needed = Array.isArray(permission) ? permission : [permission]
    if (!canAccess(user.role, needed)) {
      return <Navigate to={firstAllowedPath(user)} replace />
    }
  }
  const pageKey = page || pageKeyFromPath(location.pathname)
  if (pageKey && !hasPageAccess(user, pageKey)) {
    const fallback = firstAllowedPath(user)
    if (fallback === location.pathname) return children
    return <Navigate to={fallback} replace />
  }
  return children
}
