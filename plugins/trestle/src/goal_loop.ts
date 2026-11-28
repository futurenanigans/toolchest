import * as crypto from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import type { AgentCli, AgentEffort, AgentFailureKind } from '../types'
import { type CheckRunOptions, type CheckRunReport, type CheckStepResult, runChecks } from './checks'
import { loadEffectiveConfig, resolveAgentConfig, resolveEscalationAgentConfig, type TrestleConfig } from './config'
import { type BaselinePolicy, type Contract, contractMarkAll, contractRead } from './contract'
import { execCommand, userHome, type CommandSpec } from './platform'
import { checkCliQuota, getActiveCooldownSummaries, recordCliUsage, recordUsageLimitCooldown } from './quota'
import { appendExperiment, readDiskState, readExperimentEntries, updateDiskState } from './state'
import { AgentSupervisor } from './supervisor'
import { assertRevisionArg } from './worktrees'

export interface BaselineReport {
  baseRef: string
  passed: boolean
  baseRedChecks: string[]
  report: CheckRunReport
}

export interface GoalLoopParams {
  repoRoot: string
  contractId: string
  cli: AgentCli
  worktreeId: string
  worktreePath: string
  branch: string
  baseRef?: string
  model?: string
  effort?: AgentEffort
  maxIterations?: number
  freshContextPerIteration?: boolean
  commandOverride?: CommandSpec
  homeDir?: string
  signal?: AbortSignal
  transientRetryDelayMs?: number
}

export interface GoalLoopResult {
  status: 'passed' | 'exhausted' | 'failed' | 'cancelled' | 'blocked' | 'stuck'
  contractId: string
  worktreeId: string
  iterations: number
  baseline?: BaselineReport
  lastReport?: CheckRunReport
  finalText?: string
  error?: string
  failureKind?: AgentFailureKind
}

export interface GateEvaluation {
  effectivePassed: boolean
  newFailures: CheckStepResult[]
  baseRedUnchanged: CheckStepResult[]
  summary: string
}

const MAX_TRANSIENT_RETRIES = 2

export function gateCheckOptions(contract: Contract, config: TrestleConfig): Omit<CheckRunOptions, 'worktreePath'> {
  return {
    commands: contract.checks && contract.checks.length > 0 ? contract.checks : config.checks?.commands,
    includeMortise: contract.includeMortise ?? config.checks?.includeMortise,
    mutationSessionId: contract.mutationSessionId,
    timeoutMs: config.checks?.timeoutMs,
    allowEmpty: config.checks?.allowEmpty,
  }
}

export function evaluateGateAgainstBaseline(
  report: CheckRunReport,
  baseline: BaselineReport | undefined,
  policy: BaselinePolicy,
): GateEvaluation {
  const newFailures: CheckStepResult[] = []
  const baseRedUnchanged: CheckStepResult[] = []

  for (const step of report.results) {
    if (step.passed) continue
    const baseStep = baseline?.report.results.find(b => b.name === step.name)

    if (policy === 'no-new-failures' && baseStep && !baseStep.passed) {
      if (step.failedIds !== undefined && baseStep.failedIds !== undefined) {
        const baseSet = new Set(baseStep.failedIds)
        const added = step.failedIds.filter(id => !baseSet.has(id))
        const failedOutsideTests = step.failedIds.length === 0 && baseStep.failedIds.length > 0
        if (failedOutsideTests) {
          newFailures.push({
            ...step,
            excerpt: `Failed with no failing test IDs while base failed only on tests (build or runner error)\n${step.excerpt}`.trim(),
          })
          continue
        }
        if (added.length === 0) {
          baseRedUnchanged.push(step)
          continue
        }
        newFailures.push({
          ...step,
          failedIds: added,
          excerpt: `New failure(s) beyond base: ${added.join(', ')}\n${step.excerpt}`.trim(),
        })
        continue
      }
      // Prose-only check without structured reportFormat: compared at check level
      baseRedUnchanged.push(step)
      continue
    }

    newFailures.push(step)
  }

  const effectivePassed = report.results.length === 0 ? report.passed : newFailures.length === 0
  let summary = report.summary
  if (effectivePassed && baseRedUnchanged.length > 0) {
    summary = `Passed (no new failures; ${baseRedUnchanged.length} pre-existing base-red check(s) unchanged: ${baseRedUnchanged.map(r => r.name).join(', ')})`
  } else if (!effectivePassed && newFailures.length > 0) {
    summary = `${newFailures.length}/${report.results.length} check(s) failed: ${newFailures.map(r => r.name).join(', ')}`
  }

  return { effectivePassed, newFailures, baseRedUnchanged, summary }
}

