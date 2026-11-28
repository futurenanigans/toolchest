import { z } from 'zod'

const cli = z.enum(['claude', 'codex', 'opencode', 'agy', 'pi'])
const effort = z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
const strings = z.array(z.string())
const dir = z.string().min(1)
const count = z.number().int().positive()
const durationMs = z.number().int().positive()
const limit = z.number().nonnegative()
const command = z.union([z.string(), strings])
const checks = z.array(z.strictObject({
  name: z.string(),
  command,
  args: strings.optional(),
  metricPattern: z.string().optional(),
  heavy: z.boolean().optional(),
  reportFormat: z.enum(['libtest-json', 'nextest-json', 'junit-xml', 'sarif']).optional(),
  reportPath: z.string().optional(),
}))
const criteria = z.array(z.strictObject({ id: z.string(), description: z.string() }))

const agentConfig = z.strictObject({
  command: command.optional(),
  defaultModel: z.string().optional(),
  defaultEffort: effort.optional(),
  maxTier: z.string().optional(),
  quota: z.strictObject({
    fiveHourMaxTokens: limit.optional(),
    fiveHourMaxCostUsd: limit.optional(),
    weeklyMaxTokens: limit.optional(),
    weeklyMaxCostUsd: limit.optional(),
    manualReenable: z.boolean().optional(),
  }).optional(),
  tiers: z.record(z.string(), z.union([
    z.string(), z.strictObject({ model: z.string(), effort: effort.optional() }),
  ])).optional(),
})

const config = z.strictObject({
  version: z.literal(1).optional(),
  defaultCli: cli.optional(),
  defaultTier: z.string().optional(),
  defaultEffort: effort.optional(),
  maxIterations: count.optional(),
  agents: z.partialRecord(cli, agentConfig).optional(),
  checks: z.strictObject({
    commands: checks.optional(),
    includeMortise: z.boolean().optional(),
    timeoutMs: durationMs.optional(),
    allowEmpty: z.boolean().optional(),
  }).optional(),
  escalation: z.strictObject({
    tiers: strings.optional(),
    stepAfterFailures: count.optional(),
    enabled: z.boolean().optional(),
    fallbackClis: z.array(cli).optional(),
  }).optional(),
  resources: z.strictObject({
    maxParallel: count.optional(),
    minFreeMemMb: limit.optional(),
    perAgentMaxMemMb: limit.optional(),
    partitionThreads: z.boolean().optional(),
  }).optional(),
})

function tool<S extends z.ZodObject>(description: string, schema: S) {
  return (handler: (args: z.output<S>) => unknown) => ({
    description,
    inputSchema: z.toJSONSchema(schema, { target: 'draft-7', io: 'input' }),
    call(raw: unknown) {
      const result = schema.safeParse(raw)
      if (!result.success) throw new Error('Invalid arguments: ' + z.prettifyError(result.error))
      return handler(result.data)
    },
  })
}

const goal = z.strictObject({
  repoRoot: dir,
  contractId: z.string(),
  cli,
  worktreeId: z.string(),
  worktreePath: dir,
  branch: z.string(),
  model: z.string().optional(),
  effort: effort.optional(),
  maxIterations: count.optional(),
  freshContextPerIteration: z.boolean().optional(),
})

