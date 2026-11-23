import { z } from 'zod'

export const chatRoles = ['employee', 'manager', 'courier', 'recipient', 'other'] as const
export const priorities = ['urgent', 'today', 'upcoming', 'none'] as const
export const caseKinds = ['onboarding', 'offboarding', 'delivery'] as const

export const timestamp = z.iso.datetime({ offset: true, error: 'Укажите дату и время.' })
  .refine((value) => Number.isFinite(Date.parse(value)), 'Укажите корректную дату и время.')
const date = z.iso.date({ error: 'Укажите дату.' })
const reference = z.string().trim().min(1, 'Введите ID случая.').max(32, 'До 32 символов.')
  .refine((value) => !/\p{Cc}/u.test(value), 'Удалите управляющие символы из ID.')

export const caseInput = z.discriminatedUnion('kind', [
  z.strictObject({
    id: reference,
    kind: z.literal('onboarding'),
    crm: z.strictObject({
      startDate: date,
      documents: z.enum(['awaiting', 'confirmed'], { error: 'Выберите статус документов.' }),
    }),
  }),
  z.strictObject({
    id: reference,
    kind: z.literal('offboarding'),
    crm: z.strictObject({
      lastDay: date,
      managerConfirmed: z.boolean({ error: 'Укажите, есть ли согласование.' }),
    }),
  }),
  z.strictObject({
    id: reference,
    kind: z.literal('delivery'),
    crm: z.strictObject({
      status: z.enum(['planned', 'in_transit', 'accepted'], { error: 'Выберите статус доставки.' }),
      dueAt: timestamp.optional(),
      acceptedAt: timestamp.optional(),
    }),
  }),
])

export const messageInput = z.strictObject({
  role: z.enum(chatRoles, { error: 'Выберите автора сообщения.' }),
  text: z.string().trim().min(1, 'Введите сообщение.').max(2000, 'До 2000 символов.')
    .refine((value) => !value.includes('\u0000'), 'Удалите недопустимый символ из сообщения.'),
  at: timestamp,
  conflict: z.boolean(),
})

export const versionInput = z.number().int().positive()
export const resolutionInput = z.string().trim().min(1, 'Опишите, что удалось выяснить.').max(500, 'До 500 символов.')

const chatRecord = messageInput.extend({ key: z.string().optional(), resolution: z.string().optional() })
const digestItem = z.strictObject({
  id: z.string(),
  key: z.string().optional(),
  kind: z.enum(caseKinds),
  priority: z.enum(priorities),
  reason: z.string(),
  crm: z.array(z.string()),
  chat: z.array(chatRecord),
  chatNote: z.string().optional(),
  hasConflict: z.boolean().optional(),
  verify: z.string(),
  action: z.string(),
})

export const digestSchema = z.strictObject({ asOf: timestamp, items: z.array(digestItem) })

export type CaseInput = z.infer<typeof caseInput>
export type CaseKind = CaseInput['kind']
export type ChatMessage = z.infer<typeof chatRecord>
export type SupportCase = CaseInput & { chat: ChatMessage[]; key?: string }
export type Priority = typeof priorities[number]
export type DigestItem = z.infer<typeof digestItem>
export type DigestRequest = { asOf: string; cases: SupportCase[] }
export type Digest = z.infer<typeof digestSchema>
export type FieldIssue = { path: string; message: string }