function normalizeExcerptForDigest(excerpt: string): string {
  return excerpt
    .replace(/\b\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?\b/g, '<ts>')
    .replace(/\[\s*\d+(?:\.\d+)?\s*(?:ms|s|m)\s*\]/gi, '[<dur>]')
    .replace(/\b\d+(?:\.\d+)?\s*(?:ms|secs?|seconds?|s)\b/gi, '<dur>')
    .replace(/\s+/g, ' ')
    .trim()
}

export function digestFailures(failures: readonly CheckStepResult[]): string {
  const payload = failures
    .map(r => `${r.name}|${r.exitCode}|${r.failedIds ? r.failedIds.join(',') : normalizeExcerptForDigest(r.excerpt)}`)
    .sort()
    .join('\n---\n')
  return crypto.createHash('sha256').update(payload).digest('hex')
}

async function resolveBaseRef(
  repoRoot: string,
  worktreeId: string,
  explicitBaseRef: string | undefined,
  homeDir: string,
): Promise<string> {
  if (explicitBaseRef) return assertRevisionArg(explicitBaseRef)
  const disk = await readDiskState(repoRoot, homeDir).catch(() => undefined)
  const tracked = disk?.worktrees[worktreeId]?.baseRef
  if (tracked) return tracked
  const res = await execCommand('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoRoot })
  if (res.exitCode === 0 && res.stdout.trim() && res.stdout.trim() !== 'HEAD') {
    return res.stdout.trim()
  }
  const sha = await execCommand('git', ['rev-parse', 'HEAD'], { cwd: repoRoot })
  return sha.stdout.trim() || 'HEAD'
}

async function runBaselineChecks(
  repoRoot: string,
  baseRef: string,
  checkOpts: Omit<CheckRunOptions, 'worktreePath'>,
): Promise<BaselineReport> {
  const baseId = `_base-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  const basePath = path.join(path.resolve(repoRoot), '.trestle-wt', baseId)
  await fs.mkdir(path.dirname(basePath), { recursive: true })

  const addRes = await execCommand('git', ['worktree', 'add', '--detach', basePath, baseRef], { cwd: repoRoot })
  if (addRes.exitCode !== 0) {
    throw new Error(`Failed to create baseline checkout for '${baseRef}': ${addRes.stderr.trim() || addRes.stdout.trim()}`)
  }

  try {
    const report = await runChecks({ ...checkOpts, worktreePath: basePath })
    const baseRedChecks = report.results.filter(r => !r.passed).map(r => r.name)
    return {
      baseRef,
      passed: report.passed,
      baseRedChecks,
      report,
    }
  } finally {
    const rmRes = await execCommand('git', ['worktree', 'remove', '--force', basePath], { cwd: repoRoot })
    if (rmRes.exitCode !== 0) {
      await fs.rm(basePath, { recursive: true, force: true }).catch(() => {})
      await execCommand('git', ['worktree', 'prune'], { cwd: repoRoot }).catch(() => {})
    }
  }
}

export function buildGoalPrompt(
  contract: Contract,
  iteration: number,
  maxIterations: number,
  deadEnds: string,
  lastFailureReport?: CheckRunReport,
  lastAgentError?: string,
  options: {
    baseRef?: string
    newFailures?: readonly CheckStepResult[]
    baseRedUnchanged?: readonly CheckStepResult[]
  } = {},
): string {
  const criteria = contract.acceptanceCriteria
    .map(c => `- [${c.passed ? 'x' : ' '}] (${c.id}) ${c.description}`)
    .join('\n')

  const sections = [
    `# Goal Contract: ${contract.title} (Iteration ${iteration}/${maxIterations})`,
    '',
    '## Objective',
    contract.goal,
    '',
    '## Definition of Done / Acceptance Criteria',
    criteria,
    '',
    '## Rules',
    '- Work directly in this repository checkout. Do not leave TODOs, stubs, or placeholders.',
    '- Prefer fast, targeted tests/checks while iterating; the harness will independently run the full contract verification suite after your turn.',
  ]

  if (iteration > 1) {
    sections.push(
      '',
      '## Current Worktree State (Continued Work)',
      `Changes from iteration ${iteration - 1} are still present in this worktree as continued work (not discarded). Inspect and build on them rather than starting over.`,
    )
  }

  if (deadEnds) {
    sections.push('', '## Known Dead Ends / Prior Attempts (Do Not Repeat)', deadEnds)
  }

  if (lastAgentError) {
    sections.push('', '## Previous Iteration Agent Error (Recover From This)', lastAgentError)
  }

  const baseRed = options.baseRedUnchanged ?? []
  if (baseRed.length > 0) {
    const refLabel = options.baseRef ?? 'base'
    const baseDetails = baseRed
      .map(r => {
        const ids = r.failedIds && r.failedIds.length > 0 ? `\nFailing tests on ${refLabel}: ${r.failedIds.join(', ')}` : ''
        return `### ${r.name} (exit ${r.exitCode})${ids}\n\`\`\`\n${r.excerpt}\n\`\`\``
      })
      .join('\n\n')
    sections.push(
      '',
      `## Failing on \`${refLabel}\` before your change; do not fix unless the objective says so`,
      baseDetails,
    )
  }

  const fixFailures =
    options.newFailures ??
    (lastFailureReport && !lastFailureReport.passed ? lastFailureReport.results.filter(r => !r.passed) : [])

  if (fixFailures.length > 0) {
    const failedDetails = fixFailures
      .map(r => `### ${r.name} (exit ${r.exitCode})\n\`\`\`\n${r.excerpt}\n\`\`\``)
      .join('\n\n')
    sections.push(
      '',
      '## Previous Iteration Verification Failures (Fix These)',
      lastFailureReport?.summary ?? `${fixFailures.length} check(s) failed`,
      failedDetails,
    )
  }

  return sections.join('\n')
}

