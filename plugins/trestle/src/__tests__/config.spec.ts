import { afterEach, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import {
  BUILTIN_DEFAULT_CONFIG,
  loadEffectiveConfig,
  resolveAgentConfig,
  resolveEscalationAgentConfig,
  writeRepoConfig,
  writeUserConfig,
} from '../config'
import { contractCreate } from '../contract'
import { runGoalLoop } from '../goal_loop'
import { execCommand } from '../platform'
import { AgentSupervisor, buildResourceEnv } from '../supervisor'
import { queueAdd, queueRunNext } from '../queue'
import { worktreeCreate } from '../worktrees'

const tempDirs: string[] = []

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

test('user config provides defaults and repo configs (checked-in & local) override checks and agent tiers', async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'trestle-cfg-'))
  tempDirs.push(base)
  const home = path.join(base, 'home')
  const repo = path.join(base, 'repo')
  await fs.mkdir(home, { recursive: true })
  await fs.mkdir(repo, { recursive: true })

  // 1. User-level config sets default tiers and check timeout
  await writeUserConfig(
    {
      defaultTier: 'cheap',
      agents: {
        claude: {
          defaultModel: 'balanced',
          tiers: { cheap: 'claude-haiku-custom', balanced: 'claude-sonnet-custom' },
        },
        codex: {
          command: ['bun', 'x', '@openai/codex'],
          tiers: { cheap: 'gpt-6.2-sol' },
        },
      },
      checks: {
        includeMortise: false,
        timeoutMs: 30_000,
      },
    },
    { homeDir: home },
  )

  // 2. Checked-in repo config customizes repo checks
  await writeRepoConfig(
    repo,
    {
      checks: {
        commands: [{ name: 'repo-lint', command: ['bun', '-e', 'process.exit(0)'] }],
      },
    },
    { inRepo: true, homeDir: home },
  )

  // 3. Local repo config overrides claude cheap tier without touching git
  await writeRepoConfig(
    repo,
    {
      agents: {
        claude: {
          tiers: { cheap: 'claude-haiku-repo-local' },
        },
      },
    },
    { inRepo: false, homeDir: home },
  )

  const { config } = await loadEffectiveConfig(repo, home)

  // Repo local tier overrides user tier; user balanced tier still inherited
  expect(resolveAgentConfig(config, 'claude', 'cheap').model).toBe('claude-haiku-repo-local')
  expect(resolveAgentConfig(config, 'claude', 'balanced').model).toBe('claude-sonnet-custom')
  // Default model on claude resolves tier alias 'balanced'
  expect(resolveAgentConfig(config, 'claude').model).toBe('claude-sonnet-custom')
  // Literal model passes through untouched
  expect(resolveAgentConfig(config, 'claude', 'claude-opus-4-6').model).toBe('claude-opus-4-6')
  // User defaultTier applies to codex + command override preserved
  const codexResolved = resolveAgentConfig(config, 'codex')
  expect(codexResolved.model).toBe('gpt-6.2-sol')
  expect(codexResolved.commandOverride).toEqual(['bun', 'x', '@openai/codex'])

  // Repo checks merged with user checks defaults
  expect(config.checks?.commands?.[0]?.name).toBe('repo-lint')
  expect(config.checks?.includeMortise).toBe(false)
  expect(config.checks?.timeoutMs).toBe(30_000)
})

test('runGoalLoop uses per-repo configured checks when contract omits explicit checks', async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'trestle-cfg-goal-'))
  tempDirs.push(base)
  const home = path.join(base, 'home')
  const repo = path.join(base, 'repo')
  await fs.mkdir(home, { recursive: true })
  await fs.mkdir(repo, { recursive: true })

  await execCommand('git', ['init', '-b', 'main'], { cwd: repo })
  await execCommand('git', ['config', 'user.email', 'test@example.com'], { cwd: repo })
  await execCommand('git', ['config', 'user.name', 'Test'], { cwd: repo })
  await fs.writeFile(path.join(repo, '.gitignore'), '.trestle/\n.trestle-wt/\n', 'utf8')
  await fs.writeFile(path.join(repo, 'README.md'), 'hi\n', 'utf8')
  await execCommand('git', ['add', '.gitignore', 'README.md'], { cwd: repo })
  await execCommand('git', ['commit', '-m', 'init'], { cwd: repo })

  // Configure custom check in repo config
  await writeRepoConfig(
    repo,
    {
      checks: {
        includeMortise: false,
            commands: [{ name: 'repo-custom-check', command: ['bun', '-e', 'console.log("custom ok")'] }],
      },
    },
    { homeDir: home },
  )

  const scriptPath = path.join(repo, 'mock.ts')
  await fs.writeFile(
    scriptPath,
    `console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'done' }))\n`,
    'utf8',
  )

  const wt = await worktreeCreate(repo, 'cfg-wt', { homeDir: home })
  await contractCreate(
    repo,
    {
      id: 'cfg-contract',
      title: 'Use repo checks',
      goal: 'Pass repo-configured checks',
      acceptanceCriteria: [{ id: 'ac1', description: 'repo check passes' }],
      includeMortise: false,
    },
    home,
  )

  const supervisor = new AgentSupervisor()
  const res = await runGoalLoop(supervisor, {
    repoRoot: repo,
    contractId: 'cfg-contract',
    cli: 'claude',
    worktreeId: wt.id,
    worktreePath: wt.path,
    branch: wt.branch,
    commandOverride: ['bun', 'run', scriptPath],
    homeDir: home,
  })

  expect(res.status).toBe('passed')
  expect(res.lastReport?.results[0]?.name).toBe('repo-custom-check')
})

