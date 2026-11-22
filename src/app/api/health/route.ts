import { database } from '@/server/db'

export async function GET() {
  const headers = { 'Cache-Control': 'no-store' }
  try {
    const ready = await database().query("SELECT 1 FROM schema_migrations WHERE name = '001_workspace.sql'")
    if (!ready.rowCount) throw new Error('Missing migration')
    return Response.json({ status: 'ok' }, { headers })
  } catch {
    return Response.json({ status: 'unavailable' }, { headers, status: 503 })
  }
}
