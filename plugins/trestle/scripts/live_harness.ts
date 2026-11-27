import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import type { AgentCli } from '../types'
import { loadEffectiveConfig, resolveAgentConfig } from '../src/config'
import { contractCreate } from '../src/contract'
import { runGoalLoop } from '../src/goal_loop'
import { execCommand } from '../src/platform'
import { AgentSupervisor } from '../src/supervisor'
import { worktreeClean, worktreeCreate } from '../src/worktrees'

const ALL_CLIS: AgentCli[] = ['claude', 'codex', 'opencode', 'agy', 'pi']

function envModelOverride(cli: AgentCli): string | undefined {
  return process.env[`TRESTLE_MODEL_${cli.toUpperCase()}`]
}

interface CliTestResult {
  cli: AgentCli
  model: string
  readOnly: { passed: boolean; durationMs: number; sessionId?: string; detail: string }
  writerGoal?: { passed: boolean; durationMs: number; iterations: number; detail: string }
}

async function makeTempRepo(): Promise<{ base: string; repo: string; home: string }> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'trestle-live-'))
  const repo = path.join(base, 'repo')
  const home = path.join(base, 'home')
  await fs.mkdir(repo, { recursive: true })
  await fs.mkdir(home, { recursive: true })

  await execCommand('git', ['init', '-b', 'main'], { cwd: repo })
  await execCommand('git', ['config', 'user.email', 'trestle-live@example.com'], { cwd: repo })
  await execCommand('git', ['config', 'user.name', 'Trestle Live'], { cwd: repo })
  await fs.writeFile(path.join(repo, '.gitignore'), '.trestle/\n.trestle-wt/\n', 'utf8')
  await fs.writeFile(path.join(repo, 'CANARY.txt'), 'trestle-canary-42\n', 'utf8')
  await fs.writeFile(path.join(repo, 'answer.txt'), 'pending\n', 'utf8')
  await execCommand('git', ['add', '.gitignore', 'CANARY.txt', 'answer.txt'], { cwd: repo })
  await execCommand('git', ['commit', '-m', 'init live harness repo'], { cwd: repo })
  return { base, repo, home }
}

