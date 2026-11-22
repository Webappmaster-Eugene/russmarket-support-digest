import type { ChatMessage, Digest, DigestItem, DigestRequest, Priority, SupportCase } from '@/digest/contract'
import { readCourierEstimate } from '@/digest/eta'
import { formatDate, formatTimestamp, fromMoscowInput, toMoscowInput } from '@/digest/time'

const order: Record<Priority, number> = { urgent: 0, today: 1, upcoming: 2, none: 3 }
const deliveryStatus = { planned: 'Запланировано', in_transit: 'В пути', accepted: 'Принято' }
type Decision = Omit<DigestItem, 'id' | 'kind' | 'chat'> & { deadline?: number }

function pendingPriority(day: string, reportDay: string): Priority {
  if (day < reportDay) return 'urgent'
  return day === reportDay ? 'today' : 'upcoming'
}

function onboarding(crm: Extract<SupportCase, { kind: 'onboarding' }>['crm'], day: string): Decision {
  const confirmed = crm.documents === 'confirmed'
  const facts = [
    `Первый выход — ${formatDate(crm.startDate)}.`,
    confirmed ? 'Документы подтверждены.' : 'Документы ожидаются.',
  ]
  if (confirmed) return {
    priority: 'none',
    reason: 'Документы подтверждены в CRM.',
    crm: facts,
    verify: 'Дополнительная проверка по оформлению не требуется.',
    action: 'Оставить в сводке для сведения.',
  }

  return {
    priority: pendingPriority(crm.startDate, day),
    deadline: Date.parse(fromMoscowInput(`${crm.startDate}T00:00`)),
    reason: crm.startDate < day
      ? 'Дата первого выхода прошла, документы всё ещё ожидаются.'
      : 'Документы нужны к первому выходу.',
    crm: facts,
    verify: 'Уточнить у руководителя, получил ли он документы и все ли они на месте.',
    action: 'Обновить CRM по итогам проверки. Если документов нет, согласовать с сотрудником передачу через рабочий канал.',
  }
}

function offboarding(crm: Extract<SupportCase, { kind: 'offboarding' }>['crm'], day: string): Decision {
  const facts = [
    `Последний рабочий день — ${formatDate(crm.lastDay)}.`,
    crm.managerConfirmed ? 'Подтверждение руководителя есть.' : 'Подтверждение руководителя отсутствует.',
  ]
  if (crm.managerConfirmed) return {
    priority: 'none',
    reason: 'Согласование руководителя есть в CRM.',
    crm: facts,
    verify: 'Дополнительная проверка согласования не требуется.',
    action: 'Оставить в сводке для сведения.',
  }

  return {
    priority: pendingPriority(crm.lastDay, day),
    deadline: Date.parse(fromMoscowInput(`${crm.lastDay}T23:59`)),
    reason: crm.lastDay < day
      ? 'Последний рабочий день прошёл без подтверждения руководителя в CRM.'
      : 'К последнему рабочему дню нужно получить подтверждение руководителя.',
    crm: facts,
    verify: 'Получить явное подтверждение у ответственного руководителя.',
    action: 'Зафиксировать подтверждение в CRM. Если ответа нет, эскалировать по регламенту.',
  }
}

export function isOpenConflict(item: SupportCase, message: ChatMessage) {
  if (message.resolution) return false
  if (message.conflict) return true
  return item.kind === 'delivery' && item.crm.status === 'accepted' &&
    message.role === 'recipient' && Date.parse(message.at) >= Date.parse(item.crm.acceptedAt ?? '') &&
    /(?:не\s+(?:получили|приняли|поступили|доставили)|при[её]мка\s+не\s+состоялась)/iu.test(message.text)
}

