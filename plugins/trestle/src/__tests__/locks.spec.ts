import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { withFileLock } from '../locks'

test('a failed lock holder releases queued writers in order while other files remain independent', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'trestle-locks-'))
  const file = path.join(dir, 'state.lock')
  const events: string[] = []
  const started = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  try {
    const first = withFileLock(file, async () => {
      started.resolve()
      await release.promise
      throw new Error('write failed')
    })
    await started.promise
    const second = withFileLock(file, async () => events.push('second'))
    const third = withFileLock(file, async () => events.push('third'))
    await withFileLock(path.join(dir, 'other.lock'), async () => events.push('other'))
    expect(events).toEqual(['other'])
    release.resolve()
    await expect(first).rejects.toThrow('write failed')
    expect(await Promise.all([second, third])).toEqual([2, 3])
    expect(events).toEqual(['other', 'second', 'third'])
  } finally {
    release.resolve()
    await rm(dir, { recursive: true, force: true })
  }
})
