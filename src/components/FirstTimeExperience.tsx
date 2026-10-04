import { useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowLeft, CalendarDays, Check, ChevronRight, Plus, ShieldCheck, Sparkles, Trash2, Users } from 'lucide-react'
import { ageFromBirthDate, defaultPersonalSettings, localDate, uid, validBirthDate, type FamilyUnit, type Person } from '../data'

type FirstTimeView = 'landing' | 'onboarding'
type Role = Person['role']
type MemberDraft = { id: string; name: string; role: Role; birthDate: string }
type Props = { onComplete: (family: FamilyUnit, currentMemberId: string) => void }

const roles: Role[] = ['אב', 'אם', 'בן', 'בת']
const colors = ['sage', 'peach', 'lavender', 'butter']
const blankMember = (): MemberDraft => ({ id: uid(), name: '', role: 'בן', birthDate: '' })
const validMember = (member: MemberDraft) => !!member.name.trim() && validBirthDate(member.birthDate)

function OnboardingField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="onboarding-field"><span>{label}</span>{children}</label>
}

export function FirstTimeExperience({ onComplete }: Props) {
  const [view, setView] = useState<FirstTimeView>('landing')
  const [step, setStep] = useState(1)
  const [current, setCurrent] = useState<MemberDraft>(() => ({ ...blankMember(), role: 'אב' }))
  const [familyName, setFamilyName] = useState('')
  const [members, setMembers] = useState<MemberDraft[]>([])
  const [additional, setAdditional] = useState<MemberDraft>(blankMember)

  const setCurrentField = <K extends keyof MemberDraft>(key: K, value: MemberDraft[K]) => setCurrent(previous => ({ ...previous, [key]: value }))
  const setAdditionalField = <K extends keyof MemberDraft>(key: K, value: MemberDraft[K]) => setAdditional(previous => ({ ...previous, [key]: value }))
  const addMember = () => {
    if (!validMember(additional)) return
    setMembers(previous => [...previous, additional])
    setAdditional(blankMember())
  }
  const finish = () => {
    const people: Person[] = [current, ...members].map((member, index) => ({
      id: member.id, name: member.name.trim(), role: member.role, color: colors[index % colors.length],
      birthDate: member.birthDate, birthYear: Number(member.birthDate.slice(0, 4)), age: ageFromBirthDate(member.birthDate),
      hasLicense: false, hasCar: false, availableForPickup: false, personalSettings: defaultPersonalSettings(),
    }))
    onComplete({ id: uid(), name: familyName.trim(), people }, current.id)
  }

  if (view === 'onboarding') return <main className="onboarding-entry" dir="rtl" data-onboarding-view="entry" data-onboarding-step={step}>
    <header className="first-time-brand"><span><Sparkles size={17}/></span><strong>FamPilot</strong></header>
    <section className="onboarding-entry-card onboarding-flow-card">
      <button className="onboarding-back" type="button" onClick={() => step === 1 ? setView('landing') : setStep(value => value - 1)}><ChevronRight size={16}/> חזרה</button>
      <div className="onboarding-step"><span>0{step}</span><i style={{ '--step-progress': `${step * 33.333}%` } as CSSProperties}/><b>03</b></div>

      {step === 1 && <><span className="first-time-kicker">שלב ראשון · עליך</span><h1>נתחיל בהיכרות קצרה</h1><p>אלה הפרטים שישמשו את הפרופיל שלך בתוך המשפחה.</p>
        <div className="onboarding-form-grid">
          <OnboardingField label="שם"><input autoFocus value={current.name} onChange={event => setCurrentField('name', event.target.value)} placeholder="איך קוראים לך?"/></OnboardingField>
          <OnboardingField label="תפקיד במשפחה"><select value={current.role} onChange={event => setCurrentField('role', event.target.value as Role)}>{roles.map(role => <option key={role}>{role}</option>)}</select></OnboardingField>
          <OnboardingField label="תאריך לידה"><input type="date" max={localDate()} value={current.birthDate} onChange={event => setCurrentField('birthDate', event.target.value)}/></OnboardingField>
        </div><div className="onboarding-actions"><button className="first-time-cta" type="button" disabled={!validMember(current)} onClick={() => setStep(2)}>המשך <ArrowLeft size={16}/></button></div>
      </>}

      {step === 2 && <><span className="first-time-kicker">שלב שני · המשפחה</span><h1>מי במשפחה שלך?</h1><p>אפשר להתחיל רק איתך ולהוסיף את שאר בני המשפחה אחר כך דרך ההגדרות.</p>
        <div className="onboarding-form-grid family-name-field"><OnboardingField label="שם המשפחה"><input autoFocus value={familyName} onChange={event => setFamilyName(event.target.value)} placeholder="למשל, משפחת לוי"/></OnboardingField></div>
        <details className="onboarding-add-member" open={members.length === 0}>
          <summary><Plus size={15}/> הוספת בן או בת משפחה <small>לא חובה</small></summary>
          <div className="onboarding-member-fields">
            <OnboardingField label="שם"><input value={additional.name} onChange={event => setAdditionalField('name', event.target.value)} placeholder="שם"/></OnboardingField>
            <OnboardingField label="תפקיד"><select value={additional.role} onChange={event => setAdditionalField('role', event.target.value as Role)}>{roles.map(role => <option key={role}>{role}</option>)}</select></OnboardingField>
            <OnboardingField label="תאריך לידה"><input type="date" max={localDate()} value={additional.birthDate} onChange={event => setAdditionalField('birthDate', event.target.value)}/></OnboardingField>
            <button type="button" className="onboarding-add-button" disabled={!validMember(additional)} onClick={addMember}><Plus size={14}/> הוספה</button>
          </div>
        </details>
        {!!members.length && <div className="onboarding-member-list">{members.map((member, index) => <div key={member.id}><span className={`avatar ${colors[(index + 1) % colors.length]}`}>{member.name[0]}</span><span><strong>{member.name}</strong><small>{member.role} · {new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${member.birthDate}T12:00:00`))}</small></span><button type="button" onClick={() => setMembers(previous => previous.filter(item => item.id !== member.id))} aria-label={`הסרת ${member.name}`}><Trash2 size={14}/></button></div>)}</div>}
        <div className="onboarding-actions"><button className="first-time-cta" type="button" disabled={!familyName.trim()} onClick={() => setStep(3)}>לסיכום <ArrowLeft size={16}/></button></div>
      </>}

      {step === 3 && <><span className="first-time-kicker">שלב שלישי · מוכנים</span><h1>הכול מוכן להתחלה</h1><p>הפרטים יישמרו רק לאחר הכניסה ל־FamPilot. תמיד אפשר לערוך ולהוסיף בהמשך.</p>
        <div className="onboarding-summary">
          <div><span><Users size={17}/></span><small>המשפחה</small><strong>{familyName}</strong></div>
          <div><span className={`avatar ${colors[0]}`}>{current.name[0]}</span><small>המשתמש הנוכחי</small><strong>{current.name} · {current.role}</strong></div>
          <div className="onboarding-summary-members"><small>בני משפחה נוספים</small>{members.length ? members.map(member => <strong key={member.id}><Check size={13}/>{member.name} · {member.role}</strong>) : <strong>אפשר להוסיף בהמשך</strong>}</div>
        </div><div className="onboarding-actions"><button className="first-time-cta onboarding-finish" type="button" onClick={finish}>כניסה ל־FamPilot <ArrowLeft size={16}/></button></div>
      </>}
    </section>
  </main>

  return <main className="first-time-landing" dir="rtl" data-onboarding-view="landing"><header className="first-time-brand"><span><Sparkles size={17}/></span><strong>FamPilot</strong></header><section className="first-time-hero"><div className="first-time-copy"><span className="first-time-kicker">המשפחה, בתיאום</span><h1>המשפחה שלך.<br/><em>מסודרת מעצמה.</em></h1><p>FamPilot מחבר בין היומנים, התיאומים והשינויים הקטנים של היום־יום. LIA עוזרת לשמור הכול במקום, כדי שאתם תוכלו פשוט להיות משפחה.</p><button className="first-time-cta" type="button" onClick={() => setView('onboarding')}>התחלה <ArrowLeft size={17}/></button><small className="first-time-duration">ההקמה אורכת כמה דקות בלבד</small></div><div className="first-time-orbit" aria-hidden="true"><div className="orbit-center"><Sparkles size={23}/><span>LIA</span></div><span className="orbit-token orbit-calendar"><CalendarDays size={16}/> יומן</span><span className="orbit-token orbit-family"><Users size={16}/> משפחה</span><span className="orbit-token orbit-trust"><ShieldCheck size={16}/> בשליטה</span></div></section><footer className="first-time-footer"><span/>FamPilot נבנה בשביל הקצב האמיתי של משפחות</footer></main>
}
