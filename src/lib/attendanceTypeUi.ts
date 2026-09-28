/**
 * Per-type UI config inside the shared attendance system.
 * Mark layout, excuse sheet, and copy may differ by type.
 * Do not add separate route trees.
 * @see .cursor/skills/attendance-per-type-one-system/SKILL.md
 */
import type { ExcusePeriod, ReportPeriod } from './attendance'
import {
  BON_PARTY_TYPE_KEY,
  REPORT_PERIODS,
  SALA_CHAN_TYPE_KEY,
  STUDY_IN_KUTI_TYPE_KEY,
} from './attendance'

export type AttendanceTypeUi = {
  /** Hub card supporting line */
  hubBlurb: string
  /** Mark page header subtitle */
  markSubtitle: string
  /** Present / absent / excused column labels on mark page */
  countPresent: string
  countAbsent: string
  countExcused: string
  /** Show education level on each monk row */
  showEducation: boolean
  /** Show monk status / room / education meta under the name */
  showRowMeta: boolean
  /** Excuse sheet: which periods to offer */
  excusePeriods: ExcusePeriod[]
  /** Override period button/list labels for this type only */
  excusePeriodLabels: Partial<Record<ExcusePeriod, string>>
  /** Default period when opening excuse sheet */
  excuseDefault: ExcusePeriod
  /** Show period picker section */
  excuseShowPeriodPicker: boolean
  /** Multi-day from/to date pickers */
  excuseShowDateRange: boolean
  /** Reason / note field */
  excuseShowReason: boolean
  /** Reason as selectable dropdown (with manage list) instead of free text */
  excuseReasonDropdown: boolean
  /** Default reason labels for the reason dropdown */
  excuseReasonOptions: string[]
  /**
   * When date range is multi-day: hide morning/afternoon buttons and show a
   * dropdown of custom labels (user can add items). Single-day keeps period buttons.
   */
  excuseMultiDayDropdown: boolean
  /** Default labels for the multi-day dropdown */
  excuseMultiDayOptions: string[]
  /** Hide period buttons when range is more than 1 day */
  excuseDisablePeriodWhenMultiDay: boolean
  /** Compact narrow sheet (simple types) */
  excuseCompact: boolean
  /**
   * After save: delay before resetting absent/excuse button icons to normal.
   * `0` = clear absents immediately (study). `null` = never auto-clear.
   * Bon-party: also clears assign clock/note UI after the delay.
   */
  clearActionsDelayMs: number | null
  /** When auto-clear runs, also reset សូមច្បាប់ icons (not only absent) */
  clearActionsIncludeExcused: boolean
  /**
   * When clearing excused icons: keep multi-day leave icons visible
   * (only clear same-day / 1-day permission).
   */
  clearActionsKeepMultiDayExcused: boolean
  /**
   * When auto-clear runs, also reset ចាត់លោកទៅបុណ្យ assign UI
   * (clock + note) to normal — DB assign kept for reports.
   */
  clearPartyAssignActions: boolean
  /** Mark list grouped by attendance groups (create + assign) */
  markGrouped: boolean
  /** Show absent (X) action on each row */
  showAbsentAction: boolean
  /** Show excuse / permission action on each row */
  showExcuseAction: boolean
  /** Show party-assign icon (time · place · kind) — ចាត់លោកទៅបុណ្យ */
  showPartyAssignAction: boolean
  /** Default place dropdown labels for party assign */
  partyPlaceOptions: string[]
  /** Default kind dropdown labels for party assign */
  partyKindOptions: string[]
  /** Show របាយការណ៍ link in header */
  showReportLink: boolean
  /** Show present / absent / excused count strip */
  showStatusCounts: boolean
  /** Show អវត្តមាន / សូមច្បាប់ people lists on report page */
  showReportAbsentExcusedLists: boolean
  /** Which report period tabs to show (default: today / week / month) */
  reportPeriods: ReportPeriod[]
  /** Show រក្សាទុក button */
  showSaveButton: boolean
  /** Allow Telegram send without prior save (e.g. trash group list) */
  sendWithoutSave: boolean
  /** Create group requires typing a name (no auto ក្រុមទី១) */
  groupCreateNamed: boolean
  /** Highlight / rotate one duty group per day (trash only) */
  groupDutyRotate: boolean
}

