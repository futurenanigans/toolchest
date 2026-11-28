import type { AdapterDriver, AdapterEvent, LaunchOptions, LaunchSpec } from './types'

export function createOpencodeAdapter(): AdapterDriver {
  let lastText = ''

  return {
    cli: 'opencode',

    async prepare(opts: LaunchOptions): Promise<LaunchSpec> {
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


      return {
        cli: 'opencode',
        command: opts.commandOverride ?? 'opencode',
        args,
        cwd: opts.cwd,
        env: {
          OPENCODE_DISABLE_AUTOUPDATE: '1',
          OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
        },
        initialStdin: opts.prompt,
        closeStdinAfterInitial: true,
      }
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
        const nested = obj.error as { name?: string; type?: string; message?: string; status?: number; data?: { message?: string; statusCode?: number } } | undefined
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
        const status = nested?.status ?? nested?.data?.statusCode
        events.push({
          kind: 'turn_failed',
          error: msg,
          usageLimited: errName === 'provider.quota' || status === 429,
          loginFailed: errName === 'provider.auth' || status === 401,
          transient: errName === 'provider.transport' || errName === 'provider.internal',
        })
      }

      return events
    },

    steer() {
      return { kind: 'unsupported', reason: 'Resume the standalone run with its sessionId to send another prompt' }
    },
  }
}
