import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import type {
  AgentCli,
  AgentEffort,
  AgentFailureKind,
  AgentStatus,
  AgentUsage,
  CheckSummary,
  ContractSummary,
  DisabledCliSummary,
  QueueSummary,
} from '../types'
import { isWindows, userHome } from './platform'
import { withFileLock } from './locks'
import { repoKey } from './repo_key'

export const TERMINAL_RETENTION_MS = 24 * 60 * 60 * 1000

export interface PersistedWorktree {
  id: string
  path: string
  branch: string
  baseRef: string
  createdAt: number
}

export interface PersistedAgent {
  id: string
  cli: AgentCli
  model?: string
  effort?: AgentEffort
  stage: string
  worktreeId: string
  worktreePath: string
  branch: string
  status: AgentStatus
  processStart?: string
  pid?: number
  sessionId?: string
  startedAt: number
  lastActivityAt: number
  finishedAt?: number
  tail: string[]
  error?: string
  failureKind?: AgentFailureKind
  usage?: AgentUsage
}

export interface TrestleDiskState {
  version: 1
  worktrees: Record<string, PersistedWorktree>
  agents: Record<string, PersistedAgent>
  activeContract?: ContractSummary
  contractsByWorktree?: Record<string, ContractSummary>
  lastCheck?: CheckSummary
  checksByWorktree?: Record<string, CheckSummary>
  queue?: QueueSummary
  disabledClis?: DisabledCliSummary[]
}

const STATE_DIR = '.trestle'
const STATE_FILE = 'state.json'
const EXPERIMENTS_FILE = 'experiments.md'

export function stateDir(repoRoot: string, homeDir = userHome()): string {
  const resolved = path.resolve(repoRoot)
  return path.join(homeDir, STATE_DIR, repoKey(resolved, isWindows()))
}

export function sessionHomeDir(repoRoot: string, key: string, homeDir = userHome()): string {
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64) || 'default'
  return path.join(stateDir(repoRoot, homeDir), 'sessions', safe)
}

export function ephemeralRunsDir(repoRoot: string, homeDir = userHome()): string {
  return path.join(stateDir(repoRoot, homeDir), 'runs')
}

export async function readDiskState(repoRoot: string, homeDir = userHome()): Promise<TrestleDiskState> {
  const filePath = path.join(stateDir(repoRoot, homeDir), STATE_FILE)
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<TrestleDiskState>
    return {
      version: 1,
      worktrees: parsed.worktrees ?? {},
      agents: parsed.agents ?? {},
      activeContract: parsed.activeContract,
      contractsByWorktree: parsed.contractsByWorktree,
      lastCheck: parsed.lastCheck,
      checksByWorktree: parsed.checksByWorktree,
      queue: parsed.queue,
      disabledClis: parsed.disabledClis,
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { version: 1, worktrees: {}, agents: {} }
    }
    throw err
  }
}

export async function writeDiskState(
  repoRoot: string,
  state: TrestleDiskState,
  homeDir = userHome(),
): Promise<void> {
  const dir = stateDir(repoRoot, homeDir)
  await fs.mkdir(dir, { recursive: true })
  const target = path.join(dir, STATE_FILE)
  const tmp = path.join(dir, `${STATE_FILE}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`)
  await fs.writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  await fs.rename(tmp, target)
}


export async function updateDiskState(
  repoRoot: string,
  updater: (current: TrestleDiskState) => TrestleDiskState,
  homeDir = userHome(),
): Promise<TrestleDiskState> {
  return withFileLock(path.join(stateDir(repoRoot, homeDir), 'state.lock'), async () => {
    const current = await readDiskState(repoRoot, homeDir)
    const next = updater(current)
    for (const [id, agent] of Object.entries(next.agents)) {
      if (agent.finishedAt && agent.finishedAt < Date.now() - TERMINAL_RETENTION_MS) delete next.agents[id]
    }
    await writeDiskState(repoRoot, next, homeDir)
    return next
  })
}

export interface ExperimentEntry {
  id: string
  stage: string
  cli?: string
  hypothesis: string
  outcome: 'kept' | 'continued' | 'discarded' | 'failed'
  metric?: string
  reason: string
}

export async function appendExperiment(
  repoRoot: string,
  entry: ExperimentEntry,
  homeDir = userHome(),
): Promise<string> {
  const dir = stateDir(repoRoot, homeDir)
  await fs.mkdir(dir, { recursive: true })
  const filePath = path.join(dir, EXPERIMENTS_FILE)
  const timestamp = new Date().toISOString()
  const lines = [
    `## [${entry.outcome.toUpperCase()}] ${entry.id} (${timestamp})`,
    `- **Stage:** ${entry.stage}${entry.cli ? ` (${entry.cli})` : ''}`,
    `- **Hypothesis:** ${entry.hypothesis}`,
    ...(entry.metric ? [`- **Metric:** ${entry.metric}`] : []),
    `- **Reason / Outcome:** ${entry.reason}`,
    '',
  ]
  await fs.appendFile(filePath, `${lines.join('\n')}\n`, 'utf8')
  return filePath
}

export async function readExperiments(
  repoRoot: string,
  tailLines = 80,
  homeDir = userHome(),
): Promise<string> {
  const filePath = path.join(stateDir(repoRoot, homeDir), EXPERIMENTS_FILE)
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const lines = raw.split('\n')
    return lines.slice(-tailLines).join('\n').trim()
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return ''
    throw err
  }
}

export async function readExperimentEntries(
  repoRoot: string,
  maxEntries = 10,
  homeDir = userHome(),
  options: { excludeOutcomes?: readonly ExperimentEntry['outcome'][] } = {},
): Promise<string> {
  const filePath = path.join(stateDir(repoRoot, homeDir), EXPERIMENTS_FILE)
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const excluded = new Set((options.excludeOutcomes ?? []).map(o => `## [${o.toUpperCase()}]`))
    const parts = raw
      .split(/(?=^## \[)/m)
      .map(s => s.trim())
      .filter(Boolean)
      .filter(entry => !Array.from(excluded).some(prefix => entry.startsWith(prefix)))
    return parts.slice(-maxEntries).join('\n\n')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return ''
    throw err
  }
}
