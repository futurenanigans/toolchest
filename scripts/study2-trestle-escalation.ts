#!/usr/bin/env bun
/**
 * Study 2: Compare Trestle's escalation ladder (cheap -> balanced -> strong)
 * against fixed-tier models (fixed-cheap, fixed-balanced) on the same tasks
 * using Trestle's real runGoalLoop + AgentSupervisor.
 */
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { writeUserConfig } from '../plugins/trestle/src/config'
import { contractCreate } from '../plugins/trestle/src/contract'
import { runGoalLoop } from '../plugins/trestle/src/goal_loop'
import { execCommand } from '../plugins/trestle/src/platform'
import { AgentSupervisor } from '../plugins/trestle/src/supervisor'
import { readQuotaLedger } from '../plugins/trestle/src/quota'
import { worktreeCreate } from '../plugins/trestle/src/worktrees'

interface TaskSpec {
  id: string
  difficulty: 'easy' | 'medium' | 'hard'
  goal: string
  seedFiles: Record<string, string>
  checkCmd: string
}

const TASKS: TaskSpec[] = [
  {
    id: 'pagination-slice',
    difficulty: 'easy',
    goal: 'Fix paginate() in src/paginate.ts so all tests in test.ts pass. Do not edit test.ts.',
    checkCmd: 'bun test test.ts',
    seedFiles: {
      'src/paginate.ts': `export function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  if (page < 1 || pageSize < 1) return []
  const start = page * pageSize
  return items.slice(start, start + pageSize)
}
`,
      'test.ts': `import { expect, test } from 'bun:test'
import { paginate } from './src/paginate'

test('page 1 starts at index 0', () => {
  expect(paginate([1, 2, 3, 4, 5], 1, 2)).toEqual([1, 2])
})
test('page 2 returns next slice', () => {
  expect(paginate([1, 2, 3, 4, 5], 2, 2)).toEqual([3, 4])
})
test('page 3 returns remainder', () => {
  expect(paginate([1, 2, 3, 4, 5], 3, 2)).toEqual([5])
})
test('invalid page returns empty', () => {
  expect(paginate([1, 2], 0, 2)).toEqual([])
})
`,
    },
  },
  {
    id: 'interval-subtract',
    difficulty: 'medium',
    goal: 'Implement subtractIntervals(base, remove) in src/intervals.ts so all tests in test.ts pass. Do not edit test.ts.',
    checkCmd: 'bun test test.ts',
    seedFiles: {
      'src/intervals.ts': `export type Interval = [number, number]

// Half-open intervals [start, end). Normalize (merge overlapping/adjacent) then subtract all remove intervals.
export function subtractIntervals(base: Interval[], remove: Interval[]): Interval[] {
  return base
}
`,
      'test.ts': `import { expect, test } from 'bun:test'
import { subtractIntervals } from './src/intervals'

test('merges unsorted base and removes middle', () => {
  expect(subtractIntervals([[5, 10], [0, 6]], [[3, 7]])).toEqual([[0, 3], [7, 10]])
})
test('removes multiple overlapping cuts and adjacent spans', () => {
  expect(subtractIntervals([[0, 20]], [[2, 5], [4, 8], [15, 25]])).toEqual([[0, 2], [8, 15]])
})
test('ignores empty/inverted intervals', () => {
  expect(subtractIntervals([[5, 5], [0, 10]], [[3, 3], [8, 2]])).toEqual([[0, 10]])
})
test('complete removal yields empty', () => {
  expect(subtractIntervals([[1, 4], [4, 8]], [[0, 10]])).toEqual([])
})
`,
    },
  },
  {
    id: 'mini-cron-matcher',
    difficulty: 'hard',
    goal: 'Implement matchesCron(expr, date) in src/cron.ts supporting *, numbers, lists (1,3,5), ranges (1-5), steps (*/15, 1-10/3), and rejecting invalid syntax by throwing Error, so all tests in test.ts pass. Do not edit test.ts.',
    checkCmd: 'bun test test.ts',
    seedFiles: {
      'src/cron.ts': `// 5-field UTC cron: minute(0-59) hour(0-23) dom(1-31) month(1-12) dow(0-6, 0=Sun, 7=Sun).
// Standard Vixie cron semantics: if BOTH dom and dow are restricted (neither is '*'), match if EITHER dom OR dow matches.
export function matchesCron(expr: string, date: Date): boolean {
  throw new Error('not implemented')
}
`,
      'test.ts': `import { expect, test } from 'bun:test'
import { matchesCron } from './src/cron'

test('every 15 minutes on weekdays', () => {
  // 2026-11-30 is Monday (dow=1)
  expect(matchesCron('*/15 9-17 * * 1-5', new Date('2026-11-30T09:30:00Z'))).toBe(true)
  expect(matchesCron('*/15 9-17 * * 1-5', new Date('2026-11-30T09:31:00Z'))).toBe(false)
  expect(matchesCron('*/15 9-17 * * 1-5', new Date('2026-11-29T09:30:00Z'))).toBe(false)
})
test('step over range and list', () => {
  expect(matchesCron('1-10/3,45 0 * * *', new Date('2026-11-30T00:07:00Z'))).toBe(true)
  expect(matchesCron('1-10/3,45 0 * * *', new Date('2026-11-30T00:08:00Z'))).toBe(false)
  expect(matchesCron('1-10/3,45 0 * * *', new Date('2026-11-30T00:45:00Z'))).toBe(true)
})
test('dow 7 equals Sunday (0)', () => {
  // 2026-11-29 is Sunday
  expect(matchesCron('0 12 * * 7', new Date('2026-11-29T12:00:00Z'))).toBe(true)
})
test('Vixie OR semantics when both dom and dow are restricted', () => {
  // 2026-11-30 is Monday (dow=1), dom=30. Matches dom=15 OR dow=1 -> true
  expect(matchesCron('0 0 15 * 1', new Date('2026-11-30T00:00:00Z'))).toBe(true)
  // 2026-11-29 is Sunday (dow=0), dom=29. Neither dom=15 nor dow=1 -> false
  expect(matchesCron('0 0 15 * 1', new Date('2026-11-29T00:00:00Z'))).toBe(false)
  // When dom is restricted and dow is *, only dom matters
  expect(matchesCron('0 0 15 * *', new Date('2026-11-30T00:00:00Z'))).toBe(false)
})
test('rejects invalid expressions', () => {
  expect(() => matchesCron('* * * *', new Date())).toThrow()
  expect(() => matchesCron('60 * * * *', new Date())).toThrow()
  expect(() => matchesCron('*/0 * * * *', new Date())).toThrow()
  expect(() => matchesCron('5-2 * * * *', new Date())).toThrow()
})
`,
    },
  },
]

