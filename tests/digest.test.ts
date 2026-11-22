import { describe, expect, it } from 'vitest'
import type { ChatMessage, SupportCase } from '@/digest/contract'
import { compileDigest } from '@/digest/compile'
import { example } from '@/digest/example'

const delivery = example.cases[2]
const accepted = example.cases[3]
const asOf = example.asOf
const first = (time: string, cases: SupportCase[] = [delivery]) => compileDigest({ asOf: time, cases }).items[0]

describe('очередь поддержки', () => {
  it('сохраняет приоритеты четырёх случаев и источники', () => {
    const { items } = compileDigest(example)
    expect(items.map(({ id, priority }) => [id, priority])).toEqual([
      ['П-08', 'urgent'], ['С-24', 'today'], ['С-17', 'upcoming'], ['П-09', 'none'],
    ])
    expect(items[0]?.chatNote).toContain('не раньше 13:00')
    expect(items[0]?.crm.join(' ')).not.toContain('13:00')
    expect(items[1]?.verify).toContain('явное подтверждение')
    expect(items[2]?.crm).toContain('Документы ожидаются.')
    expect(items[3]?.crm.join(' ')).toContain('09:20 МСК')
  })

  it.each([
    ['2026-11-23T06:59:59Z', 'today'],
    ['2026-11-23T07:00:00Z', 'urgent'],
    ['2026-11-23T07:00:01Z', 'urgent'],
  ])('считает срочность на границе срока %s', (time, priority) => {
    expect(first(time)?.priority).toBe(priority)
  })

  it('учитывает московскую полночь и подтверждения кадровых случаев', () => {
    const { items } = compileDigest({ ...example, asOf: '2026-11-23T21:00:00Z' })
    expect(items.find(({ id }) => id === 'С-24')?.priority).toBe('urgent')
    expect(items.find(({ id }) => id === 'С-17')?.priority).toBe('today')
    expect(compileDigest({ asOf, cases: [
      { ...example.cases[0], crm: { ...example.cases[0].crm, documents: 'confirmed' } },
      { ...example.cases[1], crm: { ...example.cases[1].crm, managerConfirmed: true } },
    ] }).items.map(({ priority }) => priority)).toEqual(['none', 'none'])
  })

  it('привязывает оценку к дате сообщения и уточняет неоднозначное время', () => {
    const previous: ChatMessage = { role: 'courier', conflict: false, at: '2026-11-22T09:00:00+03:00', text: 'Приеду к 12:00.' }
    const next = { ...delivery, crm: { ...delivery.crm, dueAt: '2026-11-23T11:00:00+03:00' }, chat: [previous] }
    expect(first(asOf, [next])?.reason).toContain('сверить актуальное')
    expect(first(asOf, [{ ...next, chat: [{ ...previous, text: 'К 12:00 или к 14:00.' }] }])?.chatNote)
      .toContain('нельзя однозначно определить')
  })

  it('выводит расхождение после приёмки, сохраняет CRM и учитывает пояснение', () => {
    const message: ChatMessage = { role: 'recipient', conflict: false, at: '2026-11-23T09:30:00+03:00', text: 'Карты ещё не получили.' }
    const { items: [open] } = compileDigest({ asOf, cases: [{ ...accepted, chat: [message] }] })
    const { items: [resolved] } = compileDigest({ asOf, cases: [{ ...accepted, chat: [{ ...message, resolution: 'Получатель сверил поставку' }] }] })
    expect(open).toMatchObject({ priority: 'today', hasConflict: true, crm: expect.arrayContaining(['Статус «Принято».']) })
    expect(resolved).toMatchObject({ priority: 'none', hasConflict: false })
  })

  it('разбирает отмеченный оператором конфликт и игнорирует сообщения после среза', () => {
    const original = example.cases[0]
    const message: ChatMessage = { role: 'employee', text: 'Проверить документы', conflict: true, at: '2026-11-23T09:30:00+03:00' }
    const { items: [open] } = compileDigest({ asOf, cases: [{ ...original, chat: [
      message,
      { ...message, at: '2026-11-23T10:01:00+03:00' },
    ] }] })
    expect(open?.chat).toHaveLength(1)
    expect(open).toMatchObject({ priority: 'today', hasConflict: true })
  })
})
