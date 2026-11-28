import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import type { AgentCli, AgentEffort } from '../types'
import type { CheckCommandSpec } from './checks'
import { userHome, type CommandSpec } from './platform'
import { stateDir } from './state'

export type ModelTier = 'cheap' | 'balanced' | 'strong'

export type TierTarget = string | { model: string; effort?: AgentEffort }

export interface QuotaWindowConfig {
  fiveHourMaxTokens?: number
  fiveHourMaxCostUsd?: number
  weeklyMaxTokens?: number
  weeklyMaxCostUsd?: number
  manualReenable?: boolean
}

export interface AgentCliConfig {
  command?: CommandSpec
  defaultModel?: string
  defaultEffort?: AgentEffort
  maxTier?: string
  quota?: QuotaWindowConfig
  tiers?: Record<string, TierTarget | undefined>
}

export interface ChecksConfig {
  commands?: CheckCommandSpec[]
  includeMortise?: boolean
  timeoutMs?: number
  allowEmpty?: boolean
}

export interface EscalationConfig {
  tiers?: string[]
  stepAfterFailures?: number
  enabled?: boolean
  fallbackClis?: AgentCli[]
}

export interface ResourcesConfig {
  maxParallel?: number
  minFreeMemMb?: number
  perAgentMaxMemMb?: number
  partitionThreads?: boolean
}

export interface TrestleConfig {
  version?: 1
  defaultCli?: AgentCli
  defaultTier?: string
  defaultEffort?: AgentEffort
  maxIterations?: number
  escalation?: EscalationConfig
  resources?: ResourcesConfig
  agents?: Partial<Record<AgentCli, AgentCliConfig>>
  checks?: ChecksConfig
}

export const BUILTIN_DEFAULT_CONFIG: TrestleConfig = {
  version: 1,
  defaultCli: 'claude',
  maxIterations: 10,
  escalation: {
    enabled: true,
    tiers: ['cheap', 'balanced', 'strong'],
    stepAfterFailures: 2,
    fallbackClis: ['claude', 'codex'],
  },
  resources: {
    maxParallel: 2,
    minFreeMemMb: 2048,
    partitionThreads: true,
  },
  agents: {
    claude: {
      tiers: {
        cheap: { model: 'claude-haiku-5-5', effort: 'low' },
        balanced: { model: 'claude-sonnet-5-5', effort: 'medium' },
        strong: { model: 'claude-opus-5-5', effort: 'high' },
      },
    },
    codex: {
      tiers: {
        cheap: { model: 'gpt-6-luna', effort: 'low' },
        balanced: { model: 'gpt-6.2-sol', effort: 'medium' },
        strong: { model: 'gpt-6.2-sol', effort: 'high' },
      },
    },
    opencode: {
      tiers: {
        cheap: { model: 'opencode-go/deepseek-v4.1-flash', effort: 'low' },
        balanced: { model: 'opencode-go/glm-5.3', effort: 'medium' },
        strong: { model: 'opencode-go/deepseek-v4-pro', effort: 'high' },
      },
    },
    agy: {
      tiers: {
        cheap: { model: 'gemini-3.8-flash-low', effort: 'low' },
        balanced: { model: 'gemini-4-neon-medium', effort: 'medium' },
        strong: { model: 'gemini-4-neon-high', effort: 'high' },
      },
    },
    pi: {
      tiers: {
        cheap: { model: 'anthropic/claude-haiku-5-5', effort: 'medium' },
        balanced: { model: 'openai/gpt-6.2-sol', effort: 'medium' },
        strong: { model: 'openai/gpt-6.2-sol', effort: 'high' },
      },
    },
  },
}

const ALL_CLIS: AgentCli[] = ['claude', 'codex', 'opencode', 'agy', 'pi']

export function userConfigPath(homeDir = userHome()): string {
  return path.join(homeDir, '.trestle', 'config.json')
}

