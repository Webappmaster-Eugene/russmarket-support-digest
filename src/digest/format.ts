import type { Digest } from '@/digest/contract'
import { caseLabels, priorityLabels, roleLabels } from '@/digest/labels'
import { formatTimestamp } from '@/digest/time'

export function formatDigestText(digest: Digest) {
  return [`Сводка поддержки, ${formatTimestamp(digest.asOf)}`, ...digest.items.map((item) => [
    `${item.id} · ${caseLabels[item.kind]} · ${priorityLabels[item.priority]}`,
    item.reason,
    `CRM: ${item.crm.join(' ')}`,
    ...item.chat.map(({ role, text, at }) => `Чат, ${roleLabels[role]}, ${formatTimestamp(at)}: «${text}»`),
    ...(item.chatNote ? [item.chatNote] : []),
    `Проверить: ${item.verify}`, `Дальше: ${item.action}`,
  ].join('\n'))].join('\n\n')
}
