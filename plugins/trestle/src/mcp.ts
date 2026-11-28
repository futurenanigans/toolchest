import * as readline from 'node:readline'
import { handleToolCall, stopToolJobs, TOOLS } from './mcp_dispatch'

function send(msg: unknown): void {
  process.stdout.write(`${JSON.stringify(msg)}\n`)
}

let shuttingDown = false
async function shutdown(exitCode?: number): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  await stopToolJobs()
  if (exitCode !== undefined) process.exit(exitCode)
}

if (import.meta.main) {
  process.on('SIGINT', () => {
    void shutdown(0)
  })
  process.on('SIGTERM', () => {
    void shutdown(0)
  })

  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
  rl.on('close', () => {
    void shutdown(0)
  })
  rl.on('line', async line => {
    const trimmed = line.trim()
    if (!trimmed) return
    let req: { id?: unknown; method?: string; params?: Record<string, unknown> }
    try {
      req = JSON.parse(trimmed)
    } catch {
      return
    }

    if (!req || typeof req !== 'object') return
    const { id, method, params } = req
    if (id === undefined) return

    try {
      if (method === 'initialize') {
        send({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'trestle', version: '0.1.0' },
          },
        })
      } else if (method === 'ping') {
        send({ jsonrpc: '2.0', id, result: {} })
      } else if (method === 'tools/list') {
        send({ jsonrpc: '2.0', id, result: { tools: TOOLS } })
      } else if (method === 'tools/call') {
        const result = await handleToolCall(params?.name, params?.arguments)
        send({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          },
        })
      } else {
        send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } })
      }
    } catch (err) {
      send({
        jsonrpc: '2.0',
        id,
        result: {
          isError: true,
          content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }],
        },
      })
    }
  })
}