interface ArmConfig {
  name: string
  escalationEnabled: boolean
  modelTier: 'cheap' | 'balanced'
  stepAfterFailures?: number
}

const ARMS: ArmConfig[] = [
  { name: 'fixed-cheap', escalationEnabled: false, modelTier: 'cheap' },
  { name: 'fixed-balanced', escalationEnabled: false, modelTier: 'balanced' },
  { name: 'ladder', escalationEnabled: true, modelTier: 'cheap', stepAfterFailures: 1 },
]

async function seedRepo(dir: string, files: Record<string, string>) {
  await execCommand('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  await execCommand('git', ['config', 'user.email', 'study@example.invalid'], { cwd: dir })
  await execCommand('git', ['config', 'user.name', 'study'], { cwd: dir })
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel)
    await fs.mkdir(path.dirname(full), { recursive: true })
    await fs.writeFile(full, content, 'utf8')
  }
  await execCommand('git', ['add', '.'], { cwd: dir })
  await execCommand('git', ['commit', '-qm', 'Seed task'], { cwd: dir })
}

async function runTrial(task: TaskSpec, arm: ArmConfig) {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), `study2-${task.id}-${arm.name}-`))
  const repoRoot = path.join(tmpRoot, 'repo')
  const homeDir = path.join(tmpRoot, 'home')
  await fs.mkdir(repoRoot, { recursive: true })
  await fs.mkdir(homeDir, { recursive: true })

  try {
    await seedRepo(repoRoot, task.seedFiles)
    await writeUserConfig(
      {
        defaultCli: 'claude',
        maxIterations: 4,
        escalation: {
          enabled: arm.escalationEnabled,
          tiers: ['cheap', 'balanced', 'strong'],
          stepAfterFailures: arm.stepAfterFailures ?? 2,
          fallbackClis: [],
        },
      },
      { replace: true, homeDir },
    )

    const contract = await contractCreate(
      repoRoot,
      {
        id: `${task.id}-${arm.name}`,
        title: task.id,
        goal: task.goal,
        acceptanceCriteria: [{ id: 'tests-pass', description: 'All unit tests in test.ts pass without editing test.ts' }],
        baseline: 'skip',
        checks: [{ name: 'test', command: task.checkCmd }],
        maxIterations: 4,
        freshContextPerIteration: true,
      },
      homeDir,
    )

    const wt = await worktreeCreate(repoRoot, `${task.id}-${arm.name}`, { homeDir })
    const supervisor = new AgentSupervisor()
    const t0 = Date.now()
    const res = await runGoalLoop(supervisor, {
      repoRoot,
      worktreeId: wt.id,
      worktreePath: wt.path,
      branch: wt.branch,
      baseRef: wt.baseRef,
      contractId: contract.id,
      cli: 'claude',
      model: arm.modelTier,
      maxIterations: 4,
      homeDir,
    })
    const wallMs = Date.now() - t0
    const ledger = await readQuotaLedger(homeDir)
    const entries = ledger.entries.filter(e => e.cli === 'claude')
    const totalTokens = entries.reduce((sum, e) => sum + e.tokens, 0)
    const costUsd = entries.length > 0 && entries.every(e => typeof e.costUsd === 'number')
      ? Number(entries.reduce((sum, e) => sum + (e.costUsd ?? 0), 0).toFixed(6))
      : null

    const diffTest = await execCommand('git', ['diff', '--quiet', '--', 'test.ts'], { cwd: wt.path })
    const accepted = res.status === 'passed' && diffTest.exitCode === 0

    return {
      task: task.id,
      difficulty: task.difficulty,
      arm: arm.name,
      status: res.status,
      accepted,
      iterations: res.iterations,
      wallMs,
      totalTokens,
      costUsd,
      error: res.error,
    }
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {})
  }
}

