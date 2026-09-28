import { jsPDF } from 'jspdf'
import { REPORT_SHEET_TEMPLATE } from './reportSheetTemplate'

export type WeekSheetDay = { date: string; label: string }
export type WeekSheetCell = 'present' | 'absent' | 'excused' | null
export type WeekSheetRow = {
  resident_id: number
  first_name: string
  last_name: string
  cells: WeekSheetCell[]
}
export type WeekSheetData = {
  from: string
  to: string
  kuti: string
  type_label: string
  days: WeekSheetDay[]
  rows: WeekSheetRow[]
  /** ចាត់លោកទៅបុណ្យ: ✓ ticks only + last column trip count */
  variant?: 'default' | 'bon_party'
}

function isBonPartySheet(sheet: WeekSheetData) {
  return sheet.variant === 'bon_party'
}

function countPartyTrips(cells: WeekSheetCell[]) {
  let n = 0
  for (const cell of cells) {
    if (cell === 'present') n += 1
  }
  return n
}

function formatPartyTripCount(n: number) {
  return `ចំនួនទៅបុណ្យ ${toKhmerDigits(n)} ដង`
}

/** A4 at ~150 DPI for sharp PNG / PDF embed — see REPORT_SHEET_TEMPLATE */
const A4_W = REPORT_SHEET_TEMPLATE.a4.portrait.w
const A4_H = REPORT_SHEET_TEMPLATE.a4.portrait.h
/** A4 landscape at ~150 DPI */
const A4_LAND_W = REPORT_SHEET_TEMPLATE.a4.landscape.w
const A4_LAND_H = REPORT_SHEET_TEMPLATE.a4.landscape.h

const KHMER_DIGITS = ['០', '១', '២', '៣', '៤', '៥', '៦', '៧', '៨', '៩']
const KHMER_MONTHS = [
  'មករា',
  'កុម្ភៈ',
  'មីនា',
  'មេសា',
  'ឧសភា',
  'មិថុនា',
  'កក្កដា',
  'សីហា',
  'កញ្ញា',
  'តុលា',
  'វិច្ឆិកា',
  'ធ្នូ',
]

function toKhmerDigits(value: string | number) {
  return String(value).replace(/\d/g, (d) => KHMER_DIGITS[Number(d)] || d)
}

function parseIso(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m, d }
}

/** e.g. ១៩/០៩/២០២៦ */
function formatKhmerShort(iso: string) {
  const { y, m, d } = parseIso(iso)
  const dd = String(d).padStart(2, '0')
  const mm = String(m).padStart(2, '0')
  return toKhmerDigits(`${dd}/${mm}/${y}`)
}

/** e.g. ថ្ងៃទី១៩ ខែកញ្ញា ឆ្នាំ២០២៦ */
function formatKhmerLong(iso: string) {
  const { y, m, d } = parseIso(iso)
  return `ថ្ងៃទី${toKhmerDigits(d)} ខែ${KHMER_MONTHS[m - 1] || ''} ឆ្នាំ${toKhmerDigits(y)}`
}

function cellMark(status: WeekSheetCell) {
  if (status === 'present') return REPORT_SHEET_TEMPLATE.marks.present
  if (status === 'absent') return REPORT_SHEET_TEMPLATE.marks.absent
  if (status === 'excused') return REPORT_SHEET_TEMPLATE.marks.excused
  return ''
}

function cellColor(status: WeekSheetCell) {
  if (status === 'present') return REPORT_SHEET_TEMPLATE.colors.present
  if (status === 'absent') return REPORT_SHEET_TEMPLATE.colors.absent
  if (status === 'excused') return REPORT_SHEET_TEMPLATE.colors.excused
  return REPORT_SHEET_TEMPLATE.colors.muted
}

function countSheetTotals(sheet: WeekSheetData) {
  let present = 0
  let absent = 0
  let excused = 0
  for (const row of sheet.rows) {
    for (const cell of row.cells) {
      if (cell === 'present') present += 1
      else if (cell === 'absent') absent += 1
      else if (cell === 'excused') excused += 1
    }
  }
  return { present, absent, excused }
}

