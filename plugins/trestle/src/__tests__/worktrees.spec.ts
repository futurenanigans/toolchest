import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { afterEach, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { execCommand, linkOrCopy, resolveCommand, processStartToken, killProcessTree } from '../platform'
import { appendExperiment, readDiskState, readExperiments } from '../state'
import { worktreeClean, worktreeCreate, worktreeDiff, worktreeLand, worktreeLandPreview, worktreeList } from '../worktrees'

const tempDirs: string[] = []

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

async function makeTempRepo(ignoreEnv = true): Promise<{ repo: string; home: string }> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'trestle-wt-test-'))
  tempDirs.push(base)
  const repo = path.join(base, 'repo')
  const home = path.join(base, 'home')
  await fs.mkdir(repo, { recursive: true })
  await fs.mkdir(home, { recursive: true })

  await execCommand('git', ['init', '-b', 'main'], { cwd: repo })
  await execCommand('git', ['config', 'user.email', 'test@example.com'], { cwd: repo })
  await execCommand('git', ['config', 'user.name', 'Test'], { cwd: repo })
  await fs.writeFile(path.join(repo, 'README.md'), 'hello\n', 'utf8')
  const gitignore = ignoreEnv ? '.env\n.trestle/\n.trestle-wt/\n' : '.trestle/\n.trestle-wt/\n'
  await fs.writeFile(path.join(repo, '.gitignore'), gitignore, 'utf8')
  await fs.writeFile(path.join(repo, '.env'), 'SECRET=123\n', 'utf8')
  await execCommand('git', ['add', 'README.md', '.gitignore'], { cwd: repo })
  await execCommand('git', ['commit', '-m', 'init'], { cwd: repo })
  return { repo, home }
}

test('resolveCommand supports runner arrays without shell', () => {
  const resolved = resolveCommand(['bun', 'x', '@openai/codex'], ['--version'])
  expect(resolved.program).toContain('bun')
  expect(resolved.args).toEqual(['x', '@openai/codex', '--version'])
})

test('linkOrCopy links or copies existing files and skips missing optional files', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'trestle-link-'))
  tempDirs.push(dir)
  const src = path.join(dir, 'a.txt')
  const dst = path.join(dir, 'sub', 'b.txt')
  await fs.writeFile(src, 'data', 'utf8')

  expect(await linkOrCopy(src, dst)).toBe(true)
  expect(await fs.readFile(dst, 'utf8')).toBe('data')
  expect(await linkOrCopy(path.join(dir, 'missing.txt'), dst, { optional: true })).toBe(false)
})

test('worktreeCreate, worktreeList, worktreeDiff (incl. uncommitted edits), worktreeLand, and worktreeClean', async () => {
  const { repo, home } = await makeTempRepo(false)
  const wt = await worktreeCreate(repo, 'draft-1', { homeDir: home })

  expect(wt.branch).toBe('trestle/draft-1')
  expect(await fs.readFile(path.join(wt.path, '.env'), 'utf8')).toBe('SECRET=123\n')

  const listed = await worktreeList(repo, home)
  expect(listed.some(w => w.id === 'draft-1' && w.tracked && w.existsOnDisk)).toBe(true)

  await fs.writeFile(path.join(wt.path, 'README.md'), 'hello updated\n', 'utf8')
  await fs.writeFile(path.join(wt.path, 'feature.ts'), 'export const x = 1\n', 'utf8')

  const diff = await worktreeDiff(repo, 'draft-1', { homeDir: home })
  expect(diff.changedFiles).toContain('README.md')
  expect(diff.changedFiles).toContain('feature.ts')
  expect(diff.changedFiles).not.toContain('.env')

  const landed = await worktreeLand(repo, 'draft-1', { homeDir: home })
  expect(landed.targetBranch).toBe('main')
  expect(await fs.readFile(path.join(repo, 'feature.ts'), 'utf8')).toBe('export const x = 1\n')
  const trackedFiles = await execCommand('git', ['ls-files'], { cwd: repo })
  expect(trackedFiles.stdout).not.toContain('.env')

  await worktreeClean(repo, 'draft-1', { homeDir: home })
  const state = await readDiskState(repo, home)
  expect(state.worktrees['draft-1']).toBeUndefined()
})

