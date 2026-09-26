import { Bell, Link2, LockKeyhole, Settings2, UserRound } from 'lucide-react'
import { normalizePersonalSettings, type Person, type PersonalSettings } from '../data'
import { sourceDefinitionById } from '../sourceDefinitions'
import { updateConnection, updateLiaAccess, updateNotifications, updateProactiveSuggestions } from '../personalSettings'

type Props = {
  person: Person
  onChange: (settings: PersonalSettings, feedback: string) => void
  onEditProfile: () => void
}

function Toggle({ checked, disabled, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: (checked: boolean) => void }) {
  return <label className={`settings-toggle ${disabled ? 'disabled' : ''}`}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} aria-label={label}/>
    <span aria-hidden="true"/>
  </label>
}

export function SettingsPage({ person, onChange, onEditProfile }: Props) {
  const settings = normalizePersonalSettings(person.personalSettings)
  const connectedCount = settings.integrations.filter(item => item.connectionStatus === 'connected').length

  return <div className="settings-page">
    <div className="page-header settings-header"><div><div className="eyebrow">המרחב האישי שלך</div><h1>הגדרות של {person.name}</h1><p>החיבורים וההעדפות כאן שייכים רק לפרופיל הזה.</p></div></div>

    <section className="settings-section profile-summary" aria-labelledby="profile-settings-title">
      <div className="settings-section-heading"><span className={`avatar large ${person.color}`}>{person.name.slice(0, 1)}</span><div><span className="section-kicker">פרופיל</span><h2 id="profile-settings-title">{person.name}</h2><p>{person.role} · גיל {person.age} · {person.hasLicense ? 'רישיון נהיגה' : 'ללא רישיון נהיגה'}</p></div><button className="secondary-button" onClick={onEditProfile}><UserRound size={16}/> עריכת פרופיל ולו״ז</button></div>
    </section>

    <section className="settings-section" aria-labelledby="connections-title">
      <div className="settings-section-heading"><div className="settings-title-icon"><Link2 size={20}/></div><div><span className="section-kicker">שליטה במידע</span><h2 id="connections-title">חיבורים ומקורות מידע</h2><p>{connectedCount ? `${connectedCount} מקורות מחוברים לפרופיל של ${person.name}` : 'אין עדיין מקורות מחוברים.'}</p></div></div>
      <div className="privacy-note"><LockKeyhole size={18}/><span><strong>מידע אישי נשאר אישי.</strong> LIA משתפת עם המשפחה רק מידע שנדרש לתיאום, ולא את תוכן המקור המלא.</span></div>
      {!connectedCount && <div className="connections-empty">חיבור מקורות מאפשר ל־LIA לזהות שינויים ולפעול עבורך.</div>}
      <div className="connection-list">
        {settings.integrations.map(integration => {
          const source = sourceDefinitionById[integration.sourceId]
          if (!source) return null
          const connected = integration.connectionStatus === 'connected'
          const activeAccess = connected && integration.liaAccess === 'allowed'
          return <article className="connection-card" key={integration.sourceId}>
            <div className="connection-identity"><span className="connection-icon" aria-hidden="true">{source.icon}</span><div><h3>{source.displayName}</h3><p>{source.description}</p></div><span className={`connection-status ${connected ? 'connected' : ''}`}>{connected ? 'מחובר' : 'לא מחובר'} · {integration.mode === 'demo' ? 'Demo' : 'Live'}</span></div>
            <p className="lia-use"><Settings2 size={15}/><span><strong>איך LIA משתמשת בזה?</strong> {source.demoUse}</span></p>
            <div className="connection-controls">
              <div><span>אפשר ל־LIA להשתמש במידע</span><small>{connected ? activeAccess ? 'פעיל עבור מקור זה' : 'הגישה למקור כבויה' : 'אפשר לשנות לאחר חיבור המקור'}</small></div>
              <Toggle checked={activeAccess} disabled={!connected} label={`אפשר ל-LIA להשתמש במידע מ-${source.displayName}`} onChange={allowed => onChange(updateLiaAccess(settings, integration.sourceId, allowed), allowed ? `LIA יכולה כעת להשתמש ב־${source.displayName} של ${person.name}.` : `LIA לא תשתמש יותר ב־${source.displayName} של ${person.name}.`)}/>
              <button className={connected ? 'disconnect-button' : 'connect-button'} onClick={() => onChange(updateConnection(settings, integration.sourceId, !connected), connected ? `${source.displayName} נותק. ההרשאה נשמרה אך אינה פעילה.` : `${source.displayName} מחובר כעת במצב Demo.`)}>{connected ? 'נתק' : 'חבר במצב Demo'}</button>
            </div>
          </article>
        })}
      </div>
    </section>

    <div className="settings-two-column">
      <section className="settings-section" aria-labelledby="notifications-title"><div className="settings-section-heading"><div className="settings-title-icon"><Bell size={20}/></div><div><span className="section-kicker">התראות</span><h2 id="notifications-title">עדכוני LIA</h2><p>שליטה בסיסית בהתראות בתוך החוויה.</p></div></div><div className="preference-row"><div><strong>התראות LIA</strong><small>עדכונים על שינויים ובקשות אחריות.</small></div><Toggle checked={settings.notifications.enabled} label="התראות LIA" onChange={enabled => onChange(updateNotifications(settings, enabled), 'הגדרות ההתראות עודכנו ✓')}/></div></section>
      <section className="settings-section" aria-labelledby="lia-preferences-title"><div className="settings-section-heading"><div className="settings-title-icon"><Settings2 size={20}/></div><div><span className="section-kicker">העדפות LIA</span><h2 id="lia-preferences-title">המלצות יזומות</h2><p>LIA משתמשת רק במקורות שחוברו ואושרו.</p></div></div><div className="preference-row"><div><strong>הצגת המלצות</strong><small>הצעות לתיאום כשמתגלה שינוי רלוונטי.</small></div><Toggle checked={settings.lia.proactiveSuggestions} label="הצגת המלצות יזומות" onChange={enabled => onChange(updateProactiveSuggestions(settings, enabled), 'העדפות LIA עודכנו ✓')}/></div></section>
    </div>
  </div>
}
