import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import { junitDocument, junitFailureIds } from './junit'
import { Mutex } from './locks'
import { execCommand, type CommandSpec } from './platform'

export type CheckReportFormat = 'libtest-json' | 'nextest-json' | 'junit-xml' | 'sarif'

export interface CheckCommandSpec {
  name: string
  command: CommandSpec
  args?: string[]
  metricPattern?: string
  heavy?: boolean
  reportFormat?: CheckReportFormat
  reportPath?: string
}

export interface CheckStepResult {
  name: string
  passed: boolean
  exitCode: number
  durationMs: number
  excerpt: string
  metric?: string
  invalidReport?: boolean
  failedIds?: string[]
}

export interface CheckRunReport {
  passed: boolean
  summary: string
  results: CheckStepResult[]
}

export interface CheckRunOptions {
  worktreePath: string
  commands?: CheckCommandSpec[]
  includeMortise?: boolean
  mutationSessionId?: string
  timeoutMs?: number
  onlySteps?: ReadonlySet<string>
  allowEmpty?: boolean
}

const MAX_EXCERPT_CHARS = 16_000
const EXCERPT_HEAD_CHARS = 6_000
const EXCERPT_TAIL_CHARS = 10_000

const checkMutex = new Mutex()

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function detectNodeTestStep(worktreePath: string): Promise<CheckCommandSpec | undefined> {
  const pkgPath = path.join(worktreePath, 'package.json')
  if (!(await exists(pkgPath))) return undefined

  let pkg: { scripts?: Record<string, string> } = {}
  try {
    pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8')) as { scripts?: Record<string, string> }
  } catch {
  }

  const hasTestScript = Boolean(pkg.scripts?.test && !pkg.scripts.test.includes('no test specified'))
  if (await exists(path.join(worktreePath, 'bun.lock')) || await exists(path.join(worktreePath, 'bun.lockb'))) {
    return hasTestScript
      ? { name: 'bun-test', command: 'bun', args: ['run', 'test'] }
      : { name: 'bun-test', command: 'bun', args: ['test'] }
  }
  if (await exists(path.join(worktreePath, 'pnpm-lock.yaml')) && hasTestScript) {
    return { name: 'pnpm-test', command: 'pnpm', args: ['test'] }
  }
  if (await exists(path.join(worktreePath, 'yarn.lock')) && hasTestScript) {
    return { name: 'yarn-test', command: 'yarn', args: ['test'] }
  }
  if (hasTestScript) {
    return { name: 'npm-test', command: 'npm', args: ['test'] }
  }
  return { name: 'bun-test', command: 'bun', args: ['test'] }
}

async function detectDefaultSteps(
  worktreePath: string,
  options: CheckRunOptions,
): Promise<CheckCommandSpec[]> {
  const steps: CheckCommandSpec[] = []

  if (options.commands && options.commands.length > 0) {
    for (const c of options.commands) {
      steps.push({
        name: c.name,
        command: c.command,
        args: c.args ?? [],
        metricPattern: c.metricPattern,
        heavy: c.heavy,
        reportFormat: c.reportFormat,
        reportPath: c.reportPath,
      })
    }
  } else {
    if (await exists(path.join(worktreePath, 'Cargo.toml'))) {
      steps.push({ name: 'cargo-test', command: 'cargo', args: ['test', '--workspace'] })
    }
    const nodeStep = await detectNodeTestStep(worktreePath)
    if (nodeStep) steps.push(nodeStep)

    const entries = await fs.readdir(worktreePath).catch(() => [] as string[])
    if (entries.some(e => e.endsWith('.sln') || e.endsWith('.csproj'))) {
      steps.push({ name: 'dotnet-test', command: 'dotnet', args: ['test'] })
    }
    if (await exists(path.join(worktreePath, 'go.mod'))) {
      steps.push({ name: 'go-test', command: 'go', args: ['test', './...'] })
    }
    if (
      (await exists(path.join(worktreePath, 'pyproject.toml'))) ||
      (await exists(path.join(worktreePath, 'pytest.ini')))
    ) {
      steps.push({ name: 'pytest', command: 'pytest', args: [] })
    }
  }

  if (options.includeMortise !== false && (await exists(path.join(worktreePath, '.mortise', 'config.json')))) {
    steps.push({ name: 'mortise-check', command: 'mortise', args: ['check', '--json'] })
    steps.push({ name: 'mortise-layers', command: 'mortise', args: ['layers', 'check'] })
    if (options.mutationSessionId) {
      steps.push({
        name: 'mortise-mutation',
        command: 'mortise',
        args: ['mutation', 'check', '--session-id', options.mutationSessionId],
      })
    }
  }

  return steps
}

function formatExcerpt(stdout: string, stderr: string): string {
  const combined = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n')
  if (combined.length <= MAX_EXCERPT_CHARS) return combined
  const head = combined.slice(0, EXCERPT_HEAD_CHARS)
  const tail = combined.slice(-EXCERPT_TAIL_CHARS)
  const omitted = combined.length - EXCERPT_HEAD_CHARS - EXCERPT_TAIL_CHARS
  return `${head}\n\n... [${omitted} chars omitted] ...\n\n${tail}`
}