test('worktreeLand aborts merge cleanly on conflict so main repo is not left dirty', async () => {
  const { repo, home } = await makeTempRepo()
  const wt = await worktreeCreate(repo, 'conflict-wt', { homeDir: home })

  await fs.writeFile(path.join(wt.path, 'README.md'), 'worktree version\n', 'utf8')
  await execCommand('git', ['add', 'README.md'], { cwd: wt.path })
  await execCommand('git', ['commit', '-m', 'wt edit'], { cwd: wt.path })

  await fs.writeFile(path.join(repo, 'README.md'), 'main version\n', 'utf8')
  await execCommand('git', ['add', 'README.md'], { cwd: repo })
  await execCommand('git', ['commit', '-m', 'main edit'], { cwd: repo })

  await expect(worktreeLand(repo, 'conflict-wt', { homeDir: home })).rejects.toThrow()

  const status = await execCommand('git', ['status', '--porcelain'], { cwd: repo })
  expect(status.stdout.trim()).toBe('')
})

test('appendExperiment and readExperiments persist dead-end log', async () => {
  const { repo, home } = await makeTempRepo()
  await appendExperiment(
    repo,
    {
      id: 'hyp-1',
      stage: 'orchestrate',
      cli: 'codex',
      hypothesis: 'Cache hash lookups',
      outcome: 'discarded',
      metric: '+12% latency',
      reason: 'Cache miss overhead exceeded savings',
    },
    home,
  )
  const log = await readExperiments(repo, 80, home)
  expect(log).toContain('[DISCARDED] hyp-1')
  expect(log).toContain('Cache hash lookups')
})

test('worktreeDiff rejects a baseRef that git would parse as an option', async () => {
  const { repo, home } = await makeTempRepo()
  await worktreeCreate(repo, 'opt-wt', { homeDir: home })
  const target = path.join(repo, 'overwritten.txt')

  await expect(worktreeDiff(repo, 'opt-wt', { homeDir: home, baseRef: `--output=${target}` })).rejects.toThrow('Invalid git revision')
  await expect(fs.access(target)).rejects.toThrow()
})

test('worktreeLand returns the main checkout to the branch it was on', async () => {
  const { repo, home } = await makeTempRepo()
  const wt = await worktreeCreate(repo, 'land-wt', { homeDir: home })
  await fs.writeFile(path.join(wt.path, 'feature.ts'), 'export const x = 1\n', 'utf8')
  await execCommand('git', ['checkout', '-b', 'feature'], { cwd: repo })

  await worktreeLand(repo, 'land-wt', { homeDir: home, targetBranch: 'main' })

  const head = await execCommand('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repo })
  expect(head.stdout.trim()).toBe('feature')
  const onMain = await execCommand('git', ['show', 'main:feature.ts'], { cwd: repo })
  expect(onMain.exitCode).toBe(0)
})

test('long ids with a common prefix land concurrently on separate targets', async () => {
  const { repo, home } = await makeTempRepo()
  const prefix = 'feature-'.repeat(5)
  const targets = ['release-a', 'release-b']
  for (const branch of targets) await execCommand('git', ['branch', branch], { cwd: repo })
  const trees = await Promise.all(targets.map(t => worktreeCreate(repo, prefix + t, { homeDir: home })))
  expect(trees[0]!.id).not.toBe(trees[1]!.id)
  await Promise.all(trees.map((wt, i) => fs.writeFile(path.join(wt.path, 'target.txt'), targets[i]!)))
  await Promise.all(trees.map((wt, i) => worktreeLand(repo, wt.id, { targetBranch: targets[i], homeDir: home })))
  for (const target of targets) {
    expect((await execCommand('git', ['show', target + ':target.txt'], { cwd: repo })).stdout).toBe(target)
  }
  expect((await execCommand('git', ['branch', '--show-current'], { cwd: repo })).stdout.trim()).toBe('main')
})

test('mismatched process birth tokens leave a reused PID alone', async () => {
  const child = Bun.spawn([process.execPath, '-e', 'setInterval(() => {}, 1000)'])
  try {
    const start = await processStartToken(child.pid)
    expect(start).toBeTruthy()
    await killProcessTree(child.pid, 'different birth token')
    expect(await processStartToken(child.pid)).toBe(start)
  } finally {
    child.kill()
    await child.exited
  }
})

test('concurrent worktree creation appends one ignore rule and preserves unrelated landing guards', async () => {
  const { repo, home } = await makeTempRepo()
  const ignore = path.join(repo, '.gitignore')
  await fs.writeFile(ignore, '.env\r\ncache/')
  await execCommand('git', ['add', '.gitignore'], { cwd: repo })
  await execCommand('git', ['commit', '-m', 'set ignore rules'], { cwd: repo })
  const [wt] = await Promise.all(['one', 'two'].map(id => worktreeCreate(repo, id, { homeDir: home })))
  expect(await fs.readFile(ignore, 'utf8')).toBe('.env\r\ncache/\r\n/.trestle-wt/\r\n')
  expect((await execCommand('git', ['check-ignore', '-q', '.trestle-wt/one'], { cwd: repo })).exitCode).toBe(0)
  await fs.writeFile(path.join(wt!.path, 'change.txt'), 'change')
  await fs.appendFile(ignore, 'other/\n')
  await expect(worktreeLand(repo, 'one', { homeDir: home })).rejects.toThrow('uncommitted changes')
  await fs.writeFile(ignore, '.env\r\ncache/\r\n/.trestle-wt/\r\n')
  await worktreeLand(repo, 'one', { homeDir: home })
  expect(await fs.readFile(path.join(repo, 'change.txt'), 'utf8')).toBe('change')
})

test('worktree creation creates a missing .gitignore and honors existing Git exclusions', async () => {
  const { repo, home } = await makeTempRepo()
  const file = path.join(repo, '.gitignore')
  await fs.unlink(file)
  const exclude = path.join(repo, '.git/info/exclude')
  await fs.appendFile(exclude, '\n/.trestle-*/\n')
  await worktreeCreate(repo, 'excluded', { homeDir: home })
  expect(await fs.exists(file)).toBe(false)
  await fs.writeFile(exclude, '')
  await worktreeCreate(repo, 'created', { homeDir: home })
  expect(await fs.readFile(file, 'utf8')).toBe('/.trestle-wt/\n')
})

test('killProcessTree terminates an owned child and the descendant holding its output pipe', async () => {
  const script = `
    require('node:child_process').spawn(process.execPath,
      ['-e', 'console.log("ready"); setTimeout(() => process.exit(1), 10_000)'], { stdio: 'inherit' })
    setTimeout(() => process.exit(1), 10_000)
  `
  const child = spawn(process.execPath, ['-e', script], {
    detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'ignore'],
  })
  const closed = once(child, 'close')
  try {
    await once(child.stdout, 'data')
    const token = await processStartToken(child.pid)
    expect(token).toBeTruthy()
    await killProcessTree(child.pid, token)
    await closed
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill()
  }
})

