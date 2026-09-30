import { useState, type ReactNode } from 'react'
import { Bell, Bot, ChevronLeft, ChevronRight, Link2, LockKeyhole, UserRound, UsersRound } from 'lucide-react'
import { normalizePersonalSettings, type FamilyPreferences, type Person, type PersonalSettings } from '../data'
import { sourceDefinitionById } from '../sourceDefinitions'
import { updateConnection, updateLiaAccess, updateNotifications, updateProactiveSuggestions } from '../personalSettings'
import { SourceIcon } from './SourceIcon'

type Props = {
  person: Person
  autonomy: NonNullable<FamilyPreferences['autonomy']>
  onAutonomyChange: (autonomy: NonNullable<FamilyPreferences['autonomy']>) => void
  onChange: (settings: PersonalSettings, feedback: string) => void
  onEditProfile: () => void
  familyCount: number
  familyContent: ReactNode
}

type SettingsSection = 'profile' | 'lia' | 'connections' | 'notifications' | 'family' | 'privacy'

const autonomyOptions: { value: NonNullable<FamilyPreferences['autonomy']>; label: string; description: string }[] = [
  { value: 'conservative', label: 'שמרנית', description: 'LIA מזהה ומציגה שינויים, בלי פעולות רקע.' },
  { value: 'balanced', label: 'מאוזנת', description: 'LIA מטפלת בזמינות ובמשימות גמישות; שינוי רגיש ממתין לאישור.' },
  { value: 'autopilot', label: 'אוטומטית', description: 'LIA מפעילה עדכונים ותרחישים אוטומטיים; פעולות רגישות נשארות לאישור.' },
]

function Toggle({ checked, disabled, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: (checked: boolean) => void }) {
  return <label className={`settings-toggle ${disabled ? 'disabled' : ''}`}><input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} aria-label={label}/><span aria-hidden="true"/></label>
}

