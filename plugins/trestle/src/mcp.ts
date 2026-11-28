import * as path from 'node:path'
import * as readline from 'node:readline'

import type { AgentCli, AgentEffort, QueueItemStatus } from '../types'
import type { AgentPermissionMode } from './adapters'
import { type CheckCommandSpec, runChecks } from './checks'
import {
  loadEffectiveConfig,
  readRepoConfig,
  readUserConfig,
  resolveAgentConfig,
  type TrestleConfig,
  writeRepoConfig,
  writeUserConfig,
} from './config'
import { contractCreate, contractList, contractRead, contractUpdateCriterion } from './contract'
import { GoalJobManager, runGoalLoop } from './goal_loop'
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
import { worktreeClean, worktreeCreate, worktreeDiff, worktreeLand, worktreeList } from './worktrees'

const supervisor = new AgentSupervisor()
const goalJobs = new GoalJobManager()
const reconciledRepos = new Set<string>()

async function ensureRepoReconciled(rawRepoRoot: string): Promise<string> {
  const repoRoot = await canonicalRepoRoot(rawRepoRoot)
  if (!reconciledRepos.has(repoRoot)) {
    reconciledRepos.add(repoRoot)
    await supervisor.reconcileDiskState(repoRoot).catch(() => {})
    await queueReconcile(repoRoot).catch(() => {})
  }
  return repoRoot
}

interface ToolDef {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

const CHECK_COMMAND_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    command: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
    args: { type: 'array', items: { type: 'string' } },
    metricPattern: { type: 'string' },
    heavy: { type: 'boolean' },
    reportFormat: { type: 'string', enum: ['libtest-json', 'nextest-json', 'junit-xml'] },
    reportPath: { type: 'string' },
  },
  required: ['name', 'command'],
}