function countRowTotals(cells: WeekSheetCell[]) {
  let present = 0
  let absent = 0
  let excused = 0
  for (const cell of cells) {
    if (cell === 'present') present += 1
    else if (cell === 'absent') absent += 1
    else if (cell === 'excused') excused += 1
  }
  return { present, absent, excused }
}

/** Format: absent | permission | present */
function formatTotalsPipe(t: { present: number; absent: number; excused: number }) {
  return `${toKhmerDigits(t.absent)} | ${toKhmerDigits(t.excused)} | ${toKhmerDigits(t.present)}`
}

function drawTotalsColumnHeader(
  ctx: CanvasRenderingContext2D,
  x: number,
  colW: number,
  tableTop: number,
  headerH: number,
  compact: boolean,
  mode: 'default' | 'bon_party' = 'default',
) {
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  ctx.beginPath()
  ctx.moveTo(x, tableTop + (compact ? 4 : 8))
  ctx.lineTo(x, tableTop + headerH - (compact ? 4 : 8))
  ctx.stroke()

  ctx.fillStyle = '#ffffff'
  if (mode === 'bon_party') {
    ctx.font = `bold ${compact ? 14 : TABLE_TEXT_PX - 2}px ${BODY_FONT}`
    if (compact) {
      drawCentered(ctx, 'ចំនួនទៅបុណ្យ', x + colW / 2, tableTop + headerH * 0.62)
    } else {
      drawCentered(ctx, 'ចំនួន', x + colW / 2, tableTop + 28)
      drawCentered(ctx, 'ទៅបុណ្យ', x + colW / 2, tableTop + 54)
    }
    return
  }
  if (compact) {
    ctx.font = `bold ${TABLE_TEXT_PX}px ${BODY_FONT}`
    drawCentered(ctx, '✗|P|✓', x + colW / 2, tableTop + headerH * 0.62)
  } else {
    ctx.font = `bold ${TABLE_TEXT_PX}px ${BODY_FONT}`
    drawCentered(ctx, 'សរុប', x + colW / 2, tableTop + 28)
    ctx.font = `bold ${TABLE_TEXT_PX}px ${BODY_FONT}`
    drawCentered(ctx, '✗ | P | ✓', x + colW / 2, tableTop + 54)
  }
}

function drawTotalsColumnCell(
  ctx: CanvasRenderingContext2D,
  opts: {
    x: number
    ry: number
    colW: number
    rowH: number
    present: number
    absent: number
    excused: number
    fontPx: number
    highlight?: boolean
    mode?: 'default' | 'bon_party'
  },
) {
  const {
    x,
    ry,
    colW,
    rowH,
    present,
    absent,
    excused,
    fontPx,
    highlight,
    mode = 'default',
  } = opts
  ctx.beginPath()
  ctx.moveTo(x, ry)
  ctx.lineTo(x, ry + rowH)
  ctx.strokeStyle = highlight ? '#d4c4b0' : '#e8ddd0'
  ctx.stroke()

  const text =
    mode === 'bon_party'
      ? formatPartyTripCount(present)
      : formatTotalsPipe({ present, absent, excused })
  ctx.fillStyle = highlight ? '#5c1a1a' : '#2a1a12'
  const px = mode === 'bon_party' ? Math.min(fontPx, 16) : fontPx
  ctx.font = `bold ${px}px ${BODY_FONT}`
  const tw = ctx.measureText(text).width
  ctx.fillText(text, x + Math.max(4, (colW - tw) / 2), ry + rowH * 0.7)
}

function drawCentered(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
) {
  const w = ctx.measureText(text).width
  ctx.fillText(text, cx - w / 2, y)
}

const TITLE_FONT = REPORT_SHEET_TEMPLATE.fonts.title
const BODY_FONT = REPORT_SHEET_TEMPLATE.fonts.body
const TABLE_TEXT_PX = REPORT_SHEET_TEMPLATE.tableTextPx

async function ensureSheetFonts() {
  if (typeof document === 'undefined' || !document.fonts?.load) return
  await Promise.all([
    document.fonts.load(`40px ${TITLE_FONT}`),
    document.fonts.load(`24px ${BODY_FONT}`),
    document.fonts.load(`bold ${TABLE_TEXT_PX}px ${BODY_FONT}`),
    document.fonts.load(`bold 28px ${BODY_FONT}`),
  ]).catch(() => undefined)
  await document.fonts.ready.catch(() => undefined)
}

