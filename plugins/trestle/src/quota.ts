import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import type { AgentCli, AgentUsage, DisabledCliSummary } from '../types'
import type { QuotaWindowConfig } from './config'
import { withFileLock } from './locks'
import { userHome } from './platform'

export const FIVE_HOURS_MS = 5 * 60 * 60 * 1000
export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export interface UsageLedgerEntry {
  ts: number
  cli: AgentCli
  tokens: number
  costUsd?: number
}

export interface CooldownEntry {
  cli: AgentCli
  window: '5h' | 'weekly' | 'manual'
  blockedUntil?: number
  manualReenableRequired?: boolean
  reason: string
  recordedAt: number
}

export interface QuotaLedgerFile {
  version: 1
  entries: UsageLedgerEntry[]
  cooldowns: Partial<Record<AgentCli, CooldownEntry>>
}

export interface CliQuotaStatus {
  cli: AgentCli
  allowed: boolean
  reason?: string
  blockedUntil?: number
  manualReenableRequired?: boolean
  window?: '5h' | 'weekly' | 'manual'
  fiveHour: { tokens: number; costUsd: number; maxTokens?: number; maxCostUsd?: number }
  weekly: { tokens: number; costUsd: number; maxTokens?: number; maxCostUsd?: number }
}

export function quotaLedgerPath(homeDir = userHome()): string {
  return path.join(homeDir, '.trestle', 'quotas.json')
}

export async function readQuotaLedger(homeDir = userHome()): Promise<QuotaLedgerFile> {
  const filePath = quotaLedgerPath(homeDir)
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<QuotaLedgerFile>
    return {
      version: 1,
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      cooldowns: parsed.cooldowns ?? {},
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { version: 1, entries: [], cooldowns: {} }
    }
    throw err
  }
}

function isCooldownActive(cd: CooldownEntry | undefined, now: number): cd is CooldownEntry {
  if (!cd) return false
  if (cd.manualReenableRequired || cd.blockedUntil === undefined) return true
  return cd.blockedUntil > now
}

async function updateQuotaLedger(
  updater: (cur: QuotaLedgerFile) => QuotaLedgerFile,
  homeDir = userHome(),
): Promise<QuotaLedgerFile> {
  const target = quotaLedgerPath(homeDir)
  return withFileLock(target + '.lock', async () => {
    const cur = await readQuotaLedger(homeDir)
    const now = Date.now()
    const prunedEntries = cur.entries.filter(e => now - e.ts <= SEVEN_DAYS_MS)
    const prunedCooldowns: Partial<Record<AgentCli, CooldownEntry>> = {}
    for (const [cli, cd] of Object.entries(cur.cooldowns)) {
      if (isCooldownActive(cd, now)) {
        prunedCooldowns[cli as AgentCli] = cd
      }
    }
    const next = updater({ version: 1, entries: prunedEntries, cooldowns: prunedCooldowns })
    const tmp = path.join(
      path.dirname(target),
      `quotas.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`,
    )
    await fs.writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    await fs.rename(tmp, target)
    return next
  })
}

export async function recordCliUsage(
  cli: AgentCli,
  usage: AgentUsage,
  homeDir = userHome(),
  now = Date.now(),
): Promise<void> {
  const tokens = Math.max(0, (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0))
  if (tokens === 0 && usage.costUsd === undefined) return
  await updateQuotaLedger(
    cur => ({
      ...cur,
      entries: [
        ...cur.entries,
        { ts: now, cli, tokens, ...(usage.costUsd !== undefined ? { costUsd: usage.costUsd } : {}) },
      ],
    }),
    homeDir,
  )
}

export function usageLimitCooldown(resetAt: number | undefined, now: number, manualReenable = false): Pick<CooldownEntry, 'window' | 'blockedUntil' | 'manualReenableRequired'> {
  if (!manualReenable && resetAt !== undefined && Number.isFinite(resetAt) && resetAt > now) {
    return { window: resetAt - now > FIVE_HOURS_MS ? 'weekly' : '5h', blockedUntil: resetAt }
  }
  return { window: 'manual', manualReenableRequired: true }
}

export async function recordUsageLimitCooldown(
  cli: AgentCli,
  errorText: string,
  homeDir = userHome(),
  now = Date.now(),
  manualReenable = false,
  resetAt?: number,
): Promise<CooldownEntry> {
  const { window, blockedUntil, manualReenableRequired } = usageLimitCooldown(resetAt, now, manualReenable)
  const entry: CooldownEntry = {
    cli,
    window,
    ...(blockedUntil !== undefined ? { blockedUntil } : {}),
    ...(manualReenableRequired ? { manualReenableRequired: true } : {}),
    reason: errorText.slice(0, 240),
    recordedAt: now,
  }
  await updateQuotaLedger(
    cur => ({
      ...cur,
      cooldowns: { ...cur.cooldowns, [cli]: entry },
    }),
    homeDir,
  )
  return entry
}

