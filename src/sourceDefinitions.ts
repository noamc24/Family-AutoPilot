import type { IntegrationSource } from './data'

export type SourceDefinition = {
  id: IntegrationSource
  displayName: string
  icon: string
  description: string
  demoUse: string
}

export const sourceDefinitions: SourceDefinition[] = [
  { id: 'family', displayName: 'המשפחה', icon: '👪', description: 'עדכונים מהתוכנית', demoUse: 'LIA מחברת בין פעולות משפחתיות.' },
  { id: 'weather', displayName: 'מזג האוויר', icon: '☀️', description: 'תחזית לפעילויות', demoUse: 'LIA מזהה השפעה על התוכנית.' },
  { id: 'calendar', displayName: 'Google Calendar', icon: '🗓️', description: 'אירועים וזמנים אישיים', demoUse: 'LIA מבינה מי צריך להיות איפה ומתי.' },
  { id: 'whatsapp', displayName: 'WhatsApp', icon: '💬', description: 'עדכונים מתרחישי הדמו', demoUse: 'LIA מזהה מידע רלוונטי למשפחה.' },
  { id: 'email', displayName: 'Email', icon: '✉️', description: 'הודעות ועדכונים', demoUse: 'LIA מזהה שינויים ומועדים רלוונטיים.' },
  { id: 'waze', displayName: 'Waze', icon: '🚗', description: 'זמני נסיעה ועומסים', demoUse: 'LIA מזהה מתי כדאי לצאת מוקדם יותר.' },
  { id: 'location', displayName: 'Location', icon: '📍', description: 'מיקום משוער', demoUse: 'LIA משתמשת במיקום לתיאום הגעה.' },
  { id: 'school', displayName: 'בית ספר', icon: '🏫', description: 'מערכת ועדכונים', demoUse: 'LIA מזהה שינויים בשעות ובפעילויות.' },
  { id: 'university', displayName: 'אוניברסיטה', icon: '🎓', description: 'מערכת לימודים', demoUse: 'LIA מזהה שינויים במערכת הלימודים.' },
  { id: 'work', displayName: 'עבודה', icon: '💼', description: 'זמנות ואירועי עבודה', demoUse: 'LIA מתחשבת בשעות העבודה.' },
  { id: 'club', displayName: 'פעילויות', icon: '⚽', description: 'חוגים ופעילויות', demoUse: 'LIA משתמשת בשעות ובמיקומים לתיאום.' },
  { id: 'transit', displayName: 'תחבורה ציבורית', icon: '🚌', description: 'קווים וזמני הגעה', demoUse: 'LIA בודקת חלופות להסעה.' },
]

export const sourceDefinitionById = Object.fromEntries(sourceDefinitions.map(source => [source.id, source])) as Partial<Record<IntegrationSource, SourceDefinition>>
