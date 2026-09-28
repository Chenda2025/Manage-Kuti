const PRODUCTION_API = ''

export const API_ORIGIN = (import.meta.env.VITE_API_URL || PRODUCTION_API).replace(/\/$/, '')

function withSlash(path: string) {
  if (path.includes('?')) {
    const [base, query] = path.split('?')
    return `${base.endsWith('/') ? base : `${base}/`}?${query}`
  }
  return path.endsWith('/') ? path : `${path}/`
}

function normalizePath(path: string) {
  if (path === '/api/login' || path === '/api/login/') return path
  // Keep settings/:key without forced trailing slash — Hono param routes are picky
  if (/^\/api\/settings\/[^/?]+\/?$/.test(path)) {
    return path.replace(/\/$/, '')
  }
  return withSlash(path)
}

export function unwrapList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[]
  if (data && typeof data === 'object' && 'results' in data) {
    const results = (data as { results: unknown }).results
    return Array.isArray(results) ? (results as T[]) : []
  }
  return []
}

export function mediaUrl(path?: string | null) {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  const origin = API_ORIGIN || window.location.origin
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`
}

export class ApiError extends Error {
  status: number
  data: unknown

  constructor(message: string, status: number, data?: unknown) {
    super(message)
    this.status = status
    this.data = data
  }
}

type RequestOptions = {
  method?: string
  token?: string | null
  body?: unknown
  headers?: Record<string, string>
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...options.headers,
  }

  const isForm = options.body instanceof FormData
  if (!isForm && options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (options.token) {
    headers.Authorization = `Token ${options.token}`
  }

  const response = await fetch(`${API_ORIGIN}${normalizePath(path)}`, {
    method: options.method || 'GET',
    headers,
    body:
      options.body === undefined
        ? undefined
        : isForm
          ? (options.body as FormData)
          : JSON.stringify(options.body),
    cache: 'no-store',
  })

  const contentType = response.headers.get('content-type') || ''
  const data = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => null)

  if (!response.ok) {
    const message =
      (data && typeof data === 'object' && ('error' in data || 'detail' in data)
        ? String((data as { error?: string; detail?: string }).error || (data as { detail?: string }).detail)
        : '') || `សំណើបរាជ័យ (${response.status})`
    throw new ApiError(message, response.status, data)
  }

  return data as T
}
