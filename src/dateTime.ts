const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const DISPLAY_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/
const TIME = /^(\d{2}):(\d{2})$/

export function isIsoDate(value: string): boolean {
  const match = value.match(ISO_DATE)
  if (!match) return false
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

export function formatDate(value: string): string {
  const date = value.slice(0, 10)
  const match = date.match(ISO_DATE)
  return match && isIsoDate(date) ? `${match[3]}/${match[2]}/${match[1]}` : ''
}

const HEBREW_WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'] as const

export function hebrewWeekday(value: string): string {
  if (!isIsoDate(value)) return ''
  const [year, month, day] = value.split('-').map(Number)
  return HEBREW_WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
}

export function parseDisplayDate(value: string): string | null {
  const match = value.trim().match(DISPLAY_DATE)
  if (!match) return null
  const iso = `${match[3]}-${match[2]}-${match[1]}`
  return isIsoDate(iso) ? iso : null
}

export type NormalizedDateEntry = { display: string; iso: string | null; digits: string }

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

const padded = (value: number, length = 2) => String(value).padStart(length, '0')

export function normalizeDateEntry(value: string, max?: string): NormalizedDateEntry {
  const rawDigits = value.replace(/\D/g, '').slice(0, 8)
  if (!rawDigits) return { display: '', iso: null, digits: '' }

  let dayDigits = rawDigits.slice(0, 2)
  let monthDigits = rawDigits.slice(2, 4)
  let yearDigits = rawDigits.slice(4, 8)
  if (dayDigits.length === 2) dayDigits = padded(Math.min(31, Math.max(1, Number(dayDigits))))
  if (monthDigits.length === 2) monthDigits = padded(Math.min(12, Math.max(1, Number(monthDigits))))

  let iso: string | null = null
  if (rawDigits.length === 8) {
    let year = Math.max(1, Number(yearDigits))
    let month = Number(monthDigits)
    let day = Number(dayDigits)
    if (max && isIsoDate(max) && year > Number(max.slice(0, 4))) year = Number(max.slice(0, 4))
    day = Math.min(day, daysInMonth(year, month))
    iso = `${padded(year, 4)}-${padded(month)}-${padded(day)}`
    if (max && isIsoDate(max) && iso > max) iso = max
    const [normalizedYear, normalizedMonth, normalizedDay] = iso.split('-')
    yearDigits = normalizedYear
    monthDigits = normalizedMonth
    dayDigits = normalizedDay
  }

  const display = [dayDigits, monthDigits, yearDigits].filter(Boolean).join('/')
    + (rawDigits.length === 2 || rawDigits.length === 4 ? '/' : '')
  return { display, iso, digits: `${dayDigits}${monthDigits}${yearDigits}`.slice(0, rawDigits.length) }
}

export function caretAfterDigits(display: string, digitCount: number): number {
  if (digitCount <= 0) return 0
  let seen = 0
  for (let index = 0; index < display.length; index += 1) {
    if (/\d/.test(display[index])) seen += 1
    if (seen === digitCount) return display[index + 1] === '/' ? index + 2 : index + 1
  }
  return display.length
}

export function backspaceDateEntry(display: string, caret: number, max?: string): { entry: NormalizedDateEntry; digitOffset: number } | null {
  if (caret <= 0 || display[caret - 1] !== '/') return null
  const digitsBeforeSeparator = display.slice(0, caret - 1).replace(/\D/g, '')
  if (!digitsBeforeSeparator) return null
  const allDigits = display.replace(/\D/g, '')
  const removeAt = digitsBeforeSeparator.length - 1
  const entry = normalizeDateEntry(`${allDigits.slice(0, removeAt)}${allDigits.slice(removeAt + 1)}`, max)
  return { entry, digitOffset: removeAt }
}

export function isTime(value: string): boolean {
  const match = value.match(TIME)
  return !!match && Number(match[1]) < 24 && Number(match[2]) < 60
}

export const formatTime = (value?: string) => value && isTime(value.slice(0, 5)) ? value.slice(0, 5) : ''
export const taskDueDate = (value: string) => value.slice(0, 10)
export const taskDueTime = (value: string) => value.includes('T') ? formatTime(value.split('T')[1]) : ''
export const formatDateTime = (value: string) => `${formatDate(value)}${taskDueTime(value) ? ` · ${taskDueTime(value)}` : ''}`