function extractMetric(pattern: string | undefined, stdout: string, stderr: string): string | undefined {
  if (!pattern) return undefined
  try {
    const regex = new RegExp(pattern, 'm')
    const match = `${stdout}\n${stderr}`.match(regex)
    if (!match) return undefined
    return (match[1] ?? match[0]).trim()
  } catch {
    return undefined
  }
}

export function parseStructuredFailures(format: CheckReportFormat | undefined, raw: string): string[] | undefined {
  if (!format) return undefined
  if (format === 'junit-xml') return junitFailureIds(raw)
  const failed = new Set<string>()

  if (format === 'sarif') {
    const report = JSON.parse(raw)
    if (report?.version !== '2.1.0' || !Array.isArray(report.runs) || !report.runs.length) {
      throw new Error('Expected a SARIF 2.1.0 report with at least one run')
    }
    const findings: string[] = []
    const occurrences = new Map<string, number>()
    for (const run of report.runs) {
      if (!Array.isArray(run.results)) throw new Error('Missing SARIF results')
      for (const result of run.results) {
        const location = result.locations?.[0]?.physicalLocation
        const key = JSON.stringify([result.ruleId, location?.artifactLocation?.uri, location?.region?.startLine, result.message?.text])
        const occurrence = (occurrences.get(key) ?? 0) + 1
        occurrences.set(key, occurrence)
        findings.push(key + '#' + occurrence)
      }
    }
    return findings.sort()
  }

  if (format === 'libtest-json' || format === 'nextest-json') {
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('{')) continue
      try {
        const obj = JSON.parse(trimmed) as { type?: string; event?: string; name?: string }
        if (obj.type === 'test' && obj.event === 'failed' && typeof obj.name === 'string' && obj.name) {
          failed.add(obj.name)
        }
      } catch {
      }
    }
    return Array.from(failed).sort()
  }

  return undefined
}

async function readReport(
  step: CheckCommandSpec,
  reportPath: string | undefined,
  res: { exitCode: number; stdout: string },
): Promise<string | undefined> {
  if (reportPath) {
    const file = await fs.readFile(reportPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT' || step.reportFormat === 'sarif') throw error
      return undefined
    })
    if (file !== undefined) return file
    if (res.exitCode !== 0) return undefined
  }
  return step.reportFormat === 'junit-xml' ? junitDocument(res.stdout) : res.stdout
}

export async function runChecks(options: CheckRunOptions): Promise<CheckRunReport> {
  const steps = (await detectDefaultSteps(options.worktreePath, options))
    .filter(step => !options.onlySteps || options.onlySteps.has(step.name))
  const needsMutex = steps.some(s => s.heavy !== false)

  const execute = async (): Promise<CheckRunReport> => {
    const results: CheckStepResult[] = []

    for (const step of steps) {
      const start = Date.now()
      const fullReportPath = step.reportFormat && step.reportPath
        ? path.resolve(options.worktreePath, step.reportPath)
        : undefined
      try {
        if (fullReportPath) await fs.rm(fullReportPath, { force: true })
        const res = await execCommand(step.command, step.args ?? [], {
          cwd: options.worktreePath,
          timeoutMs: options.timeoutMs ?? 10 * 60 * 1000,
        })
        const metric = extractMetric(step.metricPattern, res.stdout, res.stderr)
        const output = res.exitCode === 0 ? '' : formatExcerpt(res.stdout, res.stderr)
        let failedIds: string[] | undefined
        let invalidReport: string | undefined
        try {
          const report = await readReport(step, fullReportPath, res)
          if (report !== undefined) failedIds = parseStructuredFailures(step.reportFormat, report)
        } catch (err) {
          invalidReport = (err as Error).message
        }
        const findings = step.reportFormat === 'sarif' ? failedIds?.length ?? 0 : 0
        results.push({
          name: step.name,
          passed: res.exitCode === 0 && findings === 0 && invalidReport === undefined,
          exitCode: invalidReport === undefined ? res.exitCode : res.exitCode || 1,
          durationMs: Date.now() - start,
          excerpt: invalidReport !== undefined
            ? [invalidReport, output].filter(Boolean).join('\n\n')
            : findings ? `${findings} SARIF finding(s)` : output,
          ...(metric ? { metric } : {}),
          ...(invalidReport !== undefined ? { invalidReport: true } : {}),
          ...(failedIds !== undefined ? { failedIds } : {}),
        })
      } catch (err) {
        results.push({
          name: step.name,
          passed: false,
          exitCode: 1,
          durationMs: Date.now() - start,
          excerpt: (err as Error).message,
          ...(step.reportFormat === 'sarif' || step.reportFormat === 'junit-xml' ? { invalidReport: true } : {}),
        })
      }
    }

    if (results.length === 0) {
      const passed = options.allowEmpty === true
      return {
        passed,
        summary: passed
          ? 'No verification steps detected (allowEmpty=true)'
          : 'No verification steps detected (failing closed; configure explicit checks)',
        results,
      }
    }

    const passed = results.every(r => r.passed)
    const failedNames = results.filter(r => !r.passed).map(r => r.name)
    const summary = passed
      ? `All ${results.length} check(s) passed`
      : `${failedNames.length}/${results.length} check(s) failed: ${failedNames.join(', ')}`

    return { passed, summary, results }
  }

  return needsMutex ? checkMutex.run(execute) : execute()
}
