import { afterEach, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { execCommand } from '../platform'
import {
  queueAdd,
  queueClear,
  queueFilePath,
  queueList,
  queueReadyItems,
  queueReconcile,
  queueRemove,
  queueRetry,
  queueRunNext,
  queueUpdate,
} from '../queue'
import { AgentSupervisor } from '../supervisor'
import { worktreeCreate } from '../worktrees'

const tempDirs: string[] = []

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

async function makeTempRepo(): Promise<{ repo: string; home: string }> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'trestle-queue-'))
  tempDirs.push(base)
  const repo = path.join(base, 'repo')
  const home = path.join(base, 'home')
  await fs.mkdir(repo, { recursive: true })
  await fs.mkdir(home, { recursive: true })

  await execCommand('git', ['init', '-b', 'main'], { cwd: repo })
  await execCommand('git', ['config', 'user.email', 'test@example.com'], { cwd: repo })
  await execCommand('git', ['config', 'user.name', 'Test'], { cwd: repo })
  await fs.writeFile(path.join(repo, '.gitignore'), '.trestle/\n.trestle-wt/\n', 'utf8')
  await fs.writeFile(path.join(repo, 'README.md'), 'init\n', 'utf8')
  await execCommand('git', ['add', '.gitignore', 'README.md'], { cwd: repo })
  await execCommand('git', ['commit', '-m', 'init'], { cwd: repo })
  return { repo, home }
}

test('queue persists in user home keyed by repo and enforces cycle detection, update, and dependencies', async () => {
  const { repo, home } = await makeTempRepo()

  await queueAdd(
    repo,
    { id: 'task-a', title: 'Task A', goal: 'Create a.txt', acceptanceCriteria: [{ id: 'c1', description: 'a.txt' }] },
    home,
  )
  await queueAdd(
    repo,
    {
      id: 'task-b',
      title: 'Task B',
      goal: 'Create b.txt',
      acceptanceCriteria: [{ id: 'c1', description: 'b.txt' }],
      dependsOn: ['task-a'],
    },
    home,
  )

  const qPath = queueFilePath(repo, home)
  expect(qPath.startsWith(path.join(home, '.trestle'))).toBe(true)
  expect(qPath.endsWith('queue.json')).toBe(true)
  expect(await fs.exists(qPath)).toBe(true)

  await expect(
    queueAdd(
      repo,
      { id: 'task-c', title: 'C', goal: 'C', acceptanceCriteria: [], dependsOn: ['task-c'] },
      home,
    ),
  ).rejects.toThrow('cycle')

  const updated = await queueUpdate(repo, 'task-a', { priority: 10, model: 'claude-sonnet-4-5' }, home)
  expect(updated.priority).toBe(10)
  expect(updated.model).toBe('claude-sonnet-4-5')

  const ready = await queueReadyItems(repo, home)
  expect(ready.map(i => i.id)).toEqual(['task-a'])

  expect(await queueRemove(repo, 'task-b', home)).toBe(true)
  expect((await queueList(repo, home)).map(i => i.id)).toEqual(['task-a'])
})

