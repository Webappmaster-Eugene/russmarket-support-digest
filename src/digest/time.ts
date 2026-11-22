const moscowDateTime = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Moscow',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const longDateTime = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export function toMoscowInput(timestamp: string) {
  return moscowDateTime.format(new Date(timestamp)).replace(' ', 'T')
}

export function reportTime(timestamp: string) {
  return longDateTime.format(new Date(timestamp))
}

export function formatDate(isoDate: string) {
  return isoDate.split('-').reverse().join('.')
}

export function formatTimestamp(timestamp: string) {
  const local = toMoscowInput(timestamp)
  return `${formatDate(local.slice(0, 10))}, ${local.slice(11)} МСК`
}

export function fromMoscowInput(value: string) {
  return value ? `${value}:00+03:00` : ''
}
