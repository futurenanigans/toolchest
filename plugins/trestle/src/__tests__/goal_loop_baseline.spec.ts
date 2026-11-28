import { afterEach, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { parseStructuredFailures } from '../checks'
import { writeRepoConfig, writeUserConfig } from '../config'
import { contractCreate } from '../contract'
import { digestFailures, evaluateGateAgainstBaseline, runGoalLoop } from '../goal_loop'
import { execCommand } from '../platform'
import { readExperiments } from '../state'
import { AgentSupervisor } from '../supervisor'
import { worktreeCreate } from '../worktrees'

const tempDirs: string[] = []

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

async function makeTempRepo(): Promise<{ repo: string; home: string }> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'trestle-base-bug-'))
  tempDirs.push(base)
  const repo = path.join(base, 'repo')
  const home = path.join(base, 'home')
  await fs.mkdir(repo, { recursive: true })
  await fs.mkdir(home, { recursive: true })

  await execCommand('git', ['init', '-b', 'main'], { cwd: repo })
  await execCommand('git', ['config', 'user.email', 'test@example.com'], { cwd: repo })
  await execCommand('git', ['config', 'user.name', 'Test'], { cwd: repo })
  await fs.writeFile(path.join(repo, '.gitignore'), '.trestle/\n.trestle-wt/\n', 'utf8')
  await fs.writeFile(path.join(repo, 'state.txt'), 'base\n', 'utf8')
  await execCommand('git', ['add', '.gitignore', 'state.txt'], { cwd: repo })
  await execCommand('git', ['commit', '-m', 'init'], { cwd: repo })
  return { repo, home }
}

test('parseStructuredFailures extracts failing test names from libtest-json and junit-xml', () => {
  const libtest = [
    JSON.stringify({ type: 'test', event: 'ok', name: 'mod::passes' }),
    JSON.stringify({ type: 'test', event: 'failed', name: 'watchdog::clock_test' }),
  ].join('\n')
  expect(parseStructuredFailures('libtest-json', libtest)).toEqual(['watchdog::clock_test'])

  const junit = `<testsuite><testcase classname="suite.a" name="ok"/><testcase classname="suite.a" name="broken"><failure message="boom"/></testcase></testsuite>`
  expect(parseStructuredFailures('junit-xml', junit)).toEqual(['suite.a::broken'])

  expect(parseStructuredFailures(undefined, 'FAIL foo')).toBeUndefined()
})

test('a check red on baseRef ends the job blocked before any agent is spawned, naming the check', async () => {
  const { repo, home } = await makeTempRepo()
  const wt = await worktreeCreate(repo, 'wt-base-red', { homeDir: home })

  const spawnedMarker = path.join(repo, 'agent-was-spawned.txt')
  const agentScript = path.join(repo, 'should-not-run.ts')
  await fs.writeFile(
    agentScript,
    `require('fs').writeFileSync(${JSON.stringify(spawnedMarker)}, 'ran'); console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'ok' }))\n`,
    'utf8',
  )

  await contractCreate(
    repo,
    {
      id: 'base-red-default',
      title: 'Base red blocks immediately',
      goal: 'Fix something',
      acceptanceCriteria: [{ id: 'ac1', description: 'gate passes' }],
      includeMortise: false,
      checks: [{ name: 'engine-tests', command: ['bun', '-e', 'console.error("watchdog_projection failed"); process.exit(1)'] }],
    },
    home,
  )

  const supervisor = new AgentSupervisor()
  const res = await runGoalLoop(supervisor, {
    repoRoot: repo,
    contractId: 'base-red-default',
    cli: 'claude',
    worktreeId: wt.id,
    worktreePath: wt.path,
    branch: wt.branch,
    commandOverride: ['bun', 'run', agentScript],
    homeDir: home,
  })

  expect(res.status).toBe('blocked')
  expect(res.iterations).toBe(0)
  expect(res.error).toContain('engine-tests')
  expect(res.baseline?.baseRedChecks).toEqual(['engine-tests'])
  expect(supervisor.list()).toHaveLength(0)
  expect(await fs.exists(spawnedMarker)).toBe(false)
})

