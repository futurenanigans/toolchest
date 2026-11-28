import { expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { isProcessAlive } from '../platform'
import { AgentSupervisor } from '../supervisor'

async function waitUntil(predicate: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 4_000
  while (!(await predicate())) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for ' + predicate)
    await Bun.sleep(10)
  }
}

async function runFixture(timeoutMs: number, check: (supervisor: AgentSupervisor, dir: string, pid: number) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'trestle-supervisor-'))
  const supervisor = new AgentSupervisor()
  const fixture = path.join(dir, 'runner.cjs')
  try {
    await fs.writeFile(fixture, `
      const fs = require('node:fs')
      fs.writeFileSync('pid', String(process.pid))
      setTimeout(() => process.exit(1), 10_000)
      setInterval(() => {
        if (fs.existsSync('active')) console.log(JSON.stringify({
          type: 'assistant', message: { content: [{ type: 'text', text: 'fixture activity' }] },
        }))
      }, 20)
    `)
    await supervisor.spawn({
      id: 'timer', repoRoot: dir, worktreeId: 'fixture', worktreePath: dir, branch: 'main',
      cli: 'claude', prompt: 'fixture', stage: 'test', commandOverride: [process.execPath, fixture],
      idleMs: 100, timeoutMs, homeDir: dir,
    })
    await waitUntil(() => fs.exists(path.join(dir, 'pid')))
    const pid = Number(await fs.readFile(path.join(dir, 'pid'), 'utf8'))
    await check(supervisor, dir, pid)
  } finally {
    await supervisor.stopAll()
    await fs.rm(dir, { recursive: true, force: true })
  }
}

test('an idle agent resumes on activity and an explicit stop terminates its process', async () => {
  await runFixture(30_000, async (supervisor, dir, pid) => {
    await waitUntil(() => supervisor.list()[0]?.status === 'idle')
    await fs.writeFile(path.join(dir, 'active'), '')
    await waitUntil(() => supervisor.list()[0]?.status === 'running')
    await supervisor.stop('timer')
    expect((await supervisor.wait(['timer']))[0]?.status).toBe('stopped')
    await waitUntil(() => !isProcessAlive(pid))
  })
})

test('the total deadline fails and kills a live agent', async () => {
  await runFixture(1_500, async (supervisor, dir, pid) => {
    await fs.writeFile(path.join(dir, 'active'), '')
    const [result] = await supervisor.wait(['timer'], { timeoutMs: 4_000 })
    expect(result).toMatchObject({ status: 'failed', failureKind: 'timeout' })
    await waitUntil(() => !isProcessAlive(pid))
  })
})
