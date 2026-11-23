import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { afterAll, describe, expect, it } from 'vitest'
import { database, transaction } from '@/server/db'
import { createCase, changeCase, currentDigest, listCases, listSnapshots, readCase, readSnapshot, saveSnapshot } from '@/server/store'
import type { CaseInput } from '@/digest/contract'

if (!process.env.SUPPORT_INTEGRATION_URL) throw new Error('SUPPORT_INTEGRATION_URL must point to a disposable test database')
process.env.DATABASE_URL = process.env.SUPPORT_INTEGRATION_URL

const suffix = () => randomUUID().slice(0, 8)
const migration = (filename: string) => readFile(new URL(`../../migrations/${filename}`, import.meta.url), 'utf8')
function input(id = `Т-${suffix()}`): CaseInput {
  return { id, kind: 'onboarding', crm: { startDate: '2026-12-01', documents: 'confirmed' } }
}

afterAll(async () => { await database().end() })

describe('PostgreSQL', () => {
  it('отдаёт общие случаи и учебный снимок для обоих логинов', async () => {
    const accounts = await database().query('SELECT login, workspace_id FROM accounts ORDER BY login')
    expect(accounts.rows).toEqual([
      { login: 'reviewer', workspace_id: 'support' },
      { login: 'support', workspace_id: 'support' },
    ])
    const ref = input()
    const key = await createCase('support', ref)
    expect((await readCase('support', key)).id).toBe(ref.id)
    expect((await listCases('support')).map(({ id }) => id)).toEqual(expect.arrayContaining([ref.id, 'С-17', 'С-24', 'П-08', 'П-09']))
    expect((await readSnapshot('support', '00000000-0000-4000-8000-000000000001')).items.map(({ id }) => id))
      .toEqual(['П-08', 'С-24', 'С-17', 'П-09'])
  })

  it('переносит старые данные, сохраняя UUID, версии, архив и сессии', async () => {
    const caseId = randomUUID()
    const messageId = randomUUID()
    const snapshotId = randomUUID()
    await transaction(async (db) => {
      await db.query('CREATE SCHEMA upgrade_desk; SET LOCAL search_path TO upgrade_desk')
      await db.query(await migration('001_workspace.sql'))
      await db.query(`
        INSERT INTO accounts VALUES ('reviewer', 'review', 'hash'), ('support', 'support', 'hash');
        INSERT INTO sessions VALUES ('prior-session', 'reviewer', now() + interval '1 hour');
        INSERT INTO cases (workspace_id, reference, normalized_reference, kind, crm)
          VALUES ('support', 'S-1', 's-1', 'onboarding', '{}');
      `)
      await db.query(`
        INSERT INTO cases (id, workspace_id, reference, normalized_reference, kind, crm, version, archived_at)
          VALUES ($1, 'review', 'R-1', 'r-1', 'delivery', '{}', 3, now())
      `, [caseId])
      await db.query(`
        INSERT INTO messages (id, workspace_id, case_id, role, body, sent_at, resolution, resolved_at)
          VALUES ($1, 'review', $2, 'recipient', 'Принято', now(), 'Сверено', now())
      `, [messageId, caseId])
      await db.query(`
        INSERT INTO snapshots (id, workspace_id, as_of, digest) VALUES ($1, 'review', now(), $2)
      `, [snapshotId, { items: [{ key: caseId }] }])

      await db.query(await migration('002_shared_workspace.sql'))

      expect((await db.query('SELECT id FROM workspaces')).rows).toEqual([{ id: 'support' }])
      const cases = await db.query('SELECT id, workspace_id, reference, version, archived_at IS NOT NULL AS archived FROM cases ORDER BY reference')
      expect(cases.rows).toEqual([
        { id: caseId, workspace_id: 'support', reference: 'R-1', version: 3, archived: true },
        expect.objectContaining({ workspace_id: 'support', reference: 'S-1', version: 1, archived: false }),
      ])
      expect((await db.query('SELECT id, workspace_id, case_id, body, resolution FROM messages')).rows)
        .toEqual([{ id: messageId, workspace_id: 'support', case_id: caseId, body: 'Принято', resolution: 'Сверено' }])
      expect((await db.query('SELECT id, workspace_id, digest FROM snapshots')).rows)
        .toEqual([{ id: snapshotId, workspace_id: 'support', digest: { items: [{ key: caseId }] } }])
      expect((await db.query(`
        SELECT token_hash, workspace_id FROM sessions JOIN accounts USING (login)
      `)).rows).toEqual([{ token_hash: 'prior-session', workspace_id: 'support' }])
      await db.query('DROP SCHEMA upgrade_desk CASCADE')
    })
  })

  it('сохраняет оба исходных случая при совпадении ID', async () => {
    await transaction(async (db) => {
      await db.query('CREATE SCHEMA upgrade_conflict; SET LOCAL search_path TO upgrade_conflict')
      await db.query(await migration('001_workspace.sql'))
      await db.query(`
        INSERT INTO cases (workspace_id, reference, normalized_reference, kind, crm)
        VALUES ('review', 'C-1', 'c-1', 'onboarding', '{}'), ('support', 'c-1', 'c-1', 'delivery', '{}')
      `)
      await db.query('SAVEPOINT before_upgrade')
      await expect(db.query(await migration('002_shared_workspace.sql'))).rejects.toThrow('duplicate case references')
      await db.query('ROLLBACK TO SAVEPOINT before_upgrade')
      expect((await db.query('SELECT workspace_id, reference FROM cases ORDER BY workspace_id')).rows).toEqual([
        { workspace_id: 'review', reference: 'C-1' }, { workspace_id: 'support', reference: 'c-1' },
      ])
      await db.query('DROP SCHEMA upgrade_conflict CASCADE')
    })
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