const DEFAULT_UI: AttendanceTypeUi = {
  hubBlurb: 'វត្តមានប្រចាំថ្ងៃ និងរបាយការណ៍',
  markSubtitle: 'កត់ត្រាវត្តមាន',
  countPresent: 'មក',
  countAbsent: 'អវត្តមាន',
  countExcused: 'សូមច្បាប់',
  showEducation: true,
  showRowMeta: true,
  excusePeriods: ['morning', 'afternoon'],
  excusePeriodLabels: {},
  excuseDefault: 'morning',
  excuseShowPeriodPicker: true,
  excuseShowDateRange: false,
  excuseShowReason: false,
  excuseReasonDropdown: false,
  excuseReasonOptions: [],
  excuseMultiDayDropdown: false,
  excuseMultiDayOptions: [],
  excuseDisablePeriodWhenMultiDay: false,
  excuseCompact: true,
  clearActionsDelayMs: 0,
  clearActionsIncludeExcused: false,
  clearActionsKeepMultiDayExcused: false,
  clearPartyAssignActions: false,
  markGrouped: false,
  showAbsentAction: true,
  showExcuseAction: true,
  showPartyAssignAction: false,
  partyPlaceOptions: [],
  partyKindOptions: [],
  showReportLink: true,
  showStatusCounts: true,
  showReportAbsentExcusedLists: true,
  reportPeriods: [...REPORT_PERIODS],
  showSaveButton: true,
  sendWithoutSave: false,
  groupCreateNamed: false,
  groupDutyRotate: false,
}

