import type { CheckRunReport, CheckStepResult } from './checks'
import { loadEffectiveConfig } from './config'
import { contractMarkAll, contractRead, type BaselinePolicy } from './contract'
import { digestFailures, gateCheckOptions, resolveBaseRef, runBaselineChecks, verifyWorktree } from './goal_gate'
import { runProducer } from './goal_producer'
import { recordCheckProgress, recordContractProgress } from './goal_progress'
import { buildGoalPrompt } from './goal_prompt'
import type { BaselineReport, GoalLoopParams, GoalLoopResult } from './goal_types'
import { execCommand, userHome } from './platform'
import { getActiveCooldownSummaries, recordUsageLimitCooldown } from './quota'
import { appendExperiment, readExperimentEntries, updateDiskState } from './state'
import type { AgentSupervisor } from './supervisor'

export async function runGoalLoop(
  supervisor: AgentSupervisor,
  params: GoalLoopParams,
): Promise<GoalLoopResult> {
  const homeDir = params.homeDir ?? userHome()
  const { config } = await loadEffectiveConfig(params.repoRoot, homeDir)
  const contract = await contractRead(params.repoRoot, params.contractId, homeDir)
  const maxIterations = params.maxIterations ?? contract.maxIterations ?? config.maxIterations ?? 10
  const freshContext = params.freshContextPerIteration ?? contract.freshContextPerIteration
  const baselinePolicy: BaselinePolicy = contract.baseline ?? 'require-green'

  const checkOpts = gateCheckOptions(contract, config)

  let baselineReport: BaselineReport | undefined
  const baseRef = await resolveBaseRef(params.repoRoot, params.worktreeId, params.baseRef, homeDir)
  const baseCommit = await execCommand('git', ['rev-parse', '--verify', baseRef + '^{commit}'], { cwd: params.repoRoot })
  if (baseCommit.exitCode !== 0) throw new Error('Cannot resolve base commit: ' + baseRef)
  const revision = baseCommit.stdout.trim()
  if (baselinePolicy !== 'skip') {
    baselineReport = await runBaselineChecks(params.repoRoot, revision, checkOpts)
    baselineReport.baseRef = baseRef

    if (baselinePolicy === 'require-green' && !baselineReport.passed) {
      await recordContractProgress(params, homeDir, contract, 0, maxIterations, baselineReport)
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

  function progress(iterations: number) {
    return { contractId: contract.id, worktreeId: params.worktreeId, iterations, baseline: baselineReport, lastReport }
  }

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    if (params.signal?.aborted) {
      return {
        status: 'cancelled',
        ...progress(iteration - 1),
        finalText,
        error: 'Goal loop cancelled',
      }
    }

    await recordContractProgress(params, homeDir, contract, iteration, maxIterations, baselineReport)

    const deadEnds = await readExperimentEntries(params.repoRoot, 10, homeDir, { excludeOutcomes: ['continued'] })
    const prompt = buildGoalPrompt(contract, iteration, maxIterations, deadEnds, lastReport, lastAgentError, {
      baseRef: baselineReport?.baseRef,
      newFailures: lastNewFailures,
      baseRedUnchanged: lastBaseRedUnchanged,
    })
    const producer = await runProducer(supervisor, params, config, {
      prompt, iteration, maxIterations, escalationFailures, homeDir, freshContext, lastSessionId, finalText,
    })
    if (producer.status !== 'finished') {
      return { ...progress(producer.iterations), ...producer }
    }
    const { activeCli, waited, spawnedId } = producer
    finalText = producer.finalText
    lastSessionId = producer.lastSessionId

    if (waited?.status === 'stopped') {
      return {
        status: 'cancelled',
        ...progress(iteration),
        finalText,
        error: 'Agent stopped before verification',
      }
    }

    const experiment = {
      id: `${contract.id}-${spawnedId}`,
      stage: 'goal-loop',
      cli: activeCli,
      hypothesis: `Iteration ${iteration} of ${contract.title}`,
    }
    if (waited?.status === 'failed') {
      escalationFailures += 1
      lastAgentError = waited.error ?? 'Agent failed before verification'
      await appendExperiment(
        params.repoRoot,
        {
          ...experiment,
          outcome: 'failed',
          reason: lastAgentError,
        },
        homeDir,
      )

      if (waited.failureKind === 'usage_limit') {
        const manualReenable = config.agents?.[activeCli]?.quota?.manualReenable === true
        await recordUsageLimitCooldown(activeCli, lastAgentError, homeDir, Date.now(), manualReenable, waited.resetAt).catch(() => {})
        const disabledClis = await getActiveCooldownSummaries(homeDir).catch(() => [])
        await updateDiskState(params.repoRoot, cur => ({ ...cur, disabledClis }), homeDir).catch(() => {})
        const hasFallback = (config.escalation?.fallbackClis ?? []).some(fb => fb !== activeCli)
        if (hasFallback && iteration < maxIterations) {
          continue
        }
      }

      if (waited.failureKind === 'usage_limit' || waited.failureKind === 'login_failed' || iteration === maxIterations) {
        return {
          status: 'failed',
          ...progress(iteration),
          finalText,
          error: lastAgentError,
          failureKind: waited.failureKind,
        }
      }
      continue
    }

    lastAgentError = undefined
    const verification = await verifyWorktree(params.repoRoot, params.worktreePath, revision, checkOpts, baselineReport, baselinePolicy)
    if (verification.blocked) {
      return {
        status: 'blocked', contractId: contract.id, worktreeId: params.worktreeId, iterations: iteration,
        baseline: verification.baseline, lastReport: verification.report, error: verification.error,
      }
    }
    const { emptyDiff, evaluation: evalRes } = verification
    lastReport = verification.report
    lastNewFailures = evalRes.newFailures
    lastBaseRedUnchanged = evalRes.baseRedUnchanged

    await recordCheckProgress(params, homeDir, lastReport)

    if (emptyDiff) {
      await contractMarkAll(params.repoRoot, contract.id, false, lastReport.summary, homeDir)
      return {
        status: 'failed',
        ...progress(iteration),
        error: lastReport.summary,
      }
    }

    if (lastReport.passed) {
      const updatedContract = await contractMarkAll(params.repoRoot, contract.id, true, lastReport.summary, homeDir)
      await recordContractProgress(params, homeDir, updatedContract, iteration, maxIterations, baselineReport)
      const metrics = lastReport.results
        .filter(r => r.metric)
        .map(r => `${r.name}=${r.metric}`)
        .join(', ')
      await appendExperiment(
        params.repoRoot,
        {
          ...experiment,
          outcome: 'kept',
          ...(metrics ? { metric: metrics } : {}),
          reason: lastReport.summary,
        },
        homeDir,
      )
      return {
        status: 'passed',
        ...progress(iteration),
        finalText,
      }
    }

    const failures = evalRes.newFailures.length > 0 ? evalRes.newFailures : lastReport.results.filter(r => !r.passed)
    const failureDigest = digestFailures(failures)
    if (failureDigest === lastFailureDigest) {
      sameFailureStreak += 1
    } else {
      lastFailureDigest = failureDigest
      sameFailureStreak = 1
      escalationFailures += 1
    }

    await appendExperiment(
      params.repoRoot,
      {
        ...experiment,
        outcome: 'continued',
        reason: lastReport.summary,
      },
      homeDir,
    )

    if (sameFailureStreak >= stuckThreshold) {
      const repeatedNames = failures
        .map(r => r.name)
        .join(', ')
      return {
        status: 'stuck',
        ...progress(iteration),
        finalText,
        error: `Stuck: repeated identical failure (${sameFailureStreak}x) in ${repeatedNames}`,
      }
    }
  }

  return {
    status: 'exhausted',
    ...progress(maxIterations),
    finalText,
  }
}
