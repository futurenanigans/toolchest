import type { AgentCli, AgentEffort, AgentFailureKind } from '../types'
import type { CheckRunReport } from './checks'
import type { CommandSpec } from './platform'

export interface BaselineReport {
  baseRef: string
  passed: boolean
  baseRedChecks: string[]
  report: CheckRunReport
}

export interface GoalLoopParams {
  repoRoot: string
  contractId: string
  cli: AgentCli
  worktreeId: string
  worktreePath: string
  branch: string
  baseRef?: string
  model?: string
  effort?: AgentEffort
  maxIterations?: number
  freshContextPerIteration?: boolean
  commandOverride?: CommandSpec
  homeDir?: string
  signal?: AbortSignal
  transientRetryDelayMs?: number
}

export interface GoalLoopResult {
  status: 'passed' | 'exhausted' | 'failed' | 'cancelled' | 'blocked' | 'stuck'
  contractId: string
  worktreeId: string
  iterations: number
  baseline?: BaselineReport
  lastReport?: CheckRunReport
  finalText?: string
  error?: string
  failureKind?: AgentFailureKind
}
