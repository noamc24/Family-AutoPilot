from pathlib import Path
import re

p = Path('src/App.tsx')
s = p.read_text(encoding='utf-8')

def change(old, new):
    global s
    if s.count(old) != 1:
        raise SystemExit(f'Expected one match, got {s.count(old)}: {old[:80]}')
    s = s.replace(old, new)

change('<PersonalFocus person={currentPerson} events={myEvents} tasks={myTasks} requests={actionableRequests} unresolved={unresolvedRequests.length} onTask={() => setView(\'tasks\')}/><FamilySnapshot family={family} events={familyEvents} actorId={activePersonId}/>', '')
change('<IntegrationHub data={data} familyId={family.id} actorId={activePersonId} compact onRun={runExternalSource} onShowAll={() => setView(\'more\')}/>{inputArea}<RequestBoard', '<RequestBoard')
change('</div></div><div className="trust-note">', '</div></div><IntegrationHub data={data} familyId={family.id} actorId={activePersonId} compact onRun={runExternalSource} onShowAll={() => setView(\'more\')}/>{inputArea}<div className="trust-note">')
change('<div className="right-stack"><section className="attention-card"', '<div className="right-stack">{(attention.length + attentionTasks.length > 0) && <section className="attention-card"')
change('</div>}</section><ActivityFeed data={data} family={family}/>', '</div>}</section>}<ActivityFeed data={data} family={family}/>')
for prefix in ('actionableRequests', 'unresolvedRequests'):
    pattern = r'\{' + prefix + r'\.map\(r => <div className="issue-body".*?</div></div>\)\}'
    s, count = re.subn(pattern, '', s, count=1)
    if count != 1:
        raise SystemExit(f'Could not remove duplicated {prefix} card')
change('{attentionCount ? <>{attention.map', '{attention.length + attentionTasks.length ? <>{attention.map')
change('<span className="count-badge">{attentionCount}</span></div>{attention.length', '<span className="count-badge">{attention.length + attentionTasks.length}</span></div>{attention.length')

p.write_text(s, encoding='utf-8')