test('queueRunNext executes ready items in parallel, lands sequentially (even without explicit targetBranch), and handles retry/blocked/clear', async () => {
  const { repo, home } = await makeTempRepo()

  const scriptPath = path.join(repo, 'mock-q-producer.ts')
  await fs.writeFile(
    scriptPath,
    `
import * as fs from 'node:fs'
import * as readline from 'node:readline'
const rl = readline.createInterface({ input: process.stdin })
rl.once('line', line => {
  rl.close()
  if (line.includes('Create a.txt')) fs.writeFileSync('a.txt', 'A\\n', 'utf8')
  if (line.includes('Create b.txt')) fs.writeFileSync('b.txt', 'B\\n', 'utf8')
  if (line.includes('Create c.txt')) fs.writeFileSync('c.txt', 'C\\n', 'utf8')
  console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'ok' }))
})
`,
    'utf8',
  )
  await execCommand('git', ['add', 'mock-q-producer.ts'], { cwd: repo })
  await execCommand('git', ['commit', '-m', 'add mock'], { cwd: repo })

  await queueAdd(
    repo,
    {
      id: 'a',
      title: 'Add a.txt',
      goal: 'Create a.txt',
      acceptanceCriteria: [{ id: 'ac', description: 'a.txt exists' }],
      includeMortise: false,
      baseline: 'skip',
      checks: [{ name: 'chk-a', command: ['bun', '-e', 'if (!require("fs").existsSync("a.txt")) process.exit(1)'] }],
    },
    home,
  )
  await queueAdd(
    repo,
    {
      id: 'b',
      title: 'Add b.txt',
      goal: 'Create b.txt',
      acceptanceCriteria: [{ id: 'bc', description: 'b.txt exists' }],
      includeMortise: false,
      baseline: 'skip',
      checks: [{ name: 'chk-b', command: ['bun', '-e', 'if (!require("fs").existsSync("b.txt")) process.exit(1)'] }],
    },
    home,
  )
  await queueAdd(
    repo,
    {
      id: 'c',
      title: 'Add c.txt',
      goal: 'Create c.txt',
      acceptanceCriteria: [{ id: 'cc', description: 'c.txt exists' }],
      dependsOn: ['a', 'b'],
      includeMortise: false,
      baseline: 'skip',
      checks: [{ name: 'chk-c', command: ['bun', '-e', 'if (!require("fs").existsSync("c.txt")) process.exit(1)'] }],
    },
    home,
  )

  const supervisor = new AgentSupervisor()
  const batch1 = await queueRunNext(supervisor, repo, {
    maxParallel: 2,
    homeDir: home,
    commandOverride: ['bun', 'run', scriptPath],
  })
  expect(batch1.dispatched).toBe(2)
  expect(batch1.landed.sort()).toEqual(['a', 'b'])
  expect(batch1.failed).toEqual([])

  const batch2 = await queueRunNext(supervisor, repo, {
    maxParallel: 2,
    homeDir: home,
    commandOverride: ['bun', 'run', scriptPath],
  })
  expect(batch2.dispatched).toBe(1)
  expect(batch2.landed).toEqual(['c'])

  expect(await fs.readFile(path.join(repo, 'a.txt'), 'utf8')).toBe('A\n')
  expect(await fs.readFile(path.join(repo, 'b.txt'), 'utf8')).toBe('B\n')
  expect(await fs.readFile(path.join(repo, 'c.txt'), 'utf8')).toBe('C\n')

  await queueAdd(
    repo,
    {
      id: 'fail-parent',
      title: 'Fail parent',
      goal: 'Will fail check',
      acceptanceCriteria: [{ id: 'fp', description: 'never passes' }],
      includeMortise: false,
      baseline: 'skip',
      maxIterations: 1,
      checks: [{ name: 'always-fail', command: ['bun', '-e', 'process.exit(1)'] }],
    },
    home,
  )
  await queueAdd(
    repo,
    {
      id: 'blocked-child',
      title: 'Blocked child',
      goal: 'Depends on fail-parent',
      acceptanceCriteria: [{ id: 'bc', description: 'ok' }],
      dependsOn: ['fail-parent'],
    },
    home,
  )

  const failBatch = await queueRunNext(supervisor, repo, {
    maxParallel: 1,
    homeDir: home,
    commandOverride: ['bun', 'run', scriptPath],
  })
  expect(failBatch.failed.map(f => f.id)).toEqual(['fail-parent'])

  const listed = await queueList(repo, home)
  expect(listed.find(i => i.id === 'blocked-child')?.status).toBe('blocked')

  const retried = await queueRetry(repo, 'fail-parent', { homeDir: home, supervisor })
  expect(retried.status).toBe('queued')
  const afterRetry = await queueList(repo, home)
  expect(afterRetry.find(i => i.id === 'blocked-child')?.status).toBe('queued')

  const cleared = await queueClear(repo, ['landed'], home)
  expect(cleared.removed.sort()).toEqual(['a', 'b', 'c'])
})

test('queueReconcile recovers stuck running items after crash', async () => {
  const { repo, home } = await makeTempRepo()
  await queueAdd(
    repo,
    { id: 'stuck', title: 'Stuck', goal: 'Stuck', acceptanceCriteria: [{ id: 's1', description: 'ok' }] },
    home,
  )
  const qPath = queueFilePath(repo, home)
  const raw = JSON.parse(await fs.readFile(qPath, 'utf8'))
  raw.items.stuck.status = 'running'
  await fs.writeFile(qPath, JSON.stringify(raw, null, 2), 'utf8')

  const recovered = await queueReconcile(repo, home)
  expect(recovered).toEqual(['stuck'])
  const items = await queueList(repo, home)
  expect(items[0]?.status).toBe('failed')
  expect(items[0]?.error).toContain('Interrupted')
})

test('queueReconcile leaves items owned by a live Trestle process running', async () => {
  const { repo, home } = await makeTempRepo()
  await queueAdd(
    repo,
    { id: 'live', title: 'Live', goal: 'Live', acceptanceCriteria: [{ id: 'l1', description: 'ok' }] },
    home,
  )
  const qPath = queueFilePath(repo, home)
  const raw = JSON.parse(await fs.readFile(qPath, 'utf8'))
  raw.items.live.status = 'running'
  raw.items.live.ownerPid = process.pid
  await fs.writeFile(qPath, JSON.stringify(raw, null, 2), 'utf8')

  expect(await queueReconcile(repo, home)).toEqual([])
  expect((await queueList(repo, home))[0]?.status).toBe('running')
})

