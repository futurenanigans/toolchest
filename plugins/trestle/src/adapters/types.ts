import type { AgentCli, AgentEffort, AgentUsage } from '../../types'
import type { CommandSpec } from '../platform'

export type AgentPermissionMode = 'read-only' | 'writer'

export interface LaunchOptions {
  runHome: string
  cwd: string
  prompt: string
  mode: AgentPermissionMode
  model?: string
  effort?: AgentEffort
  resumeSessionId?: string
  commandOverride?: CommandSpec
}

export interface LaunchSpec {
  cli: AgentCli
  command: CommandSpec
  args: string[]
  cwd: string
  env: Record<string, string | undefined>
  initialStdin?: string
  closeStdinAfterInitial?: boolean
  serverUrl?: string
  serverHeaders?: Record<string, string>
}

export type AdapterEvent =
  | { kind: 'session'; sessionId: string }
  | { kind: 'activity'; text: string }
  | { kind: 'message'; text: string }
  | { kind: 'usage'; usage: AgentUsage; cumulative?: boolean }
  | { kind: 'stdin_write'; data: string }
  | { kind: 'turn_done'; finalText?: string }
  | { kind: 'turn_failed'; error: string; transient?: boolean; usageLimited?: boolean; loginFailed?: boolean }

export interface AdapterDriver {
  cli: AgentCli
  prepare(opts: LaunchOptions): Promise<LaunchSpec>
  parseLine(line: string): AdapterEvent[]
  steer(text: string): { kind: 'stdin'; data: string } | { kind: 'http'; url: string; body: unknown; headers?: Record<string, string> } | { kind: 'unsupported'; reason: string }
  ready?(spec: LaunchSpec, isExited?: () => boolean): Promise<void>
}
