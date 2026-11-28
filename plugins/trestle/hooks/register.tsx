import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

import type {
  AgentSummary,
  CheckSummary,
  ContractSummary,
  DisabledCliSummary,
  QueueSummary,
  TrestlePaneState,
  WorktreeSummary,
} from '../types'
import { repoKey } from '../src/repo_key'
import { renderTrestlePane } from '../ui/pane'

const PANE = 'trestle'
const PANE_TITLE = 'Trestle'
const POLL_INTERVAL_MS = 1_000

export const paneState = atom(
  { plugin: 'trestle', key: 'pane' } as const,
  { agents: [] } as TrestlePaneState,
  { shape: 'trestle-pane-1' },
)

interface ParsedDiskState {
  agents?: Record<string, AgentSummary>
  worktrees?: Record<string, WorktreeSummary>
  activeContract?: ContractSummary
  contractsByWorktree?: Record<string, ContractSummary>
  lastCheck?: CheckSummary
  checksByWorktree?: Record<string, CheckSummary>
  queue?: QueueSummary
  disabledClis?: DisabledCliSummary[]
}

function parseStateJson(raw: string): ParsedDiskState | undefined {
  try {
    return JSON.parse(raw) as ParsedDiskState
  } catch (err) {
    if (err instanceof SyntaxError) return undefined
    throw err
  }
}

async function resolveDataBase($: Engine, cwd: string): Promise<string> {
  const home = (await $.env.get('HOME')) || (await $.env.get('USERPROFILE'))
  const cleanHome = home ? home.replace(/[\\/]+$/, '') : undefined
  const key = repoKey(cwd, (await $.env.get('OS')) === 'Windows_NT')
  return cleanHome ? `${cleanHome}/.trestle/${key}` : `${cwd.replace(/[\\/]+$/, '')}/.trestle`
}

async function readRecentExperiments($: Engine, expPath: string): Promise<string[]> {
  if (!(await $.fs.exists(expPath))) return []
  const rawExp = await $.fs.read(expPath)
  return rawExp
    .split('\n')
    .filter(l => l.startsWith('## ['))
    .slice(-5)
    .map(l => l.slice(3).trim())
}

async function syncFromDisk($: Engine, cwd: string): Promise<boolean> {
  const base = await resolveDataBase($, cwd)
  const statePath = `${base}/state.json`
  const parsed = (await $.fs.exists(statePath)) ? parseStateJson(await $.fs.read(statePath)) : undefined

  const agents = Object.values(parsed?.agents ?? {}).map(a => ({
    ...a,
    tail: Array.isArray(a.tail) ? a.tail : [],
  }))
  const worktrees = Object.values(parsed?.worktrees ?? {})
  const recentExperiments = await readRecentExperiments($, `${base}/experiments.md`)

  await update($, paneState, cur => ({
    ...cur,
    agents,
    worktrees,
    activeContract: parsed?.activeContract,
    contractsByWorktree: parsed?.contractsByWorktree,
    lastCheck: parsed?.lastCheck,
    checksByWorktree: parsed?.checksByWorktree,
    queue: parsed?.queue,
    disabledClis: parsed?.disabledClis,
    recentExperiments,
    selectedId: cur.selectedId && agents.some(a => a.id === cur.selectedId) ? cur.selectedId : agents[0]?.id,
  }))

  const hasActiveAgent = agents.some(a => a.status === 'running' || a.status === 'starting' || a.status === 'idle')
  const hasRunningQueue = (parsed?.queue?.counts?.running ?? 0) > 0
  return hasActiveAgent || hasRunningQueue
}

const pollState = { polling: false, sessionEnded: false, cwd: '' }

function startPoller($: Engine): void {
  if (pollState.polling || pollState.sessionEnded || !pollState.cwd) return
  pollState.polling = true
  void (async () => {
    try {
      while (!pollState.sessionEnded) {
        await $.clock.sleep(POLL_INTERVAL_MS)
        if (pollState.sessionEnded) break
        const stillActive = await syncFromDisk($, pollState.cwd)
        await $.ui.invalidate('ui.render')
        if (!stillActive) break
      }
    } finally {
      pollState.polling = false
    }
  })()
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    let root = e.cwd
    while (root && !(await $.fs.exists(`${root}/.git`))) {
      const parent = root.replace(/[\\/][^\\/]+[\\/]?$/, '')
      if (!parent || parent === root) {
        root = e.cwd
        break
      }
      root = parent
    }
    pollState.cwd = root
    pollState.sessionEnded = false
    await $.command.register({ name: 'trestle', description: 'Open the Trestle multi-agent orchestration sidepanel' })
    const started = await next(e)
    if (await syncFromDisk($, pollState.cwd)) startPoller($)
    return started
  })

  on('session.end', async ($, e, next) => {
    pollState.sessionEnded = true
    return next(e)
  })

  on('command.run', { command: 'trestle' }, async $ => {
    if (pollState.cwd && (await syncFromDisk($, pollState.cwd))) startPoller($)
    await $.ui.open({ id: PANE, title: PANE_TITLE })
    return { text: 'Trestle sidepanel opened.' }
  })

  on('tool.call', async ($, e, next) => {
    const res = await next(e)
    if (pollState.cwd && /^mcp__(plugin_trestle_)?trestle__/.test(e.tool)) {
      const active = await syncFromDisk($, pollState.cwd)
      await $.ui.invalidate('ui.render')
      if (active) startPoller($)
    }
    return res
  })

  on('turn.complete', async ($, e, next) => {
    const res = await next(e)
    if (pollState.cwd) {
      await syncFromDisk($, pollState.cwd)
      await $.ui.invalidate('ui.render')
    }
    return res
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const state = await read($, paneState)
    return renderTrestlePane(ui, state, async id => {
      await update($, paneState, cur => ({ ...cur, selectedId: id }))
      await $.ui.invalidate('ui.render')
    })
  })
}