export function repoLocalConfigPath(repoRoot: string, homeDir = userHome()): string {
  return path.join(stateDir(repoRoot, homeDir), 'config.json')
}

export function repoCheckedInConfigPath(repoRoot: string): string {
  return path.join(path.resolve(repoRoot), '.trestle', 'config.json')
}

async function readJsonFile(filePath: string): Promise<TrestleConfig | undefined> {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw) as TrestleConfig
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw err
  }
}

async function writeJsonAtomic(filePath: string, data: TrestleConfig): Promise<void> {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
  const tmp = path.join(dir, `config.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`)
  await fs.writeFile(tmp, `${JSON.stringify({ version: 1, ...data }, null, 2)}\n`, 'utf8')
  await fs.rename(tmp, filePath)
}

function mergeAgentConfig(base?: AgentCliConfig, override?: AgentCliConfig): AgentCliConfig | undefined {
  if (!base && !override) return undefined
  return {
    ...(base ?? {}),
    ...(override ?? {}),
    ...(base?.quota || override?.quota ? { quota: { ...(base?.quota ?? {}), ...(override?.quota ?? {}) } } : {}),
    tiers: {
      ...(base?.tiers ?? {}),
      ...(override?.tiers ?? {}),
    },
  }
}

export function mergeConfigs(...layers: Array<TrestleConfig | undefined>): TrestleConfig {
  let acc: TrestleConfig = { version: 1, agents: {}, checks: {} }
  for (const layer of layers) {
    if (!layer) continue
    const nextAgents: Partial<Record<AgentCli, AgentCliConfig>> = { ...(acc.agents ?? {}) }
    for (const cli of ALL_CLIS) {
      const merged = mergeAgentConfig(acc.agents?.[cli], layer.agents?.[cli])
      if (merged) nextAgents[cli] = merged
    }
    acc = {
      version: 1,
      defaultCli: layer.defaultCli ?? acc.defaultCli,
      defaultTier: layer.defaultTier ?? acc.defaultTier,
      defaultEffort: layer.defaultEffort ?? acc.defaultEffort,
      maxIterations: layer.maxIterations ?? acc.maxIterations,
      escalation: layer.escalation
        ? { ...(acc.escalation ?? { tiers: ['cheap', 'balanced', 'strong'] }), ...layer.escalation }
        : acc.escalation,
      resources: {
        ...(acc.resources ?? {}),
        ...(layer.resources ?? {}),
      },
      agents: nextAgents,
      checks: {
        ...(acc.checks ?? {}),
        ...(layer.checks ?? {}),
      },
    }
  }
  return acc
}

export async function readUserConfig(homeDir = userHome()): Promise<TrestleConfig> {
  return (await readJsonFile(userConfigPath(homeDir))) ?? { version: 1 }
}

export async function readRepoConfig(
  repoRoot: string,
  options: { homeDir?: string; inRepo?: boolean } = {},
): Promise<TrestleConfig> {
  const homeDir = options.homeDir ?? userHome()
  if (options.inRepo) {
    return (await readJsonFile(repoCheckedInConfigPath(repoRoot))) ?? { version: 1 }
  }
  return (await readJsonFile(repoLocalConfigPath(repoRoot, homeDir))) ?? { version: 1 }
}

export async function loadEffectiveConfig(
  repoRoot?: string,
  homeDir = userHome(),
): Promise<{
  config: TrestleConfig
  sources: { user: string; repoCheckedIn?: string; repoLocal?: string }
}> {
  const uPath = userConfigPath(homeDir)
  const userCfg = await readJsonFile(uPath)

  let checkedInCfg: TrestleConfig | undefined
  let localRepoCfg: TrestleConfig | undefined
  let checkedInPath: string | undefined
  let localRepoPath: string | undefined

  if (repoRoot) {
    checkedInPath = repoCheckedInConfigPath(repoRoot)
    localRepoPath = repoLocalConfigPath(repoRoot, homeDir)
    checkedInCfg = await readJsonFile(checkedInPath)
    localRepoCfg = await readJsonFile(localRepoPath)
  }

  return {
    config: mergeConfigs(BUILTIN_DEFAULT_CONFIG, userCfg, checkedInCfg, localRepoCfg),
    sources: {
      user: uPath,
      ...(checkedInPath ? { repoCheckedIn: checkedInPath } : {}),
      ...(localRepoPath ? { repoLocal: localRepoPath } : {}),
    },
  }
}

