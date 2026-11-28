import { afterEach, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { contractCreate, contractList, contractRead, contractUpdateCriterion } from '../contract'
import { buildGoalPrompt, GoalJobManager, runGoalLoop } from '../goal_loop'
import { execCommand } from '../platform'
import { readDiskState, updateDiskState } from '../state'
import { AgentSupervisor } from '../supervisor'
import { worktreeCreate } from '../worktrees'

const tempDirs: string[] = []

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

async function makeTempRepo(): Promise<{ repo: string; home: string }> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'trestle-goal-'))
  tempDirs.push(base)
  const repo = path.join(base, 'repo')
  const home = path.join(base, 'home')
  await fs.mkdir(repo, { recursive: true })
  await fs.mkdir(home, { recursive: true })

  await execCommand('git', ['init', '-b', 'main'], { cwd: repo })
  await execCommand('git', ['config', 'user.email', 'test@example.com'], { cwd: repo })
  await execCommand('git', ['config', 'user.name', 'Test'], { cwd: repo })
  await fs.writeFile(path.join(repo, '.gitignore'), '.trestle/\n.trestle-wt/\n', 'utf8')
  await fs.writeFile(path.join(repo, 'answer.txt'), 'wrong\n', 'utf8')
  await execCommand('git', ['add', '.gitignore', 'answer.txt'], { cwd: repo })
  await execCommand('git', ['commit', '-m', 'init'], { cwd: repo })
  return { repo, home }
}

test('contractCreate, contractList, contractUpdateCriterion, and buildGoalPrompt', async () => {
  const { repo, home } = await makeTempRepo()
  const c = await contractCreate(
    repo,
    {
      id: 'fix-answer',
      title: 'Fix answer.txt',
      goal: 'Write "42" into answer.txt',
      acceptanceCriteria: [
        { id: 'ac1', description: 'answer.txt equals 42' },
        { id: 'ac2', description: 'No stubs' },
      ],
    },
    home,
  )
  expect(c.acceptanceCriteria[0]?.passed).toBe(false)

  const list = await contractList(repo, home)
  expect(list.map(x => x.id)).toEqual(['fix-answer'])

  const updated = await contractUpdateCriterion(repo, 'fix-answer', 'ac2', true, 'verified by reviewer', home)
  expect(updated.acceptanceCriteria.find(x => x.id === 'ac1')?.passed).toBe(false)
  expect(updated.acceptanceCriteria.find(x => x.id === 'ac2')?.passed).toBe(true)
  expect(updated.acceptanceCriteria.find(x => x.id === 'ac2')?.evidence).toBe('verified by reviewer')

  const prompt = buildGoalPrompt(
    c,
    2,
    5,
    '',
    {
      passed: false,
      summary: '1/1 check(s) failed: verify-42',
      results: [{ name: 'verify-42', passed: false, exitCode: 1, durationMs: 5, excerpt: 'expected 42, got wrong' }],
    },
    'previous error note',
  )
  expect(prompt).toContain('Iteration 2/5')
  expect(prompt).toContain('expected 42, got wrong')
  expect(prompt).toContain('previous error note')
})

test('runGoalLoop iterates until deterministic check_run passes and allows repeated runs on same worktree', async () => {
  const { repo, home } = await makeTempRepo()
  const wt = await worktreeCreate(repo, 'goal-wt', { homeDir: home })

  const scriptPath = path.join(repo, 'mock-producer.ts')
  await fs.writeFile(
    scriptPath,
    `
import * as fs from 'node:fs'
import * as readline from 'node:readline'
const rl = readline.createInterface({ input: process.stdin })
rl.once('line', line => {
  rl.close()
  if (line.includes('Previous Iteration Verification Failures')) {
    fs.writeFileSync('answer.txt', '42\\n', 'utf8')
  }
  console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'updated', session_id: 'mock-sess' }))
})
`,
    'utf8',
  )

  await contractCreate(
    repo,
    {
      id: 'goal-42',
      title: 'Set answer to 42',
      goal: 'Ensure answer.txt contains 42',
      acceptanceCriteria: [{ id: 'ac1', description: 'answer.txt === 42' }],
      includeMortise: false,
      baseline: 'skip',
      maxIterations: 3,
      checks: [
        {
          name: 'verify-42',
          command: [
            'bun',
            '-e',
            'const t = require("fs").readFileSync("answer.txt", "utf8").trim(); if (t !== "42") { console.error("got " + t); process.exit(1) }',
          ],
        },
      ],
    },
    home,
  )

  const supervisor = new AgentSupervisor()
  const res = await runGoalLoop(supervisor, {
    repoRoot: repo,
    contractId: 'goal-42',
    cli: 'claude',
    worktreeId: wt.id,
    worktreePath: wt.path,
    branch: wt.branch,
    commandOverride: ['bun', 'run', scriptPath],
    homeDir: home,
  })

  expect(res.status).toBe('passed')
  expect(res.iterations).toBe(2)
  expect(res.lastReport?.passed).toBe(true)

  const updated = await contractRead(repo, 'goal-42', home)
  expect(updated.acceptanceCriteria[0]?.passed).toBe(true)

  // Repeated run on the same worktree must allocate fresh IDs without colliding
  const res2 = await runGoalLoop(supervisor, {
    repoRoot: repo,
    contractId: 'goal-42',
    cli: 'claude',
    worktreeId: wt.id,
    worktreePath: wt.path,
    branch: wt.branch,
    commandOverride: ['bun', 'run', scriptPath],
    homeDir: home,
  })
  expect(res2.status).toBe('passed')
  expect(res2.iterations).toBe(1)

  const disk = await readDiskState(repo, home)
  expect(disk.contractsByWorktree?.[wt.id]?.id).toBe('goal-42')
  expect(disk.checksByWorktree?.[wt.id]?.passed).toBe(true)
})

