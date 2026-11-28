import type { CheckRunReport } from './checks'
import type { Contract } from './contract'
import type { BaselineReport, GoalLoopParams } from './goal_types'
import { updateDiskState } from './state'

export async function recordContractProgress(
  params: GoalLoopParams, homeDir: string, contract: Contract,
  iteration: number, maxIterations: number, baselineReport?: BaselineReport,
) {
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
}

export async function recordCheckProgress(params: GoalLoopParams, homeDir: string, lastReport: CheckRunReport) {
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
}
