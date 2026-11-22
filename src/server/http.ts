import { DeskError, errorDetails } from '@/server/errors'

export async function readJson(request: Request): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    throw new DeskError(415, 'Ожидается JSON.')
  }
  const limit = 16384
  if (Number(request.headers.get('content-length')) > limit) throw new DeskError(413, 'Запрос больше 16 КиБ.')
  const reader = request.body?.getReader()
  if (!reader) throw new DeskError(400, 'Передайте данные для сохранения.')
  let bytes = 0
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let body = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) return JSON.parse(body + decoder.decode())
      bytes += value.byteLength
      if (bytes > limit) {
        void reader.cancel().catch(() => undefined)
        throw new DeskError(413, 'Запрос больше 16 КиБ.')
      }
      body += decoder.decode(value, { stream: true })
    }
  } catch (error) {
    if (error instanceof DeskError) throw error
    throw new DeskError(400, 'Не удалось прочитать JSON.')
  } finally {
    reader.releaseLock()
  }
}

export async function api(work: () => Promise<unknown>, status = 200) {
  const headers = { 'Cache-Control': 'private, no-store' }
  try {
    return Response.json(await work(), { headers, status })
  } catch (cause) {
    const { status, ...failure } = errorDetails(cause)
    return Response.json(failure, { headers, status })
  }
}
