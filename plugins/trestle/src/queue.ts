import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import type { AgentCli, AgentEffort, QueueItemStatus, QueueSummary } from '../types'
import { type CheckCommandSpec, runChecks } from './checks'
import { loadEffectiveConfig } from './config'
import { type BaselinePolicy, contractCreate, contractRead } from './contract'
import { evaluateGateAgainstBaseline, gateCheckOptions, runGoalLoop } from './goal_loop'
import { execCommand, isProcessAlive, isWindows, userHome, type CommandSpec } from './platform'
import { repoKey } from './repo_key'
import { readDiskState, updateDiskState } from './state'
import { AgentSupervisor } from './supervisor'
import { commitWorktreeChanges, worktreeClean, worktreeCreate, worktreeLand } from './worktrees'

export interface QueueItem {
  id: string
  title: string
  goal: string
  acceptanceCriteria: Array<{ id: string; description: string }>
  cli: AgentCli
  model?: string
  effort?: AgentEffort
  freshContextPerIteration?: boolean
  dependsOn: string[]
  priority: number
  status: QueueItemStatus
  checks?: CheckCommandSpec[]
  includeMortise?: boolean
  baseline?: BaselinePolicy
  maxIterations?: number
  worktreeId?: string
  contractId?: string
  landedCommit?: string
  error?: string
  gatePassed?: boolean
  ownerPid?: number
  createdAt: number
  updatedAt: number
}

export interface QueueFile {
  version: 1
  repoRoot: string
  items: Record<string, QueueItem>
}

const dispatchLocks = new Map<string, Promise<void>>()

async function withRepoDispatchLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  let release!: () => void
  const next = new Promise<void>(r => {
    release = r
  })
  const prev = dispatchLocks.get(key) ?? Promise.resolve()
  dispatchLocks.set(key, prev.then(() => next))
  await prev
  try {
    return await fn()
  } finally {
    release()
  }
}

export function queueFilePath(repoRoot: string, homeDir = userHome()): string {
  const resolved = path.resolve(repoRoot)
  return path.join(homeDir, '.trestle', repoKey(resolved, isWindows()), 'queue.json')
}

export async function readQueue(repoRoot: string, homeDir = userHome()): Promise<QueueFile> {
  const filePath = queueFilePath(repoRoot, homeDir)
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<QueueFile>
    return {
      version: 1,
      repoRoot: parsed.repoRoot ?? path.resolve(repoRoot),
      items: parsed.items ?? {},
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { version: 1, repoRoot: path.resolve(repoRoot), items: {} }
    }
    throw err
  }
}

function effectiveStatus(items: Record<string, QueueItem>, item: QueueItem): QueueItemStatus {
  if (item.status !== 'queued') return item.status
  const hasFailedDep = item.dependsOn.some(depId => {
    const dep = items[depId]
    if (!dep) return false
    return dep.status === 'failed' || effectiveStatus(items, dep) === 'blocked'
  })
  return hasFailedDep ? 'blocked' : 'queued'
}

function summarizeQueue(q: QueueFile): QueueSummary {
  const all = Object.values(q.items).sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt)
  const counts: Record<QueueItemStatus, number> = {
    queued: 0,
    running: 0,
    blocked: 0,
    passed: 0,
    landed: 0,
    failed: 0,
  }
  const enriched = all.map(item => {
    const status = effectiveStatus(q.items, item)
    counts[status] += 1
    return {
      id: item.id,
      title: item.title,
      status,
      cli: item.cli,
      dependsOn: item.dependsOn,
      ...(item.error ? { error: item.error } : {}),
    }
  })
  return {
    total: all.length,
    counts,
    items: enriched.slice(0, 20),
  }
}

async function writeQueue(repoRoot: string, q: QueueFile, homeDir = userHome()): Promise<void> {
  const resolvedRoot = path.resolve(repoRoot)
  const target = queueFilePath(resolvedRoot, homeDir)
  const dir = path.dirname(target)
  await fs.mkdir(dir, { recursive: true })
  const tmp = path.join(dir, `queue.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`)
  await fs.writeFile(tmp, `${JSON.stringify(q, null, 2)}\n`, 'utf8')
  await fs.rename(tmp, target)

  await updateDiskState(
    resolvedRoot,
    cur => ({
      ...cur,
      queue: summarizeQueue(q),
    }),
    homeDir,
  ).catch(() => {})
}

