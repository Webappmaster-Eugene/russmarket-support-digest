import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { compileDigest } from '@/digest/compile'
import { example } from '@/digest/example'
import { normalizeReference } from '@/digest/validation'
import { database, transaction } from '@/server/db'
import { hashPassword, validPasswordHash } from '@/server/password'
import type { SupportCase } from '@/digest/contract'

async function setup() {
  const dir = join(process.cwd(), 'migrations')
  await transaction(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(725172030)')
    await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
    const applied = await db.query<{ name: string }>('SELECT name FROM schema_migrations')
    const names = new Set(applied.rows.map(({ name }) => name))
    const files = (await readdir(dir)).filter((name) => /^\d+_.+\.sql$/u.test(name)).sort()
    if (!files.length) throw new Error('Missing SQL migrations')
    for (const file of files) {
      if (names.has(file)) continue
      await db.query(await readFile(join(dir, file), 'utf8'))
      await db.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file])
    }

    const accounts = [
      { login: 'reviewer', workspace: 'review', hash: process.env.REVIEWER_PASSWORD_HASH },
      { login: 'support', workspace: 'support', hash: process.env.SUPPORT_PASSWORD_HASH },
    ]
    for (const { login, workspace, hash } of accounts) {
      const existing = await db.query('SELECT login FROM accounts WHERE login = $1', [login])
      if (!hash && existing.rowCount) continue
      if (!hash || !validPasswordHash(hash)) throw new Error(`Supply a valid password hash for ${login}`)
      const changed = await db.query(`
        INSERT INTO accounts(login, workspace_id, password_hash) VALUES ($1, $2, $3)
        ON CONFLICT (login) DO UPDATE SET password_hash = EXCLUDED.password_hash
        WHERE accounts.password_hash <> EXCLUDED.password_hash
      `, [login, workspace, hash])
      if (changed.rowCount) await db.query('DELETE FROM sessions WHERE login = $1', [login])
    }

    const snapshotKey = '00000000-0000-4000-8000-000000000001'
    const seeded = await db.query("SELECT 1 FROM snapshots WHERE workspace_id = 'review' AND id = $1", [snapshotKey])
    if (seeded.rowCount) return
    const cases: SupportCase[] = []
    for (const item of example.cases) {
      const result = await db.query<{ id: string }>(`
        INSERT INTO cases(workspace_id, reference, normalized_reference, kind, crm)
        VALUES ('review', $1, $2, $3, $4) RETURNING id
      `, [item.id, normalizeReference(item.id), item.kind, item.crm])
      const key = result.rows[0]?.id
      if (!key) throw new Error('Could not create example case')
      for (const message of item.chat) {
        await db.query(`
          INSERT INTO messages(workspace_id, case_id, role, body, sent_at)
          VALUES ('review', $1, $2, $3, $4)
        `, [key, message.role, message.text, message.at])
      }
      cases.push({ ...item, key })
    }
    await db.query("INSERT INTO snapshots(id, workspace_id, as_of, digest) VALUES ($1, 'review', $2, $3)",
      [snapshotKey, example.asOf, compileDigest({ asOf: example.asOf, cases })])
  })
}

async function main() {
  if (process.argv.includes('--hash-password')) {
    const chunks: Buffer[] = []
    let bytes = 0
    for await (const chunk of process.stdin) {
      const value = Buffer.from(chunk)
      bytes += value.length
      if (bytes > 260) throw new Error('Password is too long')
      chunks.push(value)
    }
    const password = Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/u, '')
    if (password.length < 16 || password.length > 128) throw new Error('Use a password between 16 and 128 characters')
    process.stdout.write(`${await hashPassword(password)}\n`)
    return
  }

  try {
    await setup()
    process.stdout.write('Support desk database is ready\n')
  } finally {
    await database().end()
  }
}

main().catch((error: unknown) => {
  const reason = error instanceof Error && /^(Supply a valid|Use a password|Password is too long|Missing SQL)/u.test(error.message)
    ? error.message : 'Support desk database setup failed'
  process.stderr.write(`${reason}\n`)
  process.exitCode = 1
})
