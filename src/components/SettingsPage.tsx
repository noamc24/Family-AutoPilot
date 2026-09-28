import { Bell, Bot, ChevronLeft, Info, Link2, LockKeyhole, UserRound } from 'lucide-react'
import { normalizePersonalSettings, type Person, type PersonalSettings } from '../data'
import { sourceDefinitionById } from '../sourceDefinitions'
import { updateConnection, updateLiaAccess, updateNotifications, updateProactiveSuggestions } from '../personalSettings'
import { SourceIcon } from './SourceIcon'

type Props = { person: Person; onChange: (settings: PersonalSettings, feedback: string) => void; onEditProfile: () => void }

function Toggle({ checked, disabled, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: (checked: boolean) => void }) {
  return <label className={`settings-toggle ${disabled ? 'disabled' : ''}`}><input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} aria-label={label}/><span aria-hidden="true"/></label>
}

export function SettingsPage({ person, onChange, onEditProfile }: Props) {
  const settings = normalizePersonalSettings(person.personalSettings)
  const connectedCount = settings.integrations.filter(item => item.connectionStatus === 'connected').length
  return <div className="settings-page"><header className="settings-hero"><span className="overline">המרחב האישי שלך</span><h1>הגדרות</h1><p>הפרופיל, החיבורים וההעדפות של {person.name}.</p></header><div className="settings-hub">
    <SettingsRoute icon={<UserRound/>} title="פרופיל" subtitle="פרטים אישיים, זמינות ולו״ז קבוע"><div className="settings-profile"><span className={`avatar large ${person.color}`}>{person.name[0]}</span><div><h2>{person.name}</h2><p>{person.role} · גיל {person.age}</p></div><button className="primary-action" onClick={onEditProfile}>עריכת פרופיל ולו״ז</button></div></SettingsRoute>
    <SettingsRoute icon={<Link2/>} title="חיבורים" subtitle={`${connectedCount} מקורות מחוברים`}><div className="connections-grid">{settings.integrations.map(integration => { const source = sourceDefinitionById[integration.sourceId]; if (!source) return null; const connected = integration.connectionStatus === 'connected'; const allowed = connected && integration.liaAccess === 'allowed'; return <details className="connection-tile" key={integration.sourceId}><summary><span className="connection-icon"><SourceIcon sourceId={integration.sourceId}/></span><span><strong>{source.displayName}</strong><small>{connected ? 'מחובר' : 'לא מחובר'}</small></span><i className={connected ? 'connected' : ''}/><ChevronLeft size={16}/></summary><div className="connection-details"><p>{source.description}</p><div className="preference-row"><div><strong>גישה ל־LIA</strong><small>{source.demoUse}</small></div><Toggle checked={allowed} disabled={!connected} label={`גישה ל־LIA עבור ${source.displayName}`} onChange={value => onChange(updateLiaAccess(settings, integration.sourceId, value), value ? `LIA יכולה כעת להשתמש ב־${source.displayName}.` : `LIA לא תשתמש יותר ב־${source.displayName}.`)}/></div><button className={connected ? 'disconnect-button' : 'primary-action'} onClick={() => onChange(updateConnection(settings, integration.sourceId, !connected), connected ? `${source.displayName} נותק.` : `${source.displayName} חובר.`)}>{connected ? 'ניתוק החיבור' : 'חיבור השירות'}</button></div></details> })}</div><div className="privacy-note"><LockKeyhole size={17}/><span>מידע אישי נשאר אישי. המשפחה רואה רק תובנות שנדרשות לתיאום.</span></div></SettingsRoute>
    <SettingsRoute icon={<Bell/>} title="התראות" subtitle="איך ומתי להתעדכן"><Preference title="התראות FamPilot" subtitle="שינויים בתוכנית ובקשות אחריות."><Toggle checked={settings.notifications.enabled} label="התראות FamPilot" onChange={enabled => onChange(updateNotifications(settings, enabled), 'הגדרות ההתראות עודכנו ✓')}/></Preference></SettingsRoute>
    <SettingsRoute icon={<Bot/>} title="LIA" subtitle="המלצות והרשאות מידע"><Preference title="המלצות יזומות" subtitle="הצעות לתיאום כשמתגלה שינוי רלוונטי."><Toggle checked={settings.lia.proactiveSuggestions} label="המלצות יזומות" onChange={enabled => onChange(updateProactiveSuggestions(settings, enabled), 'העדפות LIA עודכנו ✓')}/></Preference></SettingsRoute>
    <SettingsRoute icon={<Info/>} title="אודות FamPilot" subtitle="פרטיות ומידע על גרסת ה־MVP"><div className="about-copy"><h2>גרסת MVP</h2><p>החיבורים לשירותים חיצוניים בגרסה הזו מדומים ופועלים מקומית לצורך הצגת חוויית המוצר. לא מתבצע חיבור לחשבונות אמיתיים.</p><h2>פרטיות</h2><p>בני המשפחה מקבלים רק את התובנה שנחוצה לתיאום.</p></div></SettingsRoute>
  </div></div>
}

function SettingsRoute({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode }) {
  return <details className="settings-route"><summary className="settings-tile"><span>{icon}</span><div><strong>{title}</strong><small>{subtitle}</small></div><ChevronLeft size={18}/></summary><section className="settings-route-content"><div className="settings-route-heading"><span className="overline">הגדרות</span><h1>{title}</h1><p>{subtitle}</p></div>{children}</section></details>
}

function Preference({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <div className="settings-panel"><div className="preference-row"><div><strong>{title}</strong><small>{subtitle}</small></div>{children}</div></div>
}