test('runGoalLoop fails fast on login_failed without burning iterations', async () => {
  const { repo, home } = await makeTempRepo()
  const wt = await worktreeCreate(repo, 'auth-wt', { homeDir: home })

  const scriptPath = path.join(repo, 'mock-auth-fail.ts')
  await fs.writeFile(
    scriptPath,
    `
console.log(JSON.stringify({ type: 'result', subtype: 'authentication_failed', is_error: true, result: 'token expired' }))
`,
    'utf8',
  )

  await contractCreate(
    repo,
    {
      id: 'auth-test',
      title: 'Auth fail test',
      goal: 'Should fail fast',
      acceptanceCriteria: [{ id: 'ac1', description: 'done' }],
      includeMortise: false,
      maxIterations: 5,
      checks: [{ name: 'ok', command: ['bun', '-e', 'process.exit(0)'] }],
    },
    home,
  )

  const supervisor = new AgentSupervisor()
  const res = await runGoalLoop(supervisor, {
    repoRoot: repo,
    contractId: 'auth-test',
    cli: 'claude',
    worktreeId: wt.id,
    worktreePath: wt.path,
    branch: wt.branch,
    commandOverride: ['bun', 'run', scriptPath],
    homeDir: home,
  })

  expect(res.status).toBe('failed')
  expect(res.failureKind).toBe('login_failed')
  expect(res.iterations).toBe(1)
})

test('GoalJobManager supports async start, status, and cancel', async () => {
  const { repo, home } = await makeTempRepo()
  const wt = await worktreeCreate(repo, 'async-wt', { homeDir: home })

  const scriptPath = path.join(repo, 'mock-slow.ts')
  await fs.writeFile(scriptPath, `setTimeout(() => {}, 10000)\n`, 'utf8')

  await contractCreate(
    repo,
    {
      id: 'async-c',
      title: 'Async cancel test',
      goal: 'Wait forever',
      acceptanceCriteria: [{ id: 'ac1', description: 'done' }],
      includeMortise: false,
      checks: [{ name: 'ok', command: ['bun', '-e', 'process.exit(0)'] }],
    },
    home,
  )

  const supervisor = new AgentSupervisor()
  const manager = new GoalJobManager()
  const job = manager.start(supervisor, {
    repoRoot: repo,
    contractId: 'async-c',
    cli: 'claude',
    worktreeId: wt.id,
    worktreePath: wt.path,
    branch: wt.branch,
    commandOverride: ['bun', 'run', scriptPath],
    homeDir: home,
  })

  expect(job.status).toBe('running')
  expect(manager.list()).toHaveLength(1)

  const cancelled = manager.cancel(job.jobId)
  expect(cancelled.status).toBe('cancelled')
  await supervisor.stopAll()
})

