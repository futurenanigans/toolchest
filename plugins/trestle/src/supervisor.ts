import { spawn, type ChildProcess } from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import type { AgentCli, AgentEffort, AgentFailureKind, AgentStatus, AgentSummary } from '../types'
import { createAdapter, type AdapterDriver, type AdapterEvent, type AgentPermissionMode, type LaunchSpec } from './adapters'
import { Mutex } from './locks'
import type { ResourcesConfig } from './config'
import {
  processStartToken,
  isProcessAlive,
  isWindows,
  killProcessGroup,
  killProcessTree,
  quoteWindowsArg,
  resolveCommand,
  userHome,
  type CommandSpec,
} from './platform'
import { TERMINAL_RETENTION_MS, ephemeralRunsDir, sessionHomeDir, updateDiskState } from './state'

const MAX_TAIL_LINES = 500
const DEFAULT_IDLE_MS = 10 * 60 * 1000
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000
const EXIT_GRACE_MS = 1_500

export interface SpawnAgentParams {
  repoRoot: string
  id: string
  cli: AgentCli
  stage: string
  worktreeId: string
  worktreePath: string
  branch: string
  prompt: string
  mode?: AgentPermissionMode
  model?: string
  effort?: AgentEffort
  resumeSessionId?: string
  persistSession?: boolean
  idleMs?: number
  timeoutMs?: number
  commandOverride?: CommandSpec
  homeDir?: string
  resources?: ResourcesConfig
}

interface ManagedAgent {
  summary: AgentSummary
  repoRoot: string
  homeDir: string
  worktreeId: string
  runHome: string
  ephemeralHome: boolean
  driver: AdapterDriver
  spec: LaunchSpec
  processStart: Promise<string | undefined>
  startToken?: string
  child: ChildProcess
  exited: boolean
  exitPromise: Promise<void>
  resolveExit: () => void
  finalText?: string
  waiters: Array<() => void>
  idleTimer?: ReturnType<typeof setTimeout>
  totalTimer?: ReturnType<typeof setTimeout>
  idleMs: number
}

export function buildResourceEnv(
  concurrentCount: number,
  resources?: ResourcesConfig,
  cpuCount = os.cpus().length,
  existingNodeOptions = process.env.NODE_OPTIONS,
): Record<string, string> {
  const out: Record<string, string> = {}
  const slots = Math.max(1, concurrentCount)
  if (resources?.partitionThreads !== false && slots > 1) {
    const jobs = Math.max(1, Math.floor(Math.max(1, cpuCount) / slots))
    out.CARGO_BUILD_JOBS = String(jobs)
    out.RAYON_NUM_THREADS = String(jobs)
    out.OMP_NUM_THREADS = String(jobs)
  }
  if (resources?.perAgentMaxMemMb && resources.perAgentMaxMemMb > 0) {
    const mb = Math.floor(resources.perAgentMaxMemMb)
    if (!existingNodeOptions || !existingNodeOptions.includes('--max-old-space-size')) {
      out.NODE_OPTIONS = existingNodeOptions
        ? `${existingNodeOptions} --max-old-space-size=${mb}`
        : `--max-old-space-size=${mb}`
    }
    const bytesHex = (BigInt(mb) * 1024n * 1024n).toString(16)
    out.DOTNET_GCHeapHardLimit = `0x${bytesHex}`
  }
  return out
}

function classifyFailure(ev: Extract<AdapterEvent, { kind: 'turn_failed' }>): AgentFailureKind {
  if (ev.loginFailed) return 'login_failed'
  if (ev.usageLimited) return 'usage_limit'
  if (ev.transient) return 'transient'
  return 'error'
}

export function isTerminalStatus(status: AgentStatus): boolean {
  return status === 'done' || status === 'failed' || status === 'stopped'
}

export class AgentSupervisor {
  private readonly agents = new Map<string, ManagedAgent>()
  private pendingWrites = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly persistMutex = new Mutex()
  private idCounter = 0

