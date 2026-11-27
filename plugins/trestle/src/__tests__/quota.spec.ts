import { afterEach, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import {
  BUILTIN_DEFAULT_CONFIG,
  mergeConfigs,
  resolveAgentConfig,
  resolveEscalationAgentConfig,
  writeUserConfig,
} from '../config'
import { contractCreate } from '../contract'
import { runGoalLoop } from '../goal_loop'
import { execCommand } from '../platform'
import {
  checkCliQuota,
  clearQuotaCooldown,
  FIVE_HOURS_MS,
  parseUsageLimitCooldown,
  recordCliUsage,
  recordUsageLimitCooldown,
  SEVEN_DAYS_MS,
} from '../quota'
import { AgentSupervisor } from '../supervisor'
import { worktreeCreate } from '../worktrees'

const tempDirs: string[] = []

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

test('maxTier clamps tier aliases and hands off to fallbackClis on escalation', () => {
  const cfg = mergeConfigs(BUILTIN_DEFAULT_CONFIG, {
    escalation: {
      enabled: true,
      tiers: ['cheap', 'balanced', 'strong'],
      stepAfterFailures: 2,
      fallbackClis: ['claude', 'codex'],
    },
    agents: {
      opencode: { maxTier: 'cheap' },
      agy: { maxTier: 'balanced' },
    },
  })

  // Requesting 'strong' on opencode clamps to 'cheap'
  const clamped = resolveAgentConfig(cfg, 'opencode', 'strong')
  expect(clamped.resolvedFromTier).toBe('cheap')
  expect(clamped.cappedByMaxTier).toBe(true)

  // After 2 failures on opencode (capped at cheap), escalation hands off to claude at balanced
  const handedOff = resolveEscalationAgentConfig(cfg, 'opencode', 'cheap', 2)
  expect(handedOff.cli).toBe('claude')
  expect(handedOff.tier).toBe('balanced')
  expect(handedOff.escalatedToFallbackCli).toBe(true)

  // agy capped at balanced: 2 failures stays on agy (balanced), 4 failures hands off to claude (strong)
  const agyStep1 = resolveEscalationAgentConfig(cfg, 'agy', 'cheap', 2)
  expect(agyStep1.cli).toBe('agy')
  expect(agyStep1.tier).toBe('balanced')
  const agyStep2 = resolveEscalationAgentConfig(cfg, 'agy', 'cheap', 4)
  expect(agyStep2.cli).toBe('claude')
  expect(agyStep2.tier).toBe('strong')
})

test('parseUsageLimitCooldown uses timed cooldowns for explicit resets and manual disable when unknown or configured', () => {
  const now = Date.parse('2026-11-26T12:00:00Z')

  const rel2h = parseUsageLimitCooldown('Rate limit exceeded, resets in 2h 15m', now)
  expect(rel2h.window).toBe('5h')
  expect(rel2h.blockedUntil).toBe(now + (2 * 60 + 15) * 60 * 1000)

  const utcDate = parseUsageLimitCooldown('You will regain access on 2026-12-01 at 00:00 UTC.', now)
  expect(utcDate.window).toBe('weekly')
  expect(utcDate.blockedUntil).toBe(Date.parse('2026-12-01T00:00:00Z'))

  // No explicit reset time -> disabled indefinitely until manual re-enable
  const unknown = parseUsageLimitCooldown('Usage limit reached', now)
  expect(unknown.window).toBe('manual')
  expect(unknown.blockedUntil).toBeUndefined()
  expect(unknown.manualReenableRequired).toBe(true)

  // Explicit manualReenable flag overrides even when a reset duration is present
  const forcedManual = parseUsageLimitCooldown('Rate limit exceeded, resets in 2h 15m', now, true)
  expect(forcedManual.window).toBe('manual')
  expect(forcedManual.manualReenableRequired).toBe(true)
})

test('rolling 5-hour and weekly token/cost caps and reactive cooldowns enforce limits', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'trestle-quota-'))
  tempDirs.push(home)

  const now = Date.now()
  // Usage from 6 hours ago counts toward weekly, NOT toward 5h
  await recordCliUsage(
    'opencode',
    { inputTokens: 800, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.5 },
    home,
    now - 6 * 60 * 60 * 1000,
  )
  // Usage from 1 hour ago counts toward both 5h and weekly
  await recordCliUsage(
    'opencode',
    { inputTokens: 400, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.25 },
    home,
    now - 60 * 60 * 1000,
  )

  const ok = await checkCliQuota('opencode', { fiveHourMaxTokens: 1000, weeklyMaxTokens: 2000 }, home, now)
  expect(ok.allowed).toBe(true)
  expect(ok.fiveHour.tokens).toBe(500)
  expect(ok.weekly.tokens).toBe(1500)

  const fiveHourBlocked = await checkCliQuota('opencode', { fiveHourMaxTokens: 500, weeklyMaxTokens: 5000 }, home, now)
  expect(fiveHourBlocked.allowed).toBe(false)
  expect(fiveHourBlocked.window).toBe('5h')

  const weeklyBlocked = await checkCliQuota('opencode', { fiveHourMaxTokens: 5000, weeklyMaxTokens: 1500 }, home, now)
  expect(weeklyBlocked.allowed).toBe(false)
  expect(weeklyBlocked.window).toBe('weekly')

  // Reactive cooldown blocks regardless of token count, and clearQuotaCooldown resets it
  await recordUsageLimitCooldown('opencode', 'Free usage limit reached, resets in 3h', home, now)
  const cooled = await checkCliQuota('opencode', undefined, home, now)
  expect(cooled.allowed).toBe(false)
  expect(cooled.window).toBe('5h')

  await clearQuotaCooldown('opencode', home)
  const cleared = await checkCliQuota('opencode', undefined, home, now)
  expect(cleared.allowed).toBe(true)
})

