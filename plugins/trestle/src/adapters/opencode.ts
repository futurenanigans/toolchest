import type { AdapterDriver, AdapterEvent, LaunchOptions, LaunchSpec } from './types'

export function createOpencodeAdapter(options: { readyTimeoutMs?: number } = {}): AdapterDriver {
  let serverUrl = ''
  let sessionId: string | undefined
  let authHeader = ''
  let lastText = ''
  const readyTimeoutMs = options.readyTimeoutMs ?? 30_000

  return {
    cli: 'opencode',

    async prepare(opts: LaunchOptions): Promise<LaunchSpec> {
      sessionId = opts.resumeSessionId
      serverUrl = ''
      authHeader = ''

      const config: Record<string, unknown> = {}
      if (opts.mode === 'read-only') {
        config.permissions = [
          { action: 'read', resource: '*', effect: 'allow' },
          { action: 'glob', resource: '*', effect: 'allow' },
          { action: 'grep', resource: '*', effect: 'allow' },
          { action: 'edit', resource: '*', effect: 'deny' },
          { action: 'bash', resource: '*', effect: 'deny' },
        ]
      }

      const args = ['run', '--standalone', '--format', 'json', '--auto']
      if (opts.model) {
        const modelArg = opts.effort && !opts.model.includes('#') ? `${opts.model}#${opts.effort}` : opts.model
        args.push('--model', modelArg)
      }
      if (opts.resumeSessionId) args.push('--session', opts.resumeSessionId)
      args.push(opts.prompt)

      return {
        cli: 'opencode',
        command: opts.commandOverride ?? 'opencode',
        args,
        cwd: opts.cwd,
        env: {
          OPENCODE_DISABLE_AUTOUPDATE: '1',
          OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
        },
        closeStdinAfterInitial: true,
      }
    },

    async ready(spec: LaunchSpec, isExited?: () => boolean): Promise<void> {
      if (!spec.serverUrl) return
      const deadline = Date.now() + readyTimeoutMs
      while (Date.now() < deadline) {
        if (isExited?.()) {
          throw new Error('opencode process exited before server became ready')
        }
        try {
          const res = await fetch(`${spec.serverUrl}/api/info`, {
            headers: spec.serverHeaders,
            signal: AbortSignal.timeout(1000),
          })
          if (res.ok) return
        } catch {
          // Wait for server startup
        }
        await new Promise(r => setTimeout(r, 150))
      }
      throw new Error(`opencode server did not become ready at ${spec.serverUrl} within ${readyTimeoutMs}ms`)
    },

    parseLine(line: string): AdapterEvent[] {
      const trimmed = line.trim()
      if (!trimmed.startsWith('{')) return []

      let obj: Record<string, unknown>
      try {
        obj = JSON.parse(trimmed) as Record<string, unknown>
      } catch {
        return []
      }

      const events: AdapterEvent[] = []
      if (typeof obj.sessionID === 'string' && obj.sessionID) {
        sessionId = obj.sessionID
        events.push({ kind: 'session', sessionId: obj.sessionID })
      }

      const type = obj.type
      const part = obj.part as Record<string, unknown> | undefined

      if (type === 'tool_use' && part) {
        const tool = typeof part.tool === 'string' ? part.tool : 'tool'
        const state = part.state as { input?: { command?: string } } | undefined
        const cmd = state?.input?.command
        events.push({ kind: 'activity', text: cmd ? `${tool}: ${cmd.slice(0, 120)}` : tool })
      } else if (type === 'text' && typeof part?.text === 'string') {
        lastText = part.text
        events.push({ kind: 'message', text: part.text })
      } else if (type === 'step_finish' && part) {
        const tokens = part.tokens as {
          input?: number
          output?: number
          cache?: { read?: number; write?: number }
        } | undefined
        const cost = typeof part.cost === 'number' ? part.cost : undefined
        if (tokens || cost !== undefined) {
          events.push({
            kind: 'usage',
            cumulative: false,
            usage: {
              inputTokens: tokens?.input ?? 0,
              outputTokens: tokens?.output ?? 0,
              cacheReadTokens: tokens?.cache?.read ?? 0,
              cacheWriteTokens: tokens?.cache?.write ?? 0,
              ...(cost !== undefined ? { costUsd: cost } : {}),
            },
          })
        }
        const reason = part.reason
        if (reason === 'stop' || reason === 'end_turn') {
          events.push({ kind: 'turn_done', finalText: lastText || undefined })
        }
      } else if (type === 'error') {
        const nested = obj.error as { name?: string; type?: string; message?: string; data?: { message?: string } } | undefined
        const errName =
          (typeof obj.name === 'string' && obj.name) ||
          (typeof nested?.name === 'string' && nested.name) ||
          (typeof nested?.type === 'string' && nested.type) ||
          ''
        const msg =
          (typeof obj.message === 'string' && obj.message) ||
          (typeof nested?.message === 'string' && nested.message) ||
          (typeof nested?.data?.message === 'string' && nested.data.message) ||
          errName ||
          'opencode error'
        const lower = msg.toLowerCase()
        events.push({
          kind: 'turn_failed',
          error: msg,
          usageLimited: errName === 'provider.quota' || lower.includes('quota') || lower.includes('rate limit'),
          loginFailed: errName === 'provider.auth' || lower.includes('unauthorized') || lower.includes('auth'),
          transient:
            errName === 'provider.transport' ||
            errName === 'provider.internal' ||
            lower.includes('transport:') ||
            lower.includes('socket connection was closed'),
        })
      }

      return events
    },

    steer(text: string) {
      if (!serverUrl || !sessionId) {
        return { kind: 'unsupported', reason: 'opencode standalone run does not expose an external steer URL; resume with sessionId instead' }
      }
      return {
        kind: 'http',
        url: `${serverUrl}/api/session/${sessionId}/prompt`,
        headers: { Authorization: authHeader },
        body: { content: text, delivery: 'steer' },
      }
    },
  }
}
