import { describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { importBlueprint, parseBlueprint } from '../blueprint'
import { contractRead } from '../contract'
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

      const contract2 = await contractRead(repo, 'feat-cache-task-2', home)
      expect(contract2.title).toBe('Wire cache into API')
      expect(contract2.acceptanceCriteria[0]?.description).toContain('cached responses')

      const queue = await queueList(repo, home)
      expect(queue).toHaveLength(2)
      expect(queue.find(i => i.id === 'feat-cache-task-2')?.dependsOn).toEqual(['feat-cache-task-1'])
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
