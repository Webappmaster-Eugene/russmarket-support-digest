import { describe, expect, it } from 'vitest'
import { POST } from '@/app/api/digest/route'
import { GET } from '@/app/api/health/route'
import { MAX_BODY_BYTES } from '@/digest/contract'
import { example } from '@/digest/example'

function request(body: string, headers = { 'Content-Type': 'application/json' }) {
  return new Request('http://localhost/api/digest', { method: 'POST', headers, body })
}

describe('API сводки', () => {
  it('возвращает серверный результат с приоритетами и отключает кеширование', async () => {
    const response = await POST(request(JSON.stringify(example)))
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    const { digest } = await response.json()
    expect(digest.items).toHaveLength(4)
    expect(digest.items[0]).toMatchObject({ id: 'П-08', priority: 'urgent' })
  })

  it('указывает поле повторяющегося ID с учётом регистра и пробелов', async () => {
    const response = await POST(request(JSON.stringify({
      ...example,
      cases: [example.cases[0], { ...example.cases[1], id: ' с-17 ' }],
    })))
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ issues: [{ path: 'cases.1.id' }] })
  })

  it('требует срок открытой доставки и отклоняет приёмку из будущего', async () => {
    const response = await POST(request(JSON.stringify({ ...example, cases: [
      { ...example.cases[2], crm: { status: 'in_transit' } },
      { ...example.cases[3], crm: { status: 'accepted', acceptedAt: '2026-11-23T10:01:00+03:00' } },
    ] })))
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ issues: [
      { path: 'cases.0.crm.dueAt' }, { path: 'cases.1.crm.acceptedAt' },
    ] })
  })

  it('отклоняет даты без часового пояса', async () => {
    const response = await POST(request(JSON.stringify({ ...example, asOf: '2026-11-23T10:00:00' })))
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ issues: [{ path: 'asOf' }] })
  })

  it('различает неверный JSON, неизвестное содержимое и слишком большое тело без Content-Length', async () => {
    expect((await POST(request('{broken'))).status).toBe(400)
    expect((await POST(request('{}', { 'Content-Type': 'text/plain' }))).status).toBe(415)
    expect((await POST(request('а'.repeat(MAX_BODY_BYTES / 2 + 1)))).status).toBe(413)
  })

  it('проверяет готовность приложения через health endpoint', async () => {
    const response = GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  })
})
