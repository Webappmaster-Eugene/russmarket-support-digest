import { z } from 'zod'
import { apiSession, checkOrigin } from '@/server/auth'
import { parse } from '@/server/errors'
import { uuidInput } from '@/server/forms'
import { api, readJson } from '@/server/http'
import { listSnapshots, saveSnapshot } from '@/server/store'

export function GET(request: Request) {
  return api(async () => {
    const { workspace } = await apiSession()
    const page = parse(z.coerce.number().int().min(1).max(10000), new URL(request.url).searchParams.get('page') ?? 1)
    const records = await listSnapshots(workspace, (page - 1) * 25)
    return { snapshots: records.slice(0, 25), hasMore: records.length > 25 }
  })
}

export function POST(request: Request) {
  return api(async () => {
    const { workspace } = await apiSession()
    checkOrigin(request)
    const { id } = parse(z.strictObject({ id: uuidInput }), await readJson(request))
    return { id: await saveSnapshot(workspace, id) }
  }, 201)
}
