import type { FamilyUnit, Person } from './data'
import type { LiaConversationContext, LiaPendingIntent } from './liaChatTypes'

export type LiaIntent = 'GREETING' | 'WELLBEING' | 'IDENTITY' | 'CAPABILITIES' | 'CAPABILITY_LIMITS' | 'ACKNOWLEDGEMENT' | 'THANKS' | 'GOODBYE' | 'RETURN_TOPIC' | 'MEMBER_OVERVIEW' | 'WHAT_NEEDS_ATTENTION' | 'SCHEDULE' | 'NEXT_EVENT' | 'PREVIOUS_EVENT' | 'EVENT_DETAILS' | 'WHO_CAN_DRIVE' | 'RIDE_STATUS' | 'RESPONSIBILITY' | 'AVAILABILITY' | 'TASKS' | 'RECENT_CHANGES' | 'SOURCE_DETAILS' | 'COMBINED_SUMMARY' | 'ALREADY_HANDLED' | 'SEND_RIDE_REQUEST' | 'EXPLAIN' | 'MORE' | 'WHAT_IF' | 'ACTION_REQUEST' | 'HELP' | 'UNSUPPORTED'
export type TemporalScope = NonNullable<LiaConversationContext['temporalScope']>

export const normalizeHebrew = (value: string) => value.trim().toLowerCase().normalize('NFKD')
  .replace(/[\u0591-\u05c7]/g, '').replace(/[?!.,:;׳״'"()\[\]{}—–-]/g, ' ')
  .replace(/\b(האם|בבקשה|תגידי|תאמרי|תוכלי)\b/g, ' ').replace(/\s+/g, ' ').trim()

const words = (text: string) => new Set(normalizeHebrew(text).split(' ').filter(Boolean))
const includesAny = (text: string, phrases: string[]) => phrases.some(phrase => text.includes(phrase))
const hasWord = (set: Set<string>, variants: string[]) => variants.some(word => set.has(word))
const priorIntent = (intent?: string): LiaIntent | undefined => intent === 'TODAY_SCHEDULE' || intent === 'UPCOMING_EVENTS' ? 'SCHEDULE' : intent === 'OPEN_TASKS' ? 'TASKS' : intent === 'MEMBER_AVAILABILITY' ? 'AVAILABILITY' : intent as LiaIntent | undefined
const conversationalQuestion = (tokens: Set<string>) => hasWord(tokens, ['מה', 'איך'])
const temporalOnly = (text: string) => /^(ו?)(היום|מחר|השבוע|שבוע הבא|בבוקר|בצהריים|בערב|בלילה|הלילה|מחר בערב|מחר בבוקר)$/.test(text)
const hasCapabilityWord = (tokens: Set<string>) => [...tokens].some(token => ['יכולות', 'יכולת', 'יודעת', 'עוזרת', 'לעזור'].some(word => token === word || token.endsWith(word)))

export function resolveMember(family: FamilyUnit, input: string, currentMember: Person, context?: LiaConversationContext): { member?: Person; explicit: boolean; correction: boolean } {
  const text = normalizeHebrew(input)
  const explicit = family.people.map(person => ({ person, index: text.lastIndexOf(normalizeHebrew(person.name)) })).filter(item => item.index >= 0).sort((a, b) => b.index - a.index)[0]?.person
  const correction = /התכוונתי|^לא .+ אלא|^בעצם/.test(text) && !!explicit
  if (explicit) return { member: explicit, explicit: true, correction }
  if (/(^| )(אני|לי|שלי|אותי)( |$)/.test(text)) return { member: currentMember, explicit: true, correction: false }
  if (includesAny(text, ['הוא', 'היא', 'אותו', 'אותה', 'איתו', 'איתה', 'שלו', 'שלה', 'עליו', 'עליה', 'ומה איתו', 'ומה איתה'])) return { member: family.people.find(person => person.id === context?.lastMemberId), explicit: false, correction: false }
  return { member: undefined, explicit: false, correction: false }
}

export function temporalScope(input: string, fallback?: TemporalScope): TemporalScope {
  const text = normalizeHebrew(input)
  const dayPart = includesAny(text, ['בבוקר', 'הבוקר']) ? 'morning' : includesAny(text, ['בצהריים', 'צהריים']) ? 'afternoon' : includesAny(text, ['בערב', 'הערב']) ? 'evening' : includesAny(text, ['בלילה', 'הלילה']) ? 'night' : undefined
  const kind = includesAny(text, ['שבוע הבא']) ? 'nextWeek' : includesAny(text, ['השבוע']) ? 'week' : includesAny(text, ['מחר']) ? 'tomorrow' : includesAny(text, ['היום', 'כרגע']) ? 'today' : fallback?.kind || 'upcoming'
  return { kind, dayPart: dayPart || fallback?.dayPart }
}

export function classifyLiaIntent(input: string, pending?: LiaPendingIntent, previousIntent?: string): LiaIntent {
  const text = normalizeHebrew(input)
  const tokenSet = words(text)
  const previous = priorIntent(previousIntent)
  if (pending && (includesAny(text, ['עזבי']) && hasWord(tokenSet, ['טוב', 'בסדר']) || hasWord(tokenSet, ['כן', 'יאללה', 'קדימה', 'מאשר', 'מאשרת']) || includesAny(text, ['תעשי את זה', 'תבצעי', 'שלחי', 'תשלחי']))) return 'SEND_RIDE_REQUEST'
  if (pending && /^(לא|עזבי|בטלי|ביטול|לא משנה|רגע לא|לא עכשיו|נכון עזבי)$/.test(text)) return 'SEND_RIDE_REQUEST'
  if (hasWord(tokenSet, ['היי', 'הי', 'שלום', 'אהלן']) || includesAny(text, ['בוקר טוב', 'צהריים טובים', 'ערב טוב'])) return 'GREETING'
  if (includesAny(text, ['מי את', 'מה זה lia', 'מה זה ליה', 'מה התפקיד שלך'])) return 'IDENTITY'
  if ((hasWord(tokenSet, ['לא']) && hasWord(tokenSet, ['יכולה', 'יודעת'])) || includesAny(text, ['מה את לא', 'מה אי אפשר'])) return 'CAPABILITY_LIMITS'
  if ((hasWord(tokenSet, ['את']) || hasWord(tokenSet, ['שלך']) || text.includes('אותך') || text.includes('איתך')) && (hasCapabilityWord(tokenSet) || includesAny(text, ['יכולה לעשות', 'יכולה לעזור', 'אפשר לשאול', 'אפשר לעשות']))) return 'CAPABILITIES'
  if (!hasCapabilityWord(tokenSet) && (conversationalQuestion(tokenSet) && (hasWord(tokenSet, ['שלומך', 'איתך', 'נשמע', 'הולך']) || includesAny(text, ['מה קורה', 'איך את'])) || includesAny(text, ['הכל טוב', 'הכול טוב']))) return 'WELLBEING'
  if (previous === 'CAPABILITIES' && includesAny(text, ['כמו מה', 'למשל', 'דוגמה'])) return 'HELP'
  if (hasWord(tokenSet, ['ביי', 'להתראות', 'סיימנו']) || includesAny(text, ['נדבר אחר כך']) || !previous && includesAny(text, ['זה הכל', 'זה הכול'])) return 'GOODBYE'
  if (hasWord(tokenSet, ['תודה', 'אלופה', 'מלכה']) || includesAny(text, ['עזרת לי'])) return 'THANKS'
  if (hasWord(tokenSet, ['חחח', 'סבבה', 'אוקיי', 'אחלה', 'יפה'])) return 'ACKNOWLEDGEMENT'
  if (includesAny(text, ['נחזור', 'איפה היינו', 'מה שאמרת קודם', 'לגבי מה שאמרת'])) return 'RETURN_TOPIC'
  if (includesAny(text, ['אם ', 'מה יקרה אם', 'מה קורה אם', 'זה מסתדר אם'])) return 'WHAT_IF'
  if ((/התכוונתי|טעיתי|^לא .+ אלא|^לא [^ ]+ [^ ]+$|^בעצם/.test(text) || temporalOnly(text)) && previous) return previous
  if (/^(ו?מה עם|ו)[ ]*[^ ]+$/.test(text) && previous) return previous
  if (hasWord(tokenSet, ['למה']) || includesAny(text, ['איך את יודעת', 'מה הסיבה'])) return 'EXPLAIN'
  if (includesAny(text, ['יש עוד', 'עוד משהו', 'ומי עוד', 'מה עוד', 'אפשר אחרת']) || previous && includesAny(text, ['זה הכל', 'זה הכול'])) return 'MORE'
  if (includesAny(text, ['אירועים הסעות משימות והחלטות', 'אירועים הסעות משימות החלטות', 'סיכום הכל', 'סיכום הכול', 'תמונת מצב משפחתית'])) return 'COMBINED_SUMMARY'
  if (includesAny(text, ['תעבירי', 'תעביר', 'תשייכי', 'שייכי', 'תני ל', 'תשלחי ל', 'שלחי ל', 'תאשרי', 'אשרי', 'תדחי', 'דחי את'])) return 'ACTION_REQUEST'
  if (/מה .+ צריכ(?:ה)? לעשות/.test(text) || includesAny(text, ['מה אני צריך לעשות', 'מה אני צריכה לעשות'])) return 'TASKS'
  if (includesAny(text, ['מה דורש', 'לטפל בו', 'תשומת לב', 'מה דחוף', 'מה נשאר פתוח', 'צריך לטפל', 'משהו בעייתי', 'אירוע שאני צריך לעשות', 'אירוע חשוב'])) return 'WHAT_NEEDS_ATTENTION'
  if (includesAny(text, ['מי יכול לקחת', 'מי יכול להחזיר', 'מי יכול להסיע', 'מי יכול לאסוף', 'מי פנוי לקחת', 'מי פנוי להסיע', 'מי במקום', 'אז מי כן', 'מי כן'])) return 'WHO_CAN_DRIVE'
  if (includesAny(text, ['מי לוקח', 'מי מחזיר', 'מי אוסף', 'מי מסיע', 'מי אחראי', 'על מי האחריות'])) return 'RESPONSIBILITY'
  if (includesAny(text, ['מצב ההסעה', 'מה קרה עם ההסעה', 'שלחת', 'למי שלחת', 'סטטוס'])) return 'RIDE_STATUS'
  if (/^(מתי|איפה)$/.test(text) || includesAny(text, ['מתי זה', 'איפה זה', 'מי איתו', 'מי איתה', 'מי משתתף', 'פרטים על', 'באיזו שעה', 'מתי ה', 'איפה ה'])) return 'EVENT_DETAILS'
  if (/^ו?לפני$/.test(text) || includesAny(text, ['מה לפני', 'לפני זה', 'קודם לכן'])) return 'PREVIOUS_EVENT'
  if (/^ו?אחר כך$/.test(text) || includesAny(text, ['מה אחר כך', 'מה אחרי זה', 'האירוע הבא', 'הדבר הבא', 'מה הבא'])) return 'NEXT_EVENT'
  if (includesAny(text, ['משימות', 'משימה', 'מה נשאר לעשות', 'צריך לעשות'])) return 'TASKS'
  if (includesAny(text, ['מה השתנה', 'מה שינית', 'מה חדש', 'קרה משהו', 'יש עדכונים', 'עדכונים אחרונים'])) return 'RECENT_CHANGES'
  if (includesAny(text, ['מאיזה מקור', 'מה המקור', 'מאיפה זה', 'מאיפה המידע'])) return 'SOURCE_DETAILS'
  if (includesAny(text, ['מה כבר טופל', 'מה כבר סגרת', 'מה lia טיפלה', 'מה ליה טיפלה'])) return 'ALREADY_HANDLED'
  if (includesAny(text, ['אירועים הסעות משימות החלטות', 'סיכום הכל', 'סיכום הכול', 'תמונת מצב משפחתית'])) return 'COMBINED_SUMMARY'
  if (includesAny(text, ['פנוי', 'פנויה', 'זמין', 'זמינה', 'בקורס', 'בעבודה', 'יכול במקום', 'יכולה במקום', 'יכול לקחת', 'יכולה לקחת', ' יכול', 'יכולה'])) return 'AVAILABILITY'
  if (includesAny(text, ['ספרי לי על', 'מה קורה עם', 'מה המצב של', 'תמונה על'])) return 'MEMBER_OVERVIEW'
  const scheduleWords = hasWord(tokenSet, ['עושה', 'עסוק', 'עסוקה', 'תוכניות', 'תכנית', 'תוכנית', 'לוז', 'אירועים']) || includesAny(text, ['מה יש ל', 'מה יש לי', 'מה יש היום', 'מה יש מחר', 'מה יש השבוע', 'מה נשאר להיום', 'משהו בערב', 'אחרי העבודה', 'אחרי בית ספר', 'לפני החוג']) || hasWord(tokenSet, ['איפה']) && hasWord(tokenSet, ['צריך', 'צריכה']) && hasWord(tokenSet, ['להיות'])
  if (scheduleWords) return 'SCHEDULE'
  if (hasWord(tokenSet, ['עזרה']) || includesAny(text, ['תעזרי לי', 'מה אפשר לעשות פה', 'מה עושים פה', 'איך משתמשים בך', 'איך משתמשים בזה'])) return 'HELP'
  return 'UNSUPPORTED'
}

export const isAffirmative = (input: string) => includesAny(normalizeHebrew(input), ['כן', 'יאללה', 'שלחי', 'תשלחי', 'קדימה', 'סבבה'])
export const isNegative = (input: string) => includesAny(normalizeHebrew(input), ['לא', 'עזבי', 'לא עכשיו', 'ביטול', 'בטלי'])
