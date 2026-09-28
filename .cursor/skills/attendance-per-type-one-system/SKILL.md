---
name: attendance-per-type-one-system
description: >-
  Keep all attendance types (កត់ត្រា / របាយការណ៍) in one shared hub+routes system.
  Per-type layout, form text, and report format may differ, but never split into
  separate apps or duplicate page trees. Use when editing AttendanceHubPage,
  AttendanceMarkPage, AttendanceReportPage, or type-specific templates.
---

# Attendance: one system, per-type customization

## Confirmed product rule (user locked)

- Each attendance type has its **own** mark form, layout, and excuse sheet — **not** shared copies of each other.
- Locked distinct types so far:
  - **ទៅរៀន** (`study`) — **not** the same as វត្តមានរៀនក្នុងកុដិ; compact excuse (ព្រឹក/រសៀល) + **multi-day date range** (hides periods when >1 day); no 2h clear countdown; own data key
  - **វត្តមានរៀនក្នុងកុដិ** (`type_mul2fl2z` / `STUDY_IN_KUTI_TYPE_KEY`) — mark-page customizations only (excuse sheet UI **locked** — do not change unless asked); once daily; multi-day date range + reason; education meta; report **ថ្ងៃនេះ** = mark-day lists only; **2h after save** clear absent + same-day permission; ceremonial daily text (`ចេញរៀន`, Khmer date/counts, name|reason|room); **never** share UI/data with seed `study`
  - **ការងារកុដិ** (`kuti_work`) — finished for now
  - **យកធុងសម្រាម** (`trash`) — mark list **grouped** (create/assign ក្រុម); not the same as study / kuti_work
  - **បិណ្ឌបាត** (`alms`) — named groups + rotate duty + auto Telegram 08:40; not the same as trash
  - **ថ្វាយបង្គំ** (`worship_meal`) — excuse ព្រឹក/យប់ + reason dropdown; multi-day hides periods; Telegram `{shift}`; 2h clear absent + same-day permission
  - **សាលាឆាន់** (`type_mu9vvfdt`) — excuse ព្រឹក/ថ្ងៃត្រង់ + multi-day hides period; reason dropdown; Telegram `{shift}`; 2h clear absent + same-day permission (keep multi-day)
  - **ចាត់លោកទៅបុណ្យ** (`type_mubb78mp` / `BON_PARTY_TYPE_KEY`) — name-only rows; assign popup; per-monk month `ចំនួន` + highlight `ឈ្មោះណាបានទៅបុណ្យតិចជាងគេ`; report month-only; sheet ✓ packed from col 1 by trip count (not calendar day) + `ចំនួនទៅបុណ្យ {n} ដង`; daily Telegram `BON_PARTY_DAILY_TEMPLATE` (`{date}` `{time}` `{Total-Number}` `{present_list}`); **1h after save** clear assign UI to normal (DB kept); no absent/excuse lists/actions/status counts
- Still **one** system: same hub + `/attendance/:type` + `/attendance/:type/reports` — never fork into separate apps or page trees.
- Customization starts from the hub card → branch **inside** shared pages by `type` / `ATTENDANCE_TYPE_UI`.
- Confirm with the user before inventing a full new layout; wait for their first specific change on that type.
- Groups: `attendance_groups` + `attendance_group_members` keyed by `attendance_type` (see `server/attendanceGroups.ts`).

## Confirmed data isolation (critical)

- Save / report / week-sheet / month-sheet / Telegram are **always** filtered by `attendance_type` (= URL `:type`).
- Example: marks saved on `/attendance/kuti_work` must **never** appear in `/attendance/study/reports` and vice versa.
- DB unique key: `(kuti_id, resident_id, attendance_type, attend_date)` — one row per monk per day **per type**.
- When building reports for a type, query only that type’s rows. Do not mix `study` into `kuti_work` (or any other type).

## Shared shell (do not fork)

| Piece | Path / pattern |
|-------|----------------|
| Hub | `AttendanceHubPage` → cards from attendance types |
| Mark | `/attendance/:type` → `AttendanceMarkPage` (layout via `uiForAttendanceType`) |
| Report | `/attendance/:type/reports` → `AttendanceReportPage` |
| Types | settings `attendance_types` + `/api/attendance/types` |
| APIs | `/api/attendance/*` keyed by `type` |
| Type UI | `src/lib/attendanceTypeUi.ts` |

## How to customize per type

1. Branch **inside** the shared pages by `type` or `ATTENDANCE_TYPE_UI[type]`.
2. Prefer config/templates per type (message templates, sheet variants, excuse periods) over new top-level pages.
3. Reuse shared APIs, auth, Telegram send, and sheet export primitives.
4. New type = new settings key + optional type-specific UI branch — **not** a new `FooAttendancePage` tree.

## Anti-patterns

- ❌ `KutiWorkMarkPage.tsx` + `StudyMarkPage.tsx` as separate route systems
- ❌ Duplicate `/kuti-work/...` vs `/attendance/...` navigation
- ❌ Copying entire report/mark stacks “just for one type”
- ❌ Reading attendance without `AND attendance_type = $type`
- ❌ Forcing study and kuti_work to share one identical mark/excuse UI

## OK patterns

- ✅ `if (type === 'kuti_work') { ... }` or `TYPE_UI[type]` registry
- ✅ Per-type daily/report text templates in settings
- ✅ Per-type excuse periods (study: morning/afternoon · kuti_work: day only)
- ✅ Shared `weekSheetExport` / sheet template with type-specific subtitle/content
- ✅ Reports/sheets always pass `type` from the route into the API