const TOOLS: ToolDef[] = [
  {
    name: 'worktree_create',
    description: 'Create an isolated git worktree under .trestle-wt/<id> for an agent task.',
    inputSchema: {
      type: 'object',
      properties: {
        repoRoot: { type: 'string' },
        id: { type: 'string' },
        baseRef: { type: 'string' },
        detached: { type: 'boolean' },
      },
      required: ['repoRoot', 'id'],
    },
  },
  {
    name: 'worktree_list',
    description: 'List tracked and git worktrees under .trestle-wt/ for a repository.',
    inputSchema: {
      type: 'object',
      properties: {
        repoRoot: { type: 'string' },
      },
      required: ['repoRoot'],
    },
  },
  {
    name: 'worktree_diff',
    description: 'Get changed files (committed + uncommitted), diff stat, and bounded patch for a worktree.',
    inputSchema: {
      type: 'object',
      properties: {
        repoRoot: { type: 'string' },
        id: { type: 'string' },
        baseRef: { type: 'string' },
        maxChars: { type: 'number' },
      },
      required: ['repoRoot', 'id'],
    },
  },
  {
    name: 'worktree_land',
    description: 'Commit any pending worktree changes (excluding .env*) and merge its branch onto the target branch. Runs no checks; files the agent committed itself, .env included, are merged.',
    inputSchema: {
      type: 'object',
      properties: {
        repoRoot: { type: 'string' },
        id: { type: 'string' },
        targetBranch: { type: 'string' },
        commitMessage: { type: 'string' },
      },
      required: ['repoRoot', 'id'],
    },
  },
  {
    name: 'worktree_clean',
    description: 'Stop any attached agent, force-remove a worktree (uncommitted work is discarded), delete its temporary branch unless deleteBranch is false, and clean session dirs.',
    inputSchema: {
      type: 'object',
      properties: {
        repoRoot: { type: 'string' },
        id: { type: 'string' },
        deleteBranch: { type: 'boolean' },
      },
      required: ['repoRoot', 'id'],
    },
  },
  {
    name: 'agent_spawn',
    description: 'Spawn an external agent CLI (claude, codex, opencode, agy, pi) asynchronously in a worktree.',
    inputSchema: {
      type: 'object',
      properties: {
        repoRoot: { type: 'string' },
        id: { type: 'string' },
        cli: { type: 'string', enum: ['claude', 'codex', 'opencode', 'agy', 'pi'] },
        stage: { type: 'string' },
        worktreeId: { type: 'string' },
        worktreePath: { type: 'string' },
        branch: { type: 'string' },
        prompt: { type: 'string' },
        mode: { type: 'string', enum: ['read-only', 'writer'] },
        model: { type: 'string' },
        effort: { type: 'string', enum: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] },
        resumeSessionId: { type: 'string' },
        persistSession: { type: 'boolean' },
        idleMs: { type: 'number' },
        timeoutMs: { type: 'number' },
      },
      required: ['repoRoot', 'id', 'cli', 'stage', 'worktreeId', 'worktreePath', 'branch', 'prompt'],
    },
  },
  {
    name: 'agent_wait',
    description: 'Wait for one or more spawned agents to finish (all or any) and return compact summaries.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' } },
        mode: { type: 'string', enum: ['all', 'any'] },
        timeoutMs: { type: 'number' },
      },
      required: ['ids'],
    },
  },
  {
    name: 'agent_steer',
    description: 'Send a live mid-turn steering message to a running agent.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        text: { type: 'string' },
      },
      required: ['id', 'text'],
    },
  },
  {
    name: 'agent_tail',
    description: 'Get recent normalized activity lines and final message from an agent.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        lines: { type: 'number' },
      },
      required: ['id'],
    },
  },
  {
    name: 'agent_stop',
    description: 'Terminate a running agent process tree.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'agent_list',
    description: 'List all tracked agents and their current status.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'check_run',
    description: 'Run verification checks (auto-detected tests, mortise, or explicit commands) sequentially in a worktree; a run with any heavy step holds a per-process mutex. Fails closed when 0 steps are detected unless allowEmpty=true.',
    inputSchema: {
      type: 'object',
      properties: {
        repoRoot: { type: 'string' },
        worktreePath: { type: 'string' },
        commands: { type: 'array', items: CHECK_COMMAND_ITEM_SCHEMA },
        includeMortise: { type: 'boolean' },
        mutationSessionId: { type: 'string' },
        timeoutMs: { type: 'number' },
        allowEmpty: { type: 'boolean' },
      },
      required: ['worktreePath'],
    },
  },
  {
    name: 'experiment_log',
    description: 'Append a kept/discarded/failed hypothesis or draft outcome to ~/.trestle/<repo-key>/experiments.md.',
    inputSchema: {
      type: 'object',
      properties: {
        repoRoot: { type: 'string' },
        id: { type: 'string' },
        stage: { type: 'string' },
        cli: { type: 'string' },
        hypothesis: { type: 'string' },
        outcome: { type: 'string', enum: ['kept', 'continued', 'discarded', 'failed'] },
        metric: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['repoRoot', 'id', 'stage', 'hypothesis', 'outcome', 'reason'],
    },
  },
  {
    name: 'experiment_read',
    description: 'Read recent entries from ~/.trestle/<repo-key>/experiments.md to avoid repeating dead ends.',
    inputSchema: {
      type: 'object',
      properties: {
        repoRoot: { type: 'string' },
        tailLines: { type: 'number' },
      },
      required: ['repoRoot'],
    },
  },
  {
    name: 'contract_create',
    description: 'Create a Default-FAIL goal contract with acceptance criteria and deterministic verification checks.',
    inputSchema: {
      type: 'object',
      properties: {
        repoRoot: { type: 'string' },
        id: { type: 'string' },
        title: { type: 'string' },
        goal: { type: 'string' },
        acceptanceCriteria: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'string' }, description: { type: 'string' } },
            required: ['id', 'description'],
          },
        },
        checks: { type: 'array', items: CHECK_COMMAND_ITEM_SCHEMA },
        includeMortise: { type: 'boolean' },
        mutationSessionId: { type: 'string' },
        baseline: { type: 'string', enum: ['require-green', 'no-new-failures', 'skip'] },
        maxIterations: { type: 'number' },
        freshContextPerIteration: { type: 'boolean' },
      },
      required: ['repoRoot', 'id', 'title', 'goal', 'acceptanceCriteria'],
    },
  },
  {
    name: 'contract_get',
    description: 'Read a persisted contract and its acceptance criteria status.',
    inputSchema: {
      type: 'object',
      properties: {
        repoRoot: { type: 'string' },
        id: { type: 'string' },
      },
      required: ['repoRoot', 'id'],
    },
  },
  {
    name: 'contract_list',
    description: 'List all persisted contracts for a repository.',
    inputSchema: {
      type: 'object',
      properties: { repoRoot: { type: 'string' } },
      required: ['repoRoot'],
    },
  },
  {
    name: 'contract_update_criterion',
    description: 'Update pass/fail status and evidence for an individual acceptance criterion on a contract.',
    inputSchema: {
      type: 'object',
      properties: {
        repoRoot: { type: 'string' },
        contractId: { type: 'string' },
        criterionId: { type: 'string' },
        passed: { type: 'boolean' },
        evidence: { type: 'string' },
      },
      required: ['repoRoot', 'contractId', 'criterionId', 'passed'],
    },
  },
  {
    name: 'goal_run',
    description: 'Run a blocking Ralph-style contract verification loop in an isolated worktree until checks pass or maxIterations is reached.',
    inputSchema: {
      type: 'object',
      properties: {
        repoRoot: { type: 'string' },
        contractId: { type: 'string' },
        cli: { type: 'string', enum: ['claude', 'codex', 'opencode', 'agy', 'pi'] },
        worktreeId: { type: 'string' },
        worktreePath: { type: 'string' },
        branch: { type: 'string' },
        model: { type: 'string' },
        effort: { type: 'string', enum: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] },
        maxIterations: { type: 'number' },
        freshContextPerIteration: { type: 'boolean' },
      },
      required: ['repoRoot', 'contractId', 'cli', 'worktreeId', 'worktreePath', 'branch'],
    },
  },
  {
    name: 'goal_start',
    description: 'Start a non-blocking Ralph-style contract verification loop and immediately return a jobId.',
    inputSchema: {
      type: 'object',
      properties: {
        repoRoot: { type: 'string' },
        contractId: { type: 'string' },
        cli: { type: 'string', enum: ['claude', 'codex', 'opencode', 'agy', 'pi'] },
        worktreeId: { type: 'string' },
        worktreePath: { type: 'string' },
        branch: { type: 'string' },
        model: { type: 'string' },
        effort: { type: 'string', enum: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] },
        maxIterations: { type: 'number' },
        freshContextPerIteration: { type: 'boolean' },
      },
      required: ['repoRoot', 'contractId', 'cli', 'worktreeId', 'worktreePath', 'branch'],
    },
  },
  {
    name: 'goal_status',
    description: 'Check status of an async goal job (or list all goal jobs when jobId is omitted).',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
      },
    },
  },
  {
    name: 'goal_cancel',
    description: 'Cancel a running async goal job and stop its active agent.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
      },
      required: ['jobId'],
    },
  },
  {
    name: 'queue_add',
    description: 'Add a task to the repo-keyed persistent queue in ~/.trestle/<repo-key>/queue.json.',
    inputSchema: {
      type: 'object',
      properties: {
        repoRoot: { type: 'string' },
        id: { type: 'string' },
        title: { type: 'string' },
        goal: { type: 'string' },
        acceptanceCriteria: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'string' }, description: { type: 'string' } },
            required: ['id', 'description'],
          },
        },
        cli: { type: 'string', enum: ['claude', 'codex', 'opencode', 'agy', 'pi'] },
        model: { type: 'string' },
        freshContextPerIteration: { type: 'boolean' },
        dependsOn: { type: 'array', items: { type: 'string' } },
        priority: { type: 'number' },
        checks: { type: 'array', items: CHECK_COMMAND_ITEM_SCHEMA },
        includeMortise: { type: 'boolean' },
        maxIterations: { type: 'number' },
      },
      required: ['repoRoot', 'id', 'title', 'goal', 'acceptanceCriteria'],
    },
  },
  {
    name: 'queue_list',
    description: 'List all queued, running, blocked, landed, and failed items for a repository.',
    inputSchema: {
      type: 'object',
      properties: { repoRoot: { type: 'string' } },
      required: ['repoRoot'],
    },
  },
  {
    name: 'queue_remove',
    description: 'Remove an item from the repository queue.',
    inputSchema: {
      type: 'object',
      properties: { repoRoot: { type: 'string' }, id: { type: 'string' } },
      required: ['repoRoot', 'id'],
    },
  },
  {
    name: 'queue_update',
    description: 'Update priority, cli, model, dependencies, or iteration settings for a queue item.',
    inputSchema: {
      type: 'object',
      properties: {
        repoRoot: { type: 'string' },
        id: { type: 'string' },
        priority: { type: 'number' },
        cli: { type: 'string', enum: ['claude', 'codex', 'opencode', 'agy', 'pi'] },
        model: { type: 'string' },
        dependsOn: { type: 'array', items: { type: 'string' } },
        maxIterations: { type: 'number' },
        freshContextPerIteration: { type: 'boolean' },
      },
      required: ['repoRoot', 'id'],
    },
  },
  {
    name: 'queue_retry',
    description: 'Reset a failed or interrupted queue item back to queued and clean up its stale worktree.',
    inputSchema: {
      type: 'object',
      properties: { repoRoot: { type: 'string' }, id: { type: 'string' } },
      required: ['repoRoot', 'id'],
    },
  },
  {
    name: 'queue_clear',
    description: 'Prune queue items matching the given statuses (defaults to landed and failed).',
    inputSchema: {
      type: 'object',
      properties: {
        repoRoot: { type: 'string' },
        statuses: {
          type: 'array',
          items: { type: 'string', enum: ['queued', 'running', 'blocked', 'landed', 'failed'] },
        },
      },
      required: ['repoRoot'],
    },
  },
  {
    name: 'config_get',
    description: 'Read Trestle user config (~/.trestle/config.json), repo config, or merged effective config (user defaults + repo overrides for checks and agent tiers).',
    inputSchema: {
      type: 'object',
      properties: {
        repoRoot: { type: 'string' },
        scope: { type: 'string', enum: ['effective', 'user', 'repo'] },
        inRepo: { type: 'boolean' },
      },
    },
  },
  {
    name: 'config_set',
    description: 'Update Trestle user config (~/.trestle/config.json) or per-repo config (custom check steps, agent model tiers/defaults, command overrides).',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['user', 'repo'] },
        repoRoot: { type: 'string' },
        inRepo: { type: 'boolean' },
        replace: { type: 'boolean' },
        config: { type: 'object' },
      },
      required: ['scope', 'config'],
    },
  },
  {
    name: 'quota_status',
    description: 'Inspect rolling 5-hour and weekly token/cost usage and active usage-limit cooldowns across CLIs.',
    inputSchema: {
      type: 'object',
      properties: {
        repoRoot: { type: 'string' },
        cli: { type: 'string', enum: ['claude', 'codex', 'opencode', 'agy', 'pi'] },
      },
    },
  },
  {
    name: 'quota_clear_cooldown',
    description: 'Re-enable a disabled CLI or clear an active 5h/weekly usage-limit cooldown for one CLI (or all CLIs if omitted).',
    inputSchema: {
      type: 'object',
      properties: {
        repoRoot: { type: 'string' },
        cli: { type: 'string', enum: ['claude', 'codex', 'opencode', 'agy', 'pi'] },
      },
    },
  },
  {
    name: 'queue_run_next',
    description: 'Dispatch up to maxParallel ready queue items (all dependsOn landed) in parallel worktrees, then land passing items sequentially: each is merged into targetBranch (default: the branch checked out when its worktree was created) with no confirmation, and its worktree and branch are deleted.',
    inputSchema: {
      type: 'object',
      properties: {
        repoRoot: { type: 'string' },
        maxParallel: { type: 'number' },
        targetBranch: { type: 'string' },
      },
      required: ['repoRoot'],
    },
  },
]

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

