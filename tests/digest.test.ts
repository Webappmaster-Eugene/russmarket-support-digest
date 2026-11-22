import { describe, expect, it } from 'vitest'
import { compileDigest } from '@/digest/compile'
import { digestRequestSchema } from '@/digest/contract'
import { example } from '@/digest/example'

describe('ежедневная сводка', () => {
  it('разбирает все четыре случая и ставит первым П-08', () => {
    const { items } = compileDigest(digestRequestSchema.parse(example))
    expect(items.map(({ id, priority }) => [id, priority])).toEqual([
      ['П-08', 'urgent'], ['С-24', 'today'], ['С-17', 'upcoming'], ['П-09', 'none'],
    ])
    expect(items[0]?.chatNote).toContain('не раньше 13:00')
    expect(items[0]?.crm.join(' ')).not.toContain('13:00')
    expect(items[1]?.verify).toContain('явное подтверждение')
    expect(items[2]?.crm).toContain('Документы ожидаются.')
    expect(items[3]?.crm.join(' ')).toContain('09:20 МСК')
  })

  it('до срока эскалирует прогноз опоздания как проверку, в срок как срочный случай', () => {
    const delivery = example.cases[2]
    const before = compileDigest({ cases: [delivery], asOf: '2026-11-23T06:59:59Z' })
    const atDeadline = compileDigest({ cases: [delivery], asOf: '2026-11-23T07:00:00Z' })
    expect(before.items[0]?.priority).toBe('today')
    expect(atDeadline.items[0]?.priority).toBe('urgent')
  })

  it('запрашивает уточнение при нескольких вариантах времени', () => {
    const delivery = { ...example.cases[2], chat: [
      { role: 'courier' as const, text: 'Приеду к 13:00 или к 15:00.' },
    ] }
    const { items } = compileDigest({ ...example, cases: [delivery] })
    expect(items[0]?.chatNote).toContain('нельзя однозначно определить')
    expect(items[0]?.verify).toContain('уточнить')
  })

  it('применяет московский календарный день к кадровым случаям', () => {
    const { items } = compileDigest({ ...example, asOf: '2026-11-23T21:00:00Z' })
    expect(items.find(({ id }) => id === 'С-24')?.priority).toBe('urgent')
    expect(items.find(({ id }) => id === 'С-17')?.priority).toBe('today')
  })

  it('оставляет открытую доставку открытой при сообщении о получении карт', () => {
    const { items } = compileDigest({ ...example, cases: [
      { ...example.cases[2], chat: example.cases[3].chat },
    ] })
    expect(items[0]?.priority).toBe('urgent')
    expect(items[0]?.chat[0]?.role).toBe('recipient')
  })

  it('не требует действий по подтверждённым кадровым случаям', () => {
    const { items } = compileDigest({ ...example, cases: [
      { ...example.cases[0], crm: { ...example.cases[0].crm, documents: 'confirmed' } },
      { ...example.cases[1], crm: { ...example.cases[1].crm, managerConfirmed: true } },
    ] })
    expect(items.map(({ priority }) => priority)).toEqual(['none', 'none'])
  })
})
