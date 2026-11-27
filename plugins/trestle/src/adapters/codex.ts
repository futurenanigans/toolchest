import * as path from 'node:path'

import { linkOrCopy, userHome } from '../platform'
import type { AdapterDriver, AdapterEvent, LaunchOptions, LaunchSpec } from './types'

export function createCodexAdapter(): AdapterDriver {
  let threadId: string | undefined
  let activeTurnId: string | undefined
  let nextRpcId = 10
  let pendingPrompt = ''
  let sandboxMode: 'read-only' | 'danger-full-access' = 'danger-full-access'
  let model: string | undefined
  let cwd = ''
  let lastAgentText = ''

  let threadStartRpcId: number | undefined

  function rpc(method: string, params: unknown): { id: number; line: string } {
    const id = nextRpcId++
    return { id, line: `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n` }
  }

  return {
    cli: 'codex',

    async prepare(opts: LaunchOptions): Promise<LaunchSpec> {
      const codexHome = path.join(opts.runHome, '.codex')
      const userAuth = path.join(userHome(), '.codex', 'auth.json')
      await linkOrCopy(userAuth, path.join(codexHome, 'auth.json'), { optional: true })

      pendingPrompt = opts.prompt
      sandboxMode = opts.mode === 'read-only' ? 'read-only' : 'danger-full-access'
      model = opts.model
      cwd = opts.cwd
      threadId = opts.resumeSessionId

      const args = [
        'app-server',
        '--listen',
        'stdio://',
        '--enable',
        'web_search',
        '--disable',
        'plugins',
        '--disable',
        'remote_plugin',
        '--config',
        'tools.update_plan.enabled=true',
        '--config',
        'tools.experimental_request_user_input.enabled=false',
      ]
      if (opts.effort) {
        args.push('--config', `model_reasoning_effort=${opts.effort}`)
      }

      const initLine = `${JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { clientInfo: { name: 'trestle', version: '0.1.0' } },
      })}\n`

      return {
        cli: 'codex',
        command: opts.commandOverride ?? 'codex',
        args,
        cwd: opts.cwd,
        env: {
          CODEX_HOME: codexHome,
        },
        initialStdin: initLine,
      }
    },

    parseLine(line: string): AdapterEvent[] {
      const trimmed = line.trim()
      if (!trimmed.startsWith('{')) return []

      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(trimmed) as Record<string, unknown>
      } catch {
        return []
      }

      const events: AdapterEvent[] = []

      // Any JSON-RPC error response must fail the turn immediately rather than hanging
      if (msg.id !== undefined && msg.error) {
        const errObj = msg.error as { message?: string; code?: number; data?: { codexErrorInfo?: string } }
        const message = errObj?.message || `codex RPC error (${errObj?.code ?? 'unknown'})`
        const lower = message.toLowerCase()
        const info = errObj?.data?.codexErrorInfo ?? ''
        events.push({
          kind: 'turn_failed',
          error: message,
          usageLimited: info === 'usageLimitExceeded' || lower.includes('quota') || lower.includes('rate limit'),
          loginFailed: info === 'unauthorized' || lower.includes('unauthorized') || lower.includes('auth'),
          transient: info === 'httpConnectionFailed' || lower.includes('connection') || lower.includes('timeout'),
        })
        return events
      }

      // Response to initialize (id: 1) -> start or resume thread
      if (msg.id === 1 && !msg.error) {
        const req = threadId
          ? rpc('thread/resume', { threadId, cwd, sandbox: sandboxMode })
          : rpc('thread/start', { cwd, sandbox: sandboxMode, ...(model ? { model } : {}) })
        threadStartRpcId = req.id
        events.push({ kind: 'stdin_write', data: req.line })
        events.push({ kind: 'activity', text: 'codex initialized' })
      } else if (threadStartRpcId !== undefined && msg.id === threadStartRpcId && !msg.error) {
        const result = msg.result as { thread?: { id?: string } } | undefined
        const resolvedThreadId = result?.thread?.id ?? threadId
        if (resolvedThreadId) {
          threadId = resolvedThreadId
          events.push({ kind: 'session', sessionId: resolvedThreadId })
          const turnReq = rpc('turn/start', {
            threadId: resolvedThreadId,
            input: [{ type: 'text', text: pendingPrompt }],
          })
          events.push({ kind: 'stdin_write', data: turnReq.line })
        }
      }

      const method = msg.method
      const params = msg.params as Record<string, unknown> | undefined

      if (method === 'turn/started' && params) {
        if (typeof params.threadId === 'string') {
          threadId = params.threadId
          events.push({ kind: 'session', sessionId: threadId })
        }
        const turn = params.turn as { id?: string } | undefined
        if (typeof turn?.id === 'string') activeTurnId = turn.id
        events.push({ kind: 'activity', text: 'codex turn started' })
      } else if (method === 'item/started' && params) {
        const item = params.item as Record<string, unknown> | undefined
        if (item?.type === 'commandExecution' && typeof item.command === 'string') {
          events.push({ kind: 'activity', text: `Bash: ${item.command.slice(0, 120)}` })
        } else if (item?.type === 'reasoning') {
          events.push({ kind: 'activity', text: 'reasoning...' })
        }
      } else if (method === 'item/completed' && params) {
        const item = params.item as Record<string, unknown> | undefined
        if (item?.type === 'agentMessage' && typeof item.text === 'string') {
          lastAgentText = item.text
          events.push({ kind: 'message', text: item.text })
        }
      } else if (method === 'thread/tokenUsage/updated' && params) {
        const tokenUsage = params.tokenUsage as {
          total?: {
            inputTokens?: number
            outputTokens?: number
            cachedInputTokens?: number
            cacheWriteInputTokens?: number
          }
        } | undefined
        if (tokenUsage?.total) {
          events.push({
            kind: 'usage',
            cumulative: true,
            usage: {
              inputTokens: tokenUsage.total.inputTokens ?? 0,
              outputTokens: tokenUsage.total.outputTokens ?? 0,
              cacheReadTokens: tokenUsage.total.cachedInputTokens ?? 0,
              cacheWriteTokens: tokenUsage.total.cacheWriteInputTokens ?? 0,
            },
          })
        }
      } else if (method === 'turn/completed' && params) {
        const turn = params.turn as { status?: string; error?: { message?: string } } | undefined
        if (turn?.status === 'failed' || turn?.status === 'interrupted') {
          events.push({
            kind: 'turn_failed',
            error: turn.error?.message || `codex turn ${turn.status}`,
          })
        } else {
          events.push({ kind: 'turn_done', finalText: lastAgentText || undefined })
        }
      } else if (method === 'error' && params) {
        const errObj = params.error as { message?: string; codexErrorInfo?: string } | undefined
        const info = errObj?.codexErrorInfo ?? ''
        events.push({
          kind: 'turn_failed',
          error: errObj?.message || info || 'codex error',
          usageLimited: info === 'usageLimitExceeded',
          loginFailed: info === 'unauthorized',
          transient: info === 'httpConnectionFailed',
        })
      }

      return events
    },

    steer(text: string) {
      if (!threadId || !activeTurnId) {
        return { kind: 'unsupported', reason: 'codex turn not yet active' }
      }
      return {
        kind: 'stdin',
        data: rpc('turn/steer', {
          threadId,
          expectedTurnId: activeTurnId,
          input: [{ type: 'text', text }],
        }).line,
      }
    },
  }
}
