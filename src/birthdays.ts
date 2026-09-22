import { localDate, validBirthDate, type FamilyUnit, type Person } from './data'

export type BirthdayReminder = { person: Person; date: string; daysUntil: number; turningAge: number }

const iso = (year: number, month: number, day: number) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
const leapYear = (year: number) => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
const utcDay = (date: string) => { const [year, month, day] = date.split('-').map(Number); return Date.UTC(year, month - 1, day) / 86_400_000 }

export function upcomingBirthdays(family: FamilyUnit, today = localDate()): BirthdayReminder[] {
  const currentYear = Number(today.slice(0, 4))
  return family.people.flatMap(person => {
    if (!person.birthDate || !validBirthDate(person.birthDate, today)) return []
    const [birthYear, month, originalDay] = person.birthDate.split('-').map(Number)
    const birthdayIn = (year: number) => iso(year, month, month === 2 && originalDay === 29 && !leapYear(year) ? 28 : originalDay)
    const date = birthdayIn(currentYear) >= today ? birthdayIn(currentYear) : birthdayIn(currentYear + 1)
    const daysUntil = utcDay(date) - utcDay(today)
    return daysUntil <= 7 ? [{ person, date, daysUntil, turningAge: Number(date.slice(0, 4)) - birthYear }] : []
  }).sort((a, b) => a.daysUntil - b.daysUntil || a.person.name.localeCompare(b.person.name, 'he'))
}
