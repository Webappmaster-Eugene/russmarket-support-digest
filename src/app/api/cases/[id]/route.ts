import { apiSession, checkOrigin } from '@/server/auth'
import { parse } from '@/server/errors'
import { operationInput, uuidInput } from '@/server/forms'
import { api, readJson } from '@/server/http'
import { changeCase, readCase } from '@/server/store'

type Context = { params: Promise<{ id: string }> }

export function GET(_request: Request, { params }: Context) {
  return api(async () => {
    const { workspace } = await apiSession()
    return { case: await readCase(workspace, parse(uuidInput, (await params).id)) }
  })
}

export function PATCH(request: Request, { params }: Context) {
  return api(async () => {
    const { workspace } = await apiSession()
    checkOrigin(request)
    const key = parse(uuidInput, (await params).id)
    return { case: await changeCase(workspace, key, parse(operationInput, await readJson(request))) }
  })
}
