import * as path from 'node:path'
import type { AgentCli } from '../types'
import { importBlueprint } from './blueprint'
import { runChecks } from './checks'
import {
  loadEffectiveConfig,
  readRepoConfig,
  readUserConfig,
  resolveAgentConfig,
  writeRepoConfig,
  writeUserConfig,
} from './config'
import { contractCreate, contractList, contractRead, contractUpdateCriterion } from './contract'
import { GoalJobManager, runGoalLoop } from './goal_loop'
import { define } from './mcp_tools'
import { canonicalRepoRoot } from './platform'
import {
  queueAdd,
  queueClear,
  queueList,
  queueReconcile,
  queueRemove,
  queueRetry,
  queueRunNext,
  queueUpdate,
} from './queue'
import { checkCliQuota, clearQuotaCooldown, getActiveCooldownSummaries } from './quota'
import { appendExperiment, readExperiments, updateDiskState } from './state'
import { AgentSupervisor } from './supervisor'
import { resolveAgentWorktree, worktreeClean, worktreeCreate, worktreeDiff, worktreeLand, worktreeLandPreview, worktreeList } from './worktrees'

const supervisor = new AgentSupervisor()
const goalJobs = new GoalJobManager()
const reconciledRepos = new Set<string>()

async function reconcileRepo(repoRoot: string): Promise<void> {
  if (!reconciledRepos.has(repoRoot)) {
    reconciledRepos.add(repoRoot)
    await supervisor.reconcileDiskState(repoRoot).catch(() => {})
    await queueReconcile(repoRoot).catch(() => {})
  }
}

async function ensureRepoReconciled(rawRepoRoot: string): Promise<string> {
  const repoRoot = await canonicalRepoRoot(rawRepoRoot)
  await reconcileRepo(repoRoot)
  return repoRoot
}

function inferWorktreeId(worktreePath: string): string | undefined {
  const parts = path.resolve(worktreePath).split(path.sep)
  const idx = parts.lastIndexOf('.trestle-wt')
  if (idx > 0 && idx + 1 < parts.length) return parts[idx + 1]
  return undefined
}

function inferRepoRoot(worktreePath: string): string {
  const parts = path.resolve(worktreePath).split(path.sep)
  const idx = parts.lastIndexOf('.trestle-wt')
  if (idx > 0) return parts.slice(0, idx).join(path.sep)
  return path.resolve(worktreePath)
}

