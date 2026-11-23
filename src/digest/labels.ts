import type { CaseKind, ChatMessage, Priority } from '@/digest/contract'

export const caseLabels: Record<CaseKind, string> = {
  onboarding: 'Оформление сотрудника',
  offboarding: 'Увольнение сотрудника',
  delivery: 'Поставка карт',
}

export const priorityLabels: Record<Priority, string> = {
  urgent: 'Вмешаться сейчас',
  today: 'Проверить сегодня',
  upcoming: 'До срока',
  none: 'Без действий',
}

export const roleLabels: Record<ChatMessage['role'], string> = {
  employee: 'Сотрудник',
  manager: 'Руководитель',
  courier: 'Курьер',
  recipient: 'Получатель',
  other: 'Другой участник',
}