/** Type-specific overrides — each type is intentionally different. */
export const ATTENDANCE_TYPE_UI: Record<string, Partial<AttendanceTypeUi>> = {
  /** ទៅរៀន — distinct from វត្តមានរៀនក្នុងកុដិ; compact excuse + multi-day range */
  study: {
    hubBlurb: 'កត់ត្រាទៅរៀន · របាយការណ៍',
    markSubtitle: 'កត់ត្រាវត្តមាន',
    countPresent: 'មក',
    showEducation: true,
    /** Keep ព្រឹក/រសៀល for single day; hide when multi-day */
    excuseShowDateRange: true,
    excuseDisablePeriodWhenMultiDay: true,
    excuseCompact: true,
    /** Immediate clear absent icons after save (no 2h countdown) */
    clearActionsDelayMs: 0,
    clearActionsIncludeExcused: false,
  },
  /**
   * វត្តមានរៀនក្នុងកុដិ — own mark page + daily text + 2h clear.
   * Excuse sheet already confirmed — do not change sheet UI unless user asks.
   */
  [STUDY_IN_KUTI_TYPE_KEY]: {
    hubBlurb: 'កត់ត្រាវត្តមានរៀន · របាយការណ៍',
    markSubtitle: 'កត់ត្រាវត្តមាន',
    countPresent: 'មក',
    showEducation: true,
    /** Once daily (~៩:០០ យប់) — no morning/afternoon split */
    excusePeriods: ['day'],
    excuseDefault: 'day',
    excuseShowPeriodPicker: false,
    /** Multi-day សូមច្បាប់ (sheet UI locked) */
    excuseShowDateRange: true,
    excuseShowReason: true,
    excuseCompact: false,
    /** 2h after save → clear absent + same-day permission icons (DB kept for report) */
    clearActionsDelayMs: 2 * 60 * 60 * 1000,
    clearActionsIncludeExcused: true,
    clearActionsKeepMultiDayExcused: true,
  },
  kuti_work: {
    hubBlurb: 'កត់ត្រាការងារកុដិ · ផ្ញើ Telegram',
    markSubtitle: 'កត់ត្រាវត្តមានការងារកុដិ',
    countPresent: 'ធ្វើការ',
    countAbsent: 'អវត្តមាន',
    countExcused: 'សូមច្បាប់',
    showEducation: false,
    excusePeriods: ['day'],
    excuseDefault: 'day',
    excuseShowPeriodPicker: false,
    excuseShowDateRange: false,
    excuseShowReason: false,
    excuseCompact: true,
    /** 2 hours after save → clear absent + permission icons to normal */
    clearActionsDelayMs: 2 * 60 * 60 * 1000,
    clearActionsIncludeExcused: true,
  },
  /** យកធុងសម្រាម — distinct from study / kuti_work; customize when user points at changes */
  trash: {
    hubBlurb: 'កត់ត្រាយកធុងសម្រាម · ផ្ញើ Telegram',
    markSubtitle: 'កត់ត្រាវត្តមានយកធុងសម្រាម',
    countPresent: 'មក',
    countAbsent: 'អវត្តមាន',
    countExcused: 'សូមច្បាប់',
    showEducation: false,
    excusePeriods: ['day'],
    excuseDefault: 'day',
    excuseShowPeriodPicker: false,
    excuseShowDateRange: false,
    excuseShowReason: false,
    excuseCompact: true,
    clearActionsDelayMs: null,
    clearActionsIncludeExcused: false,
    markGrouped: true,
    showAbsentAction: false,
    showExcuseAction: false,
    showReportLink: false,
    showStatusCounts: false,
    showSaveButton: false,
    sendWithoutSave: true,
    groupCreateNamed: false,
    groupDutyRotate: true,
  },
  /** បិណ្ឌបាត — named groups + daily rotate + auto Telegram 08:40 */
  alms: {
    hubBlurb: 'កត់ត្រាបិណ្ឌបាត · ផ្ញើ Telegram ៨ៈ៤០',
    markSubtitle: 'កត់ត្រាវត្តមានបិណ្ឌបាត',
    countPresent: 'មក',
    countAbsent: 'អវត្តមាន',
    countExcused: 'សូមច្បាប់',
    showEducation: false,
    excusePeriods: ['day'],
    excuseDefault: 'day',
    excuseShowPeriodPicker: false,
    excuseShowDateRange: false,
    excuseShowReason: false,
    excuseCompact: true,
    clearActionsDelayMs: null,
    clearActionsIncludeExcused: false,
    markGrouped: true,
    groupCreateNamed: true,
    groupDutyRotate: true,
    showAbsentAction: false,
    showExcuseAction: false,
    showReportLink: false,
    showStatusCounts: false,
    showSaveButton: false,
    sendWithoutSave: true,
  },
  /**
   * ថ្វាយបង្គំ (`worship_meal`) — distinct from study / kuti_work / trash / alms.
   * Excuse: ព្រឹក/យប់ + reason dropdown; multi-day hides periods (keep reason dropdown).
   * After save: 2h auto-clear absent + same-day permission; keep multi-day leave icons.
   */
  worship_meal: {
    hubBlurb: 'កត់ត្រាថ្វាយបង្គំ · របាយការណ៍',
    markSubtitle: 'កត់ត្រាវត្តមានថ្វាយបង្គំ',
    excusePeriods: ['morning', 'afternoon'],
    excusePeriodLabels: { afternoon: 'យប់' },
    excuseDefault: 'morning',
    excuseShowPeriodPicker: true,
    excuseShowDateRange: true,
    excuseShowReason: true,
    excuseReasonDropdown: true,
    excuseReasonOptions: ['ឈឺ', 'ទៅផ្ទះ', 'ចូលរួមពិធី', 'ច្បាប់ផ្ទាល់ខ្លួន'],
    excuseDisablePeriodWhenMultiDay: true,
    excuseCompact: false,
    clearActionsDelayMs: 2 * 60 * 60 * 1000,
    clearActionsIncludeExcused: true,
    clearActionsKeepMultiDayExcused: true,
  },
  /**
   * សាលាឆាន់ — custom type; distinct from ថ្វាយបង្គំ / study / trash / alms.
   */
  [SALA_CHAN_TYPE_KEY]: {
    hubBlurb: 'កត់ត្រាសាលាឆាន់ · របាយការណ៍',
    markSubtitle: 'កត់ត្រាវត្តមានសាលាឆាន់',
    excusePeriods: ['morning', 'afternoon'],
    excusePeriodLabels: { afternoon: 'ថ្ងៃត្រង់' },
    excuseDefault: 'morning',
    excuseShowPeriodPicker: true,
    excuseShowDateRange: true,
    excuseShowReason: true,
    excuseReasonDropdown: true,
    excuseReasonOptions: ['ឈឺ', 'ទៅផ្ទះ', 'ចូលរួមពិធី', 'ច្បាប់ផ្ទាល់ខ្លួន'],
    excuseDisablePeriodWhenMultiDay: true,
    excuseCompact: false,
    /** 2 hours after save → clear absent + same-day permission icons; keep multi-day */
    clearActionsDelayMs: 2 * 60 * 60 * 1000,
    clearActionsIncludeExcused: true,
    clearActionsKeepMultiDayExcused: true,
  },
  /**
   * ចាត់លោកទៅបុណ្យ — name-only rows + assign popup (time · place · kind).
   * Distinct from study / worship_meal / សាលាឆាន់ / trash / alms.
   */
  [BON_PARTY_TYPE_KEY]: {
    hubBlurb: 'កត់ត្រាចាត់លោកទៅបុណ្យ · របាយការណ៍',
    markSubtitle: 'កត់ត្រាវត្តមានចាត់លោកទៅបុណ្យ',
    showEducation: false,
    showRowMeta: false,
    showAbsentAction: false,
    showExcuseAction: false,
    showPartyAssignAction: true,
    partyPlaceOptions: ['ក្នុងវត្ត', 'ក្រៅវត្ត'],
    partyKindOptions: ['បាត', 'ស្រាក'],
    showStatusCounts: false,
    showReportAbsentExcusedLists: false,
    reportPeriods: ['month'],
    /** 1 hour after save → clear assign UI to normal (DB kept) */
    clearActionsDelayMs: 1 * 60 * 60 * 1000,
    clearPartyAssignActions: true,
  },
}