/**
 * Executes a Ralph-style contract verification loop:
 * 1. Baselines the contract gate on a clean detached checkout of `baseRef` (unless `baseline: 'skip'`).
 *    - Under default `baseline: 'require-green'`, a base-red check ends the job `blocked` before spawning any agent.
 *    - Under `baseline: 'no-new-failures'`, base-red checks whose failing set did not grow do not fail iterations.
 * 2. Each iteration runs a producing agent in the isolated worktree, then independently runs
 *    deterministic checks (`runChecks`).
 * 3. Identical repeated failures end the job `stuck` without escalating to a higher model tier.
 */
export async function runGoalLoop(
  supervisor: AgentSupervisor,
  params: GoalLoopParams,
): Promise<GoalLoopResult> {
  const homeDir = params.homeDir ?? userHome()
  const { config } = await loadEffectiveConfig(params.repoRoot, homeDir)
  const contract = await contractRead(params.repoRoot, params.contractId, homeDir)
  const maxIterations = params.maxIterations ?? contract.maxIterations ?? config.maxIterations ?? 10
  const freshContext = params.freshContextPerIteration ?? contract.freshContextPerIteration
  const transientDelayMs = params.transientRetryDelayMs ?? 1_500
  const baselinePolicy: BaselinePolicy = contract.baseline ?? 'require-green'

  const checkOpts = gateCheckOptions(contract, config)

  let baselineReport: BaselineReport | undefined
  if (baselinePolicy !== 'skip') {
    const baseRef = await resolveBaseRef(params.repoRoot, params.worktreeId, params.baseRef, homeDir)
    baselineReport = await runBaselineChecks(params.repoRoot, baseRef, checkOpts)

    if (baselinePolicy === 'require-green' && !baselineReport.passed) {
      const baseSummary = {
        id: contract.id,
        title: contract.title,
        worktreeId: params.worktreeId,
        iteration: 0,
        maxIterations,
        baseRef,
        baseRedChecks: baselineReport.baseRedChecks,
        acceptanceCriteria: contract.acceptanceCriteria.map(c => ({
          id: c.id,
          description: c.description,
          passed: c.passed,
        })),
      }
      await updateDiskState(
        params.repoRoot,
        cur => ({
          ...cur,
          activeContract: baseSummary,
          contractsByWorktree: {
            ...(cur.contractsByWorktree ?? {}),
            [params.worktreeId]: baseSummary,
          },
        }),
        homeDir,
      )
      return {
        status: 'blocked',
        contractId: contract.id,
        worktreeId: params.worktreeId,
        iterations: 0,
        baseline: baselineReport,
        lastReport: baselineReport.report,
        error: `Base ref '${baseRef}' fails contract gate: ${baselineReport.baseRedChecks.join(', ') || baselineReport.report.summary}`,
      }
    }
  }

  let lastReport: CheckRunReport | undefined
  let lastNewFailures: CheckStepResult[] = []
  let lastBaseRedUnchanged: CheckStepResult[] =
    baselineReport && !baselineReport.passed ? baselineReport.report.results.filter(r => !r.passed) : []
  let lastAgentError: string | undefined
  let lastSessionId: string | undefined
  let finalText: string | undefined
  let escalationFailures = 0
  let lastFailureDigest: string | undefined
  let sameFailureStreak = 0
  const stuckThreshold = Math.max(2, config.escalation?.stepAfterFailures ?? 2)

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    if (params.signal?.aborted) {
      return {
        status: 'cancelled',
        contractId: contract.id,
        worktreeId: params.worktreeId,
        iterations: iteration - 1,
        baseline: baselineReport,
        lastReport,
        finalText,
        error: 'Goal loop cancelled',
      }
    }

    const contractSummary = {
      id: contract.id,
      title: contract.title,
      worktreeId: params.worktreeId,
      iteration,
      maxIterations,
      ...(baselineReport ? { baseRef: baselineReport.baseRef, baseRedChecks: baselineReport.baseRedChecks } : {}),
      acceptanceCriteria: contract.acceptanceCriteria.map(c => ({
        id: c.id,
        description: c.description,
        passed: c.passed,
      })),
    }

    await updateDiskState(
      params.repoRoot,
      cur => ({
        ...cur,
        activeContract: contractSummary,
        contractsByWorktree: {
          ...(cur.contractsByWorktree ?? {}),
          [params.worktreeId]: contractSummary,
        },
      }),
      homeDir,
    )

    // Exclude `[CONTINUED]` entries from dead-end history so prior work in the worktree isn't labeled a dead end
    const deadEnds = await readExperimentEntries(params.repoRoot, 10, homeDir, { excludeOutcomes: ['continued'] })
    const prompt = buildGoalPrompt(contract, iteration, maxIterations, deadEnds, lastReport, lastAgentError, {
      baseRef: baselineReport?.baseRef,
      newFailures: lastNewFailures,
      baseRedUnchanged: lastBaseRedUnchanged,
    })
    let iterAgent = resolveEscalationAgentConfig(config, params.cli, params.model, escalationFailures, params.effort)

    // Enforce rolling 5h/weekly quota & active cooldowns; fall back to fallbackClis if configured
    const primaryQuota = await checkCliQuota(iterAgent.cli, config.agents?.[iterAgent.cli]?.quota, homeDir)
    if (!primaryQuota.allowed) {
      const fallbacks = config.escalation?.fallbackClis ?? []
      let switched = false
      for (const fbCli of fallbacks) {
        if (fbCli === iterAgent.cli) continue
        const fbQuota = await checkCliQuota(fbCli, config.agents?.[fbCli]?.quota, homeDir)
        if (!fbQuota.allowed) continue
        const fbResolved = resolveAgentConfig(config, fbCli, iterAgent.tier ?? params.model, params.effort)
        iterAgent = {
          cli: fbCli,
          model: fbResolved.model,
          effort: fbResolved.effort,
          commandOverride: fbResolved.commandOverride,
          tier: fbResolved.resolvedFromTier,
          escalatedToFallbackCli: true,
        }
        switched = true
        break
      }
      if (!switched) {
        return {
          status: 'failed',
          contractId: contract.id,
          worktreeId: params.worktreeId,
          iterations: iteration - 1,
          baseline: baselineReport,
          lastReport,
          finalText,
          error: primaryQuota.reason ?? `${iterAgent.cli} quota cap reached`,
          failureKind: 'usage_limit',
        }
      }
    }

    const activeCli = iterAgent.cli
    const effectiveModel = iterAgent.model
    const effectiveEffort = iterAgent.effort
    const effectiveCommandOverride = params.commandOverride ?? iterAgent.commandOverride
    const stageLabel = iterAgent.tier
      ? `goal(${iteration}/${maxIterations} · ${iterAgent.tier})`
      : `goal(${iteration}/${maxIterations})`

    let waited: Awaited<ReturnType<AgentSupervisor['wait']>>[number] | undefined
    let spawnedId = ''

    for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
      if (params.signal?.aborted) {
        return {
          status: 'cancelled',
          contractId: contract.id,
          worktreeId: params.worktreeId,
          iterations: iteration - 1,
          baseline: baselineReport,
          lastReport,
          finalText,
          error: 'Goal loop cancelled',
        }
      }

      spawnedId = supervisor.allocateId(`${params.worktreeId}-i${iteration}`)
      const spawned = await supervisor.spawn({
        repoRoot: params.repoRoot,
        id: spawnedId,
        cli: activeCli,
        stage: stageLabel,
        worktreeId: params.worktreeId,
        worktreePath: params.worktreePath,
        branch: params.branch,
        prompt,
        mode: 'writer',
        model: effectiveModel,
        effort: effectiveEffort,
        resumeSessionId: freshContext ? undefined : lastSessionId,
        persistSession: !freshContext,
        commandOverride: effectiveCommandOverride,
        homeDir,
        resources: config.resources,
      })

      const onAbort = () => {
        void supervisor.stop(spawned.id)
      }
      params.signal?.addEventListener('abort', onAbort, { once: true })
      if (params.signal?.aborted) onAbort()
      try {
        const [res] = await supervisor.wait([spawned.id], { mode: 'all' })
        waited = res
      } finally {
        params.signal?.removeEventListener('abort', onAbort)
      }

      const tail = supervisor.tail(spawned.id, 10)
      finalText = tail.finalText
      lastSessionId = waited?.sessionId

      if (params.signal?.aborted) {
        return {
          status: 'cancelled',
          contractId: contract.id,
          worktreeId: params.worktreeId,
          iterations: iteration,
          baseline: baselineReport,
          lastReport,
          finalText,
          error: 'Goal loop cancelled',
        }
      }

      if (waited?.usage) {
        await recordCliUsage(activeCli, waited.usage, homeDir).catch(() => {})
      }

      if (waited?.status === 'failed' && waited.failureKind === 'transient' && attempt < MAX_TRANSIENT_RETRIES) {
        await new Promise(r => setTimeout(r, transientDelayMs * (attempt + 1)))
        continue
      }
      break
    }

    if (waited?.status === 'stopped') {
      return {
        status: 'cancelled',
        contractId: contract.id,
        worktreeId: params.worktreeId,
        iterations: iteration,
        baseline: baselineReport,
        lastReport,
        finalText,
        error: 'Agent stopped before verification',
      }
    }

    if (waited?.status === 'failed') {
      escalationFailures += 1
      lastAgentError = waited.error ?? 'Agent failed before verification'
      await appendExperiment(
        params.repoRoot,
        {
          id: `${contract.id}-${spawnedId}`,
          stage: 'goal-loop',
          cli: activeCli,
          hypothesis: `Iteration ${iteration} of ${contract.title}`,
          outcome: 'failed',
          reason: lastAgentError,
        },
        homeDir,
      )

      if (waited.failureKind === 'usage_limit') {
        const manualReenable = config.agents?.[activeCli]?.quota?.manualReenable === true
        await recordUsageLimitCooldown(activeCli, lastAgentError, homeDir, Date.now(), manualReenable).catch(() => {})
        const disabledClis = await getActiveCooldownSummaries(homeDir).catch(() => [])
        await updateDiskState(params.repoRoot, cur => ({ ...cur, disabledClis }), homeDir).catch(() => {})
        const hasFallback = (config.escalation?.fallbackClis ?? []).some(fb => fb !== activeCli)
        if (hasFallback && iteration < maxIterations) {
          continue
        }
        return {
          status: 'failed',
          contractId: contract.id,
          worktreeId: params.worktreeId,
          iterations: iteration,
          baseline: baselineReport,
          lastReport,
          finalText,
          error: lastAgentError,
          failureKind: waited.failureKind,
        }
      }

      if (waited.failureKind === 'login_failed' || iteration === maxIterations) {
        return {
          status: 'failed',
          contractId: contract.id,
          worktreeId: params.worktreeId,
          iterations: iteration,
          baseline: baselineReport,
          lastReport,
          finalText,
          error: lastAgentError,
          failureKind: waited.failureKind,
        }
      }
      continue
    }

    lastAgentError = undefined
    const rawReport = await runChecks({ ...checkOpts, worktreePath: params.worktreePath })
    const evalRes = evaluateGateAgainstBaseline(rawReport, baselineReport, baselinePolicy)
    lastReport = {
      passed: evalRes.effectivePassed,
      summary: evalRes.summary,
      results: rawReport.results,
    }
    lastNewFailures = evalRes.newFailures
    lastBaseRedUnchanged = evalRes.baseRedUnchanged

    const checkSummary = {
      worktreeId: params.worktreeId,
      worktreePath: params.worktreePath,
      passed: lastReport.passed,
      summary: lastReport.summary,
      timestamp: Date.now(),
      results: lastReport.results.map(r => ({
        name: r.name,
        passed: r.passed,
        durationMs: r.durationMs,
        ...(r.excerpt ? { excerpt: r.excerpt.slice(0, 400) } : {}),
        ...(r.metric ? { metric: r.metric } : {}),
      })),
    }

    await updateDiskState(
      params.repoRoot,
      cur => ({
        ...cur,
        lastCheck: checkSummary,
        checksByWorktree: {
          ...(cur.checksByWorktree ?? {}),
          [params.worktreeId]: checkSummary,
        },
      }),
      homeDir,
    )

    if (lastReport.passed) {
      const updatedContract = await contractMarkAll(params.repoRoot, contract.id, true, lastReport.summary, homeDir)
      const passedSummary = {
        id: updatedContract.id,
        title: updatedContract.title,
        worktreeId: params.worktreeId,
        iteration,
        maxIterations,
        ...(baselineReport ? { baseRef: baselineReport.baseRef, baseRedChecks: baselineReport.baseRedChecks } : {}),
        acceptanceCriteria: updatedContract.acceptanceCriteria.map(c => ({
          id: c.id,
          description: c.description,
          passed: c.passed,
        })),
      }
      await updateDiskState(
        params.repoRoot,
        cur => ({
          ...cur,
          activeContract: passedSummary,
          contractsByWorktree: {
            ...(cur.contractsByWorktree ?? {}),
            [params.worktreeId]: passedSummary,
          },
        }),
        homeDir,
      )
      const metrics = lastReport.results
        .filter(r => r.metric)
        .map(r => `${r.name}=${r.metric}`)
        .join(', ')
      await appendExperiment(
        params.repoRoot,
        {
          id: `${contract.id}-${spawnedId}`,
          stage: 'goal-loop',
          cli: activeCli,
          hypothesis: `Iteration ${iteration} of ${contract.title}`,
          outcome: 'kept',
          ...(metrics ? { metric: metrics } : {}),
          reason: lastReport.summary,
        },
        homeDir,
      )
      return {
        status: 'passed',
        contractId: contract.id,
        worktreeId: params.worktreeId,
        iterations: iteration,
        baseline: baselineReport,
        lastReport,
        finalText,
      }
    }

    // Track repeated identical failures -> stop as `stuck` without escalating to a higher model tier
    const failureDigest = digestFailures(evalRes.newFailures.length > 0 ? evalRes.newFailures : rawReport.results.filter(r => !r.passed))
    if (failureDigest === lastFailureDigest) {
      sameFailureStreak += 1
    } else {
      lastFailureDigest = failureDigest
      sameFailureStreak = 1
      escalationFailures += 1
    }

    // Worktree edits are kept for the next iteration -> log as `continued`, NOT `[DISCARDED]`
    await appendExperiment(
      params.repoRoot,
      {
        id: `${contract.id}-${spawnedId}`,
        stage: 'goal-loop',
        cli: activeCli,
        hypothesis: `Iteration ${iteration} of ${contract.title}`,
        outcome: 'continued',
        reason: lastReport.summary,
      },
      homeDir,
    )

    if (sameFailureStreak >= stuckThreshold) {
      const repeatedNames = (evalRes.newFailures.length > 0 ? evalRes.newFailures : rawReport.results.filter(r => !r.passed))
        .map(r => r.name)
        .join(', ')
      return {
        status: 'stuck',
        contractId: contract.id,
        worktreeId: params.worktreeId,
        iterations: iteration,
        baseline: baselineReport,
        lastReport,
        finalText,
        error: `Stuck: repeated identical failure (${sameFailureStreak}x) in ${repeatedNames}`,
      }
    }
  }

  return {
    status: 'exhausted',
    contractId: contract.id,
    worktreeId: params.worktreeId,
    iterations: maxIterations,
    baseline: baselineReport,
    lastReport,
    finalText,
  }
}

