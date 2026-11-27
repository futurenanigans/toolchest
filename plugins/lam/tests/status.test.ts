import { expect, test } from 'claude-code/testing'

import { CWD, type ProcessRun, statusRow, stubEngine } from './engine'

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

test('the effort shown is the current model\'s own level over the top-level default', async ($, on) => {
  stubEngine(on, { settings: { effortLevel: 'high', modelSettings: { 'claude-opus-5-5': { effortLevel: 'low' } } } })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  const row = await statusRow($)
  expect(row.text).toContain(' | effort:low | ')
  expect(await row.colorOf('effort:low')).toBe('green')
})

test('no effort segment appears when no level is set', async ($, on) => {
  stubEngine(on, { settings: {} })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  expect((await statusRow($)).text).not.toContain('effort:')
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

test('the model multiplier comes from the plugin options, and an empty one hides it', { options: { opusMultiplier: '' } }, async ($, on) => {
  stubEngine(on, { git: { remote: { exitCode: 0, stdout: '' } } })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  const row = await statusRow($)
  expect(row.text).toMatch(/^claude-opus-5-5 \| /)
  expect(await row.colorOf('claude-opus-5-5')).toBe('yellow')
})

test('the fetch runs ssh in batch mode without accepting unknown host keys when the user configured no ssh command', async ($, on) => {
  const runs: ProcessRun[] = []
  stubEngine(on, { git: { remote: { exitCode: 0, stdout: 'origin\n' } }, runs })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  await $.prompt.compose(COMPOSE)
  const fetch = runs.find(run => run.argv.includes('fetch'))
  expect(fetch?.env?.GIT_SSH_COMMAND).toBe('ssh -o BatchMode=yes')
  expect(fetch?.env?.GIT_TERMINAL_PROMPT).toBe('0')
})

test('the fetch leaves the ssh command alone when core.sshCommand is set', async ($, on) => {
  const runs: ProcessRun[] = []
  stubEngine(on, { git: { remote: { exitCode: 0, stdout: 'origin\n' }, config: { exitCode: 0, stdout: 'op-ssh-sign\n' } }, runs })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  await $.prompt.compose(COMPOSE)
  const fetch = runs.find(run => run.argv.includes('fetch'))
  expect(fetch?.env?.GIT_TERMINAL_PROMPT).toBe('0')
  expect(fetch?.env?.GIT_SSH_COMMAND).toBeUndefined()
})

test('the fetch leaves the ssh command alone when GIT_SSH_COMMAND is set', async ($, on) => {
  const runs: ProcessRun[] = []
  stubEngine(on, { git: { remote: { exitCode: 0, stdout: 'origin\n' } }, env: { GIT_SSH_COMMAND: 'ssh -i key' }, runs })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  await $.prompt.compose(COMPOSE)
  const fetch = runs.find(run => run.argv.includes('fetch'))
  expect(fetch?.env?.GIT_TERMINAL_PROMPT).toBe('0')
  expect(fetch?.env?.GIT_SSH_COMMAND).toBeUndefined()
})

test('a slow fetch does not hold the prompt: it says the fetch is running, and a later compose carries the outcome', async ($, on) => {
  let release = (): void => {}
  const fetchGate = new Promise<void>(resolve => { release = resolve })
  stubEngine(on, { git: { remote: { exitCode: 0, stdout: 'origin\n' } }, fetchGate })
  on('clock.sleep', () => ({ value: undefined }))
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })

  const pending = await $.prompt.compose(COMPOSE)
  expect(pending.sections.at(-1)?.text).toContain('still running')
  release()
  let settled = await $.prompt.compose(COMPOSE)
  for (let attempt = 0; attempt < 20 && settled.sections.at(-1)?.text.includes('still running'); attempt++) settled = await $.prompt.compose(COMPOSE)
  expect(settled.sections.map(s => s.id)).toEqual(['intro', 'lam:fetch'])
  expect(settled.sections.at(-1)?.text).toContain('git fetch --all --prune completed')
})

test('each quota window shows its use, its projection at reset and the time to reset, coloured by the projection', async ($, on) => {
  stubEngine(on, { rateLimits: [
    { kind: 'seven_day', percentUsed: 80, resetsAt: '2026-11-26T09:30:00Z' },
    { kind: 'five_hour', percentUsed: 30, resetsAt: '2026-11-25T12:30:00Z' },
    { kind: 'spend_limit', percentUsed: 12 },
  ] })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  const row = await statusRow($)
  expect(row.text).toContain(' | $1.23 | 5h 30% →75% resets 3h0m | 7d 80% →93% resets 1d0h | ctx ')
  expect(await row.colorOf('5h 30% →75% resets 3h0m')).toBe('green')
  expect(await row.colorOf('7d 80% →93% resets 1d0h')).toBe('yellow')
})

test('a window on course to run out before it resets says when, in red', async ($, on) => {
  stubEngine(on, { rateLimits: [{ kind: 'five_hour', percentUsed: 60, resetsAt: '2026-11-25T12:30:00Z' }] })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  const row = await statusRow($)
  expect(row.text).toContain(' | 5h 60% full in 1h20m, resets 3h0m | ')
  expect(await row.colorOf('5h 60% full in 1h20m, resets 3h0m')).toBe('red')
})

test('a window barely begun shows no projection', async ($, on) => {
  stubEngine(on, { rateLimits: [{ kind: 'five_hour', percentUsed: 2, resetsAt: '2026-11-25T14:20:00Z' }] })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  expect((await statusRow($)).text).toContain(' | 5h 2% resets 4h50m | ')
})