export function uiForAttendanceType(type: string, label?: string): AttendanceTypeUi {
  const byKey = ATTENDANCE_TYPE_UI[type]
  if (byKey) return { ...DEFAULT_UI, ...byKey }
  const text = (label || '').trim()
  // Only វត្តមានរៀនក្នុងកុដិ — never alias seed `study` / ទៅរៀន into this UI
  if (text === 'វត្តមានរៀនក្នុងកុដិ' || /វត្តមានរៀនក្នុងកុដិ/.test(text)) {
    return { ...DEFAULT_UI, ...ATTENDANCE_TYPE_UI[STUDY_IN_KUTI_TYPE_KEY] }
  }
  return { ...DEFAULT_UI }
}

export function excusePeriodLabelForType(
  typeUi: AttendanceTypeUi,
  period: ExcusePeriod,
  fallback: Record<ExcusePeriod, string>,
) {
  return typeUi.excusePeriodLabels[period] || fallback[period]
}

/** Same-day permission (1 day) vs multi-day leave block. */
export function isMultiDayExcused(row: {
  status?: string | null
  excuse_days?: number | null
  excuse_from?: string | null
  excuse_to?: string | null
}) {
  if (row.status !== 'excused') return false
  if (row.excuse_days != null && row.excuse_days > 1) return true
  if (row.excuse_from && row.excuse_to && row.excuse_from !== row.excuse_to) return true
  return false
}

export function shouldClearExcuseActionIcon(
  typeUi: AttendanceTypeUi,
  row: {
    status?: string | null
    excuse_days?: number | null
    excuse_from?: string | null
    excuse_to?: string | null
  },
) {
  if (!typeUi.clearActionsIncludeExcused || row.status !== 'excused') return false
  if (typeUi.clearActionsKeepMultiDayExcused && isMultiDayExcused(row)) return false
  return true
}
