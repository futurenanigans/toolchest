// The status line (model, effort, git, usage and the session's correction total) and the session-start
// `git fetch` whose outcome the model is told, so remote-tracking refs are never assumed fresh.
import { atom, read } from 'claude-code'
import type { EngineInterface as Engine, SessionContextUsage } from 'claude-code'

import type { LamCounts, StatusSegment } from '../types'

const corrections = atom({ plugin: 'lam', key: 'counts' } as const, {} as LamCounts, { shape: 'counts-1' })
const FETCH_TIMEOUT_MS = 20_000
const STALE_ADVICE =
  'Remote-tracking refs are STALE: treat origin/* and any ahead/behind count as unverified, and say so rather than reporting them as current.'

const MODEL_FAMILIES: readonly { family: RegExp; multiplier: string; color: string }[] = [
  { family: /haiku/i, multiplier: '0.3x', color: 'green' },
  { family: /sonnet/i, multiplier: '1x', color: 'green' },
  { family: /opus/i, multiplier: '1.7x', color: 'yellow' },
  { family: /fable|mythos/i, multiplier: '3.3x', color: 'red' },
]

const EFFORT_COLORS: Readonly<Record<string, string>> = { low: 'green', medium: 'yellow', high: 'redBright', xhigh: 'red', max: 'red' }
const CONTEXT_RED_PERCENT = 30
const CONTEXT_RED_TOKENS = 300_000
const CONTEXT_YELLOW_PERCENT = 20

const NON_INTERACTIVE_GIT_ENV: Record<string, string> = {
  GIT_TERMINAL_PROMPT: '0',
  GIT_ASKPASS: 'echo',
  SSH_ASKPASS: 'echo',
  GCM_INTERACTIVE: 'never',
  GIT_SSH_COMMAND: 'ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new',
}

function lastLines(text: string, count: number): string {
  return text.replace(/\r/g, '').trimEnd().split('\n').slice(-count).join('\n')
}

function clockTime(epochMs: number): string {
  return new Date(epochMs).toTimeString().slice(0, 8)
}

async function git($: Engine, cwd: string, args: readonly string[]): Promise<string | null> {
  try {
    const { exitCode, stdout } = await $.process.run(['git', '-C', cwd, '--no-optional-locks', ...args])
    return exitCode === 0 ? stdout.trim() : null
  } catch {
    return null
  }
}

export async function fetchRemotes($: Engine, cwd: string): Promise<string | null> {
  if ((await $.session.repo()) === null) return null
  const remotes = await git($, cwd, ['remote'])
  if (!remotes) return null

  try {
    const { exitCode, stderr } = await $.process.run(['git', '-C', cwd, 'fetch', '--all', '--prune', '--quiet'], {
      env: NON_INTERACTIVE_GIT_ENV,
      timeoutMs: FETCH_TIMEOUT_MS,
    })
    if (exitCode !== 0) {
      const detail = lastLines(stderr, 3) || 'no detail on stderr'
      return `git fetch failed in '${cwd}' (${detail}). ${STALE_ADVICE}`
    }
  } catch (error) {
    return `git fetch did not complete within ${FETCH_TIMEOUT_MS / 1000}s in '${cwd}' (${String(error)}). ${STALE_ADVICE}`
  }
  return `git fetch --all --prune completed at ${clockTime(await $.clock.now())} local time in '${cwd}'. Remote-tracking refs are current as of that moment. Anything that mutates the remote afterwards still needs its own fetch.`
}

async function gitSegments($: Engine, cwd: string): Promise<StatusSegment[]> {
  const repo = await $.session.repo()
  const directoryName = cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd
  if (repo === null) return [{ text: directoryName }]

  const branch = await git($, cwd, ['symbolic-ref', '--short', 'HEAD'])
  if (branch === null) return [{ text: directoryName }]

  const remoteName = repo.remote ? decodeURIComponent(repo.remote.replace(/\.git$/, '').split(/[/:]/).pop() ?? '') : ''
  const porcelain = await git($, cwd, ['status', '--porcelain'])
  const segments: StatusSegment[] = [{ text: remoteName || directoryName }, { text: `${branch}${porcelain ? '*' : ''}` }]

  const counts = await git($, cwd, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'])
  if (counts) {
    const [ahead = 0, behind = 0] = counts.split(/\s+/).map(Number)
    const drift = [ahead > 0 ? `+${ahead}` : '', behind > 0 ? `-${behind}` : ''].filter(Boolean)
    segments.push({ text: drift.length > 0 ? drift.join(' ') : '=' })
  }
  return segments
}

function contextColor(percent: number, tokens: number): string {
  if (percent >= CONTEXT_RED_PERCENT || tokens >= CONTEXT_RED_TOKENS) return 'red'
  return percent >= CONTEXT_YELLOW_PERCENT ? 'yellow' : 'green'
}

function contextLimit({ window, breakdown }: SessionContextUsage): number {
  if (breakdown === undefined) return window
  const { isAutoCompactEnabled, autoCompactThreshold, rawMaxTokens } = breakdown
  return isAutoCompactEnabled && autoCompactThreshold !== undefined ? autoCompactThreshold : rawMaxTokens
}

export async function statusSegments($: Engine): Promise<StatusSegment[]> {
  const cwd = await $.session.cwd()
  const model = await $.session.model()
  const family = MODEL_FAMILIES.find(({ family }) => family.test(model))
  const settings = (await $.settings.read()) as { effortLevel?: string }
  const usage = await $.session.usage({ breakdown: 'summary' })

  const parts: StatusSegment[] = [family ? { text: `${model} ${family.multiplier}`, color: family.color } : { text: model }]
  if (settings.effortLevel) parts.push({ text: `effort:${settings.effortLevel}`, color: EFFORT_COLORS[settings.effortLevel] })
  parts.push(...(await gitSegments($, cwd)))
  if (usage.cost) parts.push({ text: `$${usage.cost.usd.toFixed(2)}` })
  const { tokens } = usage.context
  if (tokens !== undefined) {
    const percent = (tokens / contextLimit(usage.context)) * 100
    parts.push({ text: `ctx ${Math.round(percent)}%`, color: contextColor(percent, tokens) })
  }
  const corrected = Object.values(await read($, corrections)).reduce((sum, n) => sum + n, 0)
  if (corrected > 0) parts.push({ text: `guard ${corrected}`, color: 'yellow' })
  return parts
}
