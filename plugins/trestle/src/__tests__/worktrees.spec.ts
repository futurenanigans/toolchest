import { afterEach, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { execCommand, linkOrCopy, resolveCommand } from '../platform'
import { appendExperiment, readDiskState, readExperiments } from '../state'
import { worktreeClean, worktreeCreate, worktreeDiff, worktreeLand, worktreeList } from '../worktrees'

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

  // Uncommitted edit to tracked file README.md + new file feature.ts
  await fs.writeFile(path.join(wt.path, 'README.md'), 'hello updated\n', 'utf8')
  await fs.writeFile(path.join(wt.path, 'feature.ts'), 'export const x = 1\n', 'utf8')

  const diff = await worktreeDiff(repo, 'draft-1', { homeDir: home })
  expect(diff.changedFiles).toContain('README.md')
  expect(diff.changedFiles).toContain('feature.ts')
  expect(diff.changedFiles).not.toContain('.env')

  // Land auto-commits uncommitted changes WITHOUT committing .env even though .env is not in .gitignore
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

  // Divergent edit in worktree
  await fs.writeFile(path.join(wt.path, 'README.md'), 'worktree version\n', 'utf8')
  await execCommand('git', ['add', 'README.md'], { cwd: wt.path })
  await execCommand('git', ['commit', '-m', 'wt edit'], { cwd: wt.path })

  // Divergent edit on main
  await fs.writeFile(path.join(repo, 'README.md'), 'main version\n', 'utf8')
  await execCommand('git', ['add', 'README.md'], { cwd: repo })
  await execCommand('git', ['commit', '-m', 'main edit'], { cwd: repo })

  await expect(worktreeLand(repo, 'conflict-wt', { homeDir: home })).rejects.toThrow()

  // Main repo must not be stuck in MERGING state
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
