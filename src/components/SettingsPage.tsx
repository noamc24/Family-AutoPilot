import { Bell, Bot, ChevronLeft, Info, Link2, LockKeyhole, UserRound } from 'lucide-react'
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
}

const autonomyOptions: { value: NonNullable<FamilyPreferences['autonomy']>; label: string; description: string }[] = [
  { value: 'conservative', label: 'שמרנית', description: 'LIA מזהה ומציגה שינויים, בלי פעולות רקע.' },
  { value: 'balanced', label: 'מאוזנת', description: 'LIA מטפלת בזמינות ובמשימות גמישות; שינוי רגיש ממתין לאישור.' },
  { value: 'autopilot', label: 'אוטומטית', description: 'LIA מפעילה עדכונים ותרחישים אוטומטיים; פעולות רגישות נשארות לאישור.' },
]

function Toggle({ checked, disabled, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: (checked: boolean) => void }) {
  return <label className={`settings-toggle ${disabled ? 'disabled' : ''}`}><input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} aria-label={label}/><span aria-hidden="true"/></label>
}

export function SettingsPage({ person, autonomy, onAutonomyChange, onChange, onEditProfile }: Props) {
  const settings = normalizePersonalSettings(person.personalSettings)
  const connectedCount = settings.integrations.filter(item => item.connectionStatus === 'connected').length
  return <div className="settings-page"><header className="settings-hero"><span className="overline">המרחב האישי שלך</span><h1>הגדרות</h1><p>הפרופיל, החיבורים וההעדפות של {person.name}.</p></header><div className="settings-hub">
    <SettingsRoute icon={<UserRound/>} title="הפרופיל שלי" subtitle="שם, תפקיד ופרטים אישיים"><div className="settings-profile compact-profile"><span className={`avatar large ${person.color}`}>{person.name[0]}</span><div><span className="overline">הפרופיל שלי</span><h2>{person.name}</h2><p>{person.role} · גיל {person.age}{person.birthDate ? ` · ${new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long' }).format(new Date(`${person.birthDate}T12:00:00`))}` : ''}</p></div><button className="primary-action" onClick={onEditProfile}>עריכת פרטים</button></div></SettingsRoute>
    <SettingsRoute icon={<Link2/>} title="חיבורים" subtitle={`${connectedCount} מקורות פעילים עבור ${person.name}`}><div className="connections-list">{settings.integrations.map(integration => { const source = sourceDefinitionById[integration.sourceId]; if (!source) return null; const connected = integration.connectionStatus === 'connected'; const allowed = connected && integration.liaAccess === 'allowed'; return <details className={`connection-row ${connected ? 'is-active' : ''}`} key={integration.sourceId}><summary><span className="connection-icon"><SourceIcon sourceId={integration.sourceId}/></span><span className="connection-name"><strong>{source.displayName}</strong><small>{source.description}</small></span><span className={`connection-state ${connected ? 'active' : ''}`}>{connected ? 'פעיל' : 'לא פעיל'}</span><span className="manage-label">ניהול</span><ChevronLeft size={15}/></summary><div className="connection-details"><div className="preference-row"><div><strong>שימוש של LIA במקור</strong><small>{source.demoUse}</small></div><Toggle checked={allowed} disabled={!connected} label={`גישה ל־LIA עבור ${source.displayName}`} onChange={value => onChange(updateLiaAccess(settings, integration.sourceId, value), value ? `LIA יכולה כעת להשתמש ב־${source.displayName}.` : `LIA לא תשתמש יותר ב־${source.displayName}.`)}/></div><button className={connected ? 'disconnect-button' : 'primary-action'} onClick={() => onChange(updateConnection(settings, integration.sourceId, !connected), connected ? `${source.displayName} נותק.` : `${source.displayName} הופעל עבור ${person.name}.`)}>{connected ? 'ניתוק' : 'הפעלה'}</button><small className="simulation-note">חיבור זה מדומה ופועל מקומית בגרסת ה־MVP.</small></div></details> })}</div><div className="privacy-note"><LockKeyhole size={17}/><span>מידע אישי נשאר אישי. החיבורים שייכים ל־{person.name}, ומקור לא פעיל לא ייצור עבורו עדכוני הדגמה.</span></div></SettingsRoute>
    <SettingsRoute icon={<Bell/>} title="התראות" subtitle="מה מופיע כהודעה בתוך FamPilot"><div className="notification-preferences"><div className="notification-row essential"><div><strong>דברים שדורשים ממני פעולה</strong><small>אישורים, בקשות הסעה והחלטות שממתינות לך.</small></div><span className="always-on">תמיד פעיל</span></div><NotificationPreference title="שינויים חשובים" subtitle="שינויים משמעותיים בתוכנית ממקורות פעילים." checked={settings.notifications.importantChanges} onChange={enabled => onChange(updateNotifications(settings, 'importantChanges', enabled), 'הגדרות ההתראות עודכנו ✓')}/><NotificationPreference title="עדכוני LIA" subtitle="המלצות אוטומטיות וטיפול במשימות גמישות." checked={settings.notifications.liaUpdates} onChange={enabled => onChange(updateNotifications(settings, 'liaUpdates', enabled), 'הגדרות ההתראות עודכנו ✓')}/><NotificationPreference title="עדכונים שוטפים" subtitle="תזכורות אישיות שאינן דורשות פעולה מיידית." checked={settings.notifications.routineUpdates} onChange={enabled => onChange(updateNotifications(settings, 'routineUpdates', enabled), 'הגדרות ההתראות עודכנו ✓')}/></div><p className="notification-scope-note">ההעדפות משפיעות על הודעות קצרות בתוך האפליקציה. פריטים קריטיים נשארים במרכז הטיפול.</p></SettingsRoute>
    <SettingsRoute icon={<Bot/>} title="LIA" subtitle={`רמת פעולה: ${autonomyOptions.find(option => option.value === autonomy)?.label}`}><div className="lia-autonomy"><span className="overline">רמת אוטונומיה משפחתית</span><div className="autonomy-options">{autonomyOptions.map(option => <label className={autonomy === option.value ? 'selected' : ''} key={option.value}><input type="radio" name="lia-autonomy" value={option.value} checked={autonomy === option.value} onChange={() => onAutonomyChange(option.value)}/><span><strong>{option.label}</strong><small>{option.description}</small></span></label>)}</div></div><details className="lia-advanced"><summary>הגדרות מתקדמות</summary><Preference title="המלצות יזומות" subtitle="הצעות לתיאום כשמתגלה שינוי רלוונטי."><Toggle checked={settings.lia.proactiveSuggestions} label="המלצות יזומות" onChange={enabled => onChange(updateProactiveSuggestions(settings, enabled), 'העדפות LIA עודכנו ✓')}/></Preference></details></SettingsRoute>
    <SettingsRoute icon={<Info/>} title="אודות FamPilot" subtitle="פרטיות ומידע על גרסת ה־MVP"><div className="about-copy"><h2>גרסת MVP</h2><p>החיבורים לשירותים חיצוניים בגרסה הזו מדומים ופועלים מקומית לצורך הצגת חוויית המוצר. לא מתבצע חיבור לחשבונות אמיתיים.</p><h2>פרטיות</h2><p>בני המשפחה מקבלים רק את התובנה שנחוצה לתיאום.</p></div></SettingsRoute>
  </div></div>
}

function SettingsRoute({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode }) {
  return <details className="settings-route"><summary className="settings-tile"><span>{icon}</span><div><strong>{title}</strong><small>{subtitle}</small></div><ChevronLeft size={18}/></summary><section className="settings-route-content"><div className="settings-route-heading"><span className="overline">הגדרות</span><h1>{title}</h1><p>{subtitle}</p></div>{children}</section></details>
}

function Preference({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <div className="settings-panel"><div className="preference-row"><div><strong>{title}</strong><small>{subtitle}</small></div>{children}</div></div>
}

function NotificationPreference({ title, subtitle, checked, onChange }: { title: string; subtitle: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <div className="notification-row"><div><strong>{title}</strong><small>{subtitle}</small></div><Toggle checked={checked} label={title} onChange={onChange}/></div>
}