async function handleToolCall(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'worktree_create': {
      const repoRoot = await ensureRepoReconciled(args.repoRoot as string)
      return worktreeCreate(repoRoot, args.id as string, {
        baseRef: args.baseRef as string | undefined,
        detached: args.detached as boolean | undefined,
      })
    }
    case 'worktree_list': {
      const repoRoot = await ensureRepoReconciled(args.repoRoot as string)
      return worktreeList(repoRoot)
    }
    case 'worktree_diff': {
      const repoRoot = await ensureRepoReconciled(args.repoRoot as string)
      return worktreeDiff(repoRoot, args.id as string, {
        baseRef: args.baseRef as string | undefined,
        maxChars: args.maxChars as number | undefined,
      })
    }
    case 'worktree_land': {
      const repoRoot = await ensureRepoReconciled(args.repoRoot as string)
      return worktreeLand(repoRoot, args.id as string, {
        targetBranch: args.targetBranch as string | undefined,
        commitMessage: args.commitMessage as string | undefined,
      })
    }
    case 'worktree_clean': {
      const repoRoot = await ensureRepoReconciled(args.repoRoot as string)
      await worktreeClean(repoRoot, args.id as string, {
        deleteBranch: args.deleteBranch as boolean | undefined,
        supervisor,
      })
      return { cleaned: true }
    }
    case 'agent_spawn': {
      const repoRoot = await ensureRepoReconciled(args.repoRoot as string)
      const { config } = await loadEffectiveConfig(repoRoot)
      const cli = args.cli as AgentCli
      const resolved = resolveAgentConfig(
        config,
        cli,
        args.model as string | undefined,
        args.effort as AgentEffort | undefined,
      )
      return supervisor.spawn({
        repoRoot,
        id: args.id as string,
        cli,
        stage: args.stage as string,
        worktreeId: args.worktreeId as string,
        worktreePath: path.resolve(args.worktreePath as string),
        branch: args.branch as string,
        prompt: args.prompt as string,
        mode: args.mode as AgentPermissionMode | undefined,
        model: resolved.model,
        effort: resolved.effort,
        commandOverride: resolved.commandOverride,
        resumeSessionId: args.resumeSessionId as string | undefined,
        persistSession: args.persistSession as boolean | undefined,
        idleMs: args.idleMs as number | undefined,
        timeoutMs: args.timeoutMs as number | undefined,
        resources: config.resources,
      })
    }
    case 'agent_wait':
      return supervisor.wait(args.ids as string[], {
        mode: args.mode as 'all' | 'any' | undefined,
        timeoutMs: args.timeoutMs as number | undefined,
      })
    case 'agent_steer':
      return supervisor.steer(args.id as string, args.text as string)
    case 'agent_tail':
      return supervisor.tail(args.id as string, args.lines as number | undefined)
    case 'agent_stop':
      await supervisor.stop(args.id as string)
      return { stopped: true }
    case 'agent_list':
      return supervisor.list()
    case 'check_run': {
      const wtPath = path.resolve(args.worktreePath as string)
      const repoRoot = await ensureRepoReconciled((args.repoRoot as string | undefined) ?? inferRepoRoot(wtPath))
      const { config } = await loadEffectiveConfig(repoRoot)
      const explicitCmds = args.commands as CheckCommandSpec[] | undefined
      const report = await runChecks({
        worktreePath: wtPath,
        commands: explicitCmds && explicitCmds.length > 0 ? explicitCmds : config.checks?.commands,
        includeMortise: (args.includeMortise as boolean | undefined) ?? config.checks?.includeMortise,
        mutationSessionId: args.mutationSessionId as string | undefined,
        timeoutMs: (args.timeoutMs as number | undefined) ?? config.checks?.timeoutMs,
        allowEmpty: (args.allowEmpty as boolean | undefined) ?? config.checks?.allowEmpty,
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
    }
    case 'experiment_log': {
      const repoRoot = await ensureRepoReconciled(args.repoRoot as string)
      return {
        path: await appendExperiment(repoRoot, {
          id: args.id as string,
          stage: args.stage as string,
          cli: args.cli as string | undefined,
          hypothesis: args.hypothesis as string,
          outcome: args.outcome as 'kept' | 'continued' | 'discarded' | 'failed',
          metric: args.metric as string | undefined,
          reason: args.reason as string,
        }),
      }
    }
    case 'experiment_read': {
      const repoRoot = await ensureRepoReconciled(args.repoRoot as string)
      return {
        content: await readExperiments(repoRoot, args.tailLines as number | undefined),
      }
    }
    case 'contract_create': {
      const repoRoot = await ensureRepoReconciled(args.repoRoot as string)
      return contractCreate(repoRoot, {
        id: args.id as string,
        title: args.title as string,
        goal: args.goal as string,
        acceptanceCriteria: args.acceptanceCriteria as Array<{ id: string; description: string }>,
        checks: args.checks as CheckCommandSpec[] | undefined,
        includeMortise: args.includeMortise as boolean | undefined,
        mutationSessionId: args.mutationSessionId as string | undefined,
        baseline: args.baseline as 'require-green' | 'no-new-failures' | 'skip' | undefined,
        maxIterations: args.maxIterations as number | undefined,
        freshContextPerIteration: args.freshContextPerIteration as boolean | undefined,
      })
    }
    case 'contract_get': {
      const repoRoot = await ensureRepoReconciled(args.repoRoot as string)
      return contractRead(repoRoot, args.id as string)
    }
    case 'contract_list': {
      const repoRoot = await ensureRepoReconciled(args.repoRoot as string)
      return contractList(repoRoot)
    }
    case 'contract_update_criterion': {
      const repoRoot = await ensureRepoReconciled(args.repoRoot as string)
      return contractUpdateCriterion(
        repoRoot,
        args.contractId as string,
        args.criterionId as string,
        args.passed as boolean,
        args.evidence as string | undefined,
      )
    }
    case 'goal_run': {
      const repoRoot = await ensureRepoReconciled(args.repoRoot as string)
      return runGoalLoop(supervisor, {
        repoRoot,
        contractId: args.contractId as string,
        cli: args.cli as AgentCli,
        worktreeId: args.worktreeId as string,
        worktreePath: path.resolve(args.worktreePath as string),
        branch: args.branch as string,
        model: args.model as string | undefined,
        effort: args.effort as AgentEffort | undefined,
        maxIterations: args.maxIterations as number | undefined,
        freshContextPerIteration: args.freshContextPerIteration as boolean | undefined,
      })
    }
    case 'goal_start': {
      const repoRoot = await ensureRepoReconciled(args.repoRoot as string)
      return goalJobs.start(supervisor, {
        repoRoot,
        contractId: args.contractId as string,
        cli: args.cli as AgentCli,
        worktreeId: args.worktreeId as string,
        worktreePath: path.resolve(args.worktreePath as string),
        branch: args.branch as string,
        model: args.model as string | undefined,
        effort: args.effort as AgentEffort | undefined,
        maxIterations: args.maxIterations as number | undefined,
        freshContextPerIteration: args.freshContextPerIteration as boolean | undefined,
      })
    }
    case 'goal_status': {
      const jobId = args.jobId as string | undefined
      return jobId ? goalJobs.get(jobId) : goalJobs.list()
    }
    case 'goal_cancel':
      return goalJobs.cancel(args.jobId as string)
    case 'queue_add': {
      const repoRoot = await ensureRepoReconciled(args.repoRoot as string)
      return queueAdd(repoRoot, {
        id: args.id as string,
        title: args.title as string,
        goal: args.goal as string,
        acceptanceCriteria: args.acceptanceCriteria as Array<{ id: string; description: string }>,
        cli: args.cli as AgentCli | undefined,
        model: args.model as string | undefined,
        freshContextPerIteration: args.freshContextPerIteration as boolean | undefined,
        dependsOn: args.dependsOn as string[] | undefined,
        priority: args.priority as number | undefined,
        checks: args.checks as CheckCommandSpec[] | undefined,
        includeMortise: args.includeMortise as boolean | undefined,
        maxIterations: args.maxIterations as number | undefined,
      })
    }
    case 'queue_list': {
      const repoRoot = await ensureRepoReconciled(args.repoRoot as string)
      return queueList(repoRoot)
    }
    case 'queue_remove': {
      const repoRoot = await ensureRepoReconciled(args.repoRoot as string)
      return { removed: await queueRemove(repoRoot, args.id as string) }
    }
    case 'queue_update': {
      const repoRoot = await ensureRepoReconciled(args.repoRoot as string)
      return queueUpdate(repoRoot, args.id as string, {
        priority: args.priority as number | undefined,
        cli: args.cli as AgentCli | undefined,
        model: args.model as string | undefined,
        dependsOn: args.dependsOn as string[] | undefined,
        maxIterations: args.maxIterations as number | undefined,
        freshContextPerIteration: args.freshContextPerIteration as boolean | undefined,
      })
    }
    case 'queue_retry': {
      const repoRoot = await ensureRepoReconciled(args.repoRoot as string)
      return queueRetry(repoRoot, args.id as string, { supervisor })
    }
    case 'queue_clear': {
      const repoRoot = await ensureRepoReconciled(args.repoRoot as string)
      return queueClear(repoRoot, args.statuses as QueueItemStatus[] | undefined)
    }
    case 'config_get': {
      const scope = (args.scope as 'effective' | 'user' | 'repo' | undefined) ?? 'effective'
      const rawRepo = args.repoRoot as string | undefined
      const repoRoot = rawRepo ? await ensureRepoReconciled(rawRepo) : undefined
      if (scope === 'user') return readUserConfig()
      if (scope === 'repo') {
        if (!repoRoot) throw new Error('repoRoot is required when scope is "repo"')
        return readRepoConfig(repoRoot, { inRepo: args.inRepo as boolean | undefined })
      }
      return loadEffectiveConfig(repoRoot)
    }
    case 'config_set': {
      const scope = args.scope as 'user' | 'repo'
      const patch = args.config as TrestleConfig
      const replace = args.replace as boolean | undefined
      if (scope === 'user') {
        return writeUserConfig(patch, { replace })
      }
      const rawRepo = args.repoRoot as string | undefined
      if (!rawRepo) throw new Error('repoRoot is required when scope is "repo"')
      const repoRoot = await ensureRepoReconciled(rawRepo)
      return writeRepoConfig(repoRoot, patch, {
        replace,
        inRepo: args.inRepo as boolean | undefined,
      })
    }
    case 'quota_status': {
      const rawRepo = args.repoRoot as string | undefined
      const repoRoot = rawRepo ? await ensureRepoReconciled(rawRepo) : undefined
      const { config } = await loadEffectiveConfig(repoRoot)
      const targetClis: AgentCli[] = args.cli
        ? [args.cli as AgentCli]
        : ['claude', 'codex', 'opencode', 'agy', 'pi']
      return Promise.all(targetClis.map(cli => checkCliQuota(cli, config.agents?.[cli]?.quota)))
    }
    case 'quota_clear_cooldown': {
      await clearQuotaCooldown(args.cli as AgentCli | undefined)
      const rawRepo = args.repoRoot as string | undefined
      if (rawRepo) {
        const repoRoot = await ensureRepoReconciled(rawRepo)
        const disabledClis = await getActiveCooldownSummaries().catch(() => [])
        await updateDiskState(repoRoot, cur => ({ ...cur, disabledClis })).catch(() => {})
      }
      return { cleared: true, cli: (args.cli as AgentCli | undefined) ?? 'all' }
    }
    case 'queue_run_next': {
      const repoRoot = await ensureRepoReconciled(args.repoRoot as string)
      return queueRunNext(supervisor, repoRoot, {
        maxParallel: args.maxParallel as number | undefined,
        targetBranch: args.targetBranch as string | undefined,
      })
    }
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

function send(msg: unknown): void {
  process.stdout.write(`${JSON.stringify(msg)}\n`)
}

let shuttingDown = false
async function shutdown(exitCode?: number): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  goalJobs.cancelAll()
  await supervisor.stopAll().catch(() => {})
  if (exitCode !== undefined) process.exit(exitCode)
}

if (import.meta.main) {
  process.on('SIGINT', () => {
    void shutdown(0)
  })
  process.on('SIGTERM', () => {
    void shutdown(0)
  })

  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
  rl.on('close', () => {
    void shutdown(0)
  })
  rl.on('line', async line => {
    const trimmed = line.trim()
    if (!trimmed) return
    let req: { id?: unknown; method?: string; params?: Record<string, unknown> }
    try {
      req = JSON.parse(trimmed)
    } catch {
      return
    }

    const { id, method, params } = req
    if (id === undefined) return

    try {
      if (method === 'initialize') {
        send({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'trestle', version: '0.1.0' },
          },
        })
      } else if (method === 'ping') {
        send({ jsonrpc: '2.0', id, result: {} })
      } else if (method === 'tools/list') {
        send({ jsonrpc: '2.0', id, result: { tools: TOOLS } })
      } else if (method === 'tools/call') {
        const toolName = params?.name as string
        const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>
        const result = await handleToolCall(toolName, toolArgs)
        send({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          },
        })
      } else {
        send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } })
      }
    } catch (err) {
      send({
        jsonrpc: '2.0',
        id,
        result: {
          isError: true,
          content: [{ type: 'text', text: (err as Error).message }],
        },
      })
    }
  })
}
