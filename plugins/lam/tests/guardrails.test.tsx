import { expect, test } from 'claude-code/testing'

import { looksLikeTestFile } from '../checks/text'
import { stubEngine } from './engine'

const PANE = {
  plugin: 'lam',
  component: 'Pane',
  requestId: 'guard-stats',
  surface: 'terminal',
  props: { title: 'Guardrail corrections', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

test('an edit adding a type escape hatch reaches the model as context and is counted per check', async ($, on) => {
  stubEngine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const ran = await $.tool.call({ tool: 'Edit', file_path: '/repo/a.ts', old_string: 'let x: number', new_string: 'let x: any' })
  await $.tool.call({ tool: 'Bash', command: 'rm tests/a_test.py' })
  await $.tool.call({ tool: 'Edit', file_path: '/repo/b.ts', old_string: 'a', new_string: 'b' })

  expect(ran.context?.join('')).toContain('escape hatch (: any)')
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /corrections? this session/ }))?.text).toBe('2 corrections this session')
  expect((await ui.find({ type: 'Text', text: /^type-downgrade/ }))?.text).toMatch(/type-downgrade\s+1$/)
  expect((await ui.find({ type: 'Text', text: /^test-deletion/ }))?.text).toMatch(/test-deletion\s+1$/)
  expect((await ui.find({ type: 'Text', text: /^secrets/ }))?.text).toMatch(/secrets\s+0$/)
  await ui.unmount()
})

test('a denied call keeps its deny and gains no context', async ($, on) => {
  stubEngine(on, { denial: 'not allowed' })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const ran = await $.tool.call({ tool: 'Write', file_path: '/repo/a.ts', content: 'const x = y as any' })
  expect(ran.deny).toBe('not allowed')
  expect(ran.context).toBeUndefined()
})

test('README guidance comes on the first edit of a session only', async ($, on) => {
  stubEngine(on, { files: { '/repo/README.md': '# Old\n' } })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const first = await $.tool.call({ tool: 'Edit', file_path: '/repo/README.md', old_string: '# Old', new_string: '# New' })
  const second = await $.tool.call({ tool: 'Edit', file_path: '/repo/README.md', old_string: '# New', new_string: '# Newer' })
  expect(first.context?.join('')).toContain('README guidance')
  expect(second.context).toBeUndefined()
})

test('a .NET Tests suffix is matched case-sensitively', () => {
  expect(looksLikeTestFile('src/OrderServiceTests.cs')).toBe(true)
  expect(looksLikeTestFile('src/MyApp.UnitTests/Foo.cs')).toBe(true)
  expect(looksLikeTestFile('src/Contest.cs')).toBe(false)
})

test('README guidance denied on the first edit still comes on the next one', async ($, on) => {
  stubEngine(on, { files: { '/repo/README.md': '# Old\n' }, denyFirstCall: 'not allowed' })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const denied = await $.tool.call({ tool: 'Edit', file_path: '/repo/README.md', old_string: '# Old', new_string: '# New' })
  const allowed = await $.tool.call({ tool: 'Edit', file_path: '/repo/README.md', old_string: '# Old', new_string: '# New' })
  expect(denied.deny).toBe('not allowed')
  expect(allowed.context?.join('')).toContain('README guidance')
})