test('queueRetry keeps the worktree of an item that passed its gate but failed to land', async () => {
  const { repo, home } = await makeTempRepo()
  await queueAdd(
    repo,
    { id: 'passed', title: 'Passed', goal: 'Passed', acceptanceCriteria: [{ id: 'p1', description: 'ok' }] },
    home,
  )
  const wt = await worktreeCreate(repo, 'q-passed', { homeDir: home })
  await fs.writeFile(path.join(wt.path, 'work.txt'), 'passing work\n', 'utf8')
  await execCommand('git', ['add', 'work.txt'], { cwd: wt.path })
  await execCommand('git', ['commit', '-m', 'work'], { cwd: wt.path })
  const qPath = queueFilePath(repo, home)
  const raw = JSON.parse(await fs.readFile(qPath, 'utf8'))
  raw.items.passed = { ...raw.items.passed, status: 'failed', worktreeId: wt.id, gatePassed: true, error: 'dirty checkout' }
  await fs.writeFile(qPath, JSON.stringify(raw, null, 2), 'utf8')

  await expect(queueRetry(repo, 'passed', { homeDir: home })).rejects.toThrow('passed its checks')
  const branch = await execCommand('git', ['show', `${wt.branch}:work.txt`], { cwd: repo })
  expect(branch.stdout).toBe('passing work\n')
})

async function commitMockProducer(repo: string, body: string): Promise<string> {
  const scriptPath = path.join(repo, 'mock-q-producer.ts')
  await fs.writeFile(
    scriptPath,
    `
import * as fs from 'node:fs'
import * as readline from 'node:readline'
import { execFileSync } from 'node:child_process'
const rl = readline.createInterface({ input: process.stdin })
rl.once('line', () => {
  rl.close()
  ${body}
  console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'ok' }))
})
`,
    'utf8',
  )
  await execCommand('git', ['add', 'mock-q-producer.ts'], { cwd: repo })
  await execCommand('git', ['commit', '-m', 'add mock'], { cwd: repo })
  return scriptPath
}

test('queueRunNext records the worktree of an item whose goal loop threw so queueRetry can clean it', async () => {
  const { repo, home } = await makeTempRepo()
  const scriptPath = await commitMockProducer(repo, `fs.writeFileSync('a.txt', 'A\\n', 'utf8')`)
  await queueAdd(
    repo,
    {
      id: 'a',
      title: 'Add a.txt',
      goal: 'Create a.txt',
      acceptanceCriteria: [{ id: 'ac', description: 'a.txt exists' }],
      includeMortise: false,
      baseline: 'skip',
      checks: [{ name: 'chk-a', command: ['bun', '-e', 'if (!require("fs").existsSync("a.txt")) process.exit(1)'] }],
    },
    home,
  )

  class SpawnThrows extends AgentSupervisor {
    override async spawn(): Promise<never> {
      throw new Error('spawn exploded')
    }
  }
  const failBatch = await queueRunNext(new SpawnThrows(), repo, {
    homeDir: home,
    commandOverride: ['bun', 'run', scriptPath],
  })
  expect(failBatch.failed).toEqual([{ id: 'a', error: 'spawn exploded' }])
  expect((await queueList(repo, home))[0]?.worktreeId).toBe('q-a')

  const supervisor = new AgentSupervisor()
  await queueRetry(repo, 'a', { homeDir: home, supervisor })
  const retryBatch = await queueRunNext(supervisor, repo, {
    homeDir: home,
    commandOverride: ['bun', 'run', scriptPath],
  })
  expect(retryBatch.failed).toEqual([])
  expect(retryBatch.landed).toEqual(['a'])
})

test('an item interrupted mid-run keeps its worktree on record so queueRetry can clean it and rerun', async () => {
  const { repo, home } = await makeTempRepo()
  const scriptPath = await commitMockProducer(repo, `fs.writeFileSync('a.txt', 'A\\n', 'utf8')`)
  await queueAdd(
    repo,
    {
      id: 'a',
      title: 'Add a.txt',
      goal: 'Create a.txt',
      acceptanceCriteria: [{ id: 'ac', description: 'a.txt exists' }],
      includeMortise: false,
      baseline: 'skip',
      checks: [{ name: 'chk-a', command: ['bun', '-e', 'if (!require("fs").existsSync("a.txt")) process.exit(1)'] }],
    },
    home,
  )

  const qPath = queueFilePath(repo, home)
  let midRun = ''
  class SnapshotsThenThrows extends AgentSupervisor {
    override async spawn(): Promise<never> {
      midRun = await fs.readFile(qPath, 'utf8')
      throw new Error('server died here')
    }
  }
  await queueRunNext(new SnapshotsThenThrows(), repo, { homeDir: home, commandOverride: ['bun', 'run', scriptPath] })
  const crashed = JSON.parse(midRun)
  expect(crashed.items.a).toMatchObject({ status: 'running', worktreeId: 'q-a' })
  crashed.items.a.ownerPid = 99999999
  await fs.writeFile(qPath, JSON.stringify(crashed, null, 2), 'utf8')

  expect(await queueReconcile(repo, home)).toEqual(['a'])
  const supervisor = new AgentSupervisor()
  await queueRetry(repo, 'a', { homeDir: home, supervisor })
  const retryBatch = await queueRunNext(supervisor, repo, { homeDir: home, commandOverride: ['bun', 'run', scriptPath] })
  expect(retryBatch.failed).toEqual([])
  expect(retryBatch.landed).toEqual(['a'])
})

