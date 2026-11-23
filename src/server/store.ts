import type { PoolClient } from 'pg'
import { caseInput, type CaseInput, type ChatMessage, type Digest, type SupportCase } from '@/digest/contract'
import { compileDigest, isOpenConflict } from '@/digest/compile'
import { normalizeReference, validateCaseAt } from '@/digest/validation'
import { database, transaction } from '@/server/db'
import { DeskError } from '@/server/errors'
import type { Workspace } from '@/server/auth'

type CaseRow = {
  id: string
  reference: string
  kind: string
  crm: unknown
  version: number
  archived_at: Date | null
  updated_at: Date
}
type MessageRow = {
  id: string
  case_id: string
  role: ChatMessage['role']
  body: string
  sent_at: Date
  conflict: boolean
  resolution: string | null
}
type Db = Pick<PoolClient, 'query'>
export type CaseRecord = SupportCase & { key: string; version: number; archivedAt: string | null; updatedAt: string }
export type SnapshotEntry = { id: string; asOf: string; createdAt: string; count: number }
type SnapshotRow = { id: string; as_of: Date; created_at: Date; digest: Digest }

function caseRecord(row: CaseRow, chat: ChatMessage[]): CaseRecord {
  return {
    ...caseInput.parse({ id: row.reference, kind: row.kind, crm: row.crm }),
    key: row.id, version: row.version, archivedAt: row.archived_at?.toISOString() ?? null,
    updatedAt: row.updated_at.toISOString(), chat,
  }
}

function messageRecord(row: MessageRow): ChatMessage {
  return {
    key: row.id, role: row.role, text: row.body, at: row.sent_at.toISOString(),
    conflict: row.conflict, resolution: row.resolution ?? undefined,
  }
}

async function lookup(db: Db, workspace: Workspace, key: string, lock = false) {
  const { rows: [row] } = await db.query<CaseRow>(`
    SELECT * FROM cases WHERE workspace_id = $1 AND id = $2 ${lock ? 'FOR UPDATE' : ''}
  `, [workspace, key])
  if (!row) throw new DeskError(404, 'Случай не найден.')
  const chat = await db.query<MessageRow>(`
    SELECT * FROM messages WHERE workspace_id = $1 AND case_id = $2 ORDER BY sent_at, id
  `, [workspace, key])
  return caseRecord(row, chat.rows.map(messageRecord))
}

export function readCase(workspace: Workspace, key: string) {
  return transaction((db) => lookup(db, workspace, key), true)
}

async function readCases(db: Db, workspace: Workspace, archived = false) {
  const { rows } = await db.query<CaseRow>(`
    SELECT * FROM cases WHERE workspace_id = $1 AND (archived_at IS NOT NULL) = $2
    ORDER BY created_at, id
  `, [workspace, archived])
  const grouped = new Map<string, ChatMessage[]>()
  if (rows.length > 0) {
    const messages = await db.query<MessageRow>(`
      SELECT * FROM messages WHERE workspace_id = $1 AND case_id = ANY($2::uuid[]) ORDER BY sent_at, id
    `, [workspace, rows.map(({ id }) => id)])
    for (const message of messages.rows) {
      const record = messageRecord(message)
      const list = grouped.get(message.case_id)
      if (list) list.push(record)
      else grouped.set(message.case_id, [record])
    }
  }
  return rows.map((row) => caseRecord(row, grouped.get(row.id) ?? []))
}

export function listCases(workspace: Workspace, archived = false) {
  return transaction((db) => readCases(db, workspace, archived), true)
}

export function checkCase(input: CaseInput, now: string) {
  const violation = validateCaseAt(input, now)
  if (violation) throw new DeskError(422, violation.title, [violation.field])
}

export async function createCase(workspace: Workspace, value: CaseInput) {
  checkCase(value, new Date().toISOString())
  const { rows: [row] } = await database().query<{ id: string }>(`
    INSERT INTO cases(workspace_id, reference, normalized_reference, kind, crm)
    VALUES ($1, $2, $3, $4, $5) RETURNING id
  `, [workspace, value.id, normalizeReference(value.id), value.kind, value.crm])
  if (!row) throw new Error('Case was not created')
  return row.id
}

export type Operation =
  | { action: 'edit'; version: number; value: CaseInput }
  | { action: 'message'; version: number; value: Omit<ChatMessage, 'resolution' | 'key'> }
  | { action: 'resolve'; version: number; messageId: string; resolution: string }
  | { action: 'archive' | 'restore'; version: number }

