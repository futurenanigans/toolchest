import { expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { createAgyAdapter } from '../adapters/agy'
import { createClaudeAdapter } from '../adapters/claude'
import { createCodexAdapter } from '../adapters/codex'
import { createOpencodeAdapter } from '../adapters/opencode'
import { createPiAdapter } from '../adapters/pi'
import type { AdapterEvent } from '../adapters/types'

const SAMPLES_DIR = path.join(import.meta.dir, 'fixtures')

test('claude adapter replays vendored sample jsonl', async () => {
  const raw = await fs.readFile(path.join(SAMPLES_DIR, 'claude.jsonl'), 'utf8')
  const adapter = createClaudeAdapter()
  const events: AdapterEvent[] = []
  for (const line of raw.split('\n')) {
    events.push(...adapter.parseLine(line))
  }

  expect(events.some(e => e.kind === 'session' && e.sessionId === '00000000-0000-4000-8000-000000000003')).toBe(true)
  expect(events.some(e => e.kind === 'activity' && e.text.includes('Bash: echo hi'))).toBe(true)
  expect(events.some(e => e.kind === 'turn_done' && e.finalText === 'done')).toBe(true)
  expect(events.some(e => e.kind === 'usage' && e.cumulative && (e.usage.costUsd ?? 0) > 0)).toBe(true)

  const steer = adapter.steer('change direction')
  expect(steer.kind).toBe('stdin')
  if (steer.kind === 'stdin') {
    expect(steer.data).toContain('"type":"user"')
    expect(steer.data).toContain('change direction')
  }
})

test('codex adapter replays vendored sample jsonl, supports turn/steer, and fails on RPC errors', async () => {
  const raw = await fs.readFile(path.join(SAMPLES_DIR, 'codex.jsonl'), 'utf8')
  const adapter = createCodexAdapter()
  const events: AdapterEvent[] = []
  for (const line of raw.split('\n')) {
    events.push(...adapter.parseLine(line))
  }

  expect(events.some(e => e.kind === 'session' && e.sessionId === '00000000-0000-4000-8000-000000000013')).toBe(true)
  expect(events.some(e => e.kind === 'activity' && e.text.includes('Bash:'))).toBe(true)
  expect(events.some(e => e.kind === 'turn_done')).toBe(true)
  expect(events.some(e => e.kind === 'usage' && e.cumulative && e.usage.inputTokens > 0)).toBe(true)

  const steer = adapter.steer('stop sleeping')
  expect(steer.kind).toBe('stdin')
  if (steer.kind === 'stdin') {
    expect(steer.data).toContain('"method":"turn/steer"')
    expect(steer.data).toContain('stop sleeping')
  }

  const errAdapter = createCodexAdapter()
  const errEvents = errAdapter.parseLine(
    JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'unauthorized api key', data: { codexErrorInfo: 'unauthorized' } } }),
  )
  expect(errEvents).toHaveLength(1)
  expect(errEvents[0]?.kind).toBe('turn_failed')
  if (errEvents[0]?.kind === 'turn_failed') {
    expect(errEvents[0].loginFailed).toBe(true)
  }
})

test('opencode adapter replays vendored sample jsonl and reports standalone steer as unsupported', async () => {
  const raw = await fs.readFile(path.join(SAMPLES_DIR, 'opencode.jsonl'), 'utf8')
  const adapter = createOpencodeAdapter()
  const events: AdapterEvent[] = []
  for (const line of raw.split('\n')) {
    events.push(...adapter.parseLine(line))
  }

  expect(events.some(e => e.kind === 'session' && e.sessionId === 'ses_00000000000000000000000004')).toBe(true)
  expect(events.some(e => e.kind === 'activity' && e.text.includes('shell: echo hi'))).toBe(true)
  expect(events.some(e => e.kind === 'message' && e.text === 'done')).toBe(true)
  expect(events.some(e => e.kind === 'usage' && e.usage.inputTokens > 0 && (e.usage.costUsd ?? 0) > 0)).toBe(true)

  expect(adapter.steer('update').kind).toBe('unsupported')

  const errEvents = adapter.parseLine(
    JSON.stringify({ type: 'error', error: { type: 'provider.transport', message: 'Transport: socket connection was closed' } }),
  )
  expect(errEvents).toHaveLength(1)
  expect(errEvents[0]?.kind).toBe('turn_failed')
  if (errEvents[0]?.kind === 'turn_failed') {
    expect(errEvents[0].transient).toBe(true)
    expect(errEvents[0].error).toContain('Transport:')
  }
})

