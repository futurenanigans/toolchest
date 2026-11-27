import { constants as fsConstants } from 'node:fs'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { spawn } from 'node:child_process'

export type CommandSpec = string | readonly string[]

export interface ResolvedCommand {
  program: string
  args: string[]
}

const DEFAULT_MAX_CAPTURE_BYTES = 16 * 1024 * 1024

export function isWindows(): boolean {
  return process.platform === 'win32'
}

export function userHome(): string {
  return os.homedir()
}

/**
 * Quotes a single argument safely for Windows `cmd.exe` when spawning `.cmd`/`.bat` shims.
 */
export function quoteWindowsArg(arg: string): string {
  if (arg.length === 0) return '""'
  // Escape cmd.exe metacharacters and double quotes
  const sanitized = arg.replace(/\r?\n/g, ' ')
  if (!/[\s"&|<>^()%!]/.test(sanitized)) return sanitized
  const escaped = sanitized
    .replace(/(\\*)"/g, '$1$1\\"')
    .replace(/(\\+)$/, '$1$1')
    .replace(/%/g, '%%')
  return `"${escaped}"`
}

/**
 * Checks whether a PID is currently alive (returns false if ESRCH or invalid).
 */
export function isProcessAlive(pid: number | undefined): boolean {
  if (pid === undefined || !Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * Links `src` to `dst` if supported, falling back to copying on Windows or when
 * symlink creation is denied (`EPERM`/`EACCES`). Never throws if `src` does not exist
 * when `optional` is true.
 */
export async function linkOrCopy(
  src: string,
  dst: string,
  options: { optional?: boolean } = {},
): Promise<boolean> {
  try {
    await fs.access(src, fsConstants.F_OK)
  } catch {
    if (options.optional) return false
    throw new Error(`Source file does not exist: ${src}`)
  }

  await fs.mkdir(path.dirname(dst), { recursive: true })
  await fs.rm(dst, { force: true })

  if (!isWindows()) {
    try {
      await fs.symlink(src, dst)
      return true
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'EPERM' && code !== 'EACCES') throw err
    }
  }

  await fs.copyFile(src, dst)
  return true
}

/**
 * Resolves a command specification (a binary name or a runner array such as
 * `['bun', 'x', '@openai/codex']` or `['dotnet', 'exec', 'awl.dll']`) into a
 * `{ program, args }` pair without invoking a POSIX shell.
 */
export function resolveCommand(spec: CommandSpec, extraArgs: readonly string[] = []): ResolvedCommand {
  const parts = typeof spec === 'string' ? [spec] : [...spec]
  if (parts.length === 0 || !parts[0]) {
    throw new Error('CommandSpec must be a non-empty string or array')
  }

  const [head, ...rest] = parts
  let program = head

  if (typeof Bun !== 'undefined' && typeof Bun.which === 'function') {
    const found = Bun.which(head)
    if (found) {
      program = found
    } else if (isWindows()) {
      for (const ext of ['.cmd', '.bat', '.ps1', '.exe']) {
        const withExt = Bun.which(`${head}${ext}`)
        if (withExt) {
          program = withExt
          break
        }
      }
    }
  }

  return {
    program,
    args: [...rest, ...extraArgs],
  }
}

/**
 * Terminates a process and its descendants cleanly across POSIX and Windows.
 * Never throws if the process has already exited.
 */
export async function killProcessTree(pid: number | undefined): Promise<void> {
  if (pid === undefined || pid <= 0) return

  if (isWindows()) {
    await new Promise<void>(resolve => {
      const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      })
      killer.on('error', () => {
        try {
          process.kill(pid)
        } catch {
          // already exited
        }
        resolve()
      })
      killer.on('close', () => resolve())
    })
    return
  }

  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      return
    }
  }

  await new Promise(r => setTimeout(r, 250))

  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // already exited
    }
  }
}

class BoundedBuffer {
  private chunks: Buffer[] = []
  private totalBytes = 0

  constructor(private readonly maxBytes: number) {}

  push(chunk: Buffer): void {
    this.chunks.push(chunk)
    this.totalBytes += chunk.length
    while (this.totalBytes > this.maxBytes && this.chunks.length > 1) {
      const removed = this.chunks.shift()!
      this.totalBytes -= removed.length
    }
    if (this.totalBytes > this.maxBytes && this.chunks.length === 1) {
      this.chunks[0] = this.chunks[0]!.subarray(this.chunks[0]!.length - this.maxBytes)
      this.totalBytes = this.chunks[0]!.length
    }
  }

  toString(): string {
    return Buffer.concat(this.chunks).toString('utf8')
  }
}

/**
 * Runs a command directly (no POSIX shell) and collects bounded stdout/stderr/exitCode.
 */
export async function execCommand(
  spec: CommandSpec,
  args: readonly string[],
  options: {
    cwd?: string
    env?: Record<string, string | undefined>
    timeoutMs?: number
    maxCaptureBytes?: number
  } = {},
): Promise<{ exitCode: number; stdout: string; stderr: string; timedOut?: boolean }> {
  const { program, args: baseArgs } = resolveCommand(spec, args)
  const needsShell = isWindows() && /\.(cmd|bat)$/i.test(program)
  const spawnProgram = needsShell ? quoteWindowsArg(program) : program
  const spawnArgs = needsShell ? baseArgs.map(quoteWindowsArg) : baseArgs
  const cap = options.maxCaptureBytes ?? DEFAULT_MAX_CAPTURE_BYTES

  return new Promise((resolve, reject) => {
    const child = spawn(spawnProgram, spawnArgs, {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      shell: needsShell,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const stdoutBuf = new BoundedBuffer(cap)
    const stderrBuf = new BoundedBuffer(cap)
    child.stdout?.on('data', (chunk: Buffer) => stdoutBuf.push(chunk))
    child.stderr?.on('data', (chunk: Buffer) => stderrBuf.push(chunk))

    let timedOut = false
    let timer: ReturnType<typeof setTimeout> | undefined
    if (options.timeoutMs && options.timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true
        void killProcessTree(child.pid)
      }, options.timeoutMs)
    }

    child.on('error', err => {
      if (timer) clearTimeout(timer)
      reject(err)
    })

    child.on('close', code => {
      if (timer) clearTimeout(timer)
      resolve({
        exitCode: timedOut ? 124 : (code ?? 1),
        stdout: stdoutBuf.toString(),
        stderr: stderrBuf.toString(),
        ...(timedOut ? { timedOut: true } : {}),
      })
    })
  })
}

/**
 * Resolves a repository root canonically (git top-level if available, else `path.resolve`).
 */
export async function canonicalRepoRoot(repoRoot: string): Promise<string> {
  const resolved = path.resolve(repoRoot)
  try {
    const res = await execCommand('git', ['rev-parse', '--show-toplevel'], { cwd: resolved, timeoutMs: 5_000 })
    if (res.exitCode === 0 && res.stdout.trim()) {
      return path.resolve(res.stdout.trim())
    }
  } catch {
    // Fall back to resolved path if not a git repo or git unavailable
  }
  return resolved
}
