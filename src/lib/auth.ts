import { create } from 'zustand'
import { apiRequest } from './api'
import type { AuthUser, LoginResponse } from './types'

const TOKEN_KEY = 'kuti.token'
const USER_KEY = 'kuti.user'

type AuthState = {
  token: string | null
  user: AuthUser | null
  ready: boolean
  hydrate: () => void
  login: (username: string, password: string) => Promise<string | null>
  setUser: (user: AuthUser) => void
  logout: () => void
}

function persistUser(user: AuthUser) {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

function readStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

export const useAuth = create<AuthState>((set) => ({
  token: localStorage.getItem(TOKEN_KEY),
  user: readStoredUser(),
  ready: true,
  hydrate: () => {
    set({
      token: localStorage.getItem(TOKEN_KEY),
      user: readStoredUser(),
      ready: true,
    })
  },
  login: async (username, password) => {
    try {
      const data = await apiRequest<LoginResponse>('/api/login', {
        method: 'POST',
        body: { username, password },
      })
      if (!data?.token || !data.user) {
        return data?.error || 'មិនអាចចូលគណនីបានទេ'
      }
      localStorage.setItem(TOKEN_KEY, data.token)
      persistUser(data.user)
      set({ token: data.token, user: data.user })
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'មិនអាចចូលគណនីបានទេ'
    }
  },
  setUser: (user) => {
    persistUser(user)
    set({ user })
  },
  logout: () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    set({ token: null, user: null })
  },
}))
