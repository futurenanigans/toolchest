import { describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { importBlueprint, parseBlueprint } from '../blueprint'
import { execCommand } from '../platform'
import { queueList } from '../queue'
import { worktreeCreate, worktreeLandPreview } from '../worktrees'

const SAMPLE_BLUEPRINT = `
### Orientation
Read src/store.ts and src/api.ts.

### Architecture Decision
Use an in-memory map for now; reject SQLite to keep dependencies zero.

### Critical Details
All errors return typed Result values.

### Worked Examples
None. Shape claims are trivial.

### Build Sequence

Task 1: Add cache store
Files: src/cache.ts
Acceptance: bun test src/cache.spec.ts passes with TTL expiry coverage
Context: Critical Details
Dependencies: none

Task 2: Wire cache into API
Files: src/api.ts
Acceptance: bun test src/api.spec.ts verifies cached responses
Context: Critical Details
Dependencies: 1
`

describe('blueprint bridge and worktree_land preview', () => {
  test('parses a feature-architect blueprint and imports contracts + dependency-wired queue items', async () => {
    const parsed = parseBlueprint(SAMPLE_BLUEPRINT)
    expect(parsed.tasks).toHaveLength(2)
    expect(parsed.tasks[0]?.dependencies).toEqual([])
    expect(parsed.tasks[1]?.dependencies).toEqual([1])

    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'trestle-bp-'))
    const repo = path.join(tmp, 'repo')
    const home = path.join(tmp, 'home')
    await fs.mkdir(repo, { recursive: true })
    await fs.mkdir(home, { recursive: true })
    try {
      await execCommand('git', ['init', '-q', '-b', 'main'], { cwd: repo })
      const imported = await importBlueprint(repo, {
        prefix: 'feat-cache',
        blueprintMarkdown: SAMPLE_BLUEPRINT,
        cli: 'claude',
        homeDir: home,
      })
      expect(imported.count).toBe(2)
      expect(imported.items[0]?.id).toBe('feat-cache-task-1')
      expect(imported.items[1]?.dependsOn).toEqual(['feat-cache-task-1'])

      expect(imported.items[1]?.contractId).toBe('q-feat-cache-task-2')

      const queue = await queueList(repo, home)
      expect(queue).toHaveLength(2)
      const second = queue.find(i => i.id === 'feat-cache-task-2')
      expect(second?.dependsOn).toEqual(['feat-cache-task-1'])
      expect(second?.title).toBe('Wire cache into API')
      expect(second?.acceptanceCriteria[0]?.description).toContain('cached responses')
    } finally {
      await fs.rm(tmp, { recursive: true, force: true })
    }
  })

  test('a blueprint that cannot be queued whole leaves the queue untouched', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'trestle-bp-'))
    try {
      const cyclic = SAMPLE_BLUEPRINT.replace('Dependencies: none', 'Dependencies: 2')
      await expect(importBlueprint(tmp, { prefix: 'loop', blueprintMarkdown: cyclic, homeDir: tmp })).rejects.toThrow('cycle')
      expect(await queueList(tmp, tmp)).toEqual([])
    } finally {
      await fs.rm(tmp, { recursive: true, force: true })
    }
  })

  test('bundled tasks become one queue item and a multi-line Acceptance is kept whole', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'trestle-bp-'))
    const blueprint = `
### Build Sequence

Task 1: Add the store contract
Acceptance: bun test src/store.spec.ts passes
Dependencies: none

Task 2: Declare the cache port
Acceptance: tsc reports no errors once Task 3 lands
Dependencies: 1
Bundle: 2..3

Task 3: Implement the cache port
Acceptance: bun test src/cache.spec.ts passes
  and the TTL case expires at 60 seconds
Dependencies: 2
Bundle: 2..3

Task 4: Document the cache
Acceptance: README names the TTL
Dependencies: 3
`
    try {
      const imported = await importBlueprint(tmp, { prefix: 'cache', blueprintMarkdown: blueprint, homeDir: tmp })
      expect(imported.items.map(i => i.id)).toEqual(['cache-task-1', 'cache-task-2', 'cache-task-2', 'cache-task-4'])

      const queue = await queueList(tmp, tmp)
      expect(queue.map(i => [i.id, i.dependsOn])).toEqual([
        ['cache-task-1', []],
        ['cache-task-2', ['cache-task-1']],
        ['cache-task-4', ['cache-task-2']],
      ])
      expect(queue[1]?.acceptanceCriteria.map(c => c.description)).toEqual([
        'tsc reports no errors once Task 3 lands',
        'bun test src/cache.spec.ts passes\nand the TTL case expires at 60 seconds',
      ])
    } finally {
      await fs.rm(tmp, { recursive: true, force: true })
    }
  })

  test('worktreeLand with preview: true returns diff preview without mutating target branch', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'trestle-preview-'))
    const repo = path.join(tmp, 'repo')
    const home = path.join(tmp, 'home')
    await fs.mkdir(repo, { recursive: true })
    await fs.mkdir(home, { recursive: true })
    try {
      await execCommand('git', ['init', '-q', '-b', 'main'], { cwd: repo })
      await execCommand('git', ['config', 'user.email', 'test@example.invalid'], { cwd: repo })
      await execCommand('git', ['config', 'user.name', 'test'], { cwd: repo })
      await fs.writeFile(path.join(repo, 'a.txt'), 'v1\n', 'utf8')
      await execCommand('git', ['add', '.'], { cwd: repo })
      await execCommand('git', ['commit', '-qm', 'init'], { cwd: repo })
      const beforeHead = (await execCommand('git', ['rev-parse', 'HEAD'], { cwd: repo })).stdout.trim()

      const wt = await worktreeCreate(repo, 'preview-wt', { homeDir: home })
      await fs.writeFile(path.join(wt.path, 'a.txt'), 'v2\n', 'utf8')

      const preview = await worktreeLandPreview(repo, wt.id, { homeDir: home })
      expect(preview.preview).toBe(true)
      expect(preview.targetBranch).toBe('main')
      expect(preview.repoClean).toBe(true)
      expect(preview.hasChanges).toBe(true)
      expect(preview.files).toContain('a.txt')
      expect(preview.diff).toContain('+v2')

      const afterHead = (await execCommand('git', ['rev-parse', 'HEAD'], { cwd: repo })).stdout.trim()
      expect(afterHead).toBe(beforeHead)
    } finally {
      await fs.rm(tmp, { recursive: true, force: true })
    }
  })
})
