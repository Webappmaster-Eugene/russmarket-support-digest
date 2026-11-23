import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { fileURLToPath } from 'node:url'
import { exampleRequest } from '@/mcp/example'

const client = new Client({ name: 'support-digest-demo', version: '1.0.0' })
try {
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('./support-mcp.mjs', import.meta.url))],
  }))
  const result = await client.callTool({ name: 'compile_support_digest', arguments: exampleRequest })
  if (result.isError) throw new Error('MCP не смог обработать исходный пример.')
  const digest = result.content.find((item) => item.type === 'text')
  if (!digest) throw new Error('MCP не вернул текст сводки.')
  process.stdout.write(digest.text + '\n')
} finally {
  await client.close()
}