test('resolveEscalationAgentConfig steps up tiers after configured failures and respects pinned literals', () => {
  // Starting from cheap: 0-1 failures -> cheap, 2-3 -> balanced, 4+ -> strong
  expect(resolveEscalationAgentConfig(BUILTIN_DEFAULT_CONFIG, 'claude', 'cheap', 0).tier).toBe('cheap')
  expect(resolveEscalationAgentConfig(BUILTIN_DEFAULT_CONFIG, 'claude', 'cheap', 1).tier).toBe('cheap')
  expect(resolveEscalationAgentConfig(BUILTIN_DEFAULT_CONFIG, 'claude', 'cheap', 2).tier).toBe('balanced')
  expect(resolveEscalationAgentConfig(BUILTIN_DEFAULT_CONFIG, 'claude', 'cheap', 4).tier).toBe('strong')
  // Starting from balanced: 2 failures -> strong
  expect(resolveEscalationAgentConfig(BUILTIN_DEFAULT_CONFIG, 'claude', 'balanced', 2).tier).toBe('strong')
  // Literal pinned model is never escalated
  const pinned = resolveEscalationAgentConfig(BUILTIN_DEFAULT_CONFIG, 'claude', 'claude-haiku-4-5', 5)
  expect(pinned.model).toBe('claude-haiku-4-5')
  expect(pinned.tier).toBeUndefined()
  expect(BUILTIN_DEFAULT_CONFIG.escalation?.fallbackClis).toEqual(['claude', 'codex'])

  // Every built-in CLI has cheap, balanced, and strong tiers with effort labels
  for (const cli of ['claude', 'codex', 'opencode', 'agy', 'pi'] as const) {
    const cheap = resolveAgentConfig(BUILTIN_DEFAULT_CONFIG, cli, 'cheap')
    const balanced = resolveAgentConfig(BUILTIN_DEFAULT_CONFIG, cli, 'balanced')
    const strong = resolveAgentConfig(BUILTIN_DEFAULT_CONFIG, cli, 'strong')
    expect(cheap.model).toBeTruthy()
    expect(cheap.effort).toBe(cli === 'pi' ? 'medium' : 'low')
    expect(balanced.model).toBeTruthy()
    expect(balanced.effort).toBe('medium')
    expect(strong.model).toBeTruthy()
    expect(strong.effort).toBe('high')
  }
})

test('buildResourceEnv partitions threads for concurrent agents and applies heap caps', () => {
  const single = buildResourceEnv(1, { partitionThreads: true, perAgentMaxMemMb: 2048 }, 8, '')
  expect(single.CARGO_BUILD_JOBS).toBeUndefined()
  expect(single.NODE_OPTIONS).toBe('--max-old-space-size=2048')
  expect(single.DOTNET_GCHeapHardLimit).toBe('0x80000000')

  const dual = buildResourceEnv(2, { partitionThreads: true }, 8, '')
  expect(dual.CARGO_BUILD_JOBS).toBe('4')
  expect(dual.RAYON_NUM_THREADS).toBe('4')
})

test('queueRunNext throttles parallelism to 1 when free RAM is below minFreeMemMb', async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'trestle-mem-'))
  tempDirs.push(base)
  const home = path.join(base, 'home')
  const repo = path.join(base, 'repo')
  await fs.mkdir(home, { recursive: true })
  await fs.mkdir(repo, { recursive: true })

  await execCommand('git', ['init', '-b', 'main'], { cwd: repo })
  await execCommand('git', ['config', 'user.email', 'test@example.com'], { cwd: repo })
  await execCommand('git', ['config', 'user.name', 'Test'], { cwd: repo })
  await fs.writeFile(path.join(repo, '.gitignore'), '.trestle/\n.trestle-wt/\n', 'utf8')
  await fs.writeFile(path.join(repo, 'README.md'), 'hi\n', 'utf8')
  const scriptPath = path.join(repo, 'mock.ts')
  await fs.writeFile(
    scriptPath,
    `console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'ok' }))\n`,
    'utf8',
  )
  await execCommand('git', ['add', '.gitignore', 'README.md', 'mock.ts'], { cwd: repo })
  await execCommand('git', ['commit', '-m', 'init'], { cwd: repo })

  await queueAdd(
    repo,
    {
      id: 'm1',
      title: 'M1',
      goal: 'M1',
      acceptanceCriteria: [{ id: 'c1', description: 'ok' }],
      includeMortise: false,
      checks: [{ name: 'ok', command: ['bun', '-e', 'process.exit(0)'] }],
    },
    home,
  )
  await queueAdd(
    repo,
    {
      id: 'm2',
      title: 'M2',
      goal: 'M2',
      acceptanceCriteria: [{ id: 'c1', description: 'ok' }],
      includeMortise: false,
      checks: [{ name: 'ok', command: ['bun', '-e', 'process.exit(0)'] }],
    },
    home,
  )

  const supervisor = new AgentSupervisor()
  const res = await queueRunNext(supervisor, repo, {
    maxParallel: 2,
    homeDir: home,
    commandOverride: ['bun', 'run', scriptPath],
    freeMemMbOverride: 512,
  })
  expect(res.dispatched).toBe(1)
  expect(res.throttledByMemory).toBe(true)
})
