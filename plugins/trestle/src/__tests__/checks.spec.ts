import { afterEach, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { runChecks } from '../checks'
import { execCommand, quoteWindowsArg } from '../platform'

const tempDirs: string[] = []

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

test('runChecks runs custom commands, extracts metrics, and returns structured pass/fail report', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'trestle-chk-'))
  tempDirs.push(dir)

  const report = await runChecks({
    worktreePath: dir,
    includeMortise: false,
    commands: [
      { name: 'bench-step', command: ['bun', '-e', 'console.log("p95=14.2ms")'], metricPattern: 'p95=([0-9.]+ms)' },
      { name: 'fail-step', command: ['bun', '-e', 'console.error("boom"); process.exit(2)'] },
    ],
  })

  expect(report.passed).toBe(false)
  expect(report.summary).toContain('1/2 check(s) failed: fail-step')
  expect(report.results[0]?.passed).toBe(true)
  expect(report.results[0]?.metric).toBe('14.2ms')
  expect(report.results[1]?.passed).toBe(false)
  expect(report.results[1]?.excerpt).toContain('boom')
})

test('runChecks fails closed when 0 steps are detected unless allowEmpty is true', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'trestle-empty-chk-'))
  tempDirs.push(dir)

  const closed = await runChecks({
    worktreePath: dir,
    includeMortise: false,
  })
  expect(closed.passed).toBe(false)
  expect(closed.summary).toContain('failing closed')

  const allowed = await runChecks({
    worktreePath: dir,
    includeMortise: false,
    allowEmpty: true,
  })
  expect(allowed.passed).toBe(true)
})

test('quoteWindowsArg escapes quotes/metacharacters and execCommand bounds captured output', async () => {
  expect(quoteWindowsArg('simple')).toBe('simple')
  expect(quoteWindowsArg('hello world & %PATH%')).toBe('"hello world & %%PATH%%"')
  expect(quoteWindowsArg('say "hi"')).toBe('"say \\"hi\\""')

  const res = await execCommand('bun', ['-e', 'process.stdout.write("A".repeat(4000) + "END")'], {
    maxCaptureBytes: 512,
  })
  expect(res.exitCode).toBe(0)
  expect(res.stdout.length).toBeLessThanOrEqual(512)
  expect(res.stdout.endsWith('END')).toBe(true)
})

test('fast checks (heavy: false) do not block behind a slow heavy check holding checkMutex', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'trestle-lane-'))
  tempDirs.push(dir)

  const events: string[] = []
  const slowHeavy = runChecks({
    worktreePath: dir,
    includeMortise: false,
    commands: [{ name: 'slow-heavy', command: ['bun', '-e', 'await Bun.sleep(250)'], heavy: true }],
  }).then(r => {
    events.push('heavy-done')
    return r
  })

  await Bun.sleep(20)
  const fast = await runChecks({
    worktreePath: dir,
    includeMortise: false,
    commands: [{ name: 'fast-lint', command: ['bun', '-e', 'console.log("ok")'], heavy: false }],
  })
  events.push('fast-done')

  await slowHeavy
  expect(fast.passed).toBe(true)
  expect(events[0]).toBe('fast-done')
})

test.skipIf(process.platform === 'win32')('execCommand timeout kills the grandchildren that hold its output pipes', async () => {
  const started = Date.now()
  const res = await execCommand('sh', ['-c', 'sleep 6; echo late'], { timeoutMs: 300 })

  expect(res.timedOut).toBe(true)
  expect(res.exitCode).toBe(124)
  expect(res.stdout).toBe('')
  expect(Date.now() - started).toBeLessThan(3_000)
})