export async function writeUserConfig(
  patch: TrestleConfig,
  options: { replace?: boolean; homeDir?: string } = {},
): Promise<{ path: string; config: TrestleConfig }> {
  const homeDir = options.homeDir ?? userHome()
  const target = userConfigPath(homeDir)
  const existing = options.replace ? undefined : await readJsonFile(target)
  const next = options.replace ? { version: 1 as const, ...patch } : mergeConfigs(existing, patch)
  await writeJsonAtomic(target, next)
  return { path: target, config: next }
}

export async function writeRepoConfig(
  repoRoot: string,
  patch: TrestleConfig,
  options: { replace?: boolean; inRepo?: boolean; homeDir?: string } = {},
): Promise<{ path: string; config: TrestleConfig }> {
  const homeDir = options.homeDir ?? userHome()
  const target = options.inRepo ? repoCheckedInConfigPath(repoRoot) : repoLocalConfigPath(repoRoot, homeDir)
  const existing = options.replace ? undefined : await readJsonFile(target)
  const next = options.replace ? { version: 1 as const, ...patch } : mergeConfigs(existing, patch)
  await writeJsonAtomic(target, next)
  return { path: target, config: next }
}

function unpackTier(target: TierTarget | undefined): { model: string; effort?: AgentEffort } | undefined {
  if (!target) return undefined
  return typeof target === 'string' ? { model: target } : target
}

function clampTierName(
  tierName: string,
  maxTier: string | undefined,
  tierOrder: readonly string[],
): { tier: string; clamped: boolean } {
  if (!maxTier) return { tier: tierName, clamped: false }
  const reqIdx = tierOrder.indexOf(tierName)
  const maxIdx = tierOrder.indexOf(maxTier)
  if (reqIdx >= 0 && maxIdx >= 0 && reqIdx > maxIdx) {
    return { tier: maxTier, clamped: true }
  }
  return { tier: tierName, clamped: false }
}

export function resolveAgentConfig(
  config: TrestleConfig,
  cli: AgentCli,
  requestedModelOrTier?: string,
  requestedEffort?: AgentEffort,
): { model?: string; effort?: AgentEffort; commandOverride?: CommandSpec; resolvedFromTier?: string; cappedByMaxTier?: boolean } {
  const cliCfg = config.agents?.[cli]
  const tiers = cliCfg?.tiers ?? {}
  const tierOrder = config.escalation?.tiers ?? ['cheap', 'balanced', 'strong']
  const fallbackEffort = requestedEffort ?? cliCfg?.defaultEffort ?? config.defaultEffort

  const resolveTier = (rawTier: string) => {
    const { tier, clamped } = clampTierName(rawTier, cliCfg?.maxTier, tierOrder)
    const mapped = unpackTier(tiers[tier]) ?? unpackTier(tiers[rawTier])
    if (!mapped) return undefined
    return {
      model: mapped.model,
      effort: requestedEffort ?? mapped.effort ?? cliCfg?.defaultEffort ?? config.defaultEffort,
      commandOverride: cliCfg?.command,
      resolvedFromTier: tier,
      ...(clamped ? { cappedByMaxTier: true } : {}),
    }
  }

  if (requestedModelOrTier) {
    if (tiers[requestedModelOrTier]) {
      const hit = resolveTier(requestedModelOrTier)
      if (hit) return hit
    }
    return { model: requestedModelOrTier, effort: fallbackEffort, commandOverride: cliCfg?.command }
  }

  if (cliCfg?.defaultModel) {
    if (tiers[cliCfg.defaultModel]) {
      const hit = resolveTier(cliCfg.defaultModel)
      if (hit) return hit
    }
    return { model: cliCfg.defaultModel, effort: fallbackEffort, commandOverride: cliCfg.command }
  }

  if (config.defaultTier && tiers[config.defaultTier]) {
    const hit = resolveTier(config.defaultTier)
    if (hit) return hit
  }

  return { model: undefined, effort: fallbackEffort, commandOverride: cliCfg?.command }
}

