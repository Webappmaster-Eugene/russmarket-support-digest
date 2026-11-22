import { z } from 'zod'
import { chatRoles, MAX_CASES, MAX_MESSAGE_LENGTH, MAX_MESSAGES } from '@/digest/input-spec'

export const MAX_BODY_BYTES = 128 * 1024

const timestamp = z.iso.datetime({
  offset: true,
  error: 'Укажите дату, время и смещение часового пояса.',
}).refine((value) => Number.isFinite(Date.parse(value)), 'Укажите корректную метку времени.')
const date = z.iso.date({ error: 'Укажите дату.' })

const chatMessage = z.strictObject({
  role: z.enum(chatRoles, { error: 'Выберите автора сообщения.' }),
  text: z.string().trim().min(1, 'Введите сообщение.').max(MAX_MESSAGE_LENGTH, 'До 500 символов.'),
})

const caseFields = {
  id: z.string().trim().min(1, 'Введите ID случая.').max(32, 'До 32 символов.'),
  chat: z.array(chatMessage).max(MAX_MESSAGES, 'До пяти сообщений.'),
}

const caseSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...caseFields,
    kind: z.literal('onboarding'),
    crm: z.strictObject({
      startDate: date,
      documents: z.enum(['awaiting', 'confirmed'], { error: 'Выберите статус документов.' }),
    }),
  }),
  z.strictObject({
    ...caseFields,
    kind: z.literal('offboarding'),
    crm: z.strictObject({
      lastDay: date,
      managerConfirmed: z.boolean({ error: 'Укажите, есть ли подтверждение.' }),
    }),
  }),
  z.strictObject({
    ...caseFields,
    kind: z.literal('delivery'),
    crm: z.strictObject({
      status: z.enum(['planned', 'in_transit', 'accepted'], { error: 'Выберите статус доставки.' }),
      dueAt: timestamp.optional(),
      acceptedAt: timestamp.optional(),
    }),
  }),
])

export const digestRequestSchema = z.strictObject({
  asOf: timestamp,
  cases: z.array(caseSchema)
    .min(1, 'Добавьте хотя бы один случай.')
    .max(MAX_CASES, 'До 30 случаев.'),
}).superRefine(({ asOf, cases }, ctx) => {
  const ids = new Set<string>()
  for (const [index, item] of cases.entries()) {
    const id = item.id.toLocaleLowerCase('ru-RU')
    if (ids.has(id)) {
      ctx.addIssue({ code: 'custom', path: ['cases', index, 'id'], message: 'Этот ID уже используется.' })
    }
    ids.add(id)

    if (item.kind !== 'delivery') continue
    const { status, dueAt, acceptedAt } = item.crm
    const crmPath = ['cases', index, 'crm']
    if (status === 'accepted') {
      if (!acceptedAt || Date.parse(acceptedAt) > Date.parse(asOf)) {
        ctx.addIssue({
          code: 'custom',
          path: [...crmPath, 'acceptedAt'],
          message: 'Укажите время приёмки не позже времени сводки.',
        })
      }
    } else {
      if (!dueAt) {
        ctx.addIssue({
          code: 'custom', path: [...crmPath, 'dueAt'], message: 'Укажите срок открытой доставки.',
        })
      }
      if (acceptedAt) {
        ctx.addIssue({
          code: 'custom', path: [...crmPath, 'acceptedAt'], message: 'Время приёмки доступно для статуса «Принято».',
        })
      }
    }
  }
})

export type DigestRequest = z.infer<typeof digestRequestSchema>
export type SupportCase = DigestRequest['cases'][number]
export type CaseKind = SupportCase['kind']
export type ChatMessage = z.infer<typeof chatMessage>
export type Priority = 'urgent' | 'today' | 'upcoming' | 'none'

export type DigestItem = {
  id: string
  kind: CaseKind
  priority: Priority
  reason: string
  crm: string[]
  chat: ChatMessage[]
  chatNote?: string
  verify: string
  action: string
}

export type Digest = { asOf: string; items: DigestItem[] }
export type FieldIssue = { path: string; message: string }
export type DigestResponse = { digest: Digest } | { error: string; issues?: FieldIssue[] }