export function SettingsPage({ person, autonomy, onAutonomyChange, onChange, onEditProfile, familyCount, familyContent }: Props) {
  const settings = normalizePersonalSettings(person.personalSettings)
  const connectedCount = settings.integrations.filter(item => item.connectionStatus === 'connected').length
  const notificationCount = 1 + Number(settings.notifications.importantChanges) + Number(settings.notifications.liaUpdates) + Number(settings.notifications.routineUpdates)
  const role = person.role === 'אב' ? 'אבא במשפחה' : person.role === 'אם' ? 'אמא במשפחה' : person.role
  const autonomyLabel = autonomyOptions.find(option => option.value === autonomy)?.label || ''
  const [active, setActive] = useState<SettingsSection | null>(null)
  const sections: { id: SettingsSection; icon: ReactNode; title: string; summary: string; content: ReactNode }[] = [
    { id: 'profile', icon: <UserRound/>, title: 'הפרופיל שלי', summary: `${person.name} · ${role}`, content: <div className="settings-profile compact-profile"><span className={`avatar large ${person.color}`}>{person.name[0]}</span><div><h2>{person.name}</h2><p>{person.role} · גיל {person.age}{person.birthDate ? ` · ${new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long' }).format(new Date(`${person.birthDate}T12:00:00`))}` : ''}</p></div><button className="primary-action" onClick={onEditProfile}>עריכת פרטים</button></div> },
    { id: 'lia', icon: <Bot/>, title: 'LIA', summary: `מצב ${autonomyLabel}`, content: <><div className="lia-autonomy"><span className="overline">רמת אוטונומיה משפחתית</span><div className="autonomy-options">{autonomyOptions.map(option => <label className={autonomy === option.value ? 'selected' : ''} key={option.value}><input type="radio" name="lia-autonomy" value={option.value} checked={autonomy === option.value} onChange={() => onAutonomyChange(option.value)}/><span><strong>{option.label}</strong><small>{option.description}</small></span></label>)}</div></div><details className="lia-advanced"><summary>הגדרות מתקדמות</summary><Preference title="המלצות יזומות" subtitle="הצעות לתיאום כשמתגלה שינוי רלוונטי."><Toggle checked={settings.lia.proactiveSuggestions} label="המלצות יזומות" onChange={enabled => onChange(updateProactiveSuggestions(settings, enabled), 'העדפות LIA עודכנו ✓')}/></Preference></details></> },
    { id: 'connections', icon: <Link2/>, title: 'חיבורים', summary: `${connectedCount} מקורות פעילים`, content: <><div className="connections-list">{settings.integrations.map(integration => { const source = sourceDefinitionById[integration.sourceId]; if (!source) return null; const connected = integration.connectionStatus === 'connected'; const allowed = connected && integration.liaAccess === 'allowed'; return <details className={`connection-row ${connected ? 'is-active' : ''}`} key={integration.sourceId}><summary><span className="connection-icon"><SourceIcon sourceId={integration.sourceId}/></span><span className="connection-name"><strong>{source.displayName}</strong><small>{source.description}</small></span><span className={`connection-state ${connected ? 'active' : ''}`}>{connected ? 'פעיל' : 'לא פעיל'}</span><span className="manage-label">ניהול</span><ChevronLeft size={15}/></summary><div className="connection-details"><div className="preference-row"><div><strong>שימוש של LIA במקור</strong><small>{source.demoUse}</small></div><Toggle checked={allowed} disabled={!connected} label={`גישה ל־LIA עבור ${source.displayName}`} onChange={value => onChange(updateLiaAccess(settings, integration.sourceId, value), value ? `LIA יכולה כעת להשתמש ב־${source.displayName}.` : `LIA לא תשתמש יותר ב־${source.displayName}.`)}/></div><button className={connected ? 'disconnect-button' : 'primary-action'} onClick={() => onChange(updateConnection(settings, integration.sourceId, !connected), connected ? `${source.displayName} נותק.` : `${source.displayName} הופעל עבור ${person.name}.`)}>{connected ? 'ניתוק' : 'הפעלה'}</button></div></details> })}</div><div className="privacy-note"><LockKeyhole size={17}/><span>מידע אישי נשאר אישי. החיבורים שייכים ל־{person.name}, ומקור לא פעיל לא ייצור עבורו עדכונים.</span></div></> },
    { id: 'notifications', icon: <Bell/>, title: 'התראות', summary: `${notificationCount} קטגוריות פעילות`, content: <><div className="notification-preferences"><div className="notification-row essential"><div><strong>אירועים שדורשים ממני פעולה</strong><small>אישורים, בקשות הסעה והחלטות שממתינות לך.</small></div><span className="always-on">תמיד פעיל</span></div><NotificationPreference title="שינויים חשובים" subtitle="שינויים משמעותיים בתוכנית ממקורות פעילים." checked={settings.notifications.importantChanges} onChange={enabled => onChange(updateNotifications(settings, 'importantChanges', enabled), 'הגדרות ההתראות עודכנו ✓')}/><NotificationPreference title="עדכוני LIA" subtitle="המלצות אוטומטיות וטיפול במשימות גמישות." checked={settings.notifications.liaUpdates} onChange={enabled => onChange(updateNotifications(settings, 'liaUpdates', enabled), 'הגדרות ההתראות עודכנו ✓')}/><NotificationPreference title="עדכונים שוטפים" subtitle="תזכורות אישיות שאינן דורשות פעולה מיידית." checked={settings.notifications.routineUpdates} onChange={enabled => onChange(updateNotifications(settings, 'routineUpdates', enabled), 'הגדרות ההתראות עודכנו ✓')}/></div><p className="notification-scope-note">ההעדפות משפיעות על הודעות קצרות בתוך האפליקציה. פריטים קריטיים נשארים במרכז הטיפול.</p></> },
    { id: 'family', icon: <UsersRound/>, title: 'המשפחה', summary: `${familyCount} בני משפחה`, content: familyContent },
    { id: 'privacy', icon: <LockKeyhole/>, title: 'פרטיות ובטיחות', summary: 'הגנות ילדים והרשאות', content: <><div className="privacy-safety"><section className="privacy-safety-row"><div><strong>ילדים והרשאות</strong><small>{person.age < 18 ? `מצב ילד פעיל עבור ${person.name}. ניהול המשפחה, בדיקות מקורות ופעולות LIA מוגבלים אוטומטית.` : 'מצב ילד מופעל אוטומטית לבני משפחה מתחת לגיל 18 ומגביל ניהול ופעולות LIA.'}</small></div><span className="privacy-status">{person.age < 18 ? 'מצב ילד' : 'לפי גיל'}</span></section><section className="privacy-safety-row"><div><strong>גבולות הגישה של LIA</strong><small>LIA משתמשת רק במקורות פעילים שאושרו לאדם בחיבורים. תוכן המקור הגולמי נשאר פרטי, ולמשפחה מוצגת רק תובנת התיאום.</small></div><span className="privacy-status">מנוהל בחיבורים</span></section><section className="privacy-safety-row"><div><strong>פעולות רגישות</strong><small>שינויי תכנית וחריגות מאושרים רק על־ידי הורה; פעולה אוטומטית רגישה ממתינה במרכז הטיפול לאישור או לדחייה של מבוגר.</small></div><span className="privacy-status">אישור מבוגר</span></section></div><div className="privacy-safety-disclosure"><LockKeyhole size={16}/><div><strong>הערה על החיבורים</strong><span>החיבורים לשירותים חיצוניים בגרסת MVP אינם אמיתיים. הם מדומים ופועלים מקומית בלבד.</span></div></div></> },
  ]
  const selected = sections.find(section => section.id === active)
  return <div className={`settings-page ${active ? 'has-active-setting' : ''}`}><header className="settings-hero"><span className="overline">המרחב האישי שלך</span><h1>הגדרות</h1><p>הפרופיל, החיבורים וההעדפות של {person.name}.</p></header><div className="settings-layout"><nav className="settings-nav" aria-label="קטגוריות הגדרות">{sections.map(section => <button className={active === section.id ? 'active' : ''} key={section.id} onClick={() => setActive(section.id)}><span className="settings-nav-icon">{section.icon}</span><span><strong>{section.title}</strong><small>{section.summary}</small></span><ChevronLeft size={16}/></button>)}</nav>{selected && <section className="settings-section-view"><button className="settings-mobile-back" onClick={() => setActive(null)}><ChevronRight size={16}/>כל ההגדרות</button><div className="settings-route-heading"><span className="overline">הגדרות</span><h1>{selected.title}</h1><p>{selected.summary}</p></div>{selected.content}</section>}</div></div>
}

function Preference({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <div className="settings-panel"><div className="preference-row"><div><strong>{title}</strong><small>{subtitle}</small></div>{children}</div></div>
}

function NotificationPreference({ title, subtitle, checked, onChange }: { title: string; subtitle: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <div className="notification-row"><div><strong>{title}</strong><small>{subtitle}</small></div><Toggle checked={checked} label={title} onChange={onChange}/></div>
}
