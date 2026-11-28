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

export async function ensureWorktreeIgnored(repo: string): Promise<void> {
  const gitDir = await execCommand('git', ['rev-parse', '--git-dir'], { cwd: repo })
  if (gitDir.exitCode !== 0) throw new Error(gitDir.stderr)
  await withFileLock(path.resolve(repo, gitDir.stdout.trim(), 'trestle-ignore.lock'), async () => {
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
  })
}

export async function onlyWorktreeIgnoreAdded(repo: string): Promise<boolean> {
  const file = path.join(repo, '.gitignore')
  const contents = await fs.readFile(file, 'utf8')
  const original = await promisify(execFile)('git', ['cat-file', '--filters', 'HEAD:.gitignore'], {
    cwd: repo, maxBuffer: Buffer.byteLength(contents) + 1,
  }).catch(() => undefined)
  if (!original) return false
  const metadata = await execCommand('git', ['diff', '--summary', '--', '.gitignore'], { cwd: repo })
  if (metadata.exitCode !== 0 || metadata.stdout) return false
  return contents === original.stdout + ignoreSuffix(original.stdout)
}
