import { z } from 'zod'
import { caseInput, messageInput, resolutionInput, versionInput } from '@/digest/contract'
import { fromMoscowInput } from '@/digest/time'
import { parse } from '@/server/errors'

export const uuidInput = z.uuid({ error: 'Некорректный ID записи.' })

export const operationInput = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('edit'), version: versionInput, value: caseInput }),
  z.strictObject({ action: z.literal('message'), version: versionInput, value: messageInput }),
  z.strictObject({ action: z.literal('resolve'), version: versionInput, messageId: uuidInput, resolution: resolutionInput }),
  z.strictObject({ action: z.literal('archive'), version: versionInput }),
  z.strictObject({ action: z.literal('restore'), version: versionInput }),
])

export function fields(data: FormData) {
  return Object.fromEntries([...data.entries()].flatMap(([key, value]) =>
    typeof value === 'string' && !key.startsWith('$ACTION_') ? [[key, value]] : []))
}

export function readCaseFields(values: Record<string, string>) {
  let crm: unknown
  if (values.kind === 'onboarding') crm = { startDate: values.startDate, documents: values.documents }
  if (values.kind === 'offboarding') crm = {
    lastDay: values.lastDay,
    managerConfirmed: values.managerConfirmed === 'yes' ? true : values.managerConfirmed === 'no' ? false : undefined,
  }
  if (values.kind === 'delivery') crm = {
    status: values.status,
    dueAt: values.dueAt ? fromMoscowInput(values.dueAt) : undefined,
    acceptedAt: values.status === 'accepted' && values.acceptedAt ? fromMoscowInput(values.acceptedAt) : undefined,
  }
  return parse(caseInput, { id: values.id, kind: values.kind, crm })
}

export function readOperation(values: Record<string, string>) {
  const version = Number(values.version)
  const action = values.action
  if (action === 'edit') return parse(operationInput, { action, version, value: readCaseFields(values) })
  if (action === 'message') return parse(operationInput, { action, version, value: {
    role: values.role, text: values.text, at: fromMoscowInput(values.at ?? ''), conflict: values.conflict === 'on',
  } })
  if (action === 'resolve') return parse(operationInput, { action, version,
    messageId: values.messageId, resolution: values.resolution })
  return parse(operationInput, { action, version })
}
