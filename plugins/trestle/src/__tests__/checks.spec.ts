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
  expect(quoteWindowsArg('hello world')).toBe('"hello world"')
  expect(() => quoteWindowsArg('say "&')).toThrow('Unsafe argument')

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

test('SARIF gates use findings even on exit zero and reject invalid output', async () => {
  const worktreePath = await fs.mkdtemp(path.join(os.tmpdir(), 'trestle-sarif-'))
  tempDirs.push(worktreePath)
  const gate = (output: string) => runChecks({ worktreePath, includeMortise: false, commands: [{
    name: 'analyzer', command: ['bun', '-e', 'console.log(' + JSON.stringify(output) + ')'], reportFormat: 'sarif',
  }] })
  const report = (results: unknown[]) => JSON.stringify({ version: '2.1.0', runs: [{ results }] })
  expect((await gate(report([]))).passed).toBe(true)
  expect((await gate(report([{ ruleId: 'example', message: { text: 'fixture finding' } }]))).passed).toBe(false)
  expect((await gate('{}')).passed).toBe(false)
})

test('JUnit files identify failed cases by XML structure and decoded attributes', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'trestle-junit-'))
  tempDirs.push(dir)
  const xml = `<j:testsuites xmlns:j="urn:junit">
    <j:testsuite><j:testsuite>
      <j:testcase name='passed'><j:system-out><![CDATA[<failure/>]]></j:system-out></j:testcase>
      <j:testcase name='skipped'><j:skipped/><!-- <error/> --></j:testcase>
      <j:testcase name='a &amp; b' classname='suite'><j:failure/><j:error/></j:testcase>
      <j:testcase name='1 > 0'><j:error>fixture</j:error></j:testcase>
    </j:testsuite></j:testsuite>
  </j:testsuites>`
  const report = await runChecks({ worktreePath: dir, commands: [{
    name: 'tests', command: ['bun', '-e', 'await Bun.write("result.xml", process.argv[1]); process.exit(1)', xml],
    reportFormat: 'junit-xml', reportPath: 'result.xml',
  }] })
  expect(report.results[0]).toMatchObject({ passed: false, exitCode: 1, failedIds: ['1 > 0', 'suite::a & b'] })
})

test('malformed JUnit stdout fails verification even when the runner exits zero', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'trestle-junit-'))
  tempDirs.push(dir)
  const report = await runChecks({ worktreePath: dir, commands: [{
    name: 'tests', command: ['bun', '-e', 'console.log("<testsuite><testcase/></broken>")'], reportFormat: 'junit-xml',
  }] })
  expect(report.results[0]).toMatchObject({ passed: false, invalidReport: true })
  expect(report.results[0]?.excerpt).toContain('JUnit report')
})

test('a build that fails before writing its JUnit report shows the build output', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'trestle-junit-'))
  tempDirs.push(dir)
  const report = await runChecks({ worktreePath: dir, commands: [{
    name: 'tests', command: ['bun', '-e', 'console.error("error TS2304: cannot find name"); process.exit(2)'],
    reportFormat: 'junit-xml', reportPath: 'result.xml',
  }] })
  expect(report.results[0]).toMatchObject({ passed: false, exitCode: 2 })
  expect(report.results[0]?.excerpt).toContain('error TS2304')
  expect(report.results[0]?.invalidReport).toBeUndefined()
})

test('a JUnit report on stdout is read past the log lines a runner prints before it', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'trestle-junit-'))
  tempDirs.push(dir)
  const stdout = 'Restoring packages...\n<?xml version="1.0"?>\n<testsuite><testcase name="ok"/></testsuite>'
  const report = await runChecks({ worktreePath: dir, commands: [{
    name: 'tests', command: ['bun', '-e', 'console.log(process.argv[1])', stdout], reportFormat: 'junit-xml',
  }] })
  expect(report.results[0]).toMatchObject({ passed: true, failedIds: [] })
})
