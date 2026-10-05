import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { backspaceDateEntry, caretAfterDigits, daysInMonth, formatDate, normalizeDateEntry, parseDisplayDate } from '../dateTime'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & { value: string; onChange: (value: string) => void }

export function DateInput({ value, onChange, max, ...props }: Props) {
  const formatted = formatDate(value)
  const [display, setDisplay] = useState(formatted)
  const [invalid, setInvalid] = useState(false)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'year' | 'month' | 'day'>('year')
  const [draftYear, setDraftYear] = useState(0)
  const [draftMonth, setDraftMonth] = useState(0)
  const [yearPage, setYearPage] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const maxIso = typeof max === 'string' ? max : undefined
  const maxYear = Number((maxIso || new Date().toISOString().slice(0, 10)).slice(0, 4))
  useEffect(() => setDisplay(formatted), [formatted])
  const focusAtDigit = (next: string, digitOffset: number) => requestAnimationFrame(() => {
    const caret = caretAfterDigits(next, digitOffset)
    inputRef.current?.setSelectionRange(caret, caret)
  })
  const update = (next: string, digitOffset = next.replace(/\D/g, '').length) => {
    const entry = normalizeDateEntry(next, maxIso)
    setDisplay(entry.display)
    setInvalid(false)
    if (!entry.display) onChange('')
    else if (entry.iso) onChange(entry.iso)
    focusAtDigit(entry.display, digitOffset)
  }
  const openPicker = () => {
    const source = value || maxIso || new Date().toISOString().slice(0, 10)
    const [year, month] = source.split('-').map(Number)
    setDraftYear(year)
    setDraftMonth(month)
    setYearPage(Math.floor(year / 12) * 12)
    setView('year')
    setOpen(current => !current)
  }
  const selected = value ? value.split('-').map(Number) : []
  const years = Array.from({ length: 12 }, (_, index) => yearPage + 11 - index).filter(year => year > 0 && year <= maxYear)
  const months = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
  const weekdays = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']
  const chooseDay = (day: number) => {
    const iso = `${String(draftYear).padStart(4, '0')}-${String(draftMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (!maxIso || iso <= maxIso) {
      onChange(iso)
      setDisplay(formatDate(iso))
      setInvalid(false)
      setOpen(false)
    }
  }
  const firstWeekday = new Date(draftYear, draftMonth - 1, 1).getDay()
  return <div className="date-input-shell">
    <div className="date-input-control">
      <input {...props} ref={inputRef} type="text" dir="ltr" lang="he-IL" inputMode="numeric" autoComplete="bday" placeholder="DD/MM/YYYY" value={display} aria-invalid={invalid || undefined}
        onChange={event => update(event.target.value, event.target.value.slice(0, event.target.selectionStart ?? event.target.value.length).replace(/\D/g, '').length)}
        onKeyDown={event => { if (event.key === 'Backspace') { const result = backspaceDateEntry(display, event.currentTarget.selectionStart || 0, maxIso); if (result) { event.preventDefault(); setDisplay(result.entry.display); setInvalid(false); if (result.entry.iso) onChange(result.entry.iso); focusAtDigit(result.entry.display, result.digitOffset) } } }}
        onBlur={() => { const iso = parseDisplayDate(display); setInvalid(!!display && (!iso || (!!maxIso && iso > maxIso))); if (!display) onChange('') }}/>
      <button type="button" className="date-picker-trigger" aria-label="פתיחת לוח שנה" aria-expanded={open} onClick={openPicker}><CalendarDays size={17}/></button>
    </div>
    {open && <div className="date-picker" role="dialog" aria-label="בחירת תאריך לידה">
      {view === 'year' && <><header><button type="button" aria-label="שנים קודמות" onClick={() => setYearPage(page => page - 12)}><ChevronRight size={17}/></button><strong>בחירת שנה</strong><button type="button" aria-label="שנים מאוחרות יותר" disabled={yearPage + 12 > maxYear} onClick={() => setYearPage(page => page + 12)}><ChevronLeft size={17}/></button></header><div className="date-picker-years">{years.map(year => <button type="button" className={selected[0] === year ? 'selected' : ''} key={year} onClick={() => { setDraftYear(year); setView('month') }}>{year}</button>)}</div></>}
      {view === 'month' && <><header><button type="button" onClick={() => setView('year')}><ChevronRight size={17}/> שנה</button><strong>{draftYear}</strong><span/></header><div className="date-picker-months">{months.map((month, index) => { const monthNumber = index + 1; const disabled = !!maxIso && draftYear === Number(maxIso.slice(0, 4)) && monthNumber > Number(maxIso.slice(5, 7)); return <button type="button" disabled={disabled} className={selected[0] === draftYear && selected[1] === monthNumber ? 'selected' : ''} key={month} onClick={() => { setDraftMonth(monthNumber); setView('day') }}>{month}</button> })}</div></>}
      {view === 'day' && <><header><button type="button" onClick={() => setView('month')}><ChevronRight size={17}/> חודש</button><strong>{months[draftMonth - 1]} {draftYear}</strong><span/></header><div className="date-picker-weekdays">{weekdays.map(day => <span key={day}>{day}</span>)}</div><div className="date-picker-days">{Array.from({ length:firstWeekday }, (_, index) => <span key={`blank-${index}`}/>)}{Array.from({ length:daysInMonth(draftYear, draftMonth) }, (_, index) => index + 1).map(day => { const iso = `${String(draftYear).padStart(4, '0')}-${String(draftMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`; return <button type="button" disabled={!!maxIso && iso > maxIso} className={value === iso ? 'selected' : ''} key={day} onClick={() => chooseDay(day)}>{day}</button> })}</div></>}
    </div>}
  </div>
}