async function testCli(
  supervisor: AgentSupervisor,
  repo: string,
  home: string,
  cli: AgentCli,
  model: string | undefined,
  runWriterGoal: boolean,
): Promise<CliTestResult> {
  const result: CliTestResult = {
    cli,
    model: model ?? '(default)',
    readOnly: { passed: false, durationMs: 0, detail: '' },
  }

  // 1. Read-only invocation + model verification
  const roWt = await worktreeCreate(repo, `live-ro-${cli}`, { homeDir: home })
  const roStart = Date.now()
  try {
    const agentId = supervisor.allocateId(`live-ro-${cli}`)
    await supervisor.spawn({
      repoRoot: repo,
      id: agentId,
      cli,
      stage: 'live-read-only',
      worktreeId: roWt.id,
      worktreePath: roWt.path,
      branch: roWt.branch,
      prompt: 'Read the file CANARY.txt in the current directory and reply with ONLY its exact contents. Do not modify any files.',
      mode: 'read-only',
      model,
      timeoutMs: 90_000,
      idleMs: 60_000,
      homeDir: home,
    })

    const [waited] = await supervisor.wait([agentId], { mode: 'all', timeoutMs: 95_000 })
    const tail = supervisor.tail(agentId, 20)
    const durationMs = Date.now() - roStart
    const text = tail.finalText ?? ''
    const matched = text.includes('trestle-canary-42')
    const passed = waited?.status === 'done' && matched

    result.readOnly = {
      passed,
      durationMs,
      sessionId: waited?.sessionId,
      detail: passed
        ? `ok (${text.trim().slice(0, 40)})`
        : `status=${waited?.status} error=${waited?.error ?? 'none'} finalText=${JSON.stringify(text.slice(0, 80))} tail=${JSON.stringify(tail.summary.tail.slice(-3))}`,
    }
  } catch (err) {
    result.readOnly = {
      passed: false,
      durationMs: Date.now() - roStart,
      detail: (err as Error).message,
    }
  } finally {
    await worktreeClean(repo, roWt.id, { homeDir: home, supervisor }).catch(() => {})
  }

  // 2. Optional writer goal-loop verification (writes 42 into answer.txt and passes deterministic check_run)
  if (runWriterGoal) {
    const wrWt = await worktreeCreate(repo, `live-wr-${cli}`, { homeDir: home })
    const wrStart = Date.now()
    try {
      const contractId = `live-goal-${cli}`
      await contractCreate(
        repo,
        {
          id: contractId,
          title: `Live write test (${cli})`,
          goal: 'Update the file answer.txt in the current directory so its entire content is just "42" (with a trailing newline).',
          acceptanceCriteria: [{ id: 'ac1', description: 'answer.txt contains 42' }],
          includeMortise: false,
          maxIterations: 2,
          checks: [
            {
              name: 'verify-answer-42',
              command: [
                'bun',
                '-e',
                'const v = require("fs").readFileSync("answer.txt", "utf8").trim(); if (v !== "42") { console.error("expected 42, got " + JSON.stringify(v)); process.exit(1) }',
              ],
            },
          ],
        },
        home,
      )

      const loopRes = await runGoalLoop(supervisor, {
        repoRoot: repo,
        contractId,
        cli,
        model,
        worktreeId: wrWt.id,
        worktreePath: wrWt.path,
        branch: wrWt.branch,
        homeDir: home,
      })

      result.writerGoal = {
        passed: loopRes.status === 'passed',
        durationMs: Date.now() - wrStart,
        iterations: loopRes.iterations,
        detail:
          loopRes.status === 'passed'
            ? `passed in ${loopRes.iterations} iter`
            : `status=${loopRes.status} error=${loopRes.error ?? loopRes.lastReport?.summary ?? 'unknown'}`,
      }
    } catch (err) {
      result.writerGoal = {
        passed: false,
        durationMs: Date.now() - wrStart,
        iterations: 0,
        detail: (err as Error).message,
      }
    } finally {
      await worktreeClean(repo, wrWt.id, { homeDir: home, supervisor }).catch(() => {})
    }
  }

  return result
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const skipWriter = args.includes('--read-only')
  const requestedClis = args.filter(a => !a.startsWith('--')) as AgentCli[]
  const envClis = process.env.TRESTLE_LIVE_CLIS?.split(',').map(s => s.trim()).filter(Boolean) as AgentCli[] | undefined
  const clis = (requestedClis.length > 0 ? requestedClis : envClis?.length ? envClis : ALL_CLIS).filter(c =>
    ALL_CLIS.includes(c),
  )

  const { config } = await loadEffectiveConfig()
  console.log(`Trestle Live CLI Harness — testing: ${clis.join(', ')} (writer goal loop: ${!skipWriter})`)
  const { base, repo, home } = await makeTempRepo()
  const supervisor = new AgentSupervisor()

  try {
    const results: CliTestResult[] = []
    for (const cli of clis) {
      const resolved = resolveAgentConfig(config, cli, envModelOverride(cli) ?? 'cheap')
      const model = resolved.model
      console.log(`\n▶ Testing ${cli} (model: ${model ?? 'default'})...`)
      const r = await testCli(supervisor, repo, home, cli, model, !skipWriter)
      results.push(r)
      console.log(
        `  read-only: ${r.readOnly.passed ? 'PASS' : 'FAIL'} (${r.readOnly.durationMs}ms) ${r.readOnly.sessionId ? `[session=${r.readOnly.sessionId.slice(0, 12)}]` : ''} — ${r.readOnly.detail}`,
      )
      if (r.writerGoal) {
        console.log(
          `  writer-goal: ${r.writerGoal.passed ? 'PASS' : 'FAIL'} (${r.writerGoal.durationMs}ms) — ${r.writerGoal.detail}`,
        )
      }
    }

    console.log('\n=== Live Harness Summary ===')
    let allPassed = true
    for (const r of results) {
      const ok = r.readOnly.passed && (r.writerGoal ? r.writerGoal.passed : true)
      if (!ok) allPassed = false
      const roBadge = r.readOnly.passed ? 'PASS' : 'FAIL'
      const wrBadge = r.writerGoal ? (r.writerGoal.passed ? 'PASS' : 'FAIL') : 'SKIP'
      console.log(
        `${ok ? '✓' : '✗'} ${r.cli.padEnd(9)} model=${r.model.padEnd(22)} read-only=${roBadge} writer-goal=${wrBadge}`,
      )
    }

    if (!allPassed) {
      process.exitCode = 1
    }
  } finally {
    await supervisor.stopAll().catch(() => {})
    await fs.rm(base, { recursive: true, force: true }).catch(() => {})
  }
}

if (import.meta.main) {
  await main()
}
