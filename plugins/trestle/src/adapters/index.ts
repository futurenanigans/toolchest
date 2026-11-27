import type { AgentCli } from '../../types'
import { createAgyAdapter } from './agy'
import { createClaudeAdapter } from './claude'
import { createCodexAdapter } from './codex'
import { createOpencodeAdapter } from './opencode'
import { createPiAdapter } from './pi'
import type { AdapterDriver } from './types'

export type { AdapterDriver, AdapterEvent, AgentPermissionMode, LaunchOptions, LaunchSpec } from './types'

export function createAdapter(cli: AgentCli): AdapterDriver {
  switch (cli) {
    case 'claude':
      return createClaudeAdapter()
    case 'codex':
      return createCodexAdapter()
    case 'opencode':
      return createOpencodeAdapter()
    case 'agy':
      return createAgyAdapter()
    case 'pi':
      return createPiAdapter()
  }
}