export function changeCase(workspace: Workspace, key: string, operation: Operation) {
  return transaction(async (db) => {
    const item = await lookup(db, workspace, key, true)
    const now = new Date().toISOString()
    if (item.version !== operation.version) throw new DeskError(409, 'Случай уже изменился. Откройте актуальную карточку перед сохранением.')
    if (item.archivedAt && operation.action !== 'restore') throw new DeskError(409, 'Сначала восстановите случай.')
    if (operation.action === 'edit') {
      if (item.kind !== operation.value.kind) throw new DeskError(422, 'Тип сохранённого случая изменить нельзя.')
      checkCase(operation.value, now)
      await db.query(`
        UPDATE cases SET reference = $3, normalized_reference = $4, crm = $5
        WHERE workspace_id = $1 AND id = $2
      `, [workspace, key, operation.value.id, normalizeReference(operation.value.id), operation.value.crm])
    } else if (operation.action === 'message') {
      const { role, text, at, conflict } = operation.value
      if (Date.parse(at) > Date.parse(now)) throw new DeskError(422, 'Проверьте время сообщения.', [
        { path: 'at', message: 'Время сообщения должно быть не позже текущего.' },
      ])
      await db.query(`
        INSERT INTO messages(workspace_id, case_id, role, body, sent_at, conflict)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [workspace, key, role, text, at, conflict])
    } else if (operation.action === 'resolve') {
      const message = item.chat.find(({ key }) => key === operation.messageId)
      if (!message || !isOpenConflict(item, message)) throw new DeskError(409, 'Расхождение уже закрыто или отсутствует.')
      await db.query(`
        UPDATE messages SET resolution = $4, resolved_at = now()
        WHERE workspace_id = $1 AND case_id = $2 AND id = $3
      `, [workspace, key, operation.messageId, operation.resolution])
    } else {
      if (operation.action === 'archive' && compileDigest({ asOf: now, cases: [item] }).items[0]?.priority !== 'none') {
        throw new DeskError(409, 'Сначала завершите операцию и разберите расхождения.')
      }
      if (operation.action === 'restore' && !item.archivedAt) throw new DeskError(409, 'Случай уже находится в работе.')
      await db.query('UPDATE cases SET archived_at = $3 WHERE workspace_id = $1 AND id = $2',
        [workspace, key, operation.action === 'archive' ? now : null])
    }
    await db.query('UPDATE cases SET version = version + 1, updated_at = now() WHERE workspace_id = $1 AND id = $2', [workspace, key])
    return lookup(db, workspace, key)
  })
}

export function currentDigest(workspace: Workspace) {
  return transaction(async (db) => compileDigest({ asOf: new Date().toISOString(), cases: await readCases(db, workspace) }), true)
}

export async function saveSnapshot(workspace: Workspace, key: string) {
  const save = () => transaction(async (db) => {
    const exists = await db.query('SELECT id FROM snapshots WHERE workspace_id = $1 AND id = $2', [workspace, key])
    if (exists.rowCount) return key
    const asOf = new Date().toISOString()
    const digest = compileDigest({ asOf, cases: await readCases(db, workspace) })
    if (!digest.items.length) throw new DeskError(422, 'Добавьте случай перед сохранением сводки.')
    await db.query('INSERT INTO snapshots(id, workspace_id, as_of, digest) VALUES ($1, $2, $3, $4)',
      [key, workspace, asOf, digest])
    return key
  }, true)
  try {
    return await save()
  } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) ||
      (error.code !== '23505' && error.code !== '40001')) throw error
    const existing = await database().query('SELECT id FROM snapshots WHERE workspace_id = $1 AND id = $2',
      [workspace, key])
    if (existing.rowCount) return key
    throw error
  }
}

export async function listSnapshots(workspace: Workspace, offset = 0): Promise<SnapshotEntry[]> {
  const result = await database().query<{ id: string; as_of: Date; created_at: Date; count: number }>(`
    SELECT id, as_of, created_at, jsonb_array_length(digest->'items') AS count
    FROM snapshots WHERE workspace_id = $1 ORDER BY created_at DESC, id LIMIT 26 OFFSET $2
  `, [workspace, offset])
  return result.rows.map((row) => ({ id: row.id, asOf: row.as_of.toISOString(), createdAt: row.created_at.toISOString(), count: row.count }))
}

export async function readSnapshot(workspace: Workspace, key: string) {
  const { rows: [row] } = await database().query<SnapshotRow>(
    'SELECT * FROM snapshots WHERE workspace_id = $1 AND id = $2', [workspace, key],
  )
  if (!row) throw new DeskError(404, 'Сводка не найдена.')
  return row.digest
}
