from pathlib import Path
p = Path('src/App.tsx')
s = p.read_text(encoding='utf-8')

def change(old, new):
    global s
    if s.count(old) != 1:
        raise SystemExit(f'Expected one match, got {s.count(old)}: {old[:80]}')
    s = s.replace(old, new)

if s.count('navigation.map(({ id, label, icon: Icon }) =>') != 2:
    raise SystemExit('Expected desktop and mobile navigation')
s = s.replace('navigation.map(({ id, label, icon: Icon }) =>', "navigation.filter(item => !childMode || item.id !== 'more').map(({ id, label, icon: Icon }) =>")
change("<strong>{event.createdById ? `${addedBy(family.people.find(person => person.id === event.createdById))} אירוע: ${event.title}` : event.title}</strong><p>{dateLabel(event.date)} ב־{event.time}{conflicts.length ? ` · מתנגש עם ${conflicts[0].title}` : request ? ' · נדרשת הסעה' : ''}</p>{event.sourceNote && <small>{event.sourceNote}</small>}{event.issueReason && <small>{event.issueReason}</small>}{request?.status === 'UNRESOLVED' && <small>עדיין אין נהג/ת זמין/ה להסעה.</small>}{recommendation && <small>{name(recommendation.person.id)} אישר/ה ויכול/ה לבצע את ההסעה.</small>}", "<strong>{event.title}</strong><p>{dateLabel(event.date)} · {event.time} · {event.participantIds.map(name).join(', ') || 'המשפחה'}</p><small className=\"decision-summary\">{request?.status === 'UNRESOLVED' ? 'אין כרגע נהג זמין להסעה' : recommendation ? `${recommendation.person.name} זמין/ה להסעה` : conflicts.length ? 'יש חפיפה בתוכנית' : 'נדרשת החלטה לגבי ההסעה'}</small>{(conflicts.length > 0 || event.sourceNote || event.issueReason || event.createdById) && <details className=\"decision-details\"><summary>למה?</summary>{event.createdById && <p>{addedBy(family.people.find(person => person.id === event.createdById))} את האירוע</p>}{conflicts.length > 0 && <p>חופף ל־{conflicts[0].title}</p>}{event.sourceNote && <p>{event.sourceNote}</p>}{event.issueReason && <p>{event.issueReason}</p>}</details>}")
change('<p>{risk.detail}</p>{risk.sourceNote && <small>{risk.sourceNote}</small>}', '<details className="decision-details"><summary>למה?</summary><p>{risk.detail}</p>{risk.sourceNote && <small>{risk.sourceNote}</small>}</details>')
change('{entries.map(entry => <div className="feed-row"', '{entries.slice(0, 5).map(entry => <div className="feed-row"')
p.write_text(s, encoding='utf-8')
