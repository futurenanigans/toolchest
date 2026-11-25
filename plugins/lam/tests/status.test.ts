import { expect, test } from 'claude-code/testing'

import { CWD, statusRow, stubEngine } from './engine'

const COMPOSE = { model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] } as const

test('the status line carries model, effort, repo, dirty branch, ahead and behind, cost and context', async ($, on) => {
  stubEngine(on, { git: {
    remote: { exitCode: 0, stdout: 'origin\n' },
    'symbolic-ref': { exitCode: 0, stdout: 'main\n' },
    status: { exitCode: 0, stdout: ' M a.ts\n' },
    'rev-list': { exitCode: 0, stdout: '2\t1\n' },
  } })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  const row = await statusRow($)
  expect(row.text).toBe('claude-opus-5-5 1.7x | effort:high | widget | main* | +2 -1 | $1.23 | ctx 23%')
  expect(await row.colorOf('claude-opus-5-5 1.7x')).toBe('yellow')
  expect(await row.colorOf('effort:high')).toBe('redBright')
  expect(await row.colorOf('ctx 23%')).toBe('yellow')
})

test('a branch level with its upstream shows an equals sign', async ($, on) => {
  stubEngine(on, { git: {
    remote: { exitCode: 0, stdout: 'origin\n' },
    'symbolic-ref': { exitCode: 0, stdout: 'main\n' },
    status: { exitCode: 0, stdout: '' },
    'rev-list': { exitCode: 0, stdout: '0\t0\n' },
  } })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  expect((await statusRow($)).text).toContain(' | main | = | ')
})

test('the system prompt gains a successful fetch notice after the engine sections', async ($, on) => {
  stubEngine(on, { git: { remote: { exitCode: 0, stdout: 'origin\n' }, 'symbolic-ref': { exitCode: 0, stdout: 'main\n' } } })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  const { sections } = await $.prompt.compose(COMPOSE)
  expect(sections.map(s => s.id)).toEqual(['intro', 'lam:fetch'])
  expect(sections[1]?.text).toContain('git fetch --all --prune completed')
})

test('a failed fetch tells the model the refs are stale, quoting stderr', async ($, on) => {
  stubEngine(on, { git: { remote: { exitCode: 0, stdout: 'origin\n' }, fetch: { exitCode: 128, stderr: 'fatal: could not read from remote\n' } } })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  const { sections } = await $.prompt.compose(COMPOSE)
  expect(sections.at(-1)?.text).toContain('git fetch failed')
  expect(sections.at(-1)?.text).toContain('fatal: could not read from remote')
  expect(sections.at(-1)?.text).toContain('STALE')
})

test('a repository without remotes gets no fetch section', async ($, on) => {
  stubEngine(on, { git: { remote: { exitCode: 0, stdout: '' } } })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  const { sections } = await $.prompt.compose(COMPOSE)
  expect(sections.map(s => s.id)).toEqual(['intro'])
})

test('a correction updates the status line total during the turn, and none shows no total', async ($, on) => {
  stubEngine(on, { git: { remote: { exitCode: 0, stdout: '' } } })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  expect((await statusRow($)).text).not.toContain('guard')
  await $.tool.call({ tool: 'Write', file_path: '/repo/a.ts', content: 'const x = y as any' })
  await $.tool.call({ tool: 'Bash', command: 'rm tests/a_test.py' })
  const row = await statusRow($)
  expect(row.text).toMatch(/ \| guard 2$/)
  expect(await row.colorOf('guard 2')).toBe('yellow')
})

test('context turns red at 300K tokens even below 30 percent', async ($, on) => {
  stubEngine(on, { git: { remote: { exitCode: 0, stdout: '' } }, contextTokens: 300_000, contextWindow: 2_000_000 })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  expect(await (await statusRow($)).colorOf('ctx 15%')).toBe('red')
})

test('context is measured against the auto-compaction point when one is set', async ($, on) => {
  stubEngine(on, { git: { remote: { exitCode: 0, stdout: '' } }, contextTokens: 50_000, compaction: { rawMaxTokens: 400_000, autoCompactThreshold: 200_000 } })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  expect((await statusRow($)).text).toMatch(/ctx 25%$/)
})

test('context is measured against the compaction window when auto-compaction is off', async ($, on) => {
  stubEngine(on, { git: { remote: { exitCode: 0, stdout: '' } }, contextTokens: 50_000, compaction: { rawMaxTokens: 400_000 } })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  expect((await statusRow($)).text).toMatch(/ctx 13%$/)
})

test('a missing git binary leaves the session running with the directory name and no fetch section', async ($, on) => {
  stubEngine(on, { gitMissing: true })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  const { sections } = await $.prompt.compose(COMPOSE)
  expect(sections.map(s => s.id)).toEqual(['intro'])
  expect((await statusRow($)).text).toContain('widget')
})
