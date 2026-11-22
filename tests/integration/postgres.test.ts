import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { database, transaction } from '@/server/db'
import { createCase, changeCase, currentDigest, listCases, listSnapshots, readCase, readSnapshot, saveSnapshot } from '@/server/store'
import type { CaseInput } from '@/digest/contract'

if (!process.env.SUPPORT_INTEGRATION_URL) throw new Error('SUPPORT_INTEGRATION_URL must point to a disposable test database')
process.env.DATABASE_URL = process.env.SUPPORT_INTEGRATION_URL

const suffix = () => randomUUID().slice(0, 8)
function input(id = `Т-${suffix()}`): CaseInput {
  return { id, kind: 'onboarding', crm: { startDate: '2026-12-01', documents: 'confirmed' } }
}

afterAll(async () => { await database().end() })

describe('PostgreSQL', () => {
  it('разделяет данные и сохраняет учебный снимок', async () => {
    const ref = input()
    const key = await createCase('support', ref)
    expect((await readCase('support', key)).id).toBe(ref.id)
    await expect(readCase('review', key)).rejects.toMatchObject({ status: 404 })
    expect((await listCases('review')).map(({ id }) => id)).toEqual(expect.arrayContaining(['С-17', 'С-24', 'П-08', 'П-09']))
    expect((await readSnapshot('review', '00000000-0000-4000-8000-000000000001')).items.map(({ id }) => id))
      .toEqual(['П-08', 'С-24', 'С-17', 'П-09'])
    await expect(readSnapshot('support', '00000000-0000-4000-8000-000000000001')).rejects.toMatchObject({ status: 404 })
  })

  it('отклоняет дубликат и защищает от параллельной перезаписи', async () => {
    const value = input()
    const key = await createCase('support', value)
    await expect(createCase('support', { ...value, id: value.id.toLowerCase() })).rejects.toMatchObject({ code: '23505' })
    const edit = (value: CaseInput) => changeCase('support', key, { action: 'edit', version: 1, value })
    const results = await Promise.allSettled([edit(input()), edit(input())])
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1)
    expect(results).toEqual(expect.arrayContaining([expect.objectContaining({ status: 'rejected', reason: expect.objectContaining({ status: 409 }) })]))
    expect((await readCase('support', key)).version).toBe(2)
  })

  it('блокирует архив до разбора расхождения, сохраняет пояснение и восстанавливает', async () => {
    const key = await createCase('support', input())
    const value = { role: 'employee' as const, text: 'Проверьте документы', at: new Date(Date.now() - 1000).toISOString(), conflict: true }
    const record = await changeCase('support', key, { action: 'message', version: 1, value })
    await expect(changeCase('support', key, { action: 'archive', version: 2 })).rejects.toMatchObject({ status: 409 })
    const messageId = record.chat[0]?.key
    expect(messageId).toBeTruthy()
    if (!messageId) throw new Error('Missing message ID')
    await changeCase('support', key, { action: 'resolve', version: 2, messageId, resolution: 'Сверено с CRM' })
    expect((await changeCase('support', key, { action: 'archive', version: 3 })).archivedAt).toBeTruthy()
    expect((await currentDigest('support')).items.some((item) => item.key === key)).toBe(false)
    expect((await changeCase('support', key, { action: 'restore', version: 4 })).archivedAt).toBeNull()
  })

  it('откатывает составную запись и сохраняет неизменный снимок', async () => {
    await expect(transaction(async (db) => {
      await db.query("INSERT INTO login_limits(bucket,attempts,expires_at) VALUES ('rollback-check',1,now())")
      throw new Error('rollback')
    })).rejects.toThrow('rollback')
    expect((await database().query("SELECT 1 FROM login_limits WHERE bucket='rollback-check'")).rowCount).toBe(0)
    const value = input()
    const key = await createCase('support', value)
    const snapshot = randomUUID()
    await expect(Promise.all([saveSnapshot('support', snapshot), saveSnapshot('support', snapshot)]))
      .resolves.toEqual([snapshot, snapshot])
    const before = await readSnapshot('support', snapshot)
    await changeCase('support', key, { action: 'edit', version: 1, value: input() })
    await expect(saveSnapshot('support', snapshot)).resolves.toBe(snapshot)
    expect(await readSnapshot('support', snapshot)).toEqual(before)
    expect((await listSnapshots('support')).some(({ id }) => id === snapshot)).toBe(true)
  })
})
