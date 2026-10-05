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

export function parseDisplayDate(value: string): string | null {
  const match = value.trim().match(DISPLAY_DATE)
  if (!match) return null
  const iso = `${match[3]}-${match[2]}-${match[1]}`
  return isIsoDate(iso) ? iso : null
}

export function isTime(value: string): boolean {
  const match = value.match(TIME)
  return !!match && Number(match[1]) < 24 && Number(match[2]) < 60
}

export const formatTime = (value?: string) => value && isTime(value.slice(0, 5)) ? value.slice(0, 5) : ''
export const taskDueDate = (value: string) => value.slice(0, 10)
export const taskDueTime = (value: string) => value.includes('T') ? formatTime(value.split('T')[1]) : ''
export const formatDateTime = (value: string) => `${formatDate(value)}${taskDueTime(value) ? ` · ${taskDueTime(value)}` : ''}`