function hasCycle(items: Record<string, QueueItem>, startId: string, deps: string[]): boolean {
  const visited = new Set<string>()
  const stack = [...deps]
  while (stack.length > 0) {
    const cur = stack.pop()!
    if (cur === startId) return true
    if (visited.has(cur)) continue
    visited.add(cur)
    const node = items[cur]
    if (node) stack.push(...node.dependsOn)
  }
  return false
}

export async function queueAdd(
  repoRoot: string,
  params: {
    id: string
    title: string
    goal: string
    acceptanceCriteria: Array<{ id: string; description: string }>
    cli?: AgentCli
    model?: string
    effort?: AgentEffort
    freshContextPerIteration?: boolean
    dependsOn?: string[]
    priority?: number
    checks?: CheckCommandSpec[]
    includeMortise?: boolean
    baseline?: BaselinePolicy
    maxIterations?: number
  },
  homeDir = userHome(),
): Promise<QueueItem> {
  const q = await readQueue(repoRoot, homeDir)
  if (q.items[params.id]) {
    throw new Error(`Queue item already exists: ${params.id}`)
  }
  const deps = Array.from(new Set(params.dependsOn ?? []))
  if (hasCycle(q.items, params.id, deps)) {
    throw new Error(`Dependency cycle detected for queue item: ${params.id}`)
  }

  const { config } = await loadEffectiveConfig(repoRoot, homeDir)
  const now = Date.now()
  const item: QueueItem = {
    id: params.id,
    title: params.title,
    goal: params.goal,
    acceptanceCriteria: params.acceptanceCriteria,
    cli: params.cli ?? config.defaultCli ?? 'claude',
    model: params.model,
    effort: params.effort,
    freshContextPerIteration: params.freshContextPerIteration,
    dependsOn: deps,
    priority: params.priority ?? 0,
    status: 'queued',
    checks: params.checks,
    includeMortise: params.includeMortise,
    baseline: params.baseline,
    maxIterations: params.maxIterations,
    createdAt: now,
    updatedAt: now,
  }
  q.items[item.id] = item
  await writeQueue(repoRoot, q, homeDir)
  return item
}

export async function queueRemove(repoRoot: string, id: string, homeDir = userHome()): Promise<boolean> {
  const q = await readQueue(repoRoot, homeDir)
  if (!q.items[id]) return false
  delete q.items[id]
  await writeQueue(repoRoot, q, homeDir)
  return true
}

export async function queueUpdate(
  repoRoot: string,
  id: string,
  patch: {
    priority?: number
    cli?: AgentCli
    model?: string
    dependsOn?: string[]
    maxIterations?: number
    freshContextPerIteration?: boolean
  },
  homeDir = userHome(),
): Promise<QueueItem> {
  const q = await readQueue(repoRoot, homeDir)
  const existing = q.items[id]
  if (!existing) throw new Error(`Unknown queue item: ${id}`)
  const deps = patch.dependsOn ? Array.from(new Set(patch.dependsOn)) : existing.dependsOn
  if (patch.dependsOn && hasCycle(q.items, id, deps)) {
    throw new Error(`Dependency cycle detected for queue item: ${id}`)
  }
  const updated: QueueItem = {
    ...existing,
    ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
    ...(patch.cli !== undefined ? { cli: patch.cli } : {}),
    ...(patch.model !== undefined ? { model: patch.model } : {}),
    ...(patch.maxIterations !== undefined ? { maxIterations: patch.maxIterations } : {}),
    ...(patch.freshContextPerIteration !== undefined
      ? { freshContextPerIteration: patch.freshContextPerIteration }
      : {}),
    dependsOn: deps,
    updatedAt: Date.now(),
  }
  q.items[id] = updated
  await writeQueue(repoRoot, q, homeDir)
  return updated
}

export async function queueRetry(
  repoRoot: string,
  id: string,
  options: { homeDir?: string; supervisor?: AgentSupervisor } = {},
): Promise<QueueItem> {
  const homeDir = options.homeDir ?? userHome()
  const q = await readQueue(repoRoot, homeDir)
  const existing = q.items[id]
  if (!existing) throw new Error(`Unknown queue item: ${id}`)
  if (existing.status === 'landed') {
    throw new Error(`Queue item ${id} is already landed`)
  }
  if (existing.status === 'running' && isProcessAlive(existing.ownerPid)) {
    throw new Error(`Queue item ${id} is still running (Trestle process ${existing.ownerPid})`)
  }
  if (existing.worktreeId) {
    const disk = await readDiskState(repoRoot, homeDir)
    if (disk.worktrees[existing.worktreeId]) {
      if (existing.gatePassed) {
        throw new Error(
          `Queue item ${id} passed its checks and only failed to land; worktree ${existing.worktreeId} holds that work. ` +
            'Land it with worktree_land, or remove it with worktree_clean before retrying.',
        )
      }
      await worktreeClean(repoRoot, existing.worktreeId, { homeDir, supervisor: options.supervisor })
    }
  }
  const reset: QueueItem = {
    ...existing,
    status: 'queued',
    error: undefined,
    gatePassed: undefined,
    ownerPid: undefined,
    worktreeId: undefined,
    updatedAt: Date.now(),
  }
  q.items[id] = reset
  await writeQueue(repoRoot, q, homeDir)
  return reset
}

