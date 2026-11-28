import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { repoKey } from '../src/repo_key'

type On = Parameters<TestBody>[1]

const PANE = {
  plugin: 'trestle',
  component: 'Pane',
  requestId: 'trestle',
  surface: 'terminal',
  props: {
    title: 'Trestle',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

function setupEngine(on: On, files: Record<string, string> = {}) {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'trestle' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/home/test' : undefined }))
  on('fs.exists', (_, e) => ({ value: e.path in files }))
  on('fs.read', (_, e) => ({ value: files[e.path] ?? '' }))
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', () => ({ text: '' }))
}

test('trestle pane renders empty state after session start', async ($, on) => {
  setupEngine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /Trestle — 0 active/ }))?.text).toBe(
    'Trestle — 0 active agent(s)',
  )
  await ui.unmount()
})

test('trestle pane surfaces accurate counts, parallel contracts/checks, metrics, errors, and blocked queue items', async ($, on) => {
  const now = Date.now()
  const stateJson = JSON.stringify({
    version: 1,
    worktrees: {
      'wt-codex': { id: 'wt-codex', branch: 'trestle/wt-codex', baseRef: 'main', createdAt: now },
    },
    disabledClis: [
      { cli: 'opencode', window: 'manual', reason: 'Free usage limit reached' },
    ],
    queue: {
      counts: { queued: 1, running: 0, blocked: 1, landed: 2, failed: 1 },
      items: [
        { id: 'q-1', title: 'Add auth', status: 'failed', cli: 'codex', dependsOn: [], error: 'tests failed' },
        { id: 'q-2', title: 'Add tests', status: 'blocked', cli: 'claude', dependsOn: ['q-1'] },
      ],
    },
    contractsByWorktree: {
      'wt-codex': {
        id: 'c1',
        worktreeId: 'wt-codex',
        title: 'Implement auth',
        iteration: 2,
        maxIterations: 5,
        acceptanceCriteria: [
          { id: 'ac1', description: 'JWT refresh works', passed: true },
          { id: 'ac2', description: 'Unit tests pass', passed: false },
        ],
      },
    },
    checksByWorktree: {
      'wt-codex': {
        worktreeId: 'wt-codex',
        worktreePath: '/repo/.trestle-wt/wt-codex',
        passed: false,
        summary: '1/2 check(s) failed: bun-test',
        timestamp: now,
        results: [
          { name: 'mortise-check', passed: true, durationMs: 42, metric: '0 issues' },
          { name: 'bun-test', passed: false, durationMs: 120, excerpt: 'AssertionError: expected 42' },
        ],
      },
    },
    agents: {
      'draft-codex': {
        id: 'draft-codex',
        cli: 'codex',
        model: 'gpt-6.2-sol',
        effort: 'medium',
        stage: 'goal(2/5 · balanced)',
        worktreeId: 'wt-codex',
        worktreePath: '/repo/.trestle-wt/wt-codex',
        branch: 'trestle/wt-codex',
        status: 'done',
        startedAt: now - 120_000,
        lastActivityAt: now - 108_000,
        finishedAt: now - 108_000,
        usage: { inputTokens: 12_000, outputTokens: 400, cacheReadTokens: 8_000, cacheWriteTokens: 0, costUsd: 0.0042 },
        tail: ['codex initialized', 'Bash: cargo test'],
      },
      'draft-claude': {
        id: 'draft-claude',
        cli: 'claude',
        stage: 'goal(1/5)',
        worktreeId: 'wt-claude',
        worktreePath: '/repo/.trestle-wt/wt-claude',
        branch: 'trestle/wt-claude',
        status: 'failed',
        startedAt: now - 8_000,
        lastActivityAt: now - 3_000,
        finishedAt: now - 3_000,
        error: 'Claude rate limit rejected',
        tail: ['Edit: src/auth.ts'],
      },
    },
  })

  const experimentsMd = [
    '## [DISCARDED] c1-i1 (2026-11-26T17:00:00Z)',
    '- **Reason / Outcome:** 1/2 check(s) failed',
  ].join('\n')

  const key = repoKey('/repo')
  setupEngine(on, {
    [`/home/test/.trestle/${key}/state.json`]: stateJson,
    [`/home/test/.trestle/${key}/experiments.md`]: experimentsMd,
  })

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(PANE)

  // Accurate header: 0 active · 1 done · 1 failed (NOT "2 active")
  expect((await ui.find({ type: 'Text', text: /Trestle — 0 active · 1 done · 1 failed/ }))?.text).toBe(
    'Trestle — 0 active · 1 done · 1 failed',
  )
  // Aggregate usage line + disabled CLIs rendered in panel
  expect((await ui.find({ type: 'Text', text: /Usage: 12\.0k in \/ 400 out \(8\.0k cached\) · \$0\.0042/ }))?.text).toContain(
    '$0.0042',
  )
  expect((await ui.find({ type: 'Text', text: /Disabled CLIs: opencode \(manual re-enable\)/ }))?.text).toContain(
    'opencode',
  )
  // Frozen duration + agent/model + effort level for draft-codex (12s, not 120s)
  expect((await ui.find({ type: 'Text', text: /draft-codex \(codex\/gpt-6\.2-sol · effort:medium\).*12s/ }))?.text).toContain('effort:medium')
  // Agent error surfaced
  expect((await ui.find({ type: 'Text', text: /error: Claude rate limit rejected/ }))?.text).toContain('rate limit')
  // Queue shows blocked count
  expect((await ui.find({ type: 'Text', text: /1 blocked · 1 failed/ }))?.text).toContain('1 blocked')
  // Contract & checks labeled by worktree with metric and failure excerpt
  expect((await ui.find({ type: 'Text', text: /Contract \[wt-codex\]: Implement auth/ }))?.text).toContain('iter 2/5')
  expect((await ui.find({ type: 'Text', text: /Checks \[wt-codex\]: 1\/2 check\(s\) failed/ }))?.text).toContain('bun-test')
  expect((await ui.find({ type: 'Text', text: /mortise-check \(42ms\) \[0 issues\]/ }))?.text).toContain('[0 issues]')
  expect((await ui.find({ type: 'Text', text: /AssertionError: expected 42/ }))?.text).toContain('expected 42')
  expect((await ui.find({ type: 'Text', text: /Worktrees \(1\):/ }))?.text).toBe('Worktrees (1):')
  expect((await ui.find({ type: 'Text', text: /\[DISCARDED\] c1-i1/ }))?.text).toContain('c1-i1')
  expect((await ui.find({ type: 'Text', text: /Bash: cargo test/ }))?.text).toBe('Bash: cargo test')

  // Interactive selection button switches tail to draft-claude
  const inspectBtn = await ui.find({ type: 'Button' })
  expect(inspectBtn?.props.label).toBe('Inspect')
  await $.ui.press({ plugin: 'trestle', key: 'select-draft-claude', requestId: 'trestle', surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /Edit: src\/auth\.ts/ }))?.text).toBe('Edit: src/auth.ts')

  await ui.unmount()
})

test('trestle pane refreshes after a trestle MCP tool call under the installed plugin tool prefix', async ($, on) => {
  const files: Record<string, string> = {}
  setupEngine(on, files)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(PANE)

  const now = Date.now()
  files[`/home/test/.trestle/${repoKey('/repo')}/state.json`] = JSON.stringify({
    version: 1,
    worktrees: {},
    agents: {
      'wt-i1': {
        id: 'wt-i1',
        cli: 'claude',
        stage: 'goal(1/3)',
        worktreeId: 'wt',
        worktreePath: '/repo/.trestle-wt/wt',
        branch: 'trestle/wt',
        status: 'done',
        startedAt: now - 5_000,
        lastActivityAt: now - 1_000,
        finishedAt: now - 1_000,
        tail: [],
      },
    },
  })
  await $.tool.call({ tool: 'mcp__plugin_trestle_trestle__agent_list', repoRoot: '/repo' })

  expect((await ui.find({ type: 'Text', text: /0 active · 1 done/ }))?.text).toContain('1 done')
  await ui.unmount()
})