function delivery(item: Extract<SupportCase, { kind: 'delivery' }>, asOf: string): Decision {
  const { status, dueAt, acceptedAt } = item.crm
  const facts = [`Статус «${deliveryStatus[status]}».`]
  if (dueAt) facts.push(`Срок доставки — ${formatTimestamp(dueAt)}.`)
  if (status === 'accepted' && acceptedAt) {
    return {
      priority: 'none',
      reason: 'Приёмка подтверждена в CRM.',
      crm: [...facts, `Время приёмки — ${formatTimestamp(acceptedAt)}.`],
      verify: 'Повторно запрашивать подтверждение приёмки не требуется.',
      action: 'Оставить в сводке для сведения.',
    }
  }
  if (!dueAt) return {
    priority: 'today',
    reason: 'Срок доставки отсутствует.',
    crm: facts,
    verify: 'Сверить сроки с ответственным за доставку.',
    action: 'Уточнить срок и заполнить CRM.',
  }

  const deadline = Date.parse(dueAt)
  const estimate = readCourierEstimate(item.chat)
  const estimatedAt = estimate.kind === 'estimate'
    ? Date.parse(fromMoscowInput(`${toMoscowInput(estimate.at).slice(0, 10)}T${estimate.time}`))
    : undefined
  const lateEstimate = estimatedAt !== undefined && estimatedAt > deadline
  const pastEstimate = estimatedAt !== undefined && estimatedAt < Date.parse(asOf)
  const chatNote = estimate.kind === 'estimate'
    ? `Курьер сообщает о прибытии ${estimate.earliest ? 'не раньше' : 'к'} ${estimate.time} МСК.`
    : estimate.kind === 'unclear'
      ? 'Из сообщения курьера нельзя однозначно определить время прибытия.'
      : undefined

  if (deadline <= Date.parse(asOf)) {
    const hasRecipientMessage = item.chat.some(({ role }) => role === 'recipient')
    return {
      priority: 'urgent',
      deadline,
      reason: 'Срок доставки наступил, приёмка в CRM не подтверждена.',
      crm: facts,
      chatNote,
      verify: hasRecipientMessage
        ? 'Сверить фактическую приёмку с получателем.'
        : 'Связаться с курьером и уточнить актуальное время прибытия.',
      action: hasRecipientMessage
        ? 'Если карты приняты, обновить CRM. Иначе уточнить время у курьера и сообщить его точке.'
        : 'Сообщить точке о задержке и согласовать, кто подтвердит приёмку.',
    }
  }
  if (lateEstimate || pastEstimate || estimate.kind === 'unclear') return {
    priority: 'today',
    deadline,
    reason: lateEstimate
      ? 'По сообщению курьера доставка ожидается позже срока в CRM.'
      : 'Нужно сверить актуальное время доставки с курьером.',
    crm: facts,
    chatNote,
    verify: 'Уточнить дату и время прибытия у курьера.',
    action: 'При переносе согласовать новое время с точкой и обновить CRM.',
  }

  return {
    priority: 'upcoming',
    deadline,
    reason: 'Доставка открыта, срок ещё не наступил.',
    crm: facts,
    chatNote,
    verify: 'Проверить статус к сроку доставки.',
    action: 'Дождаться подтверждения приёмки в CRM.',
  }
}

export function compileDigest({ asOf, cases }: DigestRequest): Digest {
  const day = toMoscowInput(asOf).slice(0, 10)
  const decisions = cases.map((item) => {
    const chat = item.chat.filter(({ at }) => Date.parse(at) <= Date.parse(asOf))
    const decision = item.kind === 'onboarding' ? onboarding(item.crm, day)
      : item.kind === 'offboarding' ? offboarding(item.crm, day)
        : delivery({ ...item, chat }, asOf)
    const hasConflict = chat.some((message) => isOpenConflict(item, message))
    if (hasConflict) {
      decision.priority = decision.priority === 'urgent' ? 'urgent' : 'today'
      decision.reason = 'Переписка расходится с данными CRM.'
      decision.verify = 'Уточнить факты у ответственного и сверить карточку CRM.'
      decision.action = 'При необходимости обновить CRM и сохранить пояснение к расхождению.'
    }
    return { ...decision, id: item.id, key: item.key, kind: item.kind, chat, hasConflict }
  })

  decisions.sort((a, b) => {
    const priority = order[a.priority] - order[b.priority]
    if (priority !== 0) return priority
    if (a.deadline === b.deadline) return 0
    return (a.deadline ?? Infinity) - (b.deadline ?? Infinity)
  })
  const items = decisions.map(({ deadline, ...item }) => {
    void deadline
    return item
  })
  return { asOf, items }
}
