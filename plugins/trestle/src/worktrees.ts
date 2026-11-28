import * as fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import * as path from 'node:path'

import { withFileLock } from './locks'
import { execCommand, killProcessTree, linkOrCopy, userHome } from './platform'
import { type PersistedWorktree, readDiskState, sessionHomeDir, updateDiskState } from './state'
import type { AgentSupervisor } from './supervisor'
import { ensureWorktreeIgnored, onlyWorktreeIgnoreAdded, WORKTREE_ROOT_DIR } from './worktree_ignore'

const ENV_FILES_TO_LINK = ['.env', '.env.local']
const MAX_DIFF_CHARS = 100_000

async function git(repoRoot: string, args: readonly string[]): Promise<string> {
  const res = await execCommand('git', args, { cwd: repoRoot })
  if (res.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} failed (${res.exitCode}): ${res.stderr.trim() || res.stdout.trim()}`)
  }
  return res.stdout.trim()
}

export async function resolveAgentWorktree(repoRoot: string, worktreePath: string): Promise<string> {
  const root = path.join(await fs.realpath(repoRoot), WORKTREE_ROOT_DIR)
  const candidate = await fs.realpath(worktreePath)
  const relative = path.relative(root, candidate)
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    throw new Error('worktreePath must be inside the repository’s .trestle-wt directory')
  }
  if (!(await fs.stat(candidate)).isDirectory()) throw new Error('worktreePath must be a directory')
  return candidate
}

export function assertRevisionArg(ref: string): string {
  if (!ref || ref.startsWith('-')) throw new Error(`Invalid git revision: '${ref}'`)
  return ref
}

export function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '')
  if (!cleaned) throw new Error(`Invalid worktree id: ${raw}`)
  if (raw.length <= 32) return cleaned
  const suffix = createHash('sha256').update(raw).digest('hex').slice(0, 12)
  return cleaned.slice(0, 19) + '-' + suffix
}

export async function linkWorktreeEnv(resolvedRoot: string, wtPath: string): Promise<void> {
  for (const envFile of ENV_FILES_TO_LINK) {
    await linkOrCopy(path.join(resolvedRoot, envFile), path.join(wtPath, envFile), { optional: true })
  }
}

export async function worktreeCreate(
  repoRoot: string,
  rawId: string,
  options: { baseRef?: string; detached?: boolean; requireNewBranch?: boolean; homeDir?: string } = {},
): Promise<PersistedWorktree> {
  const id = sanitizeId(rawId)
  const resolvedRoot = path.resolve(repoRoot)
  const homeDir = options.homeDir ?? userHome()
  const wtPath = path.join(resolvedRoot, WORKTREE_ROOT_DIR, id)
  let baseRef = options.baseRef !== undefined
    ? assertRevisionArg(options.baseRef)
    : await git(resolvedRoot, ['rev-parse', '--abbrev-ref', 'HEAD'])
  if (baseRef === 'HEAD') {
    baseRef = await git(resolvedRoot, ['rev-parse', 'HEAD'])
  }
  const branch = options.detached ? 'HEAD' : `trestle/${id}`

  await ensureWorktreeIgnored(resolvedRoot)
  await fs.mkdir(path.dirname(wtPath), { recursive: true })

  if (options.detached) {
    await git(resolvedRoot, ['worktree', 'add', '--detach', wtPath, baseRef])
  } else {
    const branchExists = await execCommand('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], {
      cwd: resolvedRoot,
    })
    if (branchExists.exitCode === 0) {
      if (options.requireNewBranch) throw new Error(`Queue branch already exists: ${branch}`)
      await git(resolvedRoot, ['worktree', 'add', wtPath, branch])
    } else {
      await git(resolvedRoot, ['worktree', 'add', '-b', branch, wtPath, baseRef])
    }
  }

  await linkWorktreeEnv(resolvedRoot, wtPath)

  const record: PersistedWorktree = {
    id,
    path: wtPath,
    branch,
    baseRef,
    createdAt: Date.now(),
  }

  await updateDiskState(
    resolvedRoot,
    state => ({
      ...state,
      worktrees: { ...state.worktrees, [id]: record },
    }),
    homeDir,
  )

  return record
}

export interface WorktreeListEntry {
  id: string
  path: string
  branch: string
  baseRef?: string
  tracked: boolean
  existsOnDisk: boolean
  createdAt?: number
}

export async function worktreeList(repoRoot: string, homeDir = userHome()): Promise<WorktreeListEntry[]> {
  const resolvedRoot = path.resolve(repoRoot)
  const state = await readDiskState(resolvedRoot, homeDir)
  const gitRes = await execCommand('git', ['worktree', 'list', '--porcelain'], { cwd: resolvedRoot })

  const gitByPath = new Map<string, { path: string; branch: string }>()
  if (gitRes.exitCode === 0) {
    let curPath = ''
    let curBranch = 'HEAD'
    for (const line of `${gitRes.stdout}\n`.split('\n')) {
      if (line.startsWith('worktree ')) {
        curPath = path.resolve(line.slice('worktree '.length).trim())
        curBranch = 'HEAD'
      } else if (line.startsWith('branch refs/heads/')) {
        curBranch = line.slice('branch refs/heads/'.length).trim()
      } else if (line.trim() === '' && curPath) {
        gitByPath.set(curPath, { path: curPath, branch: curBranch })
        curPath = ''
      }
    }
  }

  const entries: WorktreeListEntry[] = []
  const seenPaths = new Set<string>()

  for (const wt of Object.values(state.worktrees)) {
    const resolvedWt = path.resolve(wt.path)
    seenPaths.add(resolvedWt)
    let existsOnDisk = false
    try {
      await fs.access(resolvedWt)
      existsOnDisk = true
    } catch {
      existsOnDisk = false
    }
    entries.push({
      id: wt.id,
      path: resolvedWt,
      branch: gitByPath.get(resolvedWt)?.branch ?? wt.branch,
      baseRef: wt.baseRef,
      tracked: true,
      existsOnDisk,
      createdAt: wt.createdAt,
    })
  }

  const wtRootPrefix = `${path.join(resolvedRoot, WORKTREE_ROOT_DIR)}${path.sep}`
  for (const [wtPath, info] of gitByPath.entries()) {
    if (seenPaths.has(wtPath) || !wtPath.startsWith(wtRootPrefix)) continue
    entries.push({
      id: path.basename(wtPath),
      path: wtPath,
      branch: info.branch,
      tracked: false,
      existsOnDisk: true,
    })
  }

  return entries
}

export async function worktreeDiff(
  repoRoot: string,
  rawId: string,
  options: { baseRef?: string; homeDir?: string; maxChars?: number } = {},
): Promise<{ id: string; branch: string; changedFiles: string[]; stat: string; diff: string; truncated: boolean }> {
  const id = sanitizeId(rawId)
  const resolvedRoot = path.resolve(repoRoot)
  const state = await readDiskState(resolvedRoot, options.homeDir ?? userHome())
  const wt = state.worktrees[id]
  if (!wt) throw new Error(`Unknown worktree: ${id}`)

  const base = assertRevisionArg(options.baseRef ?? wt.baseRef)
  const statusOut = await git(wt.path, ['status', '--porcelain'])
  const trackedFiles = await git(wt.path, ['diff', '--name-only', base])
  const stat = await git(wt.path, ['diff', '--stat', base])
  const fullDiff = await git(wt.path, ['diff', base])

  const untracked = statusOut
    .split('\n')
    .filter(l => l.startsWith('?? '))
    .map(l => l.slice(3).trim())
    .filter(f => !ENV_FILES_TO_LINK.includes(f))

  const changedFiles = Array.from(
    new Set([
      ...trackedFiles.split('\n').filter(Boolean),
      ...untracked,
    ]),
  )

  const cap = options.maxChars ?? MAX_DIFF_CHARS
  const truncated = fullDiff.length > cap
  const diff = truncated ? `${fullDiff.slice(0, cap)}\n\n... [diff truncated at ${cap} chars]` : fullDiff

  return { id, branch: wt.branch, changedFiles, stat, diff, truncated }
}

export async function commitWorktreeChanges(wtPath: string, message: string): Promise<boolean> {
  const status = await git(wtPath, ['status', '--porcelain'])
  if (!status) return false

  const excluded: string[] = []
  for (const envFile of ENV_FILES_TO_LINK) {
    const ignored = await execCommand('git', ['check-ignore', '-q', '--', envFile], { cwd: wtPath })
    if (ignored.exitCode !== 0) excluded.push(`:!${envFile}`)
  }
  const pathspecs = ['.', ...excluded]
  await git(wtPath, ['add', '-A', '--', ...pathspecs])

  const staged = await execCommand('git', ['diff', '--cached', '--quiet'], { cwd: wtPath })
  if (staged.exitCode === 0) return false

  await git(wtPath, ['commit', '-m', message])
  return true
}

export interface WorktreeLandPreview {
  id: string
  preview: true
  targetBranch: string
  repoClean: boolean
  hasChanges: boolean
  files: string[]
  stat: string
  diff: string
  truncated: boolean
}

export async function worktreeLandPreview(
  repoRoot: string,
  rawId: string,
  options: { targetBranch?: string; maxDiffChars?: number; homeDir?: string } = {},
): Promise<WorktreeLandPreview> {
  const id = sanitizeId(rawId)
  const resolvedRoot = path.resolve(repoRoot)
  const homeDir = options.homeDir ?? userHome()
  const state = await readDiskState(resolvedRoot, homeDir)
  const wt = state.worktrees[id]
  if (!wt) throw new Error(`Unknown worktree: ${id}`)
  const targetBranch = options.targetBranch ?? wt.baseRef
  const targetRefCheck = await execCommand('git', ['show-ref', '--verify', '--quiet', `refs/heads/${targetBranch}`], {
    cwd: resolvedRoot,
  })
  if (targetRefCheck.exitCode !== 0) {
    throw new Error(`Target branch '${targetBranch}' is not a local branch (detached HEAD or missing ref); specify targetBranch explicitly`)
  }
  const repoDirty = await git(resolvedRoot, ['status', '--porcelain', '--untracked-files=no'])
  const ignoreRuleOnly = repoDirty === 'M .gitignore' && await onlyWorktreeIgnoreAdded(resolvedRoot)
  const repoClean = !repoDirty || ignoreRuleOnly
  const diff = await worktreeDiff(resolvedRoot, id, {
    baseRef: targetBranch,
    maxChars: options.maxDiffChars,
    homeDir,
  })
  return {
    id,
    preview: true,
    targetBranch,
    repoClean,
    hasChanges: diff.changedFiles.length > 0 || diff.diff.trim().length > 0,
    files: diff.changedFiles,
    stat: diff.stat,
    diff: diff.diff,
    truncated: diff.truncated,
  }
}

export async function worktreeLand(
  repoRoot: string,
  rawId: string,
  options: {
    targetBranch?: string
    commitMessage?: string
    homeDir?: string
    beforeMerge?: () => Promise<void>
  } = {},
): Promise<{ id: string; landedCommit: string; targetBranch: string }> {
  const id = sanitizeId(rawId)
  const resolvedRoot = path.resolve(repoRoot)
  const homeDir = options.homeDir ?? userHome()
  const commonDir = await git(resolvedRoot, ['rev-parse', '--git-common-dir'])
  return withFileLock(path.resolve(resolvedRoot, commonDir, 'trestle-land.lock'), async () => {
    const state = await readDiskState(resolvedRoot, homeDir)
    const wt = state.worktrees[id]
    if (!wt) throw new Error(`Unknown worktree: ${id}`)
    if (wt.branch === 'HEAD') {
      throw new Error(`Cannot land detached worktree ${id} by branch name; commit or cherry-pick manually`)
    }

    await commitWorktreeChanges(wt.path, options.commitMessage ?? `trestle: land ${id}`)

    await options.beforeMerge?.()
    const targetBranch = options.targetBranch ?? wt.baseRef
    const targetRefCheck = await execCommand('git', ['show-ref', '--verify', '--quiet', `refs/heads/${targetBranch}`], {
      cwd: resolvedRoot,
    })
    if (targetRefCheck.exitCode !== 0) {
      throw new Error(`Target branch '${targetBranch}' is not a local branch (detached HEAD or missing ref); specify targetBranch explicitly`)
    }

    const repoDirty = await git(resolvedRoot, ['status', '--porcelain', '--untracked-files=no'])
    const ignoreRuleOnly = repoDirty === 'M .gitignore' && await onlyWorktreeIgnoreAdded(resolvedRoot)
    if (repoDirty && !ignoreRuleOnly) {
      throw new Error(`Target repository ${resolvedRoot} has uncommitted changes; clean before landing`)
    }

    const currentBranch = await git(resolvedRoot, ['rev-parse', '--abbrev-ref', 'HEAD'])
    const restoreTo = currentBranch === 'HEAD' ? await git(resolvedRoot, ['rev-parse', 'HEAD']) : currentBranch
    const switched = currentBranch !== targetBranch
    if (switched) {
      await git(resolvedRoot, ['checkout', targetBranch])
    }

    try {
      try {
        await git(resolvedRoot, [
          'merge',
          '--no-ff',
          wt.branch,
          '-m',
          options.commitMessage ?? `Merge ${wt.branch} into ${targetBranch}`,
        ])
      } catch (err) {
        await execCommand('git', ['merge', '--abort'], { cwd: resolvedRoot }).catch(() => {})
        throw err
      }
      const landedCommit = await git(resolvedRoot, ['rev-parse', 'HEAD'])
      return { id, landedCommit, targetBranch }
    } finally {
      if (switched) {
        await git(resolvedRoot, ['checkout', restoreTo])
      }
    }
  })
}

export async function worktreeClean(
  repoRoot: string,
  rawId: string,
  options: { deleteBranch?: boolean; homeDir?: string; supervisor?: AgentSupervisor } = {},
): Promise<void> {
  const id = sanitizeId(rawId)
  const resolvedRoot = path.resolve(repoRoot)
  const homeDir = options.homeDir ?? userHome()
  const state = await readDiskState(resolvedRoot, homeDir)
  const wt = state.worktrees[id]

  if (options.supervisor) {
    await options.supervisor.stopByWorktree(id)
  }

  for (const agent of Object.values(state.agents)) {
    const isActive = agent.status === 'starting' || agent.status === 'running' || agent.status === 'idle'
    if (agent.worktreeId === id && isActive && agent.pid && agent.processStart) {
      await killProcessTree(agent.pid, agent.processStart)
    }
  }

  const wtPath = wt?.path ?? path.join(resolvedRoot, WORKTREE_ROOT_DIR, id)
  const maxAttempts = 4
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await execCommand('git', ['worktree', 'remove', '--force', wtPath], { cwd: resolvedRoot })
    if (res.exitCode === 0) break
    const isBusy = /EBUSY|Permission denied|used by another process/i.test(res.stderr)
    if (!isBusy || attempt === maxAttempts) {
      await fs.rm(wtPath, { recursive: true, force: true }).catch(() => {})
      await execCommand('git', ['worktree', 'prune'], { cwd: resolvedRoot })
      break
    }
    await new Promise(r => setTimeout(r, 250 * attempt))
  }

  if (options.deleteBranch !== false && wt && wt.branch !== 'HEAD') {
    await execCommand('git', ['branch', '-D', wt.branch], { cwd: resolvedRoot })
  }

  for (const cli of ['claude', 'codex', 'opencode', 'agy', 'pi'] as const) {
    const sDir = sessionHomeDir(resolvedRoot, `${id}-${cli}`, homeDir)
    await fs.rm(sDir, { recursive: true, force: true }).catch(() => {})
  }

  await updateDiskState(
    resolvedRoot,
    cur => {
      const nextWorktrees = { ...cur.worktrees }
      delete nextWorktrees[id]
      const nextContracts = cur.contractsByWorktree ? { ...cur.contractsByWorktree } : undefined
      if (nextContracts) delete nextContracts[id]
      const nextChecks = cur.checksByWorktree ? { ...cur.checksByWorktree } : undefined
      if (nextChecks) delete nextChecks[id]
      return {
        ...cur,
        worktrees: nextWorktrees,
        ...(nextContracts ? { contractsByWorktree: nextContracts } : {}),
        ...(nextChecks ? { checksByWorktree: nextChecks } : {}),
      }
    },
    homeDir,
  )
}