  allocateId(baseId: string): string {
    if (!this.agents.has(baseId)) return baseId
    let candidate: string
    do {
      this.idCounter += 1
      candidate = `${baseId}-r${this.idCounter}`
    } while (this.agents.has(candidate))
    return candidate
  }

  async spawn(params: SpawnAgentParams): Promise<AgentSummary> {
    this.pruneAgents()
    if (this.agents.has(params.id)) {
      throw new Error(`Agent ${params.id} already exists`)
    }

    const homeDir = params.homeDir ?? userHome()
    const driver = createAdapter(params.cli)
    const shouldPersist = Boolean(params.persistSession || params.resumeSessionId)
    let runHome: string
    let ephemeralHome: boolean
    if (shouldPersist) {
      runHome = sessionHomeDir(params.repoRoot, `${params.worktreeId}-${params.cli}`, homeDir)
      await fs.mkdir(runHome, { recursive: true })
      ephemeralHome = false
    } else {
      const runsBase = ephemeralRunsDir(params.repoRoot, homeDir)
      await fs.mkdir(runsBase, { recursive: true })
      runHome = await fs.mkdtemp(path.join(runsBase, `${params.cli}-`))
      ephemeralHome = true
    }

    let spec: LaunchSpec
    try {
      spec = await driver.prepare({
        runHome,
        cwd: params.worktreePath,
        prompt: params.prompt,
        mode: params.mode ?? 'writer',
        model: params.model,
        effort: params.effort,
        resumeSessionId: params.resumeSessionId,
        commandOverride: params.commandOverride,
      })
    } catch (err) {
      if (ephemeralHome) await fs.rm(runHome, { recursive: true, force: true }).catch(() => {})
      throw err
    }

    const { program, args } = resolveCommand(spec.command, spec.args)
    const needsShell = isWindows() && /\.(cmd|bat)$/i.test(program)
    const spawnProgram = needsShell ? quoteWindowsArg(program) : program
    const spawnArgs = needsShell ? args.map(quoteWindowsArg) : args
    const activeCount = 1 + Array.from(this.agents.values()).filter(m => !isTerminalStatus(m.summary.status)).length
    const resourceEnv = buildResourceEnv(activeCount, params.resources)
    const env: Record<string, string | undefined> = { ...process.env, ...resourceEnv, PWD: spec.cwd }
    for (const [k, v] of Object.entries(spec.env)) {
      if (v === undefined) delete env[k]
      else env[k] = v
    }

    const child = spawn(spawnProgram, spawnArgs, {
      cwd: spec.cwd,
      env,
      shell: needsShell,
      detached: !isWindows(),
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const now = Date.now()
    const summary: AgentSummary = {
      id: params.id,
      cli: params.cli,
      ...(params.model ? { model: params.model } : {}),
      ...(params.effort ? { effort: params.effort } : {}),
      stage: params.stage,
      worktree: params.worktreePath,
      branch: params.branch,
      status: 'starting',
      startedAt: now,
      lastActivityAt: now,
      sessionId: params.resumeSessionId,
      tail: [],
    }

    let resolveExit!: () => void
    const exitPromise = new Promise<void>(r => {
      resolveExit = r
    })

    const managed: ManagedAgent = {
      summary,
      repoRoot: params.repoRoot,
      homeDir,
      worktreeId: params.worktreeId,
      runHome,
      ephemeralHome,
      driver,
      spec,
      processStart: processStartToken(child.pid),
      child,
      exited: false,
      exitPromise,
      resolveExit,
      waiters: [],
      idleMs: params.idleMs ?? DEFAULT_IDLE_MS,
    }
    this.agents.set(params.id, managed)

    this.attachStreams(managed)

    const totalMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS
    managed.totalTimer = setTimeout(() => {
      void this.failAndKill(managed, `Total timeout (${Math.round(totalMs / 1000)}s) exceeded`, 'timeout')
    }, totalMs)

    managed.startToken = await managed.processStart
    if (!managed.exited && summary.status === 'starting') {
      summary.status = 'running'
      this.resetIdleTimer(managed)
      if (child.stdin && !child.stdin.destroyed) {
        if (spec.initialStdin) {
          child.stdin.write(spec.initialStdin)
        }
        if (spec.closeStdinAfterInitial) {
          child.stdin.end()
        }
      }
    }

    this.schedulePersist(params.repoRoot, homeDir)
    await this.flush()
    return { ...summary, tail: [...summary.tail] }
  }

  list(): AgentSummary[] {
    this.pruneAgents()
    return Array.from(this.agents.values()).map(m => ({ ...m.summary, tail: [...m.summary.tail] }))
  }

  tail(id: string, lines = 30): { summary: AgentSummary; finalText?: string } {
    const m = this.agents.get(id)
    if (!m) throw new Error(`Unknown agent: ${id}`)
    return {
      summary: { ...m.summary, tail: m.summary.tail.slice(-lines) },
      finalText: m.finalText,
    }
  }

  async wait(ids: readonly string[], options: { mode?: 'all' | 'any'; timeoutMs?: number } = {}): Promise<AgentSummary[]> {
    const mode = options.mode ?? 'all'

    for (const id of ids) {
      if (!this.agents.has(id)) throw new Error(`Unknown agent: ${id}`)
    }

    const checkDone = () => {
      const statuses = ids.map(id => this.agents.get(id)?.summary.status)
      return mode === 'any' ? statuses.some(s => s && isTerminalStatus(s)) : statuses.every(s => s && isTerminalStatus(s))
    }

    if (!checkDone()) {
      await new Promise<void>(resolve => {
        let timer: ReturnType<typeof setTimeout> | undefined
        const cleanup = () => {
          if (timer) clearTimeout(timer)
          for (const id of ids) {
            const m = this.agents.get(id)
            if (m) {
              const idx = m.waiters.indexOf(wake)
              if (idx >= 0) m.waiters.splice(idx, 1)
            }
          }
        }
        const wake = () => {
          if (checkDone()) {
            cleanup()
            resolve()
          }
        }
        if (options.timeoutMs && options.timeoutMs > 0) {
          timer = setTimeout(() => {
            cleanup()
            resolve()
          }, options.timeoutMs)
        }
        for (const id of ids) {
          this.agents.get(id)?.waiters.push(wake)
        }
      })
    }

    return ids.map(id => {
      const m = this.agents.get(id)!
      return { ...m.summary, tail: [...m.summary.tail] }
    })
  }

  async steer(id: string, text: string): Promise<{ delivered: boolean; reason?: string }> {
    const m = this.agents.get(id)
    if (!m) throw new Error(`Unknown agent: ${id}`)
    const action = m.driver.steer(text)
    if (action.kind === 'unsupported') {
      return { delivered: false, reason: action.reason }
    }
    if (!m.child.stdin || m.child.stdin.destroyed) {
      return { delivered: false, reason: 'Agent stdin is closed' }
    }
    m.child.stdin.write(action.data)
    this.pushTail(m, `[steer] ${text.slice(0, 100)}`)
    return { delivered: true }
  }

  async stop(id: string): Promise<void> {
    const m = this.agents.get(id)
    if (!m || isTerminalStatus(m.summary.status)) return
    this.clearTimers(m)
    m.summary.status = 'stopped'
    m.summary.finishedAt = m.summary.finishedAt ?? Date.now()
    await this.killManaged(m)
    this.notifyWaiters(m)
    this.schedulePersist(m.repoRoot, m.homeDir)
    if (m.ephemeralHome) {
      await fs.rm(m.runHome, { recursive: true, force: true }).catch(() => {})
    }
  }

  async stopByWorktree(worktreeId: string): Promise<void> {
    const matching = Array.from(this.agents.values()).filter(
      m => m.worktreeId === worktreeId && !isTerminalStatus(m.summary.status),
    )
    await Promise.all(matching.map(m => this.stop(m.summary.id)))
  }

  async stopAll(): Promise<void> {
    const active = Array.from(this.agents.values()).filter(m => !isTerminalStatus(m.summary.status))
    await Promise.all(active.map(m => this.stop(m.summary.id)))
    await this.flush()
  }

  async reconcileDiskState(repoRoot: string, homeDir = userHome()): Promise<number> {
    let reconciled = 0
    const now = Date.now()
    await updateDiskState(
      repoRoot,
      cur => {
        const nextAgents = { ...cur.agents }
        for (const [id, agent] of Object.entries(nextAgents)) {
          if (this.agents.has(id)) continue
          if (!isTerminalStatus(agent.status) && !isProcessAlive(agent.pid)) {
            reconciled += 1
            nextAgents[id] = {
              ...agent,
              status: 'stopped',
              finishedAt: agent.finishedAt ?? now,
              error: agent.error ?? 'Process no longer running (recovered after restart)',
            }
          }
        }
        return reconciled > 0 ? { ...cur, agents: nextAgents } : cur
      },
      homeDir,
    )
    return reconciled
  }

  private attachStreams(m: ManagedAgent): void {
    let stdoutBuf = ''
    m.child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString('utf8')
      let idx: number
      while ((idx = stdoutBuf.indexOf('\n')) !== -1) {
        const line = stdoutBuf.slice(0, idx)
        stdoutBuf = stdoutBuf.slice(idx + 1)
        this.handleLine(m, line)
      }
    })

    let stderrBuf = ''
    m.child.stderr?.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString('utf8')
      let idx: number
      while ((idx = stderrBuf.indexOf('\n')) !== -1) {
        const line = stderrBuf.slice(0, idx).trim()
        stderrBuf = stderrBuf.slice(idx + 1)
        if (line) {
          this.pushTail(m, `[stderr] ${line.slice(0, 160)}`)
          this.handleLine(m, line)
        }
      }
    })

    m.child.on('error', err => {
      m.exited = true
      m.resolveExit()
      this.clearTimers(m)
      m.summary.status = 'failed'
      m.summary.finishedAt = m.summary.finishedAt ?? Date.now()
      m.summary.error = err.message
      m.summary.failureKind = 'error'
      this.pushTail(m, `[error] ${err.message}`)
      this.notifyWaiters(m)
      this.schedulePersist(m.repoRoot, m.homeDir)
    })

    m.child.on('exit', () => {
      void killProcessGroup(m.child.pid)
    })

    m.child.on('close', code => {
      if (stdoutBuf.trim()) this.handleLine(m, stdoutBuf)
      if (stderrBuf.trim()) {
        const tailErr = stderrBuf.trim()
        this.pushTail(m, `[stderr] ${tailErr.slice(0, 160)}`)
        this.handleLine(m, tailErr)
      }
      m.exited = true
      m.resolveExit()
      this.clearTimers(m)
      if (!isTerminalStatus(m.summary.status)) {
        m.summary.finishedAt = m.summary.finishedAt ?? Date.now()
        if (code === 0) {
          m.summary.status = 'done'
        } else {
          m.summary.status = 'failed'
          m.summary.error = m.summary.error ?? `Exited with code ${code ?? 1}`
          m.summary.failureKind = m.summary.failureKind ?? 'error'
        }
      }
      this.notifyWaiters(m)
      this.schedulePersist(m.repoRoot, m.homeDir)
      if (m.ephemeralHome) {
        void fs.rm(m.runHome, { recursive: true, force: true }).catch(() => {})
      }
    })
  }

  private finalizeTurn(m: ManagedAgent, status: 'done' | 'failed', error?: string, failureKind?: AgentFailureKind): void {
    if (isTerminalStatus(m.summary.status)) return
    m.summary.status = status
    m.summary.finishedAt = m.summary.finishedAt ?? Date.now()
    if (error) m.summary.error = error
    if (failureKind) m.summary.failureKind = failureKind
    this.clearTimers(m)
    m.child.stdin?.end()

    void (async () => {
      if (!m.exited) {
        await Promise.race([m.exitPromise, new Promise(r => setTimeout(r, EXIT_GRACE_MS))])
        if (!m.exited) {
          await this.killManaged(m)
        }
      }
      this.notifyWaiters(m)
      this.schedulePersist(m.repoRoot, m.homeDir)
    })()
  }

  private handleLine(m: ManagedAgent, line: string): void {
    const events: AdapterEvent[] = m.driver.parseLine(line)
    for (const ev of events) {
      if (ev.kind === 'session') {
        m.summary.sessionId = ev.sessionId
      } else if (ev.kind === 'activity') {
        this.recordActivity(m, ev.text)
      } else if (ev.kind === 'message') {
        m.finalText = ev.text
        this.recordActivity(m, `msg: ${ev.text.replace(/\s+/g, ' ').slice(0, 100)}`)
        const blockedMatch = /^(?:BLOCKED|NEEDS_CONTEXT|NEEDS_INPUT)\s*:\s*(.+)/im.exec(ev.text)
        const blockedReason = blockedMatch?.[1]?.trim()
        if (blockedReason && m.summary.status !== 'done' && m.summary.status !== 'failed' && m.summary.status !== 'stopped') {
          m.summary.status = 'needs_input'
          m.summary.needsInputReason = blockedReason
          this.schedulePersist(m.repoRoot, m.homeDir)
        }
      } else if (ev.kind === 'usage') {
        if (ev.cumulative || !m.summary.usage) {
          m.summary.usage = {
            ...ev.usage,
            ...(ev.usage.costUsd === undefined && m.summary.usage?.costUsd !== undefined
              ? { costUsd: m.summary.usage.costUsd }
              : {}),
          }
        } else {
          const cur = m.summary.usage
          const nextCost =
            ev.usage.costUsd !== undefined
              ? (cur.costUsd ?? 0) + ev.usage.costUsd
              : cur.costUsd
          m.summary.usage = {
            inputTokens: cur.inputTokens + ev.usage.inputTokens,
            outputTokens: cur.outputTokens + ev.usage.outputTokens,
            cacheReadTokens: cur.cacheReadTokens + ev.usage.cacheReadTokens,
            cacheWriteTokens: cur.cacheWriteTokens + ev.usage.cacheWriteTokens,
            ...(nextCost !== undefined ? { costUsd: nextCost } : {}),
          }
        }
      } else if (ev.kind === 'stdin_write') {
        if (m.child.stdin && !m.child.stdin.destroyed) m.child.stdin.write(ev.data)
      } else if (ev.kind === 'turn_done') {
        if (ev.finalText !== undefined) m.finalText = ev.finalText
        this.pushTail(m, '[done]')
        this.finalizeTurn(m, 'done')
      } else if (ev.kind === 'turn_failed') {
        if (!isTerminalStatus(m.summary.status)) m.summary.resetAt = ev.resetAt
        this.pushTail(m, `[failed] ${ev.error}`)
        this.finalizeTurn(m, 'failed', ev.error, classifyFailure(ev))
      }
    }
    if (events.length > 0) this.schedulePersist(m.repoRoot, m.homeDir)
  }

  private recordActivity(m: ManagedAgent, text: string): void {
    m.summary.lastActivityAt = Date.now()
    if (m.summary.status === 'idle') m.summary.status = 'running'
    this.resetIdleTimer(m)
    this.pushTail(m, text)
  }

  private pushTail(m: ManagedAgent, line: string): void {
    m.summary.tail.push(line)
    if (m.summary.tail.length > MAX_TAIL_LINES) {
      m.summary.tail.splice(0, m.summary.tail.length - MAX_TAIL_LINES)
    }
  }

  private resetIdleTimer(m: ManagedAgent): void {
    if (m.idleTimer) clearTimeout(m.idleTimer)
    m.idleTimer = setTimeout(() => {
      if (m.summary.status === 'running') {
        m.summary.status = 'idle'
        this.pushTail(m, '[idle timeout reached]')
        this.schedulePersist(m.repoRoot, m.homeDir)
      }
    }, m.idleMs)
  }

  private async failAndKill(m: ManagedAgent, reason: string, failureKind: AgentFailureKind = 'error'): Promise<void> {
    this.clearTimers(m)
    m.summary.status = 'failed'
    m.summary.finishedAt = m.summary.finishedAt ?? Date.now()
    m.summary.error = reason
    m.summary.failureKind = failureKind
    this.pushTail(m, `[failed] ${reason}`)
    await this.killManaged(m)
    this.notifyWaiters(m)
    this.schedulePersist(m.repoRoot, m.homeDir)
  }

  private async killManaged(m: ManagedAgent): Promise<void> {
    if (m.child.exitCode === null && m.child.signalCode === null) await killProcessTree(m.child.pid)
  }

  private pruneAgents(): void {
    const cutoff = Date.now() - TERMINAL_RETENTION_MS
    for (const [id, agent] of this.agents) {
      if (agent.exited && agent.summary.finishedAt && agent.summary.finishedAt < cutoff) this.agents.delete(id)
    }
  }

  private clearTimers(m: ManagedAgent): void {
    if (m.idleTimer) clearTimeout(m.idleTimer)
    if (m.totalTimer) clearTimeout(m.totalTimer)
    m.idleTimer = undefined
    m.totalTimer = undefined
  }

  private notifyWaiters(m: ManagedAgent): void {
    const waiters = m.waiters.splice(0)
    for (const w of waiters) w()
  }

  private schedulePersist(repoRoot: string, homeDir: string): void {
    const key = JSON.stringify([repoRoot, homeDir])
    if (this.pendingWrites.has(key)) return
    const timer = setTimeout(() => {
      this.pendingWrites.delete(key)
      this.persist(repoRoot, homeDir)
    }, 75)
    this.pendingWrites.set(key, timer)
  }

  async flush(): Promise<void> {
    for (const [key, timer] of this.pendingWrites) {
      clearTimeout(timer)
      this.pendingWrites.delete(key)
      const [repoRoot, homeDir] = JSON.parse(key)
      this.persist(repoRoot, homeDir)
    }
    await this.persistMutex.drain()
  }

  private persist(repoRoot: string, homeDir: string): void {
    void this.persistMutex.run(() => updateDiskState(
      repoRoot,
      cur => {
        const nextAgents = { ...cur.agents }
        for (const m of this.agents.values()) {
          if (m.repoRoot !== repoRoot || m.homeDir !== homeDir) continue
          nextAgents[m.summary.id] = {
            id: m.summary.id,
            cli: m.summary.cli,
            model: m.summary.model,
            effort: m.summary.effort,
            stage: m.summary.stage,
            worktreeId: m.worktreeId,
            worktreePath: m.summary.worktree,
            branch: m.summary.branch,
            status: m.summary.status,
            pid: m.child.pid,
            processStart: m.startToken,
            sessionId: m.summary.sessionId,
            startedAt: m.summary.startedAt,
            lastActivityAt: m.summary.lastActivityAt,
            finishedAt: m.summary.finishedAt,
            tail: m.summary.tail.slice(-40),
            error: m.summary.error,
            failureKind: m.summary.failureKind,
            usage: m.summary.usage,
          }
        }
        return { ...cur, agents: nextAgents }
      },
      homeDir,
    )).catch(() => {})
  }
}