export async function queueClear(
  repoRoot: string,
  statuses: readonly QueueItemStatus[] = ['landed', 'failed'],
  homeDir = userHome(),
): Promise<{ removed: string[] }> {
  const q = await readQueue(repoRoot, homeDir)
  const allowed = new Set(statuses)
  const removed: string[] = []
  for (const [id, item] of Object.entries(q.items)) {
    if (allowed.has(item.status)) {
      delete q.items[id]
      removed.push(id)
    }
  }
  if (removed.length > 0) {
    await writeQueue(repoRoot, q, homeDir)
  }
  return { removed }
}

/**
 * Resets any queue items left in `running` state after an unclean crash/restart.
 */
export async function queueReconcile(repoRoot: string, homeDir = userHome()): Promise<string[]> {
  const q = await readQueue(repoRoot, homeDir)
  const recovered: string[] = []
  const now = Date.now()
  for (const [id, item] of Object.entries(q.items)) {
    if (item.status === 'running' && !isProcessAlive(item.ownerPid)) {
      q.items[id] = {
        ...item,
        status: 'failed',
        error: item.error ?? 'Interrupted during previous session (use queue_retry to re-queue)',
        updatedAt: now,
      }
      recovered.push(id)
    }
  }
  if (recovered.length > 0) {
    await writeQueue(repoRoot, q, homeDir)
  }
  return recovered
}

export async function queueList(repoRoot: string, homeDir = userHome()): Promise<QueueItem[]> {
  const q = await readQueue(repoRoot, homeDir)
  return Object.values(q.items)
    .map(item => ({ ...item, status: effectiveStatus(q.items, item) }))
    .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt)
}

export async function queueReadyItems(repoRoot: string, homeDir = userHome()): Promise<QueueItem[]> {
  const q = await readQueue(repoRoot, homeDir)
  return Object.values(q.items)
    .filter(item => {
      if (item.status !== 'queued') return false
      return item.dependsOn.every(depId => q.items[depId]?.status === 'landed')
    })
    .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt)
}

export interface QueueBatchResult {
  dispatched: number
  landed: string[]
  failed: Array<{ id: string; error: string }>
  throttledByMemory?: boolean
}

