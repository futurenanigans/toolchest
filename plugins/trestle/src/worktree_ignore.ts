import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { withFileLock } from './locks'
import { execCommand } from './platform'

export const WORKTREE_ROOT_DIR = '.trestle-wt'

function ignoreSuffix(contents: string): string {
  const newline = contents.includes('\r\n') ? '\r\n' : '\n'
  const separator = contents && !contents.endsWith('\n') ? newline : ''
  return separator + '/' + WORKTREE_ROOT_DIR + '/' + newline
}

async function ignoreLock<T>(repo: string, action: () => Promise<T>): Promise<T> {
  const gitDir = await execCommand('git', ['rev-parse', '--git-dir'], { cwd: repo })
  if (gitDir.exitCode !== 0) throw new Error(gitDir.stderr)
  return withFileLock(path.resolve(repo, gitDir.stdout.trim(), 'trestle-ignore.lock'), action)
}

async function appendRuleUnlessIgnored(repo: string): Promise<void> {
  const ignored = await execCommand('git', ['check-ignore', '-q', '--', WORKTREE_ROOT_DIR + '/'], { cwd: repo })
  if (ignored.exitCode === 0) return
  if (ignored.exitCode !== 1) throw new Error(ignored.stderr)
  const file = path.join(repo, '.gitignore')
  const stat = await fs.lstat(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
    return undefined
  })
  if (stat && !stat.isFile()) throw new Error('Cannot append the worktree rule to a non-regular .gitignore')
  const contents = stat ? await fs.readFile(file, 'utf8') : ''
  await fs.appendFile(file, ignoreSuffix(contents))
}

export async function ensureWorktreeIgnored(repo: string): Promise<void> {
  await ignoreLock(repo, () => appendRuleUnlessIgnored(repo))
}

async function committedIgnoreFile(repo: string, maxBuffer: number): Promise<string | undefined> {
  const original = await promisify(execFile)('git', ['cat-file', '--filters', 'HEAD:.gitignore'], {
    cwd: repo, maxBuffer,
  }).catch(() => undefined)
  return original?.stdout
}

export async function onlyWorktreeIgnoreAdded(repo: string): Promise<boolean> {
  const file = path.join(repo, '.gitignore')
  const contents = await fs.readFile(file, 'utf8')
  const original = await committedIgnoreFile(repo, Buffer.byteLength(contents) + 1)
  if (original === undefined) return false
  const metadata = await execCommand('git', ['diff', '--summary', '--', '.gitignore'], { cwd: repo })
  if (metadata.exitCode !== 0 || metadata.stdout) return false
  return contents === original + ignoreSuffix(original)
}

async function setAsideWorktreeRule(repo: string): Promise<void> {
  const file = path.join(repo, '.gitignore')
  const contents = await fs.readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
    return undefined
  })
  if (contents === undefined) return
  const tracked = await execCommand('git', ['ls-files', '--error-unmatch', '--', '.gitignore'], { cwd: repo })
  if (tracked.exitCode !== 0) {
    if (contents === ignoreSuffix('')) await fs.rm(file)
    return
  }
  if (!(await onlyWorktreeIgnoreAdded(repo))) return
  const original = await committedIgnoreFile(repo, Buffer.byteLength(contents) + 1)
  if (original !== undefined) await fs.writeFile(file, original)
}

export async function withWorktreeRuleSetAside<T>(repo: string, action: () => Promise<T>): Promise<T> {
  return ignoreLock(repo, async () => {
    await setAsideWorktreeRule(repo)
    try {
      return await action()
    } finally {
      await appendRuleUnlessIgnored(repo)
    }
  })
}