async function main() {
  const results = []
  for (const task of TASKS) {
    for (const arm of ARMS) {
      console.error(`Running ${task.id} (${task.difficulty}) / ${arm.name}...`)
      const r = await runTrial(task, arm)
      results.push(r)
      console.error(
        `  -> ${r.status} accepted=${r.accepted} iters=${r.iterations} tok=${r.totalTokens} cost=${r.costUsd === null ? 'not reported' : '$' + r.costUsd} (${(r.wallMs / 1000).toFixed(1)}s)${r.error ? ' err=' + r.error : ''}`,
      )
    }
  }

  const byArm: Record<string, typeof results> = {}
  for (const r of results) (byArm[r.arm] ??= []).push(r)

  const summary: Record<string, unknown> = {}
  console.log('\n| Arm | Accepted | Past iteration 1 | Total iters | Total tokens | Cost ($) | Cost / accepted ($) |')
  console.log('| :- | -: | -: | -: | -: | -: | -: |')
  for (const arm of ARMS) {
    const rows = byArm[arm.name] ?? []
    const acc = rows.filter(r => r.accepted).length
    const retried = rows.filter(r => r.iterations > 1).length
    const iters = rows.reduce((s, r) => s + r.iterations, 0)
    const tok = rows.reduce((s, r) => s + r.totalTokens, 0)
    const cost = rows.every(r => r.costUsd !== null) ? rows.reduce((s, r) => s + (r.costUsd ?? 0), 0) : null
    const cpa = cost !== null && acc > 0 ? cost / acc : null
    summary[arm.name] = {
      accepted: acc,
      total: rows.length,
      trialsPastFirstIteration: retried,
      iters,
      totalTokens: tok,
      costUsd: cost === null ? null : Number(cost.toFixed(6)),
      costPerAcceptedUsd: cpa === null ? null : Number(cpa.toFixed(6)),
    }
    console.log(
      `| ${arm.name} | ${acc}/${rows.length} | ${retried}/${rows.length} | ${iters} | ${tok} | ${cost === null ? 'not reported' : cost.toFixed(5)} | ${cpa === null ? 'n/a' : cpa.toFixed(5)} |`,
    )
  }

  const outDir = path.resolve(import.meta.dir, '../plugins/trestle/evals/results/study2-escalation')
  await fs.mkdir(outDir, { recursive: true })
  await fs.writeFile(path.join(outDir, 'results.json'), JSON.stringify({ cli: 'claude', summary, trials: results }, null, 2) + '\n')
  console.error(`\nSaved Study 2 results to ${outDir}/results.json`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
