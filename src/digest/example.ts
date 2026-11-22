import type { DigestRequest, SupportCase } from '@/digest/contract'

export const example = {
  asOf: '2026-11-23T10:00:00+03:00',
  cases: [
    {
      id: 'С-17',
      kind: 'onboarding',
      crm: { startDate: '2026-11-24', documents: 'awaiting' },
      chat: [{ role: 'employee', text: 'Вчера отправил фотографии документов руководителю в личку.' }],
    },
    {
      id: 'С-24',
      kind: 'offboarding',
      crm: { lastDay: '2026-11-23', managerConfirmed: false },
      chat: [{ role: 'employee', text: 'С руководителем всё обсудили, он в курсе.' }],
    },
    {
      id: 'П-08',
      kind: 'delivery',
      crm: { status: 'in_transit', dueAt: '2026-11-23T10:00:00+03:00' },
      chat: [{ role: 'courier', text: 'Задерживаюсь, раньше 13:00 не приеду.' }],
    },
    {
      id: 'П-09',
      kind: 'delivery',
      crm: { status: 'accepted', acceptedAt: '2026-11-23T09:20:00+03:00' },
      chat: [{ role: 'recipient', text: 'Карты получили, количество проверили.' }],
    },
  ],
} satisfies DigestRequest & { cases: [SupportCase, ...SupportCase[]] }