export const define = {
  worktree_create: tool(
    'Create an isolated git worktree under .trestle-wt/<id> for an agent task.',
    z.strictObject({
      repoRoot: dir,
      id: z.string(),
      baseRef: z.string().optional(),
      detached: z.boolean().optional(),
    }),
  ),
  worktree_list: tool(
    'List tracked and git worktrees under .trestle-wt/ for a repository.',
    z.strictObject({ repoRoot: dir }),
  ),
  worktree_diff: tool(
    'Get changed files (committed + uncommitted), diff stat, and bounded patch for a worktree.',
    z.strictObject({
      repoRoot: dir,
      id: z.string(),
      baseRef: z.string().optional(),
      maxChars: count.optional(),
    }),
  ),
  worktree_land: tool(
    'Commit any pending worktree changes (excluding .env*) and merge its branch onto the target branch, or preview the diff and cleanliness first with preview: true. Runs no checks; files the agent committed itself, .env included, are merged.',
    z.strictObject({
      repoRoot: dir,
      id: z.string(),
      targetBranch: z.string().optional(),
      commitMessage: z.string().optional(),
      preview: z.boolean().optional(),
      maxDiffChars: count.optional(),
    }),
  ),
  worktree_clean: tool(
    'Stop any attached agent, force-remove a worktree (uncommitted work is discarded), delete its temporary branch unless deleteBranch is false, and clean session dirs.',
    z.strictObject({
      repoRoot: dir,
      id: z.string(),
      deleteBranch: z.boolean().optional(),
    }),
  ),
  agent_spawn: tool(
    'Spawn an external agent CLI (claude, codex, opencode, agy, pi) asynchronously in a directory under the repository’s .trestle-wt/.',
    z.strictObject({
      repoRoot: dir,
      id: z.string(),
      cli,
      stage: z.string(),
      worktreeId: z.string(),
      worktreePath: dir,
      branch: z.string(),
      prompt: z.string(),
      mode: z.enum(['read-only', 'writer']).optional(),
      model: z.string().optional(),
      effort: effort.optional(),
      resumeSessionId: z.string().optional(),
      persistSession: z.boolean().optional(),
      idleMs: durationMs.optional(),
      timeoutMs: durationMs.optional(),
    }),
  ),
  agent_wait: tool(
    'Wait for one or more spawned agents to finish (all or any) and return compact summaries.',
    z.strictObject({
      ids: strings,
      mode: z.enum(['all', 'any']).optional(),
      timeoutMs: durationMs.optional(),
    }),
  ),
  agent_steer: tool(
    'Send a live mid-turn steering message to a running agent.',
    z.strictObject({ id: z.string(), text: z.string() }),
  ),
  agent_tail: tool(
    'Get recent normalized activity lines and final message from an agent.',
    z.strictObject({ id: z.string(), lines: count.optional() }),
  ),
  agent_stop: tool(
    'Terminate a running agent process tree.',
    z.strictObject({ id: z.string() }),
  ),
  agent_list: tool(
    'List all tracked agents and their current status.',
    z.strictObject({}),
  ),
  check_run: tool(
    'Run verification checks (auto-detected tests, mortise, or explicit commands) sequentially in a worktree; a run with any heavy step holds a per-process mutex. Fails closed when 0 steps are detected unless allowEmpty=true.',
    z.strictObject({
      repoRoot: dir.optional(),
      worktreePath: dir,
      commands: checks.optional(),
      includeMortise: z.boolean().optional(),
      mutationSessionId: z.string().optional(),
      timeoutMs: durationMs.optional(),
      allowEmpty: z.boolean().optional(),
    }),
  ),
  experiment_log: tool(
    'Append a kept/discarded/failed hypothesis or draft outcome to ~/.trestle/<repo-key>/experiments.md.',
    z.strictObject({
      repoRoot: dir,
      id: z.string(),
      stage: z.string(),
      cli: z.string().optional(),
      hypothesis: z.string(),
      outcome: z.enum(['kept', 'continued', 'discarded', 'failed']),
      metric: z.string().optional(),
      reason: z.string(),
    }),
  ),
  experiment_read: tool(
    'Read recent entries from ~/.trestle/<repo-key>/experiments.md to avoid repeating dead ends.',
    z.strictObject({ repoRoot: dir, tailLines: count.optional() }),
  ),
  contract_create: tool(
    'Create a Default-FAIL goal contract with acceptance criteria and deterministic verification checks.',
    z.strictObject({
      repoRoot: dir,
      id: z.string(),
      title: z.string(),
      goal: z.string(),
      acceptanceCriteria: criteria,
      checks: checks.optional(),
      includeMortise: z.boolean().optional(),
      mutationSessionId: z.string().optional(),
      baseline: z.enum(['require-green', 'no-new-failures', 'skip']).optional(),
      maxIterations: count.optional(),
      freshContextPerIteration: z.boolean().optional(),
    }),
  ),
  contract_get: tool(
    'Read a persisted contract and its acceptance criteria status.',
    z.strictObject({ repoRoot: dir, id: z.string() }),
  ),
  contract_list: tool(
    'List all persisted contracts for a repository.',
    z.strictObject({ repoRoot: dir }),
  ),
  contract_update_criterion: tool(
    'Update pass/fail status and evidence for an individual acceptance criterion on a contract.',
    z.strictObject({
      repoRoot: dir,
      contractId: z.string(),
      criterionId: z.string(),
      passed: z.boolean(),
      evidence: z.string().optional(),
    }),
  ),
  goal_run: tool(
    'Run a blocking Ralph-style contract verification loop in an isolated worktree until checks pass or maxIterations is reached.',
    goal,
  ),
  goal_start: tool(
    'Start a non-blocking Ralph-style contract verification loop and immediately return a jobId.',
    goal,
  ),
  goal_status: tool(
    'Check status of an async goal job (or list all goal jobs when jobId is omitted).',
    z.strictObject({ jobId: z.string().optional() }),
  ),
  goal_cancel: tool(
    'Cancel a running async goal job and stop its active agent.',
    z.strictObject({ jobId: z.string() }),
  ),
  queue_add: tool(
    'Add a task to the repo-keyed persistent queue in ~/.trestle/<repo-key>/queue.json.',
    z.strictObject({
      repoRoot: dir,
      id: z.string(),
      title: z.string(),
      goal: z.string(),
      acceptanceCriteria: criteria,
      cli: cli.optional(),
      model: z.string().optional(),
      freshContextPerIteration: z.boolean().optional(),
      dependsOn: strings.optional(),
      priority: z.number().optional(),
      checks: checks.optional(),
      includeMortise: z.boolean().optional(),
      maxIterations: count.optional(),
    }),
  ),
  queue_list: tool(
    'List all queued, running, blocked, landed, and failed items for a repository.',
    z.strictObject({ repoRoot: dir }),
  ),
  queue_remove: tool(
    'Remove an item from the repository queue.',
    z.strictObject({ repoRoot: dir, id: z.string() }),
  ),
  queue_update: tool(
    'Update priority, cli, model, dependencies, or iteration settings for a queue item.',
    z.strictObject({
      repoRoot: dir,
      id: z.string(),
      priority: z.number().optional(),
      cli: cli.optional(),
      model: z.string().optional(),
      dependsOn: strings.optional(),
      maxIterations: count.optional(),
      freshContextPerIteration: z.boolean().optional(),
    }),
  ),
  queue_retry: tool(
    'Reset a failed or interrupted queue item back to queued and clean up its stale worktree.',
    z.strictObject({ repoRoot: dir, id: z.string() }),
  ),
  queue_clear: tool(
    'Prune queue items matching the given statuses (defaults to landed and failed).',
    z.strictObject({ repoRoot: dir, statuses: z.array(z.enum(['queued', 'running', 'blocked', 'landed', 'failed'])).optional() }),
  ),
  config_get: tool(
    'Read Trestle user config (~/.trestle/config.json), repo config, or merged effective config (user defaults + repo overrides for checks and agent tiers).',
    z.strictObject({
      repoRoot: dir.optional(),
      scope: z.enum(['effective', 'user', 'repo']).optional(),
      inRepo: z.boolean().optional(),
    }),
  ),
  config_set: tool(
    'Update Trestle user config (~/.trestle/config.json) or per-repo config (custom check steps, agent model tiers/defaults, command overrides).',
    z.strictObject({
      scope: z.enum(['user', 'repo']),
      repoRoot: dir.optional(),
      inRepo: z.boolean().optional(),
      replace: z.boolean().optional(),
      config,
    }),
  ),
  quota_status: tool(
    'Inspect rolling 5-hour and weekly token/cost usage and active usage-limit cooldowns across CLIs.',
    z.strictObject({ repoRoot: dir.optional(), cli: cli.optional() }),
  ),
  quota_clear_cooldown: tool(
    'Re-enable a disabled CLI or clear an active 5h/weekly usage-limit cooldown for one CLI (or all CLIs if omitted).',
    z.strictObject({ repoRoot: dir.optional(), cli: cli.optional() }),
  ),
  queue_run_next: tool(
    'Dispatch up to maxParallel ready queue items (all dependsOn landed) in parallel worktrees, then land passing items sequentially: each is merged into targetBranch (default: the branch checked out when its worktree was created) with no confirmation, and its worktree and branch are deleted.',
    z.strictObject({
      repoRoot: dir,
      maxParallel: count.optional(),
      targetBranch: z.string().optional(),
    }),
  ),
  blueprint_import: tool(
    'Parse a feature-architect Markdown blueprint and add dependency-wired queue items for its Build Sequence, all or none. Tasks sharing a Bundle range become one item; each item gets its contract (the returned contractId) when queue_run_next dispatches it.',
    z.strictObject({
      repoRoot: dir,
      prefix: z.string(),
      blueprintMarkdown: z.string(),
      cli: cli.optional(),
      model: z.string().optional(),
      effort: effort.optional(),
      checks: checks.optional(),
      maxIterations: count.optional(),
    }),
  ),
}
