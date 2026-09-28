---
name: attendance-report-sheet
description: >-
  Match the Kuti attendance A4 report sheet design (week portrait / month
  landscape). Use when building, editing, or regenerating attendance report
  PNG/PDF preview, Telegram week/month sheets, or similar tabular reports.
---

# Attendance report sheet template

Canonical implementation: `src/lib/weekSheetExport.ts`  
Data APIs: `buildWeekSheet` / `buildMonthSheet` in `server/attendance.ts`  
UI: `src/pages/AttendanceReportPage.tsx`

When making a new report “the same”, copy this visual system — do not invent a new layout.

## Periods (tabs only)

- `today` → ថ្ងៃនេះ (week sheet, portrait)
- `week` → ១ សប្តាហ៍ (week sheet, portrait)
- `month` → ១ ខែ (month sheet, landscape)
- Do **not** add ៣ ខែ / ៥ ខែ / ១ ឆ្នាំ

Tab bar: equal 3-column grid + sliding saffron pill + `settings-panel` content animation.

## Marks

| Status   | Mark | Color   |
|----------|------|---------|
| present  | ✓    | `#0f7b4c` |
| absent   | ✗    | `#b42318` |
| excused (permission) | P | `#c45c14` |

## Canvas sizes (~150 DPI)

- Week / today: **A4 portrait** `1240 × 1754`
- Month: **A4 landscape** `1754 × 1240`
- PDF: portrait `210×297mm` / landscape `297×210mm`

## Visual system

- Page bg: `#fbf7f0`
- Accent bar: `#c45c14` (centered short bar under title)
- Title: **Moul** (`"Moul", "Khmer OS Muol", serif`) — maroon `#5c1a1a`
- Body: **Battambang** (`"Battambang", "Khmer OS Battambang", serif`)
- Subtitle: `#8a3d0f`
- Meta card: white, border `#e2d5c4`, rounded
- Table header: `#5c1a1a`, white text
- Alternating rows: `#ffffff` / `#f7f1e8`, borders `#e8ddd0`
- Totals row: `#efe6d8`
- Legend pills: tinted backgrounds with mark colors

## Typography (must match)

| Element | Size / weight |
|---------|----------------|
| Week title | Moul **40px** |
| Month title | Moul **32px** |
| Week subtitle | Battambang **24px** |
| Month subtitle | Battambang **20px** |
| Column headers (ឈ្មោះ, days) | **bold 20px** Battambang |
| Monk names | **bold 20px** Battambang |
| Last column totals (`absent \| permission \| present`) | **bold 20px** Battambang |
| Numbers | Khmer digits `០–៩` |

## Table structure

### Week (portrait)

1. Columns: **ឈ្មោះ** | Mon–Sun (weekday label + day number) | **សរុប** last column
2. Last column format: `{absent} | {excused} | {present}` (✗ | P | ✓ order)
3. Bottom row: label **សរុប** + grand totals in last column
4. Footer note: `✗អវត្តមាន | Pសូមច្បាប់ | ✓មក`

### Month (landscape)

1. Columns: **ឈ្មោះ** | days **១…២៨/២៩/៣០/៣១** | last totals column `✗|P|✓`
2. Same per-row and grand-total last-column rules
3. Subtitle: `ប្រចាំខែ · ខែ{month} ឆ្នាំ{year} · ថ្ងៃទី១–{n}`

### ចាត់លោកទៅបុណ្យ (`variant: 'bon_party'`)

Same name×day table layout, but:

- Rows: full monk **name list**
- Columns still **១…២៨/២៩/៣០/៣១**, but ✓ are **not** placed on calendar dates — pack left from column **១** by trip count (trip 1 → col 1, trip 2 → col 2, …)
- Legend: `✓ បានចាត់ទៅបុណ្យ`
- Last column header: **ចំនួនទៅបុណ្យ** · cell: `ចំនួនទៅបុណ្យ {n} ដង`
- Persist assign `note` on present save (`upsertMarks`) so ticks appear on the sheet
- Do not invent a separate page tree — branch in `buildWeekSheet` / `buildMonthSheet` + `weekSheetExport`

## Header copy

- Title always: **របាយការណ៍វត្តមាន**
- Week subtitle: `ប្រចាំសប្តាហ៍ · ច័ន្ទ–អាទិត្យ`
- Meta: kuti name, type label, Khmer date range

## Export / send

- Preview: PNG data URL on report page
- Download: PDF via jsPDF embedding the canvas PNG
- Telegram: `POST /api/attendance/report/send-week-sheet` with base64 PNG (reuse for month)

## Do not break

- Keep centered header composition
- Keep last totals column (not only a footer strip of labels)
- Keep fonts Moul + Battambang
- Keep 20px bold for table headers, names, and totals column
- Prefer editing `weekSheetExport.ts` over a parallel one-off renderer