export function resolveEscalationAgentConfig(
  config: TrestleConfig,
  cli: AgentCli,
  requestedModelOrTier: string | undefined,
  failedIterations: number,
  requestedEffort?: AgentEffort,
): {
  cli: AgentCli
  model?: string
  effort?: AgentEffort
  commandOverride?: CommandSpec
  tier?: string
  escalatedToFallbackCli?: boolean
} {
  const base = resolveAgentConfig(config, cli, requestedModelOrTier, requestedEffort)
  const esc = config.escalation
  if (!esc || esc.enabled === false || !esc.tiers || esc.tiers.length === 0 || failedIterations <= 0) {
    return {
      cli,
      model: base.model,
      effort: base.effort,
      commandOverride: base.commandOverride,
      tier: base.resolvedFromTier,
    }
  }

  if (requestedModelOrTier && !base.resolvedFromTier) {
    return { cli, model: base.model, effort: base.effort, commandOverride: base.commandOverride }
  }

  const cliCfg = config.agents?.[cli]
  const cliTiers = cliCfg?.tiers ?? {}
  const stepAfter = Math.max(1, esc.stepAfterFailures ?? 2)
  const startTier = base.resolvedFromTier ?? esc.tiers[0]!
  const startIdx = Math.max(0, esc.tiers.indexOf(startTier))
  const desiredIdx = Math.min(esc.tiers.length - 1, startIdx + Math.floor(failedIterations / stepAfter))
  const maxTierIdx = cliCfg?.maxTier ? esc.tiers.indexOf(cliCfg.maxTier) : -1

  if (maxTierIdx >= 0 && desiredIdx > maxTierIdx && esc.fallbackClis && esc.fallbackClis.length > 0) {
    const desiredTierName = esc.tiers[desiredIdx]!
    for (const fbCli of esc.fallbackClis) {
      if (fbCli === cli) continue
      const fbCfg = config.agents?.[fbCli]
      const fbMaxIdx = fbCfg?.maxTier ? esc.tiers.indexOf(fbCfg.maxTier) : -1
      if (fbMaxIdx >= 0 && desiredIdx > fbMaxIdx) continue
      const fbResolved = resolveAgentConfig(config, fbCli, desiredTierName, requestedEffort)
      if (fbResolved.model) {
        return {
          cli: fbCli,
          model: fbResolved.model,
          effort: fbResolved.effort,
          commandOverride: fbResolved.commandOverride,
          tier: fbResolved.resolvedFromTier,
          escalatedToFallbackCli: true,
        }
      }
    }
  }

  const cappedIdx = maxTierIdx >= 0 ? Math.min(desiredIdx, maxTierIdx) : desiredIdx
  for (let i = cappedIdx; i >= startIdx; i--) {
    const tierName = esc.tiers[i]!
    const mapped = unpackTier(cliTiers[tierName])
    if (mapped) {
      return {
        cli,
        model: mapped.model,
        effort: requestedEffort ?? mapped.effort ?? cliCfg?.defaultEffort ?? config.defaultEffort,
        commandOverride: base.commandOverride,
        tier: tierName,
      }
    }
  }

  return {
    cli,
    model: base.model,
    effort: base.effort,
    commandOverride: base.commandOverride,
    tier: base.resolvedFromTier,
  }
}
