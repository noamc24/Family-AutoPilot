from pathlib import Path
p = Path('src/App.tsx')
s = p.read_text(encoding='utf-8')

def take(old):
    global s
    if s.count(old) != 1:
        raise SystemExit(f'Expected one match, got {s.count(old)}: {old[:70]}')
    s = s.replace(old, '')
    return old

def put(old, new):
    global s
    if s.count(old) != 1:
        raise SystemExit(f'Expected one match, got {s.count(old)}: {old[:70]}')
    s = s.replace(old, new)

icon = take('<Field label="סמל"><input value={form.icon || \'\'} onChange={e => updateForm(\'icon\', e.target.value)} maxLength={4}/></Field>')
end = take('<Field label="שעת סיום (רשות)"><input type="time" value={form.endTime || \'\'} onChange={e => updateForm(\'endTime\', e.target.value)}/></Field>')
priority = '<Field label="חשיבות"><select value={form.priority || \'normal\'} onChange={e => updateForm(\'priority\', e.target.value)}>{(Object.entries(priorityLabels) as [Priority, string][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>'
if s.count(priority) != 2:
    raise SystemExit('Expected event and task priority fields')
s = s.replace(priority, '', 1)
override = take('<label className="rule-check"><input type="checkbox" checked={form.routineOverride === \'true\'} onChange={e => updateForm(\'routineOverride\', String(e.target.checked))}/>אירוע חריג: מאשרים חפיפה ללו״ז הקבוע</label>')
responsibility = take('<ResponsibilityEditor people={family.people} items={responsibilities} onChange={setResponsibilities} suggestOwner={suggestResponsibilityOwner}/>')
put('<ModalActions onSave={() => saveForm()} onDelete={dialog.item ? () => removeEvent(dialog.item!) : undefined}', '<details className="advanced-options"><summary>אפשרויות נוספות</summary><div className="form-grid">' + icon + end + priority + '</div>' + override + responsibility + '</details><ModalActions onSave={() => saveForm()} onDelete={dialog.item ? () => removeEvent(dialog.item!) : undefined}')

task_start = s.index("dialog?.type === 'task' ?")
task_end = s.index("dialog?.type === 'person' ?", task_start)
task = s[task_start:task_end]
task = task.replace(priority, '')
advanced_start = task.index('<label className="rule-check">')
advanced_end = task.index('<ModalActions', advanced_start)
advanced = task[advanced_start:advanced_end]
task = task[:advanced_start] + '<details className="advanced-options"><summary>אפשרויות נוספות</summary><div className="form-grid">' + priority + '</div>' + advanced + '</details>' + task[advanced_end:]
s = s[:task_start] + task + s[task_end:]
p.write_text(s, encoding='utf-8')
