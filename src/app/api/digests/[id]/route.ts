import { apiSession } from '@/server/auth'
import { parse } from '@/server/errors'
import { uuidInput } from '@/server/forms'
import { api } from '@/server/http'
import { readSnapshot } from '@/server/store'

export function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { workspace } = await apiSession()
    return { digest: await readSnapshot(workspace, parse(uuidInput, (await params).id)) }
  })
}