export async function queueRunNext(
  supervisor: AgentSupervisor,
  repoRoot: string,
  options: {
    maxParallel?: number
    targetBranch?: string
    homeDir?: string
    commandOverride?: CommandSpec
    freeMemMbOverride?: number
  } = {},
): Promise<QueueBatchResult> {
  const resolvedRoot = path.resolve(repoRoot)
  const homeDir = options.homeDir ?? userHome()
  const lockKey = queueFilePath(resolvedRoot, homeDir)
  const { config } = await loadEffectiveConfig(resolvedRoot, homeDir)
  let throttledByMemory = false

  // Reserve ready items atomically under the per-repo dispatch lock, applying memory-aware admission
  const ready = await withRepoDispatchLock(lockKey, async () => {
    let maxParallel = Math.max(1, options.maxParallel ?? config.resources?.maxParallel ?? 2)
    const minFreeMemMb = config.resources?.minFreeMemMb ?? 2048
    const freeMemMb = options.freeMemMbOverride ?? Math.floor(os.freemem() / (1024 * 1024))
    if (maxParallel > 1 && minFreeMemMb > 0 && freeMemMb < minFreeMemMb) {
      maxParallel = 1
      throttledByMemory = true
    }

    const selected = (await queueReadyItems(resolvedRoot, homeDir)).slice(0, maxParallel)
    if (selected.length === 0) return []
    const q = await readQueue(resolvedRoot, homeDir)
    for (const item of selected) {
      q.items[item.id] = { ...q.items[item.id]!, status: 'running', ownerPid: process.pid, updatedAt: Date.now() }
    }
    await writeQueue(resolvedRoot, q, homeDir)
    return selected
  })

  if (ready.length === 0) {
    return { dispatched: 0, landed: [], failed: [] }
  }

  // Run goal loops in parallel isolated worktrees
  const outcomes = await Promise.all(
    ready.map(async item => {
      const wtId = `q-${item.id}`
      const contractId = `q-${item.id}`
      try {
        const wt = await worktreeCreate(resolvedRoot, wtId, { homeDir })
        await contractCreate(
          resolvedRoot,
          {
            id: contractId,
            title: item.title,
            goal: item.goal,
            acceptanceCriteria: item.acceptanceCriteria,
            checks: item.checks,
            includeMortise: item.includeMortise,
            baseline: item.baseline,
            maxIterations: item.maxIterations,
            freshContextPerIteration: item.freshContextPerIteration,
          },
          homeDir,
        )
        const res = await runGoalLoop(supervisor, {
          repoRoot: resolvedRoot,
          contractId,
          cli: item.cli,
          model: item.model,
          effort: item.effort,
          freshContextPerIteration: item.freshContextPerIteration,
          worktreeId: wt.id,
          worktreePath: wt.path,
          branch: wt.branch,
          commandOverride: options.commandOverride,
          homeDir,
        })
        return { item, wt, contractId, res }
      } catch (err) {
        return {
          item,
          wt: undefined,
          contractId,
          res: {
            status: 'failed' as const,
            contractId,
            worktreeId: wtId,
            iterations: 0,
            error: (err as Error).message,
          },
        }
      }
    }),
  )

  const landed: string[] = []
  const failed: Array<{ id: string; error: string }> = []

  // Land passing items sequentially onto targetBranch
  for (const out of outcomes) {
    const q = await readQueue(resolvedRoot, homeDir)
    const entry = q.items[out.item.id]!
    if (out.res.status !== 'passed' || !out.wt) {
      const errMsg = out.res.error ?? out.res.lastReport?.summary ?? `Goal loop ${out.res.status}`
      q.items[out.item.id] = {
        ...entry,
        status: 'failed',
        worktreeId: out.wt?.id,
        contractId: out.contractId,
        error: errMsg,
        updatedAt: Date.now(),
      }
      await writeQueue(resolvedRoot, q, homeDir)
      failed.push({ id: out.item.id, error: errMsg })
      continue
    }

    try {
      await commitWorktreeChanges(out.wt.path, `trestle(${out.item.id}): ${out.item.title}`)

      // Always resolve targetBranch (defaulting to worktree baseRef) so 2nd+ items re-sync and re-check
      const targetBranch = options.targetBranch ?? out.wt.baseRef
      if (landed.length > 0 && targetBranch) {
        const mergeRes = await execCommand('git', ['merge', '--no-edit', targetBranch], {
          cwd: out.wt.path,
        })
        if (mergeRes.exitCode !== 0) {
          await execCommand('git', ['merge', '--abort'], { cwd: out.wt.path }).catch(() => {})
          throw new Error(`Merge conflict updating ${out.wt.id} from ${targetBranch}`)
        }
        const contract = await contractRead(resolvedRoot, out.contractId, homeDir)
        const recheck = await runChecks({ ...gateCheckOptions(contract, config), worktreePath: out.wt.path })
        const gate = evaluateGateAgainstBaseline(recheck, out.res.baseline, contract.baseline ?? 'require-green')
        if (!gate.effectivePassed) {
          throw new Error(`Post-merge recheck failed: ${gate.summary}`)
        }
      }

      const landedRes = await worktreeLand(resolvedRoot, out.wt.id, {
        targetBranch,
        commitMessage: `trestle(${out.item.id}): ${out.item.title}`,
        homeDir,
      })
      await worktreeClean(resolvedRoot, out.wt.id, { homeDir, supervisor })

      q.items[out.item.id] = {
        ...entry,
        status: 'landed',
        worktreeId: out.wt.id,
        contractId: out.contractId,
        landedCommit: landedRes.landedCommit,
        error: undefined,
        updatedAt: Date.now(),
      }
      await writeQueue(resolvedRoot, q, homeDir)
      landed.push(out.item.id)
    } catch (err) {
      const errMsg = (err as Error).message
      q.items[out.item.id] = {
        ...entry,
        status: 'failed',
        worktreeId: out.wt.id,
        contractId: out.contractId,
        error: errMsg,
        gatePassed: true,
        updatedAt: Date.now(),
      }
      await writeQueue(resolvedRoot, q, homeDir)
      failed.push({ id: out.item.id, error: errMsg })
    }
  }

  return { dispatched: ready.length, landed, failed, ...(throttledByMemory ? { throttledByMemory: true } : {}) }
}
