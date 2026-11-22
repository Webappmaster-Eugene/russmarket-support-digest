import { caseInput } from '@/digest/contract'
import { apiSession, checkOrigin } from '@/server/auth'
import { parse } from '@/server/errors'
import { api, readJson } from '@/server/http'
import { createCase, listCases } from '@/server/store'

export function GET(request: Request) {
  return api(async () => {
    const { workspace } = await apiSession()
    return { cases: await listCases(workspace, new URL(request.url).searchParams.get('archived') === '1') }
  })
}

export function POST(request: Request) {
  return api(async () => {
    const { workspace } = await apiSession()
    checkOrigin(request)
    return { id: await createCase(workspace, parse(caseInput, await readJson(request))) }
  }, 201)
}
