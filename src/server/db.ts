import pg from 'pg'

let activePool: pg.Pool | undefined

export function database() {
  if (!activePool) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) throw new Error('DATABASE_URL is required')
    activePool = new pg.Pool({ connectionString, max: 8, connectionTimeoutMillis: 4000, statement_timeout: 8000 })
    activePool.on('error', () => { console.error('Idle database connection failed') })
  }
  return activePool
}

export async function transaction<T>(work: (client: pg.PoolClient) => Promise<T>, consistent = false) {
  const client = await database().connect()
  try {
    await client.query(consistent ? 'BEGIN ISOLATION LEVEL REPEATABLE READ' : 'BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}
