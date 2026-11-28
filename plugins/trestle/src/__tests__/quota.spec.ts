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
  usageLimitCooldown,
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

  const clamped = resolveAgentConfig(cfg, 'opencode', 'strong')
  expect(clamped.resolvedFromTier).toBe('cheap')
  expect(clamped.cappedByMaxTier).toBe(true)

  const handedOff = resolveEscalationAgentConfig(cfg, 'opencode', 'cheap', 2)
  expect(handedOff.cli).toBe('claude')
  expect(handedOff.tier).toBe('balanced')
  expect(handedOff.escalatedToFallbackCli).toBe(true)

  const agyStep1 = resolveEscalationAgentConfig(cfg, 'agy', 'cheap', 2)
  expect(agyStep1.cli).toBe('agy')
  expect(agyStep1.tier).toBe('balanced')
  const agyStep2 = resolveEscalationAgentConfig(cfg, 'agy', 'cheap', 4)
  expect(agyStep2.cli).toBe('claude')
  expect(agyStep2.tier).toBe('strong')
})

test('usageLimitCooldown uses timed cooldowns for explicit resets and manual disable when unknown or configured', () => {
  const now = Date.parse('2026-11-26T12:00:00Z')

  const rel2h = usageLimitCooldown(now + 135 * 60_000, now)
  expect(rel2h.window).toBe('5h')
  expect(rel2h.blockedUntil).toBe(now + (2 * 60 + 15) * 60 * 1000)

  const utcDate = usageLimitCooldown(Date.parse('2026-12-01T00:00:00Z'), now)
  expect(utcDate.window).toBe('weekly')
  expect(utcDate.blockedUntil).toBe(Date.parse('2026-12-01T00:00:00Z'))

  const unknown = usageLimitCooldown(undefined, now)
  expect(unknown.window).toBe('manual')
  expect(unknown.blockedUntil).toBeUndefined()
  expect(unknown.manualReenableRequired).toBe(true)

  const forcedManual = usageLimitCooldown(now + 135 * 60_000, now, true)
  expect(forcedManual.window).toBe('manual')
  expect(forcedManual.manualReenableRequired).toBe(true)
})

test('rolling 5-hour and weekly token/cost caps and reactive cooldowns enforce limits', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'trestle-quota-'))
  tempDirs.push(home)

  const now = Date.now()
  await recordCliUsage(
    'opencode',
    { inputTokens: 800, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.5 },
    home,
    now - 6 * 60 * 60 * 1000,
  )
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

  await recordUsageLimitCooldown('opencode', 'Free usage limit reached, resets in 3h', home, now, false, now + 3 * 3600_000)
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
  await recordUsageLimitCooldown('opencode', '5h limit reached', home)

  const scriptPath = path.join(repo, 'mock-claude.ts')
  await fs.writeFile(
    scriptPath,
    `require('fs').writeFileSync('result.txt', 'done'); console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'fallback ok' }))\n`,
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

test('independent processes retain every usage entry in the same quota ledger', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'trestle-shared-quota-'))
  tempDirs.push(home)
  const script = `
    import { recordCliUsage } from './quota'
    for (let i = 0; i < 16; i++) {
      await recordCliUsage('codex', { inputTokens: 1, outputTokens: 0 }, process.argv[1])
    }
  `
  const processes = Array.from({ length: 3 }, () =>
    Bun.spawn([process.execPath, '-e', script, home], { cwd: path.dirname(import.meta.dir), stderr: 'inherit' }),
  )
  expect(await Promise.all(processes.map(child => child.exited))).toEqual([0, 0, 0])
  const status = await checkCliQuota('codex', {}, home)
  expect(status.fiveHour.tokens).toBe(48)
})