test('runGoalLoop automatically falls back to fallbackCli when primary CLI is in 5h cooldown', async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'trestle-fb-'))
  tempDirs.push(base)
  const home = path.join(base, 'home')
  const repo = path.join(base, 'repo')
  await fs.mkdir(home, { recursive: true })
  await fs.mkdir(repo, { recursive: true })

  await execCommand('git', ['init', '-b', 'main'], { cwd: repo })
  await execCommand('git', ['config', 'user.email', 'test@example.com'], { cwd: repo })
  await execCommand('git', ['config', 'user.name', 'Test'], { cwd: repo })
  await fs.writeFile(path.join(repo, '.gitignore'), '.trestle/\n.trestle-wt/\n', 'utf8')
  await fs.writeFile(path.join(repo, 'README.md'), 'init\n', 'utf8')
  await execCommand('git', ['add', '.gitignore', 'README.md'], { cwd: repo })
  await execCommand('git', ['commit', '-m', 'init'], { cwd: repo })

  await writeUserConfig(
    {
      escalation: { enabled: true, tiers: ['cheap', 'balanced', 'strong'], fallbackClis: ['claude'] },
    },
    { homeDir: home },
  )
  // Put opencode into 5h cooldown
  await recordUsageLimitCooldown('opencode', '5h limit reached', home)

  const scriptPath = path.join(repo, 'mock-claude.ts')
  await fs.writeFile(
    scriptPath,
    `console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'fallback ok' }))\n`,
    'utf8',
  )

  const wt = await worktreeCreate(repo, 'fb-wt', { homeDir: home })
  await contractCreate(
    repo,
    {
      id: 'fb-c',
      title: 'Fallback test',
      goal: 'Succeed via fallback CLI',
      acceptanceCriteria: [{ id: 'ac1', description: 'ok' }],
      includeMortise: false,
      checks: [{ name: 'ok', command: ['bun', '-e', 'process.exit(0)'] }],
    },
    home,
  )

  const supervisor = new AgentSupervisor()
  const res = await runGoalLoop(supervisor, {
    repoRoot: repo,
    contractId: 'fb-c',
    cli: 'opencode',
    worktreeId: wt.id,
    worktreePath: wt.path,
    branch: wt.branch,
    commandOverride: ['bun', 'run', scriptPath],
    homeDir: home,
  })

  expect(res.status).toBe('passed')
  expect(supervisor.list()[0]?.cli).toBe('claude')
})
