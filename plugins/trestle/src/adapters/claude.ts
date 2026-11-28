import * as path from 'node:path'

import { linkOrCopy, userHome } from '../platform'
import type { AdapterDriver, AdapterEvent, LaunchOptions, LaunchSpec } from './types'

const READ_TOOLS = 'Bash,Read,Glob,Grep,WebFetch,WebSearch'
const READ_RULES = [
  'Bash(git status)',
  'Bash(git status *)',
  'Bash(git diff)',
  'Bash(git diff *)',
  'Bash(git log)',
  'Bash(git log *)',
  'Bash(git show *)',
  'Bash(git rev-parse *)',
  'Bash(git ls-files *)',
  'WebFetch',
  'WebSearch',
].join(',')

export function formatClaudeUserMessage(text: string): string {
  return `${JSON.stringify({
    type: 'user',
    message: { role: 'user', content: text },
  })}\n`
}

export function createClaudeAdapter(): AdapterDriver {
  return {
    cli: 'claude',

    async prepare(opts: LaunchOptions): Promise<LaunchSpec> {
      const configDir = path.join(opts.runHome, '.claude')
      const userCreds = path.join(userHome(), '.claude', '.credentials.json')
      await linkOrCopy(userCreds, path.join(configDir, '.credentials.json'), { optional: true })

      const args = [
        '-p',
        '--verbose',
        '--input-format',
        'stream-json',
        '--output-format',
        'stream-json',
        '--setting-sources',
        '',
      ]

      if (opts.model) args.push('--model', opts.model)
      if (opts.effort) args.push('--effort', opts.effort)
      if (opts.resumeSessionId) args.push('--resume', opts.resumeSessionId)

      if (opts.mode === 'read-only') {
        args.push('--permission-mode', 'dontAsk', '--tools', READ_TOOLS, '--allowedTools', READ_RULES)
      } else {
        args.push('--dangerously-skip-permissions')
      }

      return {
        cli: 'claude',
        command: opts.commandOverride ?? 'claude',
        args,
        cwd: opts.cwd,
        env: {
          CLAUDE_CONFIG_DIR: configDir,
          CLAUDECODE: undefined,
        },
        initialStdin: formatClaudeUserMessage(opts.prompt),
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
      const type = obj.type

      if (typeof obj.session_id === 'string' && obj.session_id) {
        events.push({ kind: 'session', sessionId: obj.session_id })
      }

      if (type === 'assistant') {
        const msg = obj.message as {
          content?: Array<Record<string, unknown>>
          usage?: {
            input_tokens?: number
            output_tokens?: number
            cache_read_input_tokens?: number
            cache_creation_input_tokens?: number
          }
        } | undefined
        if (msg?.usage) {
          events.push({
            kind: 'usage',
            cumulative: false,
            usage: {
              inputTokens: msg.usage.input_tokens ?? 0,
              outputTokens: msg.usage.output_tokens ?? 0,
              cacheReadTokens: msg.usage.cache_read_input_tokens ?? 0,
              cacheWriteTokens: msg.usage.cache_creation_input_tokens ?? 0,
            },
          })
        }
        for (const block of msg?.content ?? []) {
          if (block.type === 'tool_use' && typeof block.name === 'string') {
            const input = block.input as Record<string, unknown> | undefined
            const detail =
              typeof input?.command === 'string'
                ? input.command
                : typeof input?.file_path === 'string'
                  ? input.file_path
                  : typeof input?.pattern === 'string'
                    ? input.pattern
                    : ''
            events.push({
              kind: 'activity',
              text: detail ? `${block.name}: ${detail.slice(0, 120)}` : block.name,
            })
          } else if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
            events.push({ kind: 'message', text: block.text })
          }
        }
      } else if (type === 'rate_limit_event') {
        const info = obj.rate_limit_info as { status?: string; resetsAt?: number } | undefined
        if (info?.status === 'rejected') {
          events.push({ kind: 'turn_failed', error: 'Claude rate limit rejected', usageLimited: true, resetAt: typeof info?.resetsAt === 'number' ? info.resetsAt * 1000 : undefined })
        }
      } else if (type === 'result') {
        const usageObj = obj.usage as {
          input_tokens?: number
          output_tokens?: number
          cache_read_input_tokens?: number
          cache_creation_input_tokens?: number
        } | undefined
        const costUsd = typeof obj.total_cost_usd === 'number' ? obj.total_cost_usd : undefined
        if (usageObj || costUsd !== undefined) {
          events.push({
            kind: 'usage',
            cumulative: true,
            usage: {
              inputTokens: usageObj?.input_tokens ?? 0,
              outputTokens: usageObj?.output_tokens ?? 0,
              cacheReadTokens: usageObj?.cache_read_input_tokens ?? 0,
              cacheWriteTokens: usageObj?.cache_creation_input_tokens ?? 0,
              ...(costUsd !== undefined ? { costUsd } : {}),
            },
          })
        }
        const isError = obj.is_error === true
        const resultText = typeof obj.result === 'string' ? obj.result : undefined
        const subtype = typeof obj.subtype === 'string' ? obj.subtype : ''
        if (isError || subtype === 'error_during_execution') {
          const authFailed = subtype === 'authentication_failed'
          events.push({
            kind: 'turn_failed',
            error: resultText || subtype || 'Claude turn failed',
            loginFailed: authFailed,
          })
        } else {
          events.push({ kind: 'turn_done', finalText: resultText })
        }
      }

      return events
    },

    steer(text: string) {
      return { kind: 'stdin', data: formatClaudeUserMessage(text) }
    },
  }
}
