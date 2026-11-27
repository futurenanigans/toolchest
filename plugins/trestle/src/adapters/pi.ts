import * as path from 'node:path'

import { linkOrCopy, userHome } from '../platform'
import type { AdapterDriver, AdapterEvent, LaunchOptions, LaunchSpec } from './types'

export function createPiAdapter(): AdapterDriver {
  let lastAssistantText = ''
  let terminated = false

  return {
    cli: 'pi',

    async prepare(opts: LaunchOptions): Promise<LaunchSpec> {
      const agentDir = path.join(opts.runHome, 'pi-agent')
      const sessionDir = path.join(opts.runHome, 'pi-sessions')
      const userAuth = path.join(userHome(), '.pi', 'agent', 'auth.json')
      await linkOrCopy(userAuth, path.join(agentDir, 'auth.json'), { optional: true })

      const args = ['--mode', 'json']
      if (opts.model) args.push('--model', opts.model)
      if (opts.effort) args.push('--thinking', opts.effort)
      if (opts.resumeSessionId) args.push('--session', opts.resumeSessionId)
      if (opts.mode === 'read-only') args.push('--tools', 'read,grep,find,ls')
      args.push(opts.prompt)

      return {
        cli: 'pi',
        command: opts.commandOverride ?? 'pi',
        args,
        cwd: opts.cwd,
        env: {
          PI_CODING_AGENT_DIR: agentDir,
          PI_CODING_AGENT_SESSION_DIR: sessionDir,
          PI_SKIP_VERSION_CHECK: '1',
        },
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
      const type = obj.type

      if (type === 'session' && typeof obj.id === 'string') {
        events.push({ kind: 'session', sessionId: obj.id })
      } else if (type === 'tool_execution_start' && typeof obj.toolName === 'string') {
        events.push({ kind: 'activity', text: obj.toolName })
      } else if (type === 'message_end') {
        const msg = obj.message as {
          role?: string
          content?: Array<{ type?: string; text?: string }>
          stopReason?: string
          errorMessage?: string
          usage?: {
            input?: number
            output?: number
            cacheRead?: number
            cacheWrite?: number
            cost?: { total?: number }
          }
        } | undefined
        if (msg?.role === 'assistant') {
          if (msg.usage) {
            const costUsd = typeof msg.usage.cost?.total === 'number' ? msg.usage.cost.total : undefined
            events.push({
              kind: 'usage',
              cumulative: false,
              usage: {
                inputTokens: msg.usage.input ?? 0,
                outputTokens: msg.usage.output ?? 0,
                cacheReadTokens: msg.usage.cacheRead ?? 0,
                cacheWriteTokens: msg.usage.cacheWrite ?? 0,
                ...(costUsd !== undefined ? { costUsd } : {}),
              },
            })
          }
          const text = (msg.content ?? [])
            .filter(c => c.type === 'text' && typeof c.text === 'string')
            .map(c => c.text)
            .join('')
          if (text) {
            lastAssistantText = text
            events.push({ kind: 'message', text })
          }
          if (msg.stopReason === 'aborted' || msg.stopReason === 'error') {
            terminated = true
            const errMsg = msg.errorMessage || `pi turn ${msg.stopReason}`
            const lower = errMsg.toLowerCase()
            events.push({
              kind: 'turn_failed',
              error: errMsg,
              usageLimited: lower.includes('usage limit') || lower.includes('quota') || lower.includes('rate limit'),
              loginFailed: lower.includes('api key') || lower.includes('unauthorized'),
              transient: lower.includes('overloaded') || lower.includes('timeout'),
            })
          }
        }
      } else if (type === 'agent_settled' || type === 'agent_end') {
        if (!terminated) {
          terminated = true
          events.push({ kind: 'turn_done', finalText: lastAssistantText || undefined })
        }
      } else if (type === 'error') {
        terminated = true
        const msg = typeof obj.message === 'string' ? obj.message : 'pi error'
        const lower = msg.toLowerCase()
        events.push({
          kind: 'turn_failed',
          error: msg,
          usageLimited: lower.includes('usage limit') || lower.includes('quota') || lower.includes('rate limit'),
          loginFailed: lower.includes('api key') || lower.includes('unauthorized'),
        })
      }

      return events
    },

    steer() {
      return { kind: 'unsupported', reason: 'pi --mode json is one-shot; resume with sessionId instead' }
    },
  }
}
