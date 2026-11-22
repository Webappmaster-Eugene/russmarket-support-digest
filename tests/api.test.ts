import { describe, expect, it } from 'vitest'
import { caseInput, messageInput } from '@/digest/contract'
import { readJson } from '@/server/http'
import { operationInput, readCaseFields } from '@/server/forms'
import { checkCase } from '@/server/store'

const now = '2026-11-23T10:00:00+03:00'
function request(body: string, contentType = 'application/json') {
  return new Request('http://localhost/api/cases', { method: 'POST', body, headers: { 'Content-Type': contentType } })
}

describe('граница ввода', () => {
  it('различает формат, повреждённый JSON и большой запрос', async () => {
    await expect(readJson(request('{}', 'text/plain'))).rejects.toMatchObject({ status: 415 })
    await expect(readJson(request('{'))).rejects.toMatchObject({ status: 400 })
    await expect(readJson(request('а'.repeat(9000)))).rejects.toMatchObject({ status: 413 })
    await expect(readJson(request(JSON.stringify({ message: 'а'.repeat(2000) })))).resolves.toHaveProperty('message')
  })

  it('запрещает клиенту выбирать пространство или добавлять неизвестные поля', () => {
    const value = { id: 'С-1', kind: 'onboarding', crm: { startDate: '2026-11-22', documents: 'awaiting' } }
    expect(caseInput.safeParse({ ...value, workspace: 'support' }).success).toBe(false)
    expect(caseInput.safeParse({ ...value, crm: { ...value.crm, foo: 'bar' } }).success).toBe(false)
    expect(operationInput.safeParse({ action: 'archive', version: 0 }).success).toBe(false)
  })

  it('требует срок открытой доставки и отклоняет приёмку из будущего', () => {
    expect(() => checkCase({ id: 'П-1', kind: 'delivery', crm: { status: 'planned' } }, now))
      .toThrow('Проверьте поля доставки')
    expect(() => checkCase({ id: 'П-1', kind: 'delivery', crm: { status: 'accepted', acceptedAt: '2026-11-23T10:01:00+03:00' } }, now))
      .toThrow('Проверьте время приёмки')
  })

  it('одинаково обрабатывает корректные даты из формы и JSON', () => {
    const value = readCaseFields({ id: 'П-1', kind: 'delivery', status: 'planned', dueAt: '2026-11-23T10:00' })
    expect(value.crm).toEqual({ status: 'planned', dueAt: '2026-11-23T07:00:00.000Z', acceptedAt: undefined })
    expect(messageInput.safeParse({ role: 'courier', text: 'Приеду', conflict: false, at: '2026-11-23T10:00' }).success).toBe(false)
  })
})