export interface GoalJobSnapshot {
  jobId: string
  contractId: string
  worktreeId: string
  cli: AgentCli
  status: 'running' | 'passed' | 'exhausted' | 'failed' | 'cancelled' | 'blocked' | 'stuck'
  startedAt: number
  finishedAt?: number
  baseline?: BaselineReport
  result?: GoalLoopResult
  error?: string
}

/**
 * Manages asynchronous (non-blocking) `goal_start` / `goal_status` / `goal_cancel` jobs
 * so long-running loops do not hit MCP client tool timeouts.
 */
export class GoalJobManager {
  private readonly jobs = new Map<
    string,
    { snapshot: GoalJobSnapshot; controller: AbortController; promise: Promise<void> }
  >()
  private seq = 0

  start(supervisor: AgentSupervisor, params: GoalLoopParams): GoalJobSnapshot {
    this.seq += 1
    const jobId = `goal-${params.worktreeId}-${this.seq}`
    const controller = new AbortController()
    const snapshot: GoalJobSnapshot = {
      jobId,
      contractId: params.contractId,
      worktreeId: params.worktreeId,
      cli: params.cli,
      status: 'running',
      startedAt: Date.now(),
    }

    const promise = runGoalLoop(supervisor, { ...params, signal: controller.signal })
      .then(result => {
        snapshot.status = result.status
        snapshot.result = result
        snapshot.baseline = result.baseline
        snapshot.finishedAt = Date.now()
        if (result.error) snapshot.error = result.error
      })
      .catch(err => {
        snapshot.status = 'failed'
        snapshot.error = (err as Error).message
        snapshot.finishedAt = Date.now()
      })

    this.jobs.set(jobId, { snapshot, controller, promise })
    return { ...snapshot }
  }

  get(jobId: string): GoalJobSnapshot {
    const job = this.jobs.get(jobId)
    if (!job) throw new Error(`Unknown goal job: ${jobId}`)
    return { ...job.snapshot }
  }

  list(): GoalJobSnapshot[] {
    return Array.from(this.jobs.values()).map(j => ({ ...j.snapshot }))
  }

  cancel(jobId: string): GoalJobSnapshot {
    const job = this.jobs.get(jobId)
    if (!job) throw new Error(`Unknown goal job: ${jobId}`)
    job.controller.abort()
    if (job.snapshot.status === 'running') {
      job.snapshot.status = 'cancelled'
      job.snapshot.finishedAt = Date.now()
    }
    return { ...job.snapshot }
  }

  cancelAll(): void {
    for (const job of this.jobs.values()) {
      job.controller.abort()
    }
  }
}
