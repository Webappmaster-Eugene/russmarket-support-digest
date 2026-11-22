import { compileDigest } from '@/digest/compile'
import { digestRequestSchema, MAX_BODY_BYTES, type DigestResponse } from '@/digest/contract'

function reply(body: DigestResponse, status: number) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

async function readBody(stream: ReadableStream<Uint8Array>): Promise<{ ok: true; text: string } | { ok: false }> {
  const reader = stream.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let size = 0
  let text = ''

  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) return { ok: true, text: text + decoder.decode() }

      size += chunk.value.byteLength
      if (size > MAX_BODY_BYTES) {
        void reader.cancel().catch(() => undefined)
        return { ok: false }
      }
      text += decoder.decode(chunk.value, { stream: true })
    }
  } finally {
    reader.releaseLock()
  }
}

export async function POST(request: Request) {
  const mediaType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (mediaType !== 'application/json') {
    return reply({ error: 'Отправьте данные в формате application/json.' }, 415)
  }
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) {
    return reply({ error: 'Размер запроса превышает 128 КиБ.' }, 413)
  }
  if (!request.body) return reply({ error: 'Передайте данные для сводки.' }, 400)

  let input: unknown
  try {
    const body = await readBody(request.body)
    if (!body.ok) return reply({ error: 'Размер запроса превышает 128 КиБ.' }, 413)
    input = JSON.parse(body.text)
  } catch {
    return reply({ error: 'Не удалось прочитать JSON. Проверьте формат запроса.' }, 400)
  }

  const result = digestRequestSchema.safeParse(input)
  if (!result.success) {
    return reply({
      error: 'Проверьте поля сводки.',
      issues: result.error.issues.map(({ path, message }) => ({ path: path.join('.'), message })),
    }, 422)
  }

  return reply({ digest: compileDigest(result.data) }, 200)
}