test('under baseline: no-new-failures, unchanged base-red set passes and grown set fails; iter 2 prompt separates base-red from Fix These and excludes continued from dead ends', async () => {
  const { repo, home } = await makeTempRepo()
  const wt = await worktreeCreate(repo, 'wt-nnf', { homeDir: home })

  const checkScript = path.join(repo, 'libtest-check.ts')
  await fs.writeFile(
    checkScript,
    `
import * as fs from 'node:fs'
const s = fs.readFileSync('state.txt', 'utf8').trim()
console.log(JSON.stringify({ type: 'test', event: 'failed', name: 'watchdog::clock_test' }))
if (s === 'regressed') {
  console.log(JSON.stringify({ type: 'test', event: 'failed', name: 'new::regression' }))
}
process.exit(1)
`,
    'utf8',
  )
  await execCommand('git', ['add', 'libtest-check.ts'], { cwd: repo })
  await execCommand('git', ['commit', '-m', 'add check script'], { cwd: repo })

  const wt2 = await worktreeCreate(repo, 'wt-nnf-2', { homeDir: home })

  const promptsLog = path.join(repo, 'prompts.jsonl')
  const agentScript = path.join(repo, 'agent-nnf.ts')
  await fs.writeFile(
    agentScript,
    `
import * as fs from 'node:fs'
import * as readline from 'node:readline'
const rl = readline.createInterface({ input: process.stdin })
rl.once('line', line => {
  rl.close()
  const msg = JSON.parse(line)
  const prompt = msg.message.content
  fs.appendFileSync(${JSON.stringify(promptsLog)}, JSON.stringify({ prompt }) + '\\n')
  if (prompt.includes('Iteration 1/')) {
    fs.writeFileSync('state.txt', 'regressed\\n', 'utf8')
  } else {
    fs.writeFileSync('state.txt', 'fixed\\n', 'utf8')
  }
  console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'done' }))
})
`,
    'utf8',
  )

  await contractCreate(
    repo,
    {
      id: 'nnf-contract',
      title: 'No new failures test',
      goal: 'Make change without adding new failures',
      acceptanceCriteria: [{ id: 'ac1', description: 'no new failures' }],
      includeMortise: false,
      baseline: 'no-new-failures',
      maxIterations: 4,
      checks: [
        { name: 'engine-tests', command: ['bun', 'run', checkScript], reportFormat: 'libtest-json' },
        {
          name: 'base-prose-red',
          command: ['bun', '-e', 'console.error("pre-existing prose failure"); process.exit(1)'],
        },
      ],
    },
    home,
  )

  const supervisor = new AgentSupervisor()
  const res = await runGoalLoop(supervisor, {
    repoRoot: repo,
    contractId: 'nnf-contract',
    cli: 'claude',
    worktreeId: wt2.id,
    worktreePath: wt2.path,
    branch: wt2.branch,
    commandOverride: ['bun', 'run', agentScript],
    homeDir: home,
  })

  expect(res.status).toBe('passed')
  expect(res.iterations).toBe(2)

  const prompts = (await fs.readFile(promptsLog, 'utf8'))
    .trim()
    .split('\n')
    .map(l => (JSON.parse(l) as { prompt: string }).prompt)
  const iter2Prompt = prompts[1]!

  expect(iter2Prompt).toContain('Failing on `main` before your change; do not fix unless the objective says so')
  const [beforeFix, afterFix] = iter2Prompt.split('## Previous Iteration Verification Failures (Fix These)')
  expect(beforeFix).toContain('base-prose-red')
  expect(afterFix).not.toContain('base-prose-red')
  expect(afterFix).toContain('new::regression')

  expect(iter2Prompt).toContain('Current Worktree State (Continued Work)')
  expect(iter2Prompt).not.toContain('Known Dead Ends / Prior Attempts (Do Not Repeat)')

  const expLog = await readExperiments(repo, 80, home)
  expect(expLog).toContain('## [CONTINUED]')
  expect(expLog).not.toContain('## [DISCARDED]')
  void wt
})

test('three iterations failing the same check with the same excerpt end stuck without escalating tiers', async () => {
  const { repo, home } = await makeTempRepo()
  await writeUserConfig(
    {
      escalation: { enabled: true, tiers: ['cheap', 'balanced', 'strong'], stepAfterFailures: 3 },
    },
    { homeDir: home },
  )

  const wt = await worktreeCreate(repo, 'wt-stuck', { homeDir: home })
  const agentScript = path.join(repo, 'agent-noop.ts')
  await fs.writeFile(
    agentScript,
    `console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'tried' }))\n`,
    'utf8',
  )

  await contractCreate(
    repo,
    {
      id: 'stuck-contract',
      title: 'Stuck test',
      goal: 'Try forever',
      acceptanceCriteria: [{ id: 'ac1', description: 'passes' }],
      includeMortise: false,
      baseline: 'skip',
      maxIterations: 6,
      checks: [{ name: 'constant-fail', command: ['bun', '-e', 'console.error("same error every time"); process.exit(1)'] }],
    },
    home,
  )

  const supervisor = new AgentSupervisor()
  const res = await runGoalLoop(supervisor, {
    repoRoot: repo,
    contractId: 'stuck-contract',
    cli: 'claude',
    model: 'cheap',
    worktreeId: wt.id,
    worktreePath: wt.path,
    branch: wt.branch,
    commandOverride: ['bun', 'run', agentScript],
    homeDir: home,
  })

  expect(res.status).toBe('stuck')
  expect(res.iterations).toBe(3)
  expect(res.error).toContain('constant-fail')
  const modelsUsed = supervisor.list().map(a => a.model)
  expect(modelsUsed).toEqual(['claude-haiku-5-5', 'claude-haiku-5-5', 'claude-haiku-5-5'])
})

