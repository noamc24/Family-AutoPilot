import { useEffect, useState, type InputHTMLAttributes } from 'react'
import { formatDate, parseDisplayDate } from '../dateTime'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & { value: string; onChange: (value: string) => void }

export function DateInput({ value, onChange, max, ...props }: Props) {
  const formatted = formatDate(value)
  const [display, setDisplay] = useState(formatted)
  const [invalid, setInvalid] = useState(false)
  useEffect(() => setDisplay(formatted), [formatted])
  const update = (next: string) => {
    const clean = next.replace(/[^\d/]/g, '').slice(0, 10)
    setDisplay(clean)
    setInvalid(false)
    if (!clean) return onChange('')
    const iso = parseDisplayDate(clean)
    if (iso && (!max || iso <= String(max))) onChange(iso)
  }
  return <input {...props} type="text" dir="ltr" lang="he-IL" inputMode="numeric" placeholder="DD/MM/YYYY" value={display} aria-invalid={invalid || undefined} onChange={event => update(event.target.value)} onBlur={() => {
    const iso = parseDisplayDate(display)
    setInvalid(!!display && (!iso || (!!max && iso > String(max))))
    if (!display) onChange('')
  }}/>
}
