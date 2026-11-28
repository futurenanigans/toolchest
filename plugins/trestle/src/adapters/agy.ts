import type { AdapterDriver, AdapterEvent, LaunchOptions, LaunchSpec } from './types'

function formatAgyUserMessage(text: string): string {
  return `${JSON.stringify({ event: 'user', message: { content: text } })}\n`
}

export function createAgyAdapter(): AdapterDriver {
  let pendingTurns = 1

  return {
    cli: 'agy',

    async prepare(opts: LaunchOptions): Promise<LaunchSpec> {
      const args = [
        '--output-format',
        'stream-json',
        '--input-format',
        'stream-json',
        '--disable-slash-commands',
      ]
      if (opts.model) args.push('--model', opts.model)
      if (opts.effort) args.push('--effort', opts.effort)
      if (opts.resumeSessionId) args.push('--resume', opts.resumeSessionId)
      if (opts.mode === 'read-only') {
        args.push('--mode', 'plan', '--sandbox')
      } else {
        args.push('--dangerously-skip-permissions')
      }

      return {
        cli: 'agy',
        command: opts.commandOverride ?? 'agy',
        args,
        cwd: opts.cwd,
        env: {},
        initialStdin: formatAgyUserMessage(opts.prompt),
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
      const evName = obj.event

      if (evName === 'init') {
        const cid = obj.conversation_id
        if (typeof cid === 'string' && cid) events.push({ kind: 'session', sessionId: cid })
      } else if (evName === 'step_update') {
        const su = obj.step_update as Record<string, unknown> | undefined
        if (su?.state === 'DONE' && su.usage && typeof su.usage === 'object') {
          const u = su.usage as {
            input_tokens?: number
            output_tokens?: number
            cache_read_tokens?: number
            cache_write_tokens?: number
          }
          events.push({
            kind: 'usage',
            cumulative: false,
            usage: {
              inputTokens: u.input_tokens ?? 0,
              outputTokens: u.output_tokens ?? 0,
              cacheReadTokens: u.cache_read_tokens ?? 0,
              cacheWriteTokens: u.cache_write_tokens ?? 0,
            },
          })
        }
        if (su?.step_type === 'tool' && su.state === 'ACTIVE' && typeof su.tool_name === 'string') {
          const info = su.tool_info as { parameters?: Record<string, unknown> } | undefined
          const cmd = info?.parameters?.CommandLine
          events.push({
            kind: 'activity',
            text: typeof cmd === 'string' ? `${su.tool_name}: ${cmd.slice(0, 120)}` : su.tool_name,
          })
        } else if (su?.step_type === 'agent_response' && typeof su.text_delta === 'string' && su.text_delta.trim()) {
          events.push({ kind: 'message', text: su.text_delta })
        }
      } else if (evName === 'result') {
        const res = obj.result as {
          status?: string
          error?: string
          response?: string
          denied_actions?: Array<{ action?: string }>
          usage?: {
            input_tokens?: number
            output_tokens?: number
            cache_read_tokens?: number
            cache_write_tokens?: number
          }
        } | undefined
        if (res?.usage) {
          events.push({
            kind: 'usage',
            cumulative: true,
            usage: {
              inputTokens: res.usage.input_tokens ?? 0,
              outputTokens: res.usage.output_tokens ?? 0,
              cacheReadTokens: res.usage.cache_read_tokens ?? 0,
              cacheWriteTokens: res.usage.cache_write_tokens ?? 0,
            },
          })
        }
        const denied = res?.denied_actions ?? []
        if (denied.length > 0) {
          events.push({
            kind: 'turn_failed',
            error: `Denied action(s): ${denied.map(d => d.action ?? 'unknown').join(', ')}`,
          })
        } else if (res?.status !== 'SUCCESS') {
          const errMsg = res?.error || res?.status || 'agy turn failed'
          events.push({
            kind: 'turn_failed',
            error: errMsg,
          })
        } else {
          pendingTurns = Math.max(0, pendingTurns - 1)
          if (pendingTurns === 0) {
            events.push({ kind: 'turn_done', finalText: res.response })
          }
        }
      }

      return events
    },

    steer(text: string) {
      pendingTurns += 1
      return { kind: 'stdin', data: formatAgyUserMessage(text) }
    },
  }
}
