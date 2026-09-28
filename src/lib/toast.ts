import { create } from 'zustand'

type ToastKind = 'ok' | 'error' | 'info'

type ToastItem = {
  id: number
  kind: ToastKind
  message: string
}

type ToastState = {
  items: ToastItem[]
  push: (message: string, kind?: ToastKind) => void
  dismiss: (id: number) => void
}

let nextId = 1

export const useToast = create<ToastState>((set, get) => ({
  items: [],
  push: (message, kind = 'ok') => {
    const id = nextId++
    set({ items: [...get().items, { id, kind, message }] })
    window.setTimeout(() => get().dismiss(id), 3200)
  },
  dismiss: (id) => set({ items: get().items.filter((item) => item.id !== id) }),
}))
