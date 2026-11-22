import { createHash, randomBytes } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { database } from '@/server/db'
import { DeskError } from '@/server/errors'
import { verifyPassword } from '@/server/password'

export type Workspace = 'review' | 'support'
type Session = { login: string; workspace: Workspace }
const sessionSeconds = 12 * 60 * 60
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const secure = () => process.env.APP_ORIGIN?.startsWith('https://') ?? process.env.NODE_ENV === 'production'
const cookieName = () => secure() ? '__Host-supportdesk' : 'supportdesk-local'

export async function getSession() {
  const value = (await cookies()).get(cookieName())?.value
  if (!value || !/^[a-f0-9]{64}$/u.test(value)) return null
  const result = await database().query<Session>(`
    SELECT a.login, a.workspace_id AS workspace
    FROM sessions s JOIN accounts a ON a.login = s.login
    WHERE s.token_hash = $1 AND s.expires_at > now()
  `, [digest(value)])
  return result.rows[0] ?? null
}

export async function pageSession() {
  const session = await getSession()
  if (!session) redirect('/login')
  return session
}

export async function apiSession() {
  const session = await getSession()
  if (!session) throw new DeskError(401, 'Войдите в приложение.')
  return session
}

export function checkOrigin(request: Request) {
  const origin = process.env.APP_ORIGIN || new URL(request.url).origin
  if (request.headers.get('origin') !== origin) throw new DeskError(403, 'Запрос отклонён.')
}

export async function signIn(login: string, password: string) {
  const requestHeaders = await headers()
  const addresses = requestHeaders.get('x-forwarded-for')?.split(',').map((value) => value.trim()) ?? []
  const client = addresses.at(-2) || addresses.at(-1) || 'local'
  const bucket = digest(`${client}|${login === 'reviewer' || login === 'support' ? login : '*'}`)
  const db = database()
  const limit = await db.query<{ attempts: number }>(`
    INSERT INTO login_limits (bucket, attempts, expires_at) VALUES ($1, 1, now() + interval '15 minutes')
    ON CONFLICT (bucket) DO UPDATE SET
      attempts = CASE WHEN login_limits.expires_at <= now() THEN 1 ELSE login_limits.attempts + 1 END,
      expires_at = CASE WHEN login_limits.expires_at <= now() THEN EXCLUDED.expires_at ELSE login_limits.expires_at END
    WHERE login_limits.expires_at <= now() OR login_limits.attempts < 6
    RETURNING attempts
  `, [bucket])
  if (!limit.rows[0] || limit.rows[0].attempts > 5) throw new DeskError(429, 'Слишком много попыток. Попробуйте через 15 минут.')

  const { rows: [account] } = await db.query<{ login: string; password_hash: string }>(
    'SELECT login, password_hash FROM accounts WHERE login = $1', [login],
  )
  if (!await verifyPassword(password, account?.password_hash) || !account) {
    throw new DeskError(401, 'Проверьте логин и пароль.')
  }
  const token = randomBytes(32).toString('hex')
  await db.query('DELETE FROM sessions WHERE expires_at <= now()')
  await db.query('DELETE FROM login_limits WHERE expires_at <= now() OR bucket = $1', [bucket])
  await db.query(`
    INSERT INTO sessions (token_hash, login, expires_at)
    VALUES ($1, $2, now() + $3 * interval '1 second')
  `, [digest(token), account.login, sessionSeconds])
  const jar = await cookies()
  const previous = jar.get(cookieName())?.value
  if (previous) await db.query('DELETE FROM sessions WHERE token_hash = $1', [digest(previous)])
  jar.set(cookieName(), token, { httpOnly: true, secure: secure(), sameSite: 'lax', path: '/', maxAge: sessionSeconds })
}

export async function signOut() {
  const jar = await cookies()
  const token = jar.get(cookieName())?.value
  if (token) await database().query('DELETE FROM sessions WHERE token_hash = $1', [digest(token)])
  jar.delete(cookieName())
}
