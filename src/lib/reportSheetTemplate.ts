/**
 * Attendance A4 report sheet — shared design template.
 * Full rules: `.cursor/skills/attendance-report-sheet/SKILL.md`
 * Keep week (portrait) and month (landscape) visually consistent with that skill.
 */
export const REPORT_SHEET_TEMPLATE = {
  title: 'របាយការណ៍វត្តមាន',
  fonts: {
    title: '"Moul", "Khmer OS Muol", serif',
    body: '"Battambang", "Khmer OS Battambang", serif',
  },
  colors: {
    pageBg: '#fbf7f0',
    accent: '#c45c14',
    maroon: '#5c1a1a',
    subtitle: '#8a3d0f',
    present: '#0f7b4c',
    absent: '#b42318',
    excused: '#c45c14',
    muted: '#9a8f84',
    rowAlt: '#f7f1e8',
    totalsRow: '#efe6d8',
    border: '#e8ddd0',
    metaBorder: '#e2d5c4',
  },
  marks: {
    present: '✓',
    absent: '✗',
    excused: 'P',
  } as const,
  /** Table headers, monk names, last totals column */
  tableTextPx: 20,
  a4: {
    portrait: { w: 1240, h: 1754 },
    landscape: { w: 1754, h: 1240 },
  },
  /** Last column order: absent | permission | present */
  totalsOrder: ['absent', 'excused', 'present'] as const,
} as const