test('a branch that edits .gitignore lands over the uncommitted worktree ignore rule', async () => {
  const { repo, home } = await makeTempRepo()
  const ignore = path.join(repo, '.gitignore')
  await fs.writeFile(ignore, '.env\n')
  await execCommand('git', ['commit', '-am', 'drop the worktree rule'], { cwd: repo })
  const wt = await worktreeCreate(repo, 'ignore-edit', { homeDir: home })
  expect(await fs.readFile(ignore, 'utf8')).toBe('.env\n/.trestle-wt/\n')
  await fs.appendFile(path.join(wt.path, '.gitignore'), 'dist/\n')

  await worktreeLand(repo, 'ignore-edit', { homeDir: home })

  expect((await execCommand('git', ['show', 'main:.gitignore'], { cwd: repo })).stdout).toBe('.env\ndist/\n')
  expect(await fs.readFile(ignore, 'utf8')).toBe('.env\ndist/\n/.trestle-wt/\n')
})

test('a branch that adds the first .gitignore lands over the one Trestle created', async () => {
  const { repo, home } = await makeTempRepo()
  const ignore = path.join(repo, '.gitignore')
  await fs.rm(path.join(repo, '.env'))
  await execCommand('git', ['rm', '-q', '.gitignore'], { cwd: repo })
  await execCommand('git', ['commit', '-m', 'no ignore file'], { cwd: repo })
  const wt = await worktreeCreate(repo, 'ignore-add', { homeDir: home })
  expect(await fs.readFile(ignore, 'utf8')).toBe('/.trestle-wt/\n')
  await fs.writeFile(path.join(wt.path, '.gitignore'), 'dist/\n')

  await worktreeLand(repo, 'ignore-add', { homeDir: home })

  expect(await fs.readFile(ignore, 'utf8')).toBe('dist/\n/.trestle-wt/\n')
})

test('the land preview lists only what the merge brings in when the target has moved on', async () => {
  const { repo, home } = await makeTempRepo()
  const wt = await worktreeCreate(repo, 'preview-moved', { homeDir: home })
  await fs.writeFile(path.join(wt.path, 'feature.ts'), 'export const x = 1\n')
  await fs.writeFile(path.join(repo, 'later.txt'), 'added on main after the worktree\n')
  await execCommand('git', ['add', 'later.txt'], { cwd: repo })
  await execCommand('git', ['commit', '-m', 'main moves on'], { cwd: repo })

  const preview = await worktreeLandPreview(repo, 'preview-moved', { homeDir: home })

  expect(preview.files).toEqual(['feature.ts'])
  expect(preview.diff).not.toContain('later.txt')
})