const handlers = {
  worktree_create: define.worktree_create(async args => {
    const repoRoot = await ensureRepoReconciled(args.repoRoot)
    return worktreeCreate(repoRoot, args.id, {
      baseRef: args.baseRef,
      detached: args.detached,
    })
  }),
  worktree_list: define.worktree_list(async args => {
    const repoRoot = await ensureRepoReconciled(args.repoRoot)
    return worktreeList(repoRoot)
  }),
  worktree_diff: define.worktree_diff(async args => {
    const repoRoot = await ensureRepoReconciled(args.repoRoot)
    return worktreeDiff(repoRoot, args.id, {
      baseRef: args.baseRef,
      maxChars: args.maxChars,
    })
  }),
  worktree_land: define.worktree_land(async args => {
    const repoRoot = await ensureRepoReconciled(args.repoRoot)
    if (args.preview) {
      return worktreeLandPreview(repoRoot, args.id, {
        targetBranch: args.targetBranch,
        maxDiffChars: args.maxDiffChars,
      })
    }
    return worktreeLand(repoRoot, args.id, {
      targetBranch: args.targetBranch,
      commitMessage: args.commitMessage,
    })
  }),
  worktree_clean: define.worktree_clean(async args => {
    const repoRoot = await ensureRepoReconciled(args.repoRoot)
    await worktreeClean(repoRoot, args.id, {
      deleteBranch: args.deleteBranch,
      supervisor,
    })
    return { cleaned: true }
  }),
  agent_spawn: define.agent_spawn(async args => {
    const repoRoot = await canonicalRepoRoot(args.repoRoot)
    const worktreePath = await resolveAgentWorktree(repoRoot, args.worktreePath)
    await reconcileRepo(repoRoot)
    const { config } = await loadEffectiveConfig(repoRoot)
    const cli = args.cli
    const resolved = resolveAgentConfig(
      config,
      cli,
      args.model,
      args.effort,
    )
    return supervisor.spawn({
      repoRoot,
      id: args.id,
      cli,
      stage: args.stage,
      worktreeId: args.worktreeId,
      worktreePath,
      branch: args.branch,
      prompt: args.prompt,
      mode: args.mode,
      model: resolved.model,
      effort: resolved.effort,
      commandOverride: resolved.commandOverride,
      resumeSessionId: args.resumeSessionId,
      persistSession: args.persistSession,
      idleMs: args.idleMs,
      timeoutMs: args.timeoutMs,
      resources: config.resources,
    })
  }),
  agent_wait: define.agent_wait(async args => {
    return supervisor.wait(args.ids, {
      mode: args.mode,
      timeoutMs: args.timeoutMs,
    })
  }),
  agent_steer: define.agent_steer(async args => {
    return supervisor.steer(args.id, args.text)
  }),
  agent_tail: define.agent_tail(async args => {
    return supervisor.tail(args.id, args.lines)
  }),
  agent_stop: define.agent_stop(async args => {
    await supervisor.stop(args.id)
    return { stopped: true }
  }),
  agent_list: define.agent_list(async () => {
    return supervisor.list()
  }),
  check_run: define.check_run(async args => {
    const wtPath = path.resolve(args.worktreePath)
    const repoRoot = await ensureRepoReconciled(args.repoRoot ?? inferRepoRoot(wtPath))
    const { config } = await loadEffectiveConfig(repoRoot)
    const explicitCmds = args.commands
    const report = await runChecks({
      worktreePath: wtPath,
      commands: explicitCmds && explicitCmds.length > 0 ? explicitCmds : config.checks?.commands,
      includeMortise: args.includeMortise ?? config.checks?.includeMortise,
      mutationSessionId: args.mutationSessionId,
      timeoutMs: args.timeoutMs ?? config.checks?.timeoutMs,
      allowEmpty: args.allowEmpty ?? config.checks?.allowEmpty,
    })
    const wtId = inferWorktreeId(wtPath) ?? 'main'
    const checkSummary = {
      worktreeId: wtId,
      worktreePath: wtPath,
      passed: report.passed,
      summary: report.summary,
      timestamp: Date.now(),
      results: report.results.map(r => ({
        name: r.name,
        passed: r.passed,
        durationMs: r.durationMs,
        ...(r.excerpt ? { excerpt: r.excerpt.slice(0, 400) } : {}),
        ...(r.metric ? { metric: r.metric } : {}),
      })),
    }
    await updateDiskState(repoRoot, cur => ({
      ...cur,
      lastCheck: checkSummary,
      checksByWorktree: {
        ...(cur.checksByWorktree ?? {}),
        [wtId]: checkSummary,
      },
    })).catch(() => {})
    return report
  }),
  experiment_log: define.experiment_log(async args => {
    const repoRoot = await ensureRepoReconciled(args.repoRoot)
    return {
      path: await appendExperiment(repoRoot, {
        id: args.id,
        stage: args.stage,
        cli: args.cli,
        hypothesis: args.hypothesis,
        outcome: args.outcome,
        metric: args.metric,
        reason: args.reason,
      }),
    }
  }),
  experiment_read: define.experiment_read(async args => {
    const repoRoot = await ensureRepoReconciled(args.repoRoot)
    return {
      content: await readExperiments(repoRoot, args.tailLines),
    }
  }),
  contract_create: define.contract_create(async args => {
    const repoRoot = await ensureRepoReconciled(args.repoRoot)
    return contractCreate(repoRoot, {
      id: args.id,
      title: args.title,
      goal: args.goal,
      acceptanceCriteria: args.acceptanceCriteria,
      checks: args.checks,
      includeMortise: args.includeMortise,
      mutationSessionId: args.mutationSessionId,
      baseline: args.baseline,
      maxIterations: args.maxIterations,
      freshContextPerIteration: args.freshContextPerIteration,
    })
  }),
  contract_get: define.contract_get(async args => {
    const repoRoot = await ensureRepoReconciled(args.repoRoot)
    return contractRead(repoRoot, args.id)
  }),
  contract_list: define.contract_list(async args => {
    const repoRoot = await ensureRepoReconciled(args.repoRoot)
    return contractList(repoRoot)
  }),
  contract_update_criterion: define.contract_update_criterion(async args => {
    const repoRoot = await ensureRepoReconciled(args.repoRoot)
    return contractUpdateCriterion(
      repoRoot,
      args.contractId,
      args.criterionId,
      args.passed,
      args.evidence,
    )
  }),
  goal_run: define.goal_run(async args => {
    const repoRoot = await ensureRepoReconciled(args.repoRoot)
    return runGoalLoop(supervisor, {
      repoRoot,
      contractId: args.contractId,
      cli: args.cli,
      worktreeId: args.worktreeId,
      worktreePath: path.resolve(args.worktreePath),
      branch: args.branch,
      model: args.model,
      effort: args.effort,
      maxIterations: args.maxIterations,
      freshContextPerIteration: args.freshContextPerIteration,
    })
  }),
  goal_start: define.goal_start(async args => {
    const repoRoot = await ensureRepoReconciled(args.repoRoot)
    return goalJobs.start(supervisor, {
      repoRoot,
      contractId: args.contractId,
      cli: args.cli,
      worktreeId: args.worktreeId,
      worktreePath: path.resolve(args.worktreePath),
      branch: args.branch,
      model: args.model,
      effort: args.effort,
      maxIterations: args.maxIterations,
      freshContextPerIteration: args.freshContextPerIteration,
    })
  }),
  goal_status: define.goal_status(async args => {
    const jobId = args.jobId
    return jobId ? goalJobs.get(jobId) : goalJobs.list()
  }),
  goal_cancel: define.goal_cancel(async args => {
    return goalJobs.cancel(args.jobId)
  }),
  queue_add: define.queue_add(async args => {
    const repoRoot = await ensureRepoReconciled(args.repoRoot)
    return queueAdd(repoRoot, {
      id: args.id,
      title: args.title,
      goal: args.goal,
      acceptanceCriteria: args.acceptanceCriteria,
      cli: args.cli,
      model: args.model,
      freshContextPerIteration: args.freshContextPerIteration,
      dependsOn: args.dependsOn,
      priority: args.priority,
      checks: args.checks,
      includeMortise: args.includeMortise,
      maxIterations: args.maxIterations,
    })
  }),
  queue_list: define.queue_list(async args => {
    const repoRoot = await ensureRepoReconciled(args.repoRoot)
    return queueList(repoRoot)
  }),
  queue_remove: define.queue_remove(async args => {
    const repoRoot = await ensureRepoReconciled(args.repoRoot)
    return { removed: await queueRemove(repoRoot, args.id) }
  }),
  queue_update: define.queue_update(async args => {
    const repoRoot = await ensureRepoReconciled(args.repoRoot)
    return queueUpdate(repoRoot, args.id, {
      priority: args.priority,
      cli: args.cli,
      model: args.model,
      dependsOn: args.dependsOn,
      maxIterations: args.maxIterations,
      freshContextPerIteration: args.freshContextPerIteration,
    })
  }),
  queue_retry: define.queue_retry(async args => {
    const repoRoot = await ensureRepoReconciled(args.repoRoot)
    return queueRetry(repoRoot, args.id, { supervisor })
  }),
  queue_clear: define.queue_clear(async args => {
    const repoRoot = await ensureRepoReconciled(args.repoRoot)
    return queueClear(repoRoot, args.statuses)
  }),
  config_get: define.config_get(async args => {
    const scope = args.scope ?? 'effective'
    const rawRepo = args.repoRoot
    const repoRoot = rawRepo ? await ensureRepoReconciled(rawRepo) : undefined
    if (scope === 'user') return readUserConfig()
    if (scope === 'repo') {
      if (!repoRoot) throw new Error('repoRoot is required when scope is "repo"')
      return readRepoConfig(repoRoot, { inRepo: args.inRepo })
    }
    return loadEffectiveConfig(repoRoot)
  }),
  config_set: define.config_set(async args => {
    const scope = args.scope
    const patch = args.config
    const replace = args.replace
    if (scope === 'user') {
      return writeUserConfig(patch, { replace })
    }
    const rawRepo = args.repoRoot
    if (!rawRepo) throw new Error('repoRoot is required when scope is "repo"')
    const repoRoot = await ensureRepoReconciled(rawRepo)
    return writeRepoConfig(repoRoot, patch, {
      replace,
      inRepo: args.inRepo,
    })
  }),
  quota_status: define.quota_status(async args => {
    const rawRepo = args.repoRoot
    const repoRoot = rawRepo ? await ensureRepoReconciled(rawRepo) : undefined
    const { config } = await loadEffectiveConfig(repoRoot)
    const targetClis: AgentCli[] = args.cli
      ? [args.cli]
      : ['claude', 'codex', 'opencode', 'agy', 'pi']
    return Promise.all(targetClis.map(cli => checkCliQuota(cli, config.agents?.[cli]?.quota)))
  }),
  quota_clear_cooldown: define.quota_clear_cooldown(async args => {
    await clearQuotaCooldown(args.cli)
    const rawRepo = args.repoRoot
    if (rawRepo) {
      const repoRoot = await ensureRepoReconciled(rawRepo)
      const disabledClis = await getActiveCooldownSummaries().catch(() => [])
      await updateDiskState(repoRoot, cur => ({ ...cur, disabledClis })).catch(() => {})
    }
    return { cleared: true, cli: args.cli ?? 'all' }
  }),
  queue_run_next: define.queue_run_next(async args => {
    const repoRoot = await ensureRepoReconciled(args.repoRoot)
    return queueRunNext(supervisor, repoRoot, {
      maxParallel: args.maxParallel,
      targetBranch: args.targetBranch,
    })
  }),
  blueprint_import: define.blueprint_import(async args => {
    const repoRoot = await ensureRepoReconciled(args.repoRoot)
    return importBlueprint(repoRoot, {
      prefix: args.prefix,
      blueprintMarkdown: args.blueprintMarkdown,
      cli: args.cli,
      model: args.model,
      effort: args.effort,
      checks: args.checks,
      maxIterations: args.maxIterations,
    })
  }),
}

const registry = new Map(Object.entries(handlers))
export const TOOLS = Array.from(registry, ([name, { description, inputSchema }]) => ({ name, description, inputSchema }))

export async function handleToolCall(name: unknown, raw: unknown = {}): Promise<unknown> {
  if (typeof name !== 'string') throw new Error('Tool name must be a string')
  const handler = registry.get(name)
  if (!handler) throw new Error(`Unknown tool: ${name}`)
  return handler.call(raw)
}

export async function stopToolJobs(): Promise<void> {
  goalJobs.cancelAll()
  await supervisor.stopAll().catch(() => {})
}
