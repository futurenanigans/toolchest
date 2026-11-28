import * as crypto from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { type CheckRunOptions, type CheckRunReport, type CheckStepResult, runChecks } from './checks'
import type { TrestleConfig } from './config'
import type { BaselinePolicy, Contract } from './contract'
import type { BaselineReport } from './goal_types'
import { execCommand } from './platform'
import { readDiskState } from './state'
import { assertRevisionArg, linkWorktreeEnv } from './worktrees'

export interface GateEvaluation {
  effectivePassed: boolean
  newFailures: CheckStepResult[]
  baseRedUnchanged: CheckStepResult[]
  summary: string
}

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
    if (step.invalidReport) {
      newFailures.push(step)
      continue
    }
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

export async function resolveBaseRef(
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

export async function runBaselineChecks(
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
    await linkWorktreeEnv(repoRoot, basePath)
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

export async function verifyWorktree(
  repoRoot: string, worktreePath: string, revision: string,
  checkOpts: Omit<CheckRunOptions, 'worktreePath'>,
  baselineReport: BaselineReport | undefined, baselinePolicy: BaselinePolicy,
) {
  const paths = ['--', '.', ':!.env', ':!.env.local']
  const cwd = worktreePath
  const diff = await execCommand('git', ['diff', '--quiet', revision, ...paths], { cwd })
  const untracked = await execCommand('git', ['ls-files', '--others', '--exclude-standard', ...paths], { cwd })
  if (diff.exitCode > 1 || untracked.exitCode !== 0) throw new Error('Cannot inspect worktree changes')
  const changed = diff.exitCode === 1 || Boolean(untracked.stdout.trim())
  const rawReport = await runChecks({ ...checkOpts, worktreePath })
  let evalRes = evaluateGateAgainstBaseline(rawReport, baselineReport, baselinePolicy)
  if (baselineReport && evalRes.newFailures.length) {
    const repeated = await runBaselineChecks(repoRoot, revision, {
      ...checkOpts, onlySteps: new Set(evalRes.newFailures.map(step => step.name)),
    })
    const shared = evalRes.newFailures.filter(failure => {
      const base = repeated.report.results.find(step => step.name === failure.name && !step.passed)
      if (!base) return false
      if (failure.failedIds?.length) return failure.failedIds.some(id => base.failedIds?.includes(id))
      return digestFailures([failure]) === digestFailures([base])
    })
    if (shared.length && baselinePolicy === 'require-green') {
      return {
        blocked: true as const, baseline: repeated, report: rawReport,
        error: 'Failure reproduced on the base checkout: ' + shared.map(step => step.name).join(', '),
      }
    }
    if (shared.length) {
      for (const failure of shared) {
        const original = baselineReport.report.results.find(step => step.name === failure.name)
        const rerun = repeated.report.results.find(step => step.name === failure.name)!
        if (!original) continue
        const failedIds = rerun.failedIds && [...new Set([...(original.failedIds ?? []), ...rerun.failedIds])]
        Object.assign(original, rerun, { failedIds })
      }
      baselineReport.passed = false
      baselineReport.report.passed = false
      baselineReport.baseRedChecks = baselineReport.report.results.filter(step => !step.passed).map(step => step.name)
      baselineReport.report.summary = 'Base failures: ' + baselineReport.baseRedChecks.join(', ')
      evalRes = evaluateGateAgainstBaseline(rawReport, baselineReport, baselinePolicy)
    }
  }
  const emptyDiff = evalRes.effectivePassed && !changed
  if (emptyDiff) {
    evalRes.effectivePassed = false
    evalRes.summary = 'Verification passed but the worktree has no changes against the base commit'
  }
  return {
    blocked: false as const, emptyDiff, evaluation: evalRes,
    report: { passed: evalRes.effectivePassed, summary: evalRes.summary, results: rawReport.results },
  }
}