/** Draw A4 portrait week sheet onto a canvas. */
export function renderWeekSheetCanvas(sheet: WeekSheetData) {
  const canvas = document.createElement('canvas')
  canvas.width = A4_W
  canvas.height = A4_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')

  // Background
  ctx.fillStyle = '#fbf7f0'
  ctx.fillRect(0, 0, A4_W, A4_H)

  const marginX = 52
  const contentW = A4_W - marginX * 2
  let y = 48

  // Accent bar — centered
  ctx.fillStyle = '#c45c14'
  const accentW = 56
  ctx.fillRect(marginX + (contentW - accentW) / 2, y, accentW, 6)
  y += 32

  // Title — Moul, centered
  ctx.fillStyle = '#5c1a1a'
  ctx.font = `40px ${TITLE_FONT}`
  drawCentered(ctx, 'របាយការណ៍វត្តមាន', marginX + contentW / 2, y)
  y += 42

  // Subtitle — Battambang, centered
  ctx.fillStyle = '#8a3d0f'
  ctx.font = `24px ${BODY_FONT}`
  drawCentered(ctx, 'ប្រចាំសប្តាហ៍ · ច័ន្ទ–អាទិត្យ', marginX + contentW / 2, y)
  y += 38

  // Meta card
  const metaH = 78
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = '#e2d5c4'
  ctx.lineWidth = 1.5
  roundRect(ctx, marginX, y, contentW, metaH, 14)
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = '#5c1a1a'
  ctx.font = `bold ${TABLE_TEXT_PX}px ${BODY_FONT}`
  ctx.fillText(sheet.kuti, marginX + 22, y + 30)

  ctx.fillStyle = '#6b5e52'
  ctx.font = `18px ${BODY_FONT}`
  ctx.fillText(sheet.type_label, marginX + 22, y + 56)

  const rangeText =
    sheet.from === sheet.to
      ? formatKhmerLong(sheet.from)
      : `${formatKhmerShort(sheet.from)} – ${formatKhmerShort(sheet.to)}`
  ctx.fillStyle = '#5c1a1a'
  ctx.font = `bold 18px ${BODY_FONT}`
  const rangeW = ctx.measureText(rangeText).width
  ctx.fillText(rangeText, marginX + contentW - 22 - rangeW, y + 44)

  y += metaH + 18

  const bonParty = isBonPartySheet(sheet)

  // Legend pills
  const legends: Array<{ mark: string; label: string; color: string }> = bonParty
    ? [{ mark: '✓', label: 'បានចាត់ទៅបុណ្យ', color: '#0f7b4c' }]
    : [
        { mark: '✓', label: 'មក', color: '#0f7b4c' },
        { mark: '✗', label: 'អវត្តមាន', color: '#b42318' },
        { mark: 'P', label: 'សូមច្បាប់', color: '#c45c14' },
      ]
  let lx = marginX
  legends.forEach((item) => {
    const label = `${item.mark}  ${item.label}`
    ctx.font = `bold 16px ${BODY_FONT}`
    const tw = ctx.measureText(label).width + 28
    ctx.fillStyle = `${item.color}14`
    roundRect(ctx, lx, y, tw, 30, 10)
    ctx.fill()
    ctx.fillStyle = item.color
    ctx.fillText(label, lx + 14, y + 20)
    lx += tw + 10
  })
  y += 44

  const tableTop = y
  const tableWidth = contentW
  const totalColW = bonParty ? 240 : 200
  const nameColW = Math.floor(tableWidth * 0.26)
  const dayColW = Math.floor((tableWidth - nameColW - totalColW) / 7)
  const totalColX = marginX + nameColW + dayColW * 7
  const headerH = 72
  const totals = countSheetTotals(sheet)
  const partyGrand = sheet.rows.reduce((sum, row) => sum + countPartyTrips(row.cells), 0)
  const rowH = Math.min(
    48,
    Math.max(
      38,
      Math.floor((A4_H - tableTop - 72) / Math.max(sheet.rows.length + 2, 1)),
    ),
  )

  // Header row
  ctx.fillStyle = '#5c1a1a'
  roundRect(ctx, marginX, tableTop, tableWidth, headerH, 12)
  ctx.fill()
  // square bottom corners of header for table continuity
  ctx.fillRect(marginX, tableTop + headerH - 12, tableWidth, 12)

  // Column headers — 20px bold
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold ${TABLE_TEXT_PX}px ${BODY_FONT}`
  ctx.fillText('ឈ្មោះ', marginX + 14, tableTop + 44)

  sheet.days.forEach((day, i) => {
    const x = marginX + nameColW + i * dayColW
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'
    ctx.beginPath()
    ctx.moveTo(x, tableTop + 8)
    ctx.lineTo(x, tableTop + headerH - 8)
    ctx.stroke()

    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${TABLE_TEXT_PX}px ${BODY_FONT}`
    drawCentered(ctx, day.label, x + dayColW / 2, tableTop + 32)

    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = `16px ${BODY_FONT}`
    const { d } = parseIso(day.date)
    drawCentered(ctx, toKhmerDigits(d), x + dayColW / 2, tableTop + 56)
  })

  drawTotalsColumnHeader(
    ctx,
    totalColX,
    totalColW,
    tableTop,
    headerH,
    false,
    bonParty ? 'bon_party' : 'default',
  )

  // Body rows — monk names 20px bold
  let lastRowBottom = tableTop + headerH
  sheet.rows.forEach((row, ri) => {
    const ry = tableTop + headerH + ri * rowH
    if (ry + rowH > A4_H - 56 - rowH) return

    ctx.fillStyle = ri % 2 === 0 ? '#ffffff' : '#f7f1e8'
    ctx.fillRect(marginX, ry, tableWidth, rowH)
    ctx.strokeStyle = '#e8ddd0'
    ctx.strokeRect(marginX, ry, tableWidth, rowH)

    ctx.fillStyle = '#2a1a12'
    ctx.font = `bold ${TABLE_TEXT_PX}px ${BODY_FONT}`
    const name = `${toKhmerDigits(ri + 1)}. ${row.last_name} ${row.first_name}`.trim()
    ctx.fillText(name, marginX + 12, ry + rowH * 0.68)

    row.cells.forEach((cell, ci) => {
      const x = marginX + nameColW + ci * dayColW
      ctx.beginPath()
      ctx.moveTo(x, ry)
      ctx.lineTo(x, ry + rowH)
      ctx.strokeStyle = '#e8ddd0'
      ctx.stroke()

      // Bon party: only ✓ ticks (never ✗ / P)
      const mark = bonParty
        ? cell === 'present'
          ? REPORT_SHEET_TEMPLATE.marks.present
          : ''
        : cellMark(cell)
      if (!mark) return
      ctx.fillStyle = bonParty ? REPORT_SHEET_TEMPLATE.colors.present : cellColor(cell)
      ctx.font = `bold ${Math.floor(rowH * 0.62)}px sans-serif`
      const mw = ctx.measureText(mark).width
      ctx.fillText(mark, x + (dayColW - mw) / 2, ry + rowH * 0.7)
    })

    const rowTot = bonParty
      ? { present: countPartyTrips(row.cells), absent: 0, excused: 0 }
      : countRowTotals(row.cells)
    drawTotalsColumnCell(ctx, {
      x: totalColX,
      ry,
      colW: totalColW,
      rowH,
      ...rowTot,
      fontPx: TABLE_TEXT_PX,
      mode: bonParty ? 'bon_party' : 'default',
    })
    lastRowBottom = ry + rowH
  })

  // Last row — grand totals in last column
  ctx.fillStyle = '#efe6d8'
  ctx.fillRect(marginX, lastRowBottom, tableWidth, rowH)
  ctx.strokeStyle = '#d4c4b0'
  ctx.lineWidth = 1.5
  ctx.strokeRect(marginX, lastRowBottom, tableWidth, rowH)
  ctx.fillStyle = '#5c1a1a'
  ctx.font = `bold 18px ${BODY_FONT}`
  ctx.fillText('សរុប', marginX + 12, lastRowBottom + rowH * 0.7)
  for (let i = 0; i < 7; i++) {
    const x = marginX + nameColW + i * dayColW
    ctx.beginPath()
    ctx.moveTo(x, lastRowBottom)
    ctx.lineTo(x, lastRowBottom + rowH)
    ctx.strokeStyle = '#d4c4b0'
    ctx.stroke()
  }
  drawTotalsColumnCell(ctx, {
    x: totalColX,
    ry: lastRowBottom,
    colW: totalColW,
    rowH,
    ...(bonParty
      ? { present: partyGrand, absent: 0, excused: 0 }
      : totals),
    fontPx: TABLE_TEXT_PX,
    highlight: true,
    mode: bonParty ? 'bon_party' : 'default',
  })

  // Footer
  ctx.fillStyle = '#9a8f84'
  ctx.font = `14px ${BODY_FONT}`
  const footer = bonParty
    ? `សរុប ${toKhmerDigits(sheet.rows.length)} អង្គ · A4 · ✓បានចាត់ទៅបុណ្យ · ${formatPartyTripCount(partyGrand)}`
    : `សរុប ${toKhmerDigits(sheet.rows.length)} អង្គ · A4 · ✗អវត្តមាន | Pសូមច្បាប់ | ✓មក`
  ctx.fillText(footer, marginX, A4_H - 28)

  return canvas
}

