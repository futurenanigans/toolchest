import type { AgentCli } from '../types'
import { runGoalLoop } from './goal_run'
import type { BaselineReport, GoalLoopParams, GoalLoopResult } from './goal_types'
import { TERMINAL_RETENTION_MS } from './state'
import type { AgentSupervisor } from './supervisor'

export interface GoalJobSnapshot {
  jobId: string
  contractId: string
  worktreeId: string
  cli: AgentCli
  status: 'running' | 'passed' | 'exhausted' | 'failed' | 'cancelled' | 'blocked' | 'stuck'
  startedAt: number
  finishedAt?: number
  baseline?: BaselineReport
  result?: GoalLoopResult
  error?: string
}

export class GoalJobManager {
  private readonly jobs = new Map<
    string,
    { snapshot: GoalJobSnapshot; controller: AbortController; promise: Promise<void> }
  >()
  private seq = 0

  start(supervisor: AgentSupervisor, params: GoalLoopParams): GoalJobSnapshot {
    this.pruneJobs()
    this.seq += 1
    const jobId = `goal-${params.worktreeId}-${this.seq}`
    const controller = new AbortController()
    const snapshot: GoalJobSnapshot = {
      jobId,
      contractId: params.contractId,
      worktreeId: params.worktreeId,
      cli: params.cli,
      status: 'running',
      startedAt: Date.now(),
    }

    const promise = runGoalLoop(supervisor, { ...params, signal: controller.signal })
      .then(result => {
        snapshot.status = result.status
        snapshot.result = result
        snapshot.baseline = result.baseline
        snapshot.finishedAt = Date.now()
        if (result.error) snapshot.error = result.error
      })
      .catch(err => {
        snapshot.status = 'failed'
        snapshot.error = (err as Error).message
        snapshot.finishedAt = Date.now()
      })

    this.jobs.set(jobId, { snapshot, controller, promise })
    return { ...snapshot }
  }

  private pruneJobs(): void {
    const cutoff = Date.now() - TERMINAL_RETENTION_MS
    for (const [id, job] of this.jobs) {
      if (job.snapshot.finishedAt && job.snapshot.finishedAt < cutoff) this.jobs.delete(id)
    }
  }

  get(jobId: string): GoalJobSnapshot {
    this.pruneJobs()
    const job = this.jobs.get(jobId)
    if (!job) throw new Error(`Unknown goal job: ${jobId}`)
    return { ...job.snapshot }
  }

  list(): GoalJobSnapshot[] {
    this.pruneJobs()
    return Array.from(this.jobs.values()).map(j => ({ ...j.snapshot }))
  }

  cancel(jobId: string): GoalJobSnapshot {
    const job = this.jobs.get(jobId)
    if (!job) throw new Error(`Unknown goal job: ${jobId}`)
    job.controller.abort()
    if (job.snapshot.status === 'running') {
      job.snapshot.status = 'cancelled'
      job.snapshot.finishedAt = Date.now()
    }
    return { ...job.snapshot }
  }

  cancelAll(): void {
    for (const job of this.jobs.values()) {
      job.controller.abort()
    }
  }
}
