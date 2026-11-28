export type AgentCli = 'claude' | 'codex' | 'opencode' | 'agy' | 'pi'

export type AgentStatus = 'starting' | 'running' | 'idle' | 'done' | 'failed' | 'stopped'

export type AgentFailureKind = 'transient' | 'usage_limit' | 'login_failed' | 'timeout' | 'error'

export type AgentEffort = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface AgentUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  costUsd?: number
}

export interface AgentSummary {
  id: string
  cli: AgentCli
  model?: string
  effort?: AgentEffort
  stage: string
  worktree: string
  branch: string
  status: AgentStatus
  startedAt: number
  lastActivityAt: number
  finishedAt?: number
  sessionId?: string
  tail: string[]
  error?: string
  failureKind?: AgentFailureKind
  usage?: AgentUsage
}

export interface ContractSummary {
  id: string
  title: string
  worktreeId?: string
  iteration: number
  maxIterations: number
  baseRef?: string
  baseRedChecks?: string[]
  acceptanceCriteria: Array<{ id: string; description: string; passed: boolean }>
}

export interface CheckSummary {
  worktreeId?: string
  worktreePath: string
  passed: boolean
  summary: string
  timestamp: number
  results: Array<{
    name: string
    passed: boolean
    durationMs: number
    excerpt?: string
    metric?: string
  }>
}

export interface WorktreeSummary {
  id: string
  branch: string
  baseRef: string
  createdAt: number
}

export type QueueItemStatus = 'queued' | 'running' | 'blocked' | 'landed' | 'failed'

export interface QueueSummary {
  total?: number
  counts: Record<QueueItemStatus, number>
  items: Array<{
    id: string
    title: string
    status: QueueItemStatus
    cli: AgentCli
    dependsOn: string[]
    error?: string
  }>
}

export interface DisabledCliSummary {
  cli: AgentCli
  window: '5h' | 'weekly' | 'manual'
  blockedUntil?: number
  reason: string
}

export interface TrestlePaneState {
  agents: AgentSummary[]
  selectedId?: string
  activeContract?: ContractSummary
  contractsByWorktree?: Record<string, ContractSummary>
  lastCheck?: CheckSummary
  checksByWorktree?: Record<string, CheckSummary>
  worktrees?: WorktreeSummary[]
  recentExperiments?: string[]
  queue?: QueueSummary
  disabledClis?: DisabledCliSummary[]
}

declare module 'claude-code' {
  interface PluginState {
    trestle: {
      pane: Shaped<TrestlePaneState>
    }
  }
}
