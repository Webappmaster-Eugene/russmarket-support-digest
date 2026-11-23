import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { build } from 'esbuild'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { digestSchema } from '@/digest/contract'
import { exampleRequest } from '@/mcp/example'

const toolName = 'compile_support_digest'
const resultSchema = z.object({ digest: digestSchema })
const client = new Client({ name: 'support-digest-test', version: '1.0.0' })
let directory: string | undefined

beforeAll(async () => {
  const buildDirectory = resolve('.build')
  await mkdir(buildDirectory, { recursive: true })
  directory = await mkdtemp(join(buildDirectory, 'mcp-test-'))
  const entry = join(directory, 'server.mjs')
  await build({
    entryPoints: ['src/mcp/stdio.ts'],
    bundle: true, platform: 'node', target: 'node22', format: 'esm',
    packages: 'external', outfile: entry,
  })
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry] }))
}, 20000)

afterAll(async () => {
  try {
    await client.close()
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true })
  }
})

function call(argumentsValue: Record<string, unknown>) {
  return client.callTool({ name: toolName, arguments: argumentsValue })
}

const newRecord = {
  id: 'П-101',
  kind: 'delivery',
  crm: { status: 'in_transit', dueAt: '2026-11-23T12:00:00+03:00' },
}

describe('MCP сводки через stdio', () => {
  it('объявляет один инструмент чтения и возвращает сводку по четырём исходным случаям', async () => {
    const { tools } = await client.listTools()
    expect(tools).toHaveLength(1)
    expect(tools[0]).toMatchObject({ name: toolName, annotations: { readOnlyHint: true, idempotentHint: true } })
    expect(tools[0]?.outputSchema).toBeDefined()

    const response = await call(exampleRequest)
    expect(response.isError).not.toBe(true)
    const { items } = resultSchema.parse(response.structuredContent).digest
    expect(items.map(({ id, priority }) => [id, priority])).toEqual([
      ['П-08', 'urgent'], ['С-24', 'today'], ['С-17', 'upcoming'], ['П-09', 'none'],
    ])
    expect(items[0]?.crm.join(' ')).not.toContain('13:00')
    expect(items[0]?.chatNote).toContain('не раньше 13:00')
    expect(response.content[0]).toMatchObject({ type: 'text', text: expect.stringContaining('CRM:') })
  })

  it('принимает новый случай, учитывает срок и оставляет поздние сообщения за пределами среза', async () => {
    const payload = {
      asOf: exampleRequest.asOf,
      cases: [{ record: newRecord, chat: [
        { role: 'courier', text: 'Приеду к 13:00.', at: '2026-11-23T09:50:00+03:00' },
        { role: 'courier', text: 'Приеду к 11:00.', at: '2026-11-23T10:01:00+03:00' },
      ] }],
    }
    const first = await call(payload)
    expect(first.isError).not.toBe(true)
    const { items } = resultSchema.parse(first.structuredContent).digest
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: 'П-101', priority: 'today', chatNote: expect.stringContaining('13:00') })
    expect(items[0]?.chat).toHaveLength(1)
    expect((await call(payload)).structuredContent).toEqual(first.structuredContent)
    const next = await call({ asOf: exampleRequest.asOf, cases: [{ record: newRecord }] })
    expect(resultSchema.parse(next.structuredContent).digest.items[0]).toMatchObject({ priority: 'upcoming', chat: [] })
  })

  it.each([
    { name: 'некорректную дату', asOf: '2026-11-23T10:00:00', cases: [{ record: newRecord }] },
    { name: 'дубликат ID', asOf: exampleRequest.asOf, cases: [{ record: newRecord }, { record: { ...newRecord, id: ' п-101 ' } }] },
    { name: 'открытую доставку без срока', asOf: exampleRequest.asOf, cases: [{ record: { ...newRecord, crm: { status: 'planned' } } }] },
    { name: 'приёмку позже сводки', asOf: exampleRequest.asOf, cases: [{ record: { ...newRecord, crm: { status: 'accepted', acceptedAt: '2026-11-23T10:01:00+03:00' } } }] },
  ])('отклоняет $name', async ({ asOf, cases }) => {
    const result = await call({ asOf, cases })
    expect(result.isError).toBe(true)
    expect(result.structuredContent).toBeUndefined()
  })
})