test('contractCreate leaves includeMortise undefined when omitted so repo config false wins', async () => {
  const { repo, home } = await makeTempRepo()
  await writeRepoConfig(repo, { checks: { includeMortise: false } }, { homeDir: home })

  const c = await contractCreate(
    repo,
    {
      id: 'mortise-inherit',
      title: 'Inherit includeMortise',
      goal: 'Respect repo config',
      acceptanceCriteria: [{ id: 'ac1', description: 'ok' }],
    },
    home,
  )
  expect(c.includeMortise).toBeUndefined()
})

test('digestFailures ignores volatile test durations/timestamps in prose excerpts so stuck triggers reliably', () => {
  const d1 = digestFailures([
    {
      name: 'nextest',
      passed: false,
      exitCode: 100,
      durationMs: 6012,
      excerpt: 'TIMEOUT [   6.001s] mortise-engine paused_worker_test\nTIMEOUT [   6.004s] mortise-engine repeated_stops_test\nfinished in 6.12s',
    },
  ])
  const d2 = digestFailures([
    {
      name: 'nextest',
      passed: false,
      exitCode: 100,
      durationMs: 6099,
      excerpt: 'TIMEOUT [   6.042s] mortise-engine paused_worker_test\nTIMEOUT [   6.019s] mortise-engine repeated_stops_test\nfinished in 6.88s',
    },
  ])
  expect(d1).toBe(d2)
})

test('under no-new-failures, a step that fails with no test IDs is a new failure when base failed only on tests', () => {
  const baseStep = { name: 'test', passed: false, exitCode: 101, durationMs: 1, excerpt: '', failedIds: ['flaky_one'] }
  const brokenBuild = { name: 'test', passed: false, exitCode: 101, durationMs: 1, excerpt: 'error[E0425]', failedIds: [] }
  const gate = evaluateGateAgainstBaseline(
    { passed: false, summary: '1/1 check(s) failed: test', results: [brokenBuild] },
    { baseRef: 'main', passed: false, baseRedChecks: ['test'], report: { passed: false, summary: '', results: [baseStep] } },
    'no-new-failures',
  )
  expect(gate.effectivePassed).toBe(false)
  expect(gate.newFailures.map(r => r.name)).toEqual(['test'])
})

test.each(['require-green', 'no-new-failures'] as const)('a failure reproduced on the pinned base is attributed to the base under %s', async policy => {
  const { repo, home } = await makeTempRepo()
  await fs.writeFile(path.join(repo, '.env.local'), 'fixture')
  const wt = await worktreeCreate(repo, 'flaky', { homeDir: home })
  const marker = path.join(home, 'first-check')
  const check = `
    const fs = require('node:fs')
    if (fs.readFileSync('.env.local', 'utf8') !== 'fixture') process.exit(2)
    if (fs.existsSync(${JSON.stringify(marker)})) {
      console.log(JSON.stringify({ type: 'test', event: 'failed', name: 'slow-boundary' }))
      process.exit(1)
    }
    fs.writeFileSync(${JSON.stringify(marker)}, 'base was green')
  `
  await contractCreate(repo, { id: 'flaky', title: 'Flaky', goal: 'Update state', acceptanceCriteria: [], baseline: policy,
    checks: [{ name: 'suite', command: ['bun', '-e', check], reportFormat: 'libtest-json' }] }, home)
  const agent = path.join(home, 'agent.ts')
  await fs.writeFile(agent, "require('fs').writeFileSync('state.txt', 'changed'); console.log(JSON.stringify({type:'result', result:'done'}))")
  const res = await runGoalLoop(new AgentSupervisor(), { repoRoot: repo, contractId: 'flaky', cli: 'claude',
    worktreeId: wt.id, worktreePath: wt.path, branch: wt.branch, commandOverride: ['bun', agent], homeDir: home })
  expect(res.status).toBe(policy === 'require-green' ? 'blocked' : 'passed')
  expect(res.iterations).toBe(1)
  expect(res.baseline?.report.results[0]?.failedIds).toEqual(['slow-boundary'])
})
