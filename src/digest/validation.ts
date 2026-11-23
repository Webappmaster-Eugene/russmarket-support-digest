import type { CaseInput, FieldIssue } from '@/digest/contract'

export function normalizeReference(reference: string) {
  return reference.normalize('NFKC').toLocaleLowerCase('ru-RU')
}

export function validateCaseAt(input: CaseInput, asOf: string): { title: string; field: FieldIssue } | undefined {
  if (input.kind !== 'delivery') return
  const { status, acceptedAt, dueAt } = input.crm
  if (status === 'accepted') {
    if (!acceptedAt || Date.parse(acceptedAt) > Date.parse(asOf)) return {
      title: 'Проверьте время приёмки.',
      field: { path: 'crm.acceptedAt', message: 'Укажите время приёмки не позже текущего момента.' },
    }
    return
  }
  if (!dueAt) return {
    title: 'Проверьте поля доставки.',
    field: { path: 'crm.dueAt', message: 'Укажите срок доставки.' },
  }
  if (acceptedAt) return {
    title: 'Проверьте поля доставки.',
    field: { path: 'crm.acceptedAt', message: 'Время приёмки доступно для статуса «Принято».' },
  }
}
