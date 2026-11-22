import type { ChatMessage } from '@/digest/contract'

type Estimate = { time: string; earliest: boolean }
const clock = '([01]?\\d|2[0-3]):([0-5]\\d)'
const patterns = [
  { pattern: new RegExp(`^(?:не раньше ${clock}|раньше ${clock} не приеду)$`, 'u'), earliest: true },
  { pattern: new RegExp(`^(?:приеду|буду|прибытие) (?:в |к )?${clock}$`, 'u'), earliest: false },
]

function estimateFromText(text: string): Estimate | undefined {
  const times = text.match(/(?<!\d)\d{1,2}:\d{2}(?!\d)/gu)
  if (times?.length !== 1 || /\b(?:utc|gmt)\b|завтра|вчера|если|возможно|наверное|\?|\d{1,2}[./]\d{1,2}/iu.test(text)) return

  const clauses = text.toLocaleLowerCase('ru-RU').split(/[,.;]+/u)
  for (const clause of clauses) {
    for (const { pattern, earliest } of patterns) {
      const match = pattern.exec(clause.trim())
      if (!match) continue
      const [hours, minutes] = match.slice(1).filter(Boolean)
      if (hours && minutes) return { time: `${hours.padStart(2, '0')}:${minutes}`, earliest }
    }
  }
}

export function readCourierEstimate(chat: ChatMessage[]) {
  const courierMessages = chat.filter(({ role }) => role === 'courier')
  const latest = courierMessages.reduce((latest, { at }) => Math.max(latest, Date.parse(at)), -Infinity)
  const fromCouriers = courierMessages.filter(({ at }) => Date.parse(at) === latest)
  if (fromCouriers.length === 0) return { kind: 'absent' } as const

  const first = fromCouriers[0]
  const estimate = first && estimateFromText(first.text)
  if (first && estimate && fromCouriers.every(({ text }) => {
    const next = estimateFromText(text)
    return next?.time === estimate.time && next.earliest === estimate.earliest
  })) return { kind: 'estimate', at: first.at, ...estimate } as const

  return { kind: 'unclear' } as const
}