/** Draw A4 landscape month sheet (days 1–28/29/30/31). */
export function renderMonthSheetCanvas(sheet: WeekSheetData) {
  const canvas = document.createElement('canvas')
  canvas.width = A4_LAND_W
  canvas.height = A4_LAND_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')

  ctx.fillStyle = '#fbf7f0'
  ctx.fillRect(0, 0, A4_LAND_W, A4_LAND_H)

  const marginX = 36
  const contentW = A4_LAND_W - marginX * 2
  let y = 28

  ctx.fillStyle = '#c45c14'
  const accentW = 48
  ctx.fillRect(marginX + (contentW - accentW) / 2, y, accentW, 5)
  y += 24

  ctx.fillStyle = '#5c1a1a'
  ctx.font = `32px ${TITLE_FONT}`
  drawCentered(ctx, 'របាយការណ៍វត្តមាន', marginX + contentW / 2, y)
  y += 34

  const { m: monthNum, y: yearNum } = parseIso(sheet.from)
  const monthTitle = `ប្រចាំខែ · ខែ${KHMER_MONTHS[monthNum - 1] || ''} ឆ្នាំ${toKhmerDigits(yearNum)} · ថ្ងៃទី១–${toKhmerDigits(sheet.days.length)}`
  ctx.fillStyle = '#8a3d0f'
  ctx.font = `20px ${BODY_FONT}`
  drawCentered(ctx, monthTitle, marginX + contentW / 2, y)
  y += 28

  const metaH = 52
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = '#e2d5c4'
  ctx.lineWidth = 1.5
  roundRect(ctx, marginX, y, contentW, metaH, 12)
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = '#5c1a1a'
  ctx.font = `bold 16px ${BODY_FONT}`
  ctx.fillText(sheet.kuti, marginX + 16, y + 22)

  ctx.fillStyle = '#6b5e52'
  ctx.font = `14px ${BODY_FONT}`
  ctx.fillText(sheet.type_label, marginX + 16, y + 40)

  const rangeText = `${formatKhmerShort(sheet.from)} – ${formatKhmerShort(sheet.to)}`
  ctx.fillStyle = '#5c1a1a'
  ctx.font = `bold 15px ${BODY_FONT}`
  const rangeW = ctx.measureText(rangeText).width
  ctx.fillText(rangeText, marginX + contentW - 16 - rangeW, y + 32)

  y += metaH + 12

  const bonParty = isBonPartySheet(sheet)

  const legends: Array<{ mark: string; label: string; color: string }> = bonParty
    ? [{ mark: '✓', label: 'បានចាត់ទៅបុណ្យ', color: '#0f7b4c' }]
    : [
        { mark: '✓', label: 'មក', color: '#0f7b4c' },
        { mark: '✗', label: 'អវត្តមាន', color: '#b42318' },
        { mark: 'P', label: 'សូមច្បាប់', color: '#c45c14' },
      ]
  let lx = marginX
  legends.forEach((item) => {
    const label = `${item.mark}  ${item.label}`
    ctx.font = `bold 13px ${BODY_FONT}`
    const tw = ctx.measureText(label).width + 22
    ctx.fillStyle = `${item.color}14`
    roundRect(ctx, lx, y, tw, 24, 8)
    ctx.fill()
    ctx.fillStyle = item.color
    ctx.fillText(label, lx + 11, y + 16)
    lx += tw + 8
  })
  y += 34

  const dayCount = Math.max(sheet.days.length, 1)
  const tableTop = y
  const tableWidth = contentW
  const totalColW = bonParty ? 210 : 160
  const nameColW = Math.floor(tableWidth * 0.13)
  const dayColW = Math.floor((tableWidth - nameColW - totalColW) / dayCount)
  const totalColX = marginX + nameColW + dayColW * dayCount
  const headerH = 42
  const totals = countSheetTotals(sheet)
  const partyGrand = sheet.rows.reduce((sum, row) => sum + countPartyTrips(row.cells), 0)
  const rowH = Math.min(
    32,
    Math.max(
      26,
      Math.floor((A4_LAND_H - tableTop - 40) / Math.max(sheet.rows.length + 2, 1)),
    ),
  )

  ctx.fillStyle = '#5c1a1a'
  roundRect(ctx, marginX, tableTop, tableWidth, headerH, 8)
  ctx.fill()
  ctx.fillRect(marginX, tableTop + headerH - 8, tableWidth, 8)

  // Column headers — 20px bold
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold ${TABLE_TEXT_PX}px ${BODY_FONT}`
  ctx.fillText('ឈ្មោះ', marginX + 8, tableTop + 28)

  sheet.days.forEach((day, i) => {
    const x = marginX + nameColW + i * dayColW
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'
    ctx.beginPath()
    ctx.moveTo(x, tableTop + 4)
    ctx.lineTo(x, tableTop + headerH - 4)
    ctx.stroke()

    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${TABLE_TEXT_PX}px ${BODY_FONT}`
    drawCentered(ctx, day.label, x + dayColW / 2, tableTop + 28)
  })

  drawTotalsColumnHeader(
    ctx,
    totalColX,
    totalColW,
    tableTop,
    headerH,
    true,
    bonParty ? 'bon_party' : 'default',
  )

  let lastRowBottom = tableTop + headerH
  sheet.rows.forEach((row, ri) => {
    const ry = tableTop + headerH + ri * rowH
    if (ry + rowH > A4_LAND_H - 32 - rowH) return

    ctx.fillStyle = ri % 2 === 0 ? '#ffffff' : '#f7f1e8'
    ctx.fillRect(marginX, ry, tableWidth, rowH)
    ctx.strokeStyle = '#e8ddd0'
    ctx.strokeRect(marginX, ry, tableWidth, rowH)

    // Monk names — 20px bold
    ctx.fillStyle = '#2a1a12'
    ctx.font = `bold ${TABLE_TEXT_PX}px ${BODY_FONT}`
    const name = `${toKhmerDigits(ri + 1)}. ${row.last_name} ${row.first_name}`.trim()
    const maxNameW = nameColW - 12
    let drawName = name
    while (ctx.measureText(drawName).width > maxNameW && drawName.length > 4) {
      drawName = `${drawName.slice(0, -2)}…`
    }
    ctx.fillText(drawName, marginX + 6, ry + rowH * 0.72)

    row.cells.forEach((cell, ci) => {
      const x = marginX + nameColW + ci * dayColW
      ctx.beginPath()
      ctx.moveTo(x, ry)
      ctx.lineTo(x, ry + rowH)
      ctx.strokeStyle = '#e8ddd0'
      ctx.stroke()

      const mark = bonParty
        ? cell === 'present'
          ? REPORT_SHEET_TEMPLATE.marks.present
          : ''
        : cellMark(cell)
      if (!mark) return
      ctx.fillStyle = bonParty ? REPORT_SHEET_TEMPLATE.colors.present : cellColor(cell)
      ctx.font = `bold ${Math.floor(rowH * 0.7)}px sans-serif`
      const mw = ctx.measureText(mark).width
      ctx.fillText(mark, x + (dayColW - mw) / 2, ry + rowH * 0.75)
    })

    const rowTot = bonParty
      ? { present: countPartyTrips(row.cells), absent: 0, excused: 0 }
      : countRowTotals(row.cells)
    drawTotalsColumnCell(ctx, {
      x: totalColX,
      ry,
      colW: totalColW,
      rowH,
      ...rowTot,
      fontPx: TABLE_TEXT_PX,
      mode: bonParty ? 'bon_party' : 'default',
    })
    lastRowBottom = ry + rowH
  })

  // Last row — grand totals in last column
  const sumH = Math.max(rowH, 30)
  ctx.fillStyle = '#efe6d8'
  ctx.fillRect(marginX, lastRowBottom, tableWidth, sumH)
  ctx.strokeStyle = '#d4c4b0'
  ctx.lineWidth = 1.5
  ctx.strokeRect(marginX, lastRowBottom, tableWidth, sumH)
  ctx.fillStyle = '#5c1a1a'
  ctx.font = `bold 14px ${BODY_FONT}`
  ctx.fillText('សរុប', marginX + 6, lastRowBottom + sumH * 0.7)
  for (let i = 0; i < dayCount; i++) {
    const x = marginX + nameColW + i * dayColW
    ctx.beginPath()
    ctx.moveTo(x, lastRowBottom)
    ctx.lineTo(x, lastRowBottom + sumH)
    ctx.strokeStyle = '#d4c4b0'
    ctx.stroke()
  }
  drawTotalsColumnCell(ctx, {
    x: totalColX,
    ry: lastRowBottom,
    colW: totalColW,
    rowH: sumH,
    ...(bonParty
      ? { present: partyGrand, absent: 0, excused: 0 }
      : totals),
    fontPx: TABLE_TEXT_PX,
    highlight: true,
    mode: bonParty ? 'bon_party' : 'default',
  })

  ctx.fillStyle = '#9a8f84'
  ctx.font = `12px ${BODY_FONT}`
  const footer = bonParty
    ? `សរុប ${toKhmerDigits(sheet.rows.length)} អង្គ · A4 ផ្តេក · ${toKhmerDigits(dayCount)} ថ្ងៃ · ✓បានចាត់ទៅបុណ្យ · ${formatPartyTripCount(partyGrand)}`
    : `សរុប ${toKhmerDigits(sheet.rows.length)} អង្គ · A4 ផ្តេក · ${toKhmerDigits(dayCount)} ថ្ងៃ · ✗|P|✓`
  ctx.fillText(footer, marginX, A4_LAND_H - 16)

  return canvas
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function downloadWeekSheetPng(sheet: WeekSheetData, filename?: string) {
  await ensureSheetFonts()
  const canvas = renderWeekSheetCanvas(sheet)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('PNG failed')
  downloadBlob(blob, filename || `attendance-week-${sheet.from}.png`)
}

export async function downloadWeekSheetPdf(sheet: WeekSheetData, filename?: string) {
  await ensureSheetFonts()
  const canvas = renderWeekSheetCanvas(sheet)
  const img = canvas.toDataURL('image/png')
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  pdf.addImage(img, 'PNG', 0, 0, 210, 297)
  pdf.save(filename || `attendance-week-${sheet.from}.pdf`)
}

/** PNG data URL for on-screen preview. */
export async function weekSheetPngDataUrl(sheet: WeekSheetData) {
  await ensureSheetFonts()
  return renderWeekSheetCanvas(sheet).toDataURL('image/png')
}

export async function downloadMonthSheetPdf(sheet: WeekSheetData, filename?: string) {
  await ensureSheetFonts()
  const canvas = renderMonthSheetCanvas(sheet)
  const img = canvas.toDataURL('image/png')
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  pdf.addImage(img, 'PNG', 0, 0, 297, 210)
  pdf.save(filename || `attendance-month-${sheet.from}.pdf`)
}

export async function monthSheetPngDataUrl(sheet: WeekSheetData) {
  await ensureSheetFonts()
  return renderMonthSheetCanvas(sheet).toDataURL('image/png')
}