test('queueReconcile recovers a running item whose owner PID now belongs to another process', async () => {
  const { repo, home } = await makeTempRepo()
  await queueAdd(
    repo,
    { id: 'reused', title: 'Reused', goal: 'Reused', acceptanceCriteria: [{ id: 'r1', description: 'ok' }] },
    home,
  )
  const qPath = queueFilePath(repo, home)
  const raw = JSON.parse(await fs.readFile(qPath, 'utf8'))
  raw.items.reused = { ...raw.items.reused, status: 'running', ownerPid: process.pid, ownerStart: 'started before the reboot' }
  await fs.writeFile(qPath, JSON.stringify(raw, null, 2), 'utf8')

  expect(await queueReconcile(repo, home)).toEqual(['reused'])
  expect(await queueRemove(repo, 'reused', home)).toBe(true)
})

test('queueRunNext re-checks the first item against a target branch that moved during its run', async () => {
  const { repo, home } = await makeTempRepo()
  const scriptPath = await commitMockProducer(
    repo,
    `
  fs.writeFileSync('a.txt', 'A\\n', 'utf8')
  const repo = ${JSON.stringify(repo)}
  fs.writeFileSync(repo + '/poison.txt', 'P\\n', 'utf8')
  execFileSync('git', ['add', 'poison.txt'], { cwd: repo })
  execFileSync('git', ['commit', '-m', 'move main'], { cwd: repo })
`,
  )
  await queueAdd(
    repo,
    {
      id: 'a',
      title: 'Add a.txt',
      goal: 'Create a.txt',
      acceptanceCriteria: [{ id: 'ac', description: 'a.txt exists' }],
      includeMortise: false,
      baseline: 'skip',
      checks: [{ name: 'no-poison', command: ['bun', '-e', 'if (require("fs").existsSync("poison.txt")) process.exit(1)'] }],
    },
    home,
  )

  const batch = await queueRunNext(new AgentSupervisor(), repo, {
    homeDir: home,
    commandOverride: ['bun', 'run', scriptPath],
  })

  expect(batch.landed).toEqual([])
  expect(batch.failed[0]?.error).toContain('Post-merge recheck failed')
  expect(await fs.exists(path.join(repo, 'a.txt'))).toBe(false)
})

test('two server processes racing to dispatch the same item claim it once', async () => {
  const { repo, home } = await makeTempRepo()
  await queueAdd(repo, {
    id: 'race', title: 'Race', goal: 'Race', acceptanceCriteria: [],
    includeMortise: false, checks: [{ name: 'base-red', command: ['bun', '-e', 'process.exit(1)'] }],
  }, home)
  const code = `
    import { queueRunNext } from ${JSON.stringify(path.resolve(import.meta.dir, '../queue.ts'))}
    import { AgentSupervisor } from ${JSON.stringify(path.resolve(import.meta.dir, '../supervisor.ts'))}
    const result = await queueRunNext(new AgentSupervisor(), process.argv[1], { homeDir: process.argv[2] })
    console.log(result.dispatched)
  `
  const run = () => execCommand('bun', ['-e', code, repo, home])
  const results = await Promise.all([run(), run()])
  expect(results.map(r => r.stderr)).toEqual(['', ''])
  expect(results.map(r => r.stdout.trim()).sort()).toEqual(['0', '1'])
})

test('concurrent edits to distinct fields of one queue item both survive', async () => {
  const { repo, home } = await makeTempRepo()
  await queueAdd(repo, { id: 'shared', title: 'Shared', goal: 'Fixture', acceptanceCriteria: [] }, home)
  await Promise.all([
    queueUpdate(repo, 'shared', { priority: 7 }, home),
    queueUpdate(repo, 'shared', { maxIterations: 3 }, home),
  ])
  expect(await queueList(repo, home)).toMatchObject([{ id: 'shared', priority: 7, maxIterations: 3 }])
})
