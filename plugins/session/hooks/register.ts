// Records non-exploratory failed shell commands in session state (capped and deduplicated)
// so /session:handover can pre-fill "Failed approaches" with verified commands instead of recall.
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const MAX_RECORDED = 5
const MAX_CMD_CHARS = 160
const SECTION_ID = 'session:failed-commands'

const EXPLORATORY_PREFIX = /^(?:grep|rg|find|ls|dir|cat|head|tail|less|more|which|where|type|test|\[|pwd|echo|printf|stat|wc|git\s+(?:status|diff|log|show|branch|rev-parse|check-ignore|stash\s+list))\b/i

const failedCommands = atom({ plugin: 'session', key: 'failedCommands' } as const, [] as string[], { shape: 'failed-cmds-1' })

function isShell(tool: string): boolean {
  return tool === 'Bash' || tool === 'PowerShell'
}

export function normalizeCommand(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_CMD_CHARS)
}

export function isExploratory(cmd: string): boolean {
  return EXPLORATORY_PREFIX.test(cmd.trim())
}

export const register: Register = on => {
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (!isShell(e.tool) || ran.deny !== undefined || ran.isError !== true) return ran

    const raw = (e as Record<string, unknown>).command
    if (typeof raw !== 'string') return ran
    const normalized = normalizeCommand(raw)
    if (!normalized || isExploratory(normalized)) return ran

    await update($, failedCommands, current => {
      const deduped = current.filter(item => item !== normalized)
      return [...deduped, normalized].slice(-MAX_RECORDED)
    })
    return ran
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const entries = await read($, failedCommands)
    if (entries.length === 0) return composed
    const text =
      'Recent failed shell commands this session (for /session:handover "Failed approaches", filtered to the stated goal):\n' +
      entries.map(c => `- ${c}`).join('\n')
    return { sections: [...composed.sections, { id: SECTION_ID, text, scope: 'session' as const }] }
  })
}
