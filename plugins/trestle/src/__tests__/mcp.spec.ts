import { expect, test } from 'bun:test'
import { spawn } from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { handleToolCall } from '../mcp_dispatch'
import { resolveAgentWorktree } from '../worktrees'

const MCP_ENTRY = path.join(import.meta.dir, '..', 'mcp.ts')

test('MCP server responds to initialize, ping, and tools/list and exits cleanly on stdin close', async () => {
  const child = spawn('bun', ['run', MCP_ENTRY], {
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  const responses: Array<Record<string, unknown>> = []
  let buf = ''
  const done = new Promise<number | null>(resolve => {
    child.stdout.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8')
      let idx: number
      while ((idx = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, idx).trim()
        buf = buf.slice(idx + 1)
        if (line) responses.push(JSON.parse(line) as Record<string, unknown>)
      }
      if (responses.length >= 3) {
        child.stdin.end()
      }
    })
    child.on('close', code => resolve(code))
  })

  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })}\n`)
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping', params: {} })}\n`)
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} })}\n`)

  const exitCode = await done
  expect(exitCode).toBe(0)
  expect(responses).toHaveLength(3)

  const initRes = responses.find(r => r.id === 1)?.result as { serverInfo?: { name?: string } } | undefined
  expect(initRes?.serverInfo?.name).toBe('trestle')

  const pingRes = responses.find(r => r.id === 2)?.result as Record<string, unknown> | undefined
  expect(pingRes).toEqual({})

  const listRes = responses.find(r => r.id === 3)?.result as { tools?: Array<{ name: string }> } | undefined
  const toolNames = (listRes?.tools ?? []).map(t => t.name)
  expect(toolNames).toContain('worktree_list')
  expect(toolNames).toContain('contract_list')
  expect(toolNames).toContain('contract_update_criterion')
  expect(toolNames).toContain('goal_start')
  expect(toolNames).toContain('goal_status')
  expect(toolNames).toContain('goal_cancel')
  expect(toolNames).toContain('queue_retry')
  expect(toolNames).toContain('queue_update')
  expect(toolNames).toContain('queue_clear')
  expect(toolNames).toContain('config_get')
  expect(toolNames).toContain('config_set')
})

test('tool calls validate nested arguments before dispatch', async () => {
  await expect(handleToolCall('agent_list', null)).rejects.toThrow('Invalid arguments')
  await expect(handleToolCall('agent_tail', {})).rejects.toThrow('id')
  await expect(handleToolCall('goal_status', { typo: 'job' })).rejects.toThrow('typo')
  await expect(handleToolCall('check_run', {
    worktreePath: '.', commands: [{ name: 'fixture', command: [1] }],
  })).rejects.toThrow('commands')
  await expect(handleToolCall('config_set', {
    scope: 'user', config: { agents: { codex: { defaultEffort: 'unknown' } } },
  })).rejects.toThrow('defaultEffort')
  expect(await handleToolCall('goal_status')).toEqual([])
})

test('agent_spawn only accepts directories physically inside the repository worktree root', async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'trestle-spawn-'))
  try {
    const managed = path.join(repo, '.trestle-wt')
    const valid = path.join(managed, 'fixture')
    const sibling = path.join(repo, '.trestle-wt-other')
    await fs.mkdir(valid, { recursive: true })
    await fs.mkdir(sibling)
    const alias = path.join(managed, 'alias')
    await fs.symlink(sibling, alias, 'junction')
    expect(await resolveAgentWorktree(repo, valid)).toBe(await fs.realpath(valid))
    for (const invalid of [managed, sibling, alias]) {
      await expect(handleToolCall('agent_spawn', {
        repoRoot: repo, id: 'fixture', cli: 'claude', stage: 'test', worktreeId: 'fixture',
        worktreePath: invalid, branch: 'fixture', prompt: 'fixture',
      })).rejects.toThrow('worktreePath must be inside')
    }
  } finally {
    await fs.rm(repo, { recursive: true, force: true })
  }
})
