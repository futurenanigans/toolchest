import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import { execCommand, type CommandSpec } from './platform'

export type CheckReportFormat = 'libtest-json' | 'nextest-json' | 'junit-xml'

export interface CheckCommandSpec {
  name: string
  command: CommandSpec
  args?: string[]
  metricPattern?: string
  /** Set `false` for fast/lightweight checks (lint/typecheck/unit) that can run without acquiring the heavy build/test mutex */
  heavy?: boolean
  /** Structured test output format for exact failing-set comparison under `baseline: "no-new-failures"` */
  reportFormat?: CheckReportFormat
  /** Optional relative path to a report file (e.g. JUnit XML file) instead of stdout */
  reportPath?: string
}

export interface CheckStepResult {
  name: string
  passed: boolean
  exitCode: number
  durationMs: number
  excerpt: string
  metric?: string
  /** Structured failing test identifiers when `reportFormat` is declared on the check */
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
  allowEmpty?: boolean
}

const MAX_EXCERPT_CHARS = 16_000
const EXCERPT_HEAD_CHARS = 6_000
const EXCERPT_TAIL_CHARS = 10_000

class AsyncMutex {
  private queue: Promise<void> = Promise.resolve()

  async run<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void
    const next = new Promise<void>(r => {
      release = r
    })
    const prev = this.queue
    this.queue = prev.then(() => next)
    await prev
    try {
      return await fn()
    } finally {
      release()
    }
  }
}

const checkMutex = new AsyncMutex()

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
    // Fallback to lockfile detection
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

/**
 * Parses structured failing test identifiers from libtest JSON, nextest JSON, or JUnit XML.
 * Never parses free-form prose: returns `undefined` when no `reportFormat` is declared.
 */
export function parseStructuredFailures(format: CheckReportFormat | undefined, raw: string): string[] | undefined {
  if (!format) return undefined
  const failed = new Set<string>()

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
        // Ignore non-JSON lines emitted alongside structured test output
      }
    }
    return Array.from(failed).sort()
  }

  if (format === 'junit-xml') {
    const caseRe = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/gi
    let m: RegExpExecArray | null
    while ((m = caseRe.exec(raw)) !== null) {
      const attrs = m[1] ?? ''
      const body = m[2] ?? ''
      if (!/<(?:failure|error)\b/i.test(body)) continue
      const nameMatch = attrs.match(/\bname="([^"]+)"/i)
      const classMatch = attrs.match(/\bclassname="([^"]+)"/i)
      const name = nameMatch?.[1]
      if (!name) continue
      const cls = classMatch?.[1]
      failed.add(cls ? `${cls}::${name}` : name)
    }
    return Array.from(failed).sort()
  }

  return undefined
}

/**
 * Runs verification steps. Heavy steps (builds, full test suites, mutation runs — the default)
 * run under a process-wide mutex so parallel worktrees do not thrash CPU/RAM. Fast steps
 * explicitly marked `heavy: false` run without waiting behind slow builds/mutation runs.
 * Fails closed when 0 steps are detected unless `allowEmpty: true`.
 */
export async function runChecks(options: CheckRunOptions): Promise<CheckRunReport> {
  const steps = await detectDefaultSteps(options.worktreePath, options)
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
        let reportSource = res.stdout
        if (fullReportPath) {
          reportSource = await fs.readFile(fullReportPath, 'utf8').catch(() => res.stdout)
        }
        const failedIds = parseStructuredFailures(step.reportFormat, reportSource)
        results.push({
          name: step.name,
          passed: res.exitCode === 0,
          exitCode: res.exitCode,
          durationMs: Date.now() - start,
          excerpt: res.exitCode === 0 ? '' : formatExcerpt(res.stdout, res.stderr),
          ...(metric ? { metric } : {}),
          ...(failedIds !== undefined ? { failedIds } : {}),
        })
      } catch (err) {
        results.push({
          name: step.name,
          passed: false,
          exitCode: 1,
          durationMs: Date.now() - start,
          excerpt: (err as Error).message,
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
