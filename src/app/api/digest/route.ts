import { apiSession } from '@/server/auth'
import { api } from '@/server/http'
import { currentDigest } from '@/server/store'

export function GET() {
  return api(async () => {
    const { workspace } = await apiSession()
    return { digest: await currentDigest(workspace) }
  })
}