export async function clearQuotaCooldown(cli?: AgentCli, homeDir = userHome()): Promise<void> {
  await updateQuotaLedger(cur => {
    if (!cli) return { ...cur, cooldowns: {} }
    const next = { ...cur.cooldowns }
    delete next[cli]
    return { ...cur, cooldowns: next }
  }, homeDir)
}

export async function getActiveCooldownSummaries(
  homeDir = userHome(),
  now = Date.now(),
): Promise<DisabledCliSummary[]> {
  const ledger = await readQuotaLedger(homeDir)
  const out: DisabledCliSummary[] = []
  for (const cd of Object.values(ledger.cooldowns)) {
    if (!isCooldownActive(cd, now)) continue
    out.push({
      cli: cd.cli,
      window: cd.window,
      ...(cd.blockedUntil !== undefined ? { blockedUntil: cd.blockedUntil } : {}),
      reason: cd.reason,
    })
  }
  return out
}

export async function checkCliQuota(
  cli: AgentCli,
  quotaCfg?: QuotaWindowConfig,
  homeDir = userHome(),
  now = Date.now(),
): Promise<CliQuotaStatus> {
  const ledger = await readQuotaLedger(homeDir)

  let fiveHourTokens = 0
  let fiveHourCost = 0
  let weeklyTokens = 0
  let weeklyCost = 0

  for (const e of ledger.entries) {
    if (e.cli !== cli) continue
    const age = now - e.ts
    if (age <= SEVEN_DAYS_MS) {
      weeklyTokens += e.tokens
      weeklyCost += e.costUsd ?? 0
    }
    if (age <= FIVE_HOURS_MS) {
      fiveHourTokens += e.tokens
      fiveHourCost += e.costUsd ?? 0
    }
  }

  const base: CliQuotaStatus = {
    cli,
    allowed: true,
    fiveHour: {
      tokens: fiveHourTokens,
      costUsd: fiveHourCost,
      ...(quotaCfg?.fiveHourMaxTokens !== undefined ? { maxTokens: quotaCfg.fiveHourMaxTokens } : {}),
      ...(quotaCfg?.fiveHourMaxCostUsd !== undefined ? { maxCostUsd: quotaCfg.fiveHourMaxCostUsd } : {}),
    },
    weekly: {
      tokens: weeklyTokens,
      costUsd: weeklyCost,
      ...(quotaCfg?.weeklyMaxTokens !== undefined ? { maxTokens: quotaCfg.weeklyMaxTokens } : {}),
      ...(quotaCfg?.weeklyMaxCostUsd !== undefined ? { maxCostUsd: quotaCfg.weeklyMaxCostUsd } : {}),
    },
  }

  const cd = ledger.cooldowns[cli]
  if (isCooldownActive(cd, now)) {
    const reason =
      cd.manualReenableRequired || cd.blockedUntil === undefined
        ? `${cli} disabled after usage limit (re-enable via quota_clear_cooldown): ${cd.reason}`
        : `${cli} ${cd.window} usage-limit cooldown active until ${new Date(cd.blockedUntil).toISOString()} (${cd.reason})`
    return {
      ...base,
      allowed: false,
      window: cd.window,
      ...(cd.blockedUntil !== undefined ? { blockedUntil: cd.blockedUntil } : {}),
      ...(cd.manualReenableRequired ? { manualReenableRequired: true } : {}),
      reason,
    }
  }

  if (quotaCfg?.fiveHourMaxTokens !== undefined && fiveHourTokens >= quotaCfg.fiveHourMaxTokens) {
    return {
      ...base,
      allowed: false,
      window: '5h',
      reason: `${cli} 5h token cap reached (${fiveHourTokens}/${quotaCfg.fiveHourMaxTokens})`,
    }
  }
  if (quotaCfg?.fiveHourMaxCostUsd !== undefined && fiveHourCost >= quotaCfg.fiveHourMaxCostUsd) {
    return {
      ...base,
      allowed: false,
      window: '5h',
      reason: `${cli} 5h cost cap reached ($${fiveHourCost.toFixed(4)}/$${quotaCfg.fiveHourMaxCostUsd.toFixed(4)})`,
    }
  }
  if (quotaCfg?.weeklyMaxTokens !== undefined && weeklyTokens >= quotaCfg.weeklyMaxTokens) {
    return {
      ...base,
      allowed: false,
      window: 'weekly',
      reason: `${cli} weekly token cap reached (${weeklyTokens}/${quotaCfg.weeklyMaxTokens})`,
    }
  }
  if (quotaCfg?.weeklyMaxCostUsd !== undefined && weeklyCost >= quotaCfg.weeklyMaxCostUsd) {
    return {
      ...base,
      allowed: false,
      window: 'weekly',
      reason: `${cli} weekly cost cap reached ($${weeklyCost.toFixed(4)}/$${quotaCfg.weeklyMaxCostUsd.toFixed(4)})`,
    }
  }

  return base
}
