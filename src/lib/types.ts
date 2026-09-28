export type Role = 'admin' | 'manager'

/** Pages a manager may be assigned to manage. */
export type AppPageKey = 'home' | 'attendance' | 'kutis' | 'residents'

export type Permission =
  | 'users.view'
  | 'users.manage'
  | 'roles.manage'
  | 'kutis.view'
  | 'kutis.manage'
  | 'residents.view'
  | 'residents.assign'
  | 'reports.view'
  | 'attendance.view'
  | 'attendance.manage'
  | 'settings.manage'

export type AuthUser = {
  id: number
  username: string
  role: Role | string
  teacher_id?: number | null
  student_id?: number | null
  is_active?: boolean
  avatar_url?: string | null
  display_name?: string | null
  managed_pages?: AppPageKey[] | null
  managed_attendance_types?: string[] | null
}

export type Account = {
  id: number
  username: string
  role: string
  teacher: number | null
  student: number | null
  is_active: boolean
  managed_pages?: AppPageKey[] | null
  managed_attendance_types?: string[] | null
  created_at?: string | null
  updated_at?: string | null
}

export type Pagoda = {
  id: number
  name: string
  abbot_name?: string
  phone?: string | null
}

export type Kuti = {
  id: number
  pagoda: number
  kuti_name: string
  manager_name: string
  created_at?: string | null
  room_count?: number
  token_linked?: boolean
}

export type Room = {
  id: number
  kuti_id: number
  room_name: string
  manager_name: string
  created_at?: string | null
}

export type Resident = {
  id: number
  student_code: string
  first_name: string
  last_name: string
  latin_name?: string | null
  gender?: string
  monk_status?: string
  position?: string | null
  vassa_years?: number | null
  image_url?: string | null
  phone?: string | null
  kuti?: number | null
  room_id?: number | null
  current_pagoda?: number | null
  status?: string
}

export type Teacher = {
  id: number
  teacher_code?: string
  first_name: string
  last_name: string
  phone?: string | null
  status?: string
}

export type LoginResponse = {
  token: string
  user: AuthUser
  error?: string
}

export type AttendanceDayRow = {
  resident_id: number
  kuti_id?: number | null
  kuti_name?: string | null
  first_name: string
  last_name: string
  monk_status?: string | null
  education_level?: string | null
  room_id?: number | null
  room_name?: string | null
  group_id?: number | null
  group_name?: string | null
  group_sort?: number | null
  status: 'present' | 'absent' | 'excused' | null
  excuse_period?: 'morning' | 'afternoon' | 'day' | null
  attendance_id?: number | null
  note?: string | null
  /** Leave range start (inclusive) when status is excused */
  excuse_from?: string | null
  /** Leave range end / deadline (inclusive) */
  excuse_to?: string | null
  /** Total days in leave range */
  excuse_days?: number | null
  /** Days left from viewed date through excuse_to (countdown) */
  excuse_remaining?: number | null
}

export type AppSettings = {
  telegram: {
    enabled: boolean
    bot_token: string
    chat_id: string
  }
  kuti_api: {
    base_url: string
    token: string
  }
  attendance_types: {
    items: Array<{ key: string; label: string; enabled: boolean }>
  }
  attendance_text_formats: {
    daily: Record<string, string>
    report: Record<string, string>
  }
  attendance_reminders: {
    timezone: string
    items: Array<{ type: string; time: string; enabled: boolean }>
  }
}