test('agy adapter replays vendored sample jsonl, preserves HOME, and enforces read-only plan mode', async () => {
  const raw = await fs.readFile(path.join(SAMPLES_DIR, 'agy.jsonl'), 'utf8')
  const adapter = createAgyAdapter()
  const events: AdapterEvent[] = []
  for (const line of raw.split('\n')) {
    events.push(...adapter.parseLine(line))
  }

  expect(events.some(e => e.kind === 'session' && e.sessionId === '00000000-0000-4000-8000-000000000001')).toBe(true)
  expect(events.some(e => e.kind === 'activity' && e.text.includes('run_command: echo hi'))).toBe(true)
  expect(events.some(e => e.kind === 'turn_done' && e.finalText === 'done\n')).toBe(true)
  expect(events.some(e => e.kind === 'usage' && e.cumulative && e.usage.inputTokens === 25080)).toBe(true)

  const roSpec = await adapter.prepare({ runHome: '/tmp/agy-home', cwd: '/tmp', prompt: 'inspect', mode: 'read-only' })
  expect(roSpec.env.HOME).toBeUndefined()
  expect(roSpec.env.USERPROFILE).toBeUndefined()
  expect(roSpec.args).toContain('--mode')
  expect(roSpec.args).toContain('plan')
  expect(roSpec.args).toContain('--sandbox')
  expect(roSpec.args).not.toContain('--dangerously-skip-permissions')
})

test('pi adapter replays vendored sample jsonl', async () => {
  const raw = await fs.readFile(path.join(SAMPLES_DIR, 'pi.jsonl'), 'utf8')
  const adapter = createPiAdapter()
  const events: AdapterEvent[] = []
  for (const line of raw.split('\n')) {
    events.push(...adapter.parseLine(line))
  }

  expect(events.some(e => e.kind === 'session' && e.sessionId === '00000000-0000-4000-8000-000000000010')).toBe(true)
  expect(events.some(e => e.kind === 'usage' && e.usage.inputTokens > 0)).toBe(true)

  const errAdapter = createPiAdapter()
  const errEvs = errAdapter.parseLine(
    JSON.stringify({
      type: 'message_end',
      message: { role: 'assistant', content: [], stopReason: 'error', errorMessage: 'API usage limits reached' },
    }),
  )
  expect(errEvs[0]?.kind).toBe('turn_failed')
  if (errEvs[0]?.kind === 'turn_failed') {
    expect(errEvs[0].usageLimited).toBeFalsy()
  }
  expect(errAdapter.parseLine(JSON.stringify({ type: 'agent_end' }))).toEqual([])
})

test('one-shot adapters send quoted prompts intact over stdin', async () => {
  const prompt = 'Show the literal characters "& in the output.\n' + 'x'.repeat(9000)
  const runHome = await fs.mkdtemp(path.join(os.tmpdir(), 'trestle-prompt-'))
  try {
    for (const driver of [createOpencodeAdapter(), createPiAdapter()]) {
      const spec = await driver.prepare({ runHome, cwd: runHome, mode: 'read-only', prompt })
      expect(spec.initialStdin).toBe(prompt)
      expect(spec.args).not.toContain(prompt)
      expect(spec.closeStdinAfterInitial).toBe(true)
    }
  } finally {
    await fs.rm(runHome, { recursive: true, force: true })
  }
})

test('error prose is display-only and the Claude reset is carried in milliseconds', () => {
  const rpc = createCodexAdapter().parseLine(JSON.stringify({ id: 1, error: { message: 'author unavailable' } }))
  const standalone = createOpencodeAdapter().parseLine(JSON.stringify({ type: 'error', message: 'author unavailable' }))
  for (const [event] of [rpc, standalone]) {
    expect(event?.kind).toBe('turn_failed')
    if (event?.kind === 'turn_failed') expect(event.loginFailed).toBeFalsy()
  }
  const [rate] = createClaudeAdapter().parseLine(JSON.stringify({
    type: 'rate_limit_event', rate_limit_info: { status: 'rejected', resetsAt: 1800000000 },
  }))
  expect(rate?.kind === 'turn_failed' && rate.resetAt).toBe(1800000000000)
})
