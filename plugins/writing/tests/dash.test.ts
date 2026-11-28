// Tests for the dash hook against a stubbed file system that each Write, Edit or MultiEdit changes as the tool would.
import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

type On = Parameters<TestBody>[1]
type Replacement = { old_string: string; new_string: string }

const EM = '\u2014'

function stubEngine(on: On, files: Record<string, string>): void {
  on('fs.exists', (_, e) => ({ value: e.path in files }))
  on('fs.stat', (_, e) => ({ value: { kind: 'file', size: (files[e.path] ?? '').length, mtimeMs: 0, isLink: false } }))
  on('fs.read', (_, e) => ({ value: files[e.path] ?? '' }))
  on('tool.call', (_, e) => {
    const input = e as unknown as { file_path: string; content: string; edits: Replacement[] } & Replacement
    const replace = (edits: Replacement[]) => edits.reduce((body, edit) => body.replace(edit.old_string, edit.new_string), files[input.file_path] ?? '')
    if (e.tool === 'Write') files[input.file_path] = input.content
    if (e.tool === 'Edit') files[input.file_path] = replace([input])
    if (e.tool === 'MultiEdit') files[input.file_path] = replace(input.edits)
    return { result: {} }
  })
}

test('a dash the edit adds is the one the model is told to replace', async ($, on) => {
  stubEngine(on, { '/repo/.git': '', '/repo/a.md': `old ${EM} line\nline two\n` })
  const ran = await $.tool.call({ tool: 'Edit', file_path: '/repo/a.md', old_string: 'line two', new_string: `new ${EM} line` })
  expect(ran.context?.join('')).toContain('in /repo/a.md on line 2.')
  expect(ran.context?.join('')).toContain('line 1 that this edit did not introduce')
})

test('an Edit that adds a dash in the middle of a line is told to replace it', async ($, on) => {
  stubEngine(on, { '/repo/.git': '', '/repo/a.md': `old ${EM} line\nprefix a - b suffix\n` })
  const ran = await $.tool.call({ tool: 'Edit', file_path: '/repo/a.md', old_string: 'a - b', new_string: `a ${EM} b` })
  expect(ran.context?.join('')).toContain('this edit put em-dashes or en-dashes in /repo/a.md on line 2.')
  expect(ran.context?.join('')).toContain('line 1 that this edit did not introduce')
})

test('a MultiEdit is told to replace the mid-line dash it adds and not the one it leaves', async ($, on) => {
  stubEngine(on, { '/repo/.git': '', '/repo/a.md': `first line\nold ${EM} line\nprefix a - b suffix\n` })
  const edits = [
    { old_string: 'first', new_string: 'opening' },
    { old_string: 'a - b', new_string: `a ${EM} b` },
  ]
  const ran = await $.tool.call({ tool: 'MultiEdit', file_path: '/repo/a.md', edits })
  expect(ran.context?.join('')).toContain('this edit put em-dashes or en-dashes in /repo/a.md on line 3.')
  expect(ran.context?.join('')).toContain('line 2 that this edit did not introduce')
})

test('a Write over an existing file corrects only lines missing from the original', async ($, on) => {
  stubEngine(on, { '/repo/.git': '', '/repo/a.ts': `kept ${EM} line\n` })
  const ran = await $.tool.call({ tool: 'Write', file_path: '/repo/a.ts', content: `kept ${EM} line\nadded ${EM} line\n` })
  expect(ran.context?.join('')).toContain('on line 2.')
  expect(ran.context?.join('')).toContain('line 1 that this edit did not introduce')
})

test("a project's allow list silences the dash rules", async ($, on) => {
  stubEngine(on, { '/repo/.writing': '', '/repo/.writing/allow.txt': 'em-dash\n' })
  const ran = await $.tool.call({ tool: 'Write', file_path: '/repo/docs/a.md', content: `new ${EM} line\n` })
  expect(ran.context).toBeUndefined()
})

test('files under node_modules and dash-free files get no advice', async ($, on) => {
  stubEngine(on, { '/repo/.git': '' })
  expect((await $.tool.call({ tool: 'Write', file_path: '/repo/node_modules/x/a.md', content: `a ${EM} b\n` })).context).toBeUndefined()
  expect((await $.tool.call({ tool: 'Write', file_path: '/repo/a.md', content: 'plain\n' })).context).toBeUndefined()
})