test('AgentSupervisor handles missing binary cleanly and reconciles dead PIDs on startup', async () => {
  const { repo, home } = await makeTempRepo()
  const supervisor = new AgentSupervisor()

  // Spawn non-existent binary: should transition to failed without crashing process
  await supervisor.spawn({
    repoRoot: repo,
    id: 'missing-bin',
    cli: 'claude',
    stage: 'test',
    worktreeId: 'wt-x',
    worktreePath: repo,
    branch: 'main',
    prompt: 'hi',
    commandOverride: 'nonexistent-binary-trestle-xyz-99999',
    homeDir: home,
  })
  const [waited] = await supervisor.wait(['missing-bin'])
  expect(waited?.status).toBe('failed')
  expect(waited?.finishedAt).toBeDefined()

  // Seed a dead PID in disk state and reconcile
  await updateDiskState(
    repo,
    cur => ({
      ...cur,
      agents: {
        ...cur.agents,
        'stale-agent': {
          id: 'stale-agent',
          cli: 'codex',
          stage: 'goal(1/3)',
          worktreeId: 'wt-old',
          worktreePath: repo,
          branch: 'trestle/wt-old',
          status: 'running',
          pid: 99999999,
          startedAt: Date.now() - 60_000,
          lastActivityAt: Date.now() - 60_000,
          tail: [],
        },
      },
    }),
    home,
  )

  const recovered = await supervisor.reconcileDiskState(repo, home)
  expect(recovered).toBe(1)
  const disk = await readDiskState(repo, home)
  expect(disk.agents['stale-agent']?.status).toBe('stopped')
  expect(disk.agents['stale-agent']?.finishedAt).toBeDefined()
})

async function makeHangingAgentLoop(id: string): Promise<{
  repo: string
  home: string
  params: Parameters<typeof runGoalLoop>[1]
}> {
  const { repo, home } = await makeTempRepo()
  const wt = await worktreeCreate(repo, `${id}-wt`, { homeDir: home })
  const scriptPath = path.join(repo, 'mock-hang.ts')
  await fs.writeFile(scriptPath, `setTimeout(() => {}, 30000)\n`, 'utf8')
  await contractCreate(
    repo,
    {
      id,
      title: 'Hanging agent',
      goal: 'Never finishes',
      acceptanceCriteria: [{ id: 'ac1', description: 'done' }],
      includeMortise: false,
      baseline: 'skip',
      checks: [{ name: 'ok', command: ['bun', '-e', 'process.exit(0)'] }],
    },
    home,
  )
  return {
    repo,
    home,
    params: {
      repoRoot: repo,
      contractId: id,
      cli: 'claude',
      worktreeId: wt.id,
      worktreePath: wt.path,
      branch: wt.branch,
      commandOverride: ['bun', 'run', scriptPath],
      homeDir: home,
    },
  }
}

test('runGoalLoop does not verify or pass an iteration whose agent was stopped', async () => {
  const { repo, home, params } = await makeHangingAgentLoop('stopped-agent')
  const supervisor = new AgentSupervisor()
  const loop = runGoalLoop(supervisor, params)

  const agentId = `${params.worktreeId}-i1`
  while (!supervisor.list().some(a => a.id === agentId && a.status === 'running')) {
    await new Promise(r => setTimeout(r, 20))
  }
  await supervisor.stop(agentId)

  const res = await loop
  expect(res.status).toBe('cancelled')
  expect(res.lastReport).toBeUndefined()
  const contract = await contractRead(repo, 'stopped-agent', home)
  expect(contract.acceptanceCriteria[0]?.passed).toBe(false)
})

test('runGoalLoop stops the agent when the abort arrives while it is still spawning', async () => {
  const { params } = await makeHangingAgentLoop('abort-in-spawn')
  const controller = new AbortController()
  class AbortDuringSpawn extends AgentSupervisor {
    override async spawn(spawnParams: Parameters<AgentSupervisor['spawn']>[0]) {
      const spawned = await super.spawn(spawnParams)
      controller.abort()
      return spawned
    }
  }
  const supervisor = new AbortDuringSpawn()

  const res = await runGoalLoop(supervisor, { ...params, signal: controller.signal })

  expect(res.status).toBe('cancelled')
  expect(supervisor.list().map(a => a.status)).toEqual(['stopped'])
})

test('AgentSupervisor keeps the first terminal frame and stopByWorktree leaves finished agents alone', async () => {
  const { repo, home } = await makeTempRepo()
  const scriptPath = path.join(repo, 'mock-two-frames.ts')
  await fs.writeFile(
    scriptPath,
    `
console.log(JSON.stringify({ type: 'result', subtype: 'authentication_failed', is_error: true, result: 'token expired' }))
console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'ok' }))
`,
    'utf8',
  )
  const supervisor = new AgentSupervisor()
  await supervisor.spawn({
    repoRoot: repo,
    id: 'two-frames',
    cli: 'claude',
    stage: 'test',
    worktreeId: 'wt-frames',
    worktreePath: repo,
    branch: 'main',
    prompt: 'hi',
    commandOverride: ['bun', 'run', scriptPath],
    homeDir: home,
  })

  const [waited] = await supervisor.wait(['two-frames'])
  expect(waited?.status).toBe('failed')
  expect(waited?.failureKind).toBe('login_failed')

  await supervisor.stopByWorktree('wt-frames')
  expect(supervisor.list()[0]?.status).toBe('failed')
})
