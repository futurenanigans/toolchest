import { expect, test } from 'claude-code/testing'

import { looksLikeTestFile } from '../checks/text'
import { CWD, statusRow, stubEngine } from './engine'

const PANE = {
  plugin: 'lam',
  component: 'Pane',
  requestId: 'guard-stats',
  surface: 'terminal',
  props: { title: 'Guardrail advisories', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

test('an edit adding a type escape hatch reaches the model as context and is counted per check', async ($, on) => {
  stubEngine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const ran = await $.tool.call({ tool: 'Edit', file_path: '/repo/a.ts', old_string: 'let x: number', new_string: 'let x: any' })
  await $.tool.call({ tool: 'Bash', command: 'rm tests/a_test.py' })
  await $.tool.call({ tool: 'Edit', file_path: '/repo/b.ts', old_string: 'a', new_string: 'b' })

  expect(ran.context?.join('')).toContain('escape hatch (: any)')
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /advisor(y|ies) this session/ }))?.text).toBe('2 advisories this session')
  expect((await ui.find({ type: 'Text', text: /^type-downgrade/ }))?.text).toMatch(/type-downgrade\s+1$/)
  expect((await ui.find({ type: 'Text', text: /^test-deletion/ }))?.text).toMatch(/test-deletion\s+1$/)
  expect((await ui.find({ type: 'Text', text: /^secrets/ }))?.text).toMatch(/secrets\s+0$/)
  await ui.unmount()
})

test('a denied call keeps its deny, gains no context and is not counted', async ($, on) => {
  stubEngine(on, { denial: 'not allowed' })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const ran = await $.tool.call({ tool: 'Write', file_path: '/repo/a.ts', content: 'const x = y as any' })
  expect(ran.deny).toBe('not allowed')
  expect(ran.context).toBeUndefined()
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /^type-downgrade/ }))?.text).toMatch(/type-downgrade\s+0$/)
  await ui.unmount()
})

test('README guidance comes on the first edit of a session only', async ($, on) => {
  stubEngine(on, { files: { '/repo/README.md': '# Old\n' } })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const first = await $.tool.call({ tool: 'Edit', file_path: '/repo/README.md', old_string: '# Old', new_string: '# New' })
  const second = await $.tool.call({ tool: 'Edit', file_path: '/repo/README.md', old_string: '# New', new_string: '# Newer' })
  expect(first.context?.join('')).toContain('README guidance')
  expect(second.context).toBeUndefined()
  expect((await statusRow($)).text).not.toContain('guard')
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

test('README guidance comes once whether the README is written or edited', async ($, on) => {
  stubEngine(on, { files: { '/repo/README.md': '# Old\n' } })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const written = await $.tool.call({ tool: 'Write', file_path: '/repo/README.md', content: '# New\n' })
  const rewritten = await $.tool.call({ tool: 'Write', file_path: '/repo/README.md', content: '# Newer\n' })
  const edited = await $.tool.call({ tool: 'Edit', file_path: '/repo/README.md', old_string: '# Newer', new_string: '# Newest' })
  expect(written.context?.join('')).toContain('README guidance')
  expect(rewritten.context).toBeUndefined()
  expect(edited.context).toBeUndefined()
})

test('a Write that empties a test file is flagged as test deletion', async ($, on) => {
  stubEngine(on, { files: { '/repo/a.test.ts': 'test("x", () => {})\n' } })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const ran = await $.tool.call({ tool: 'Write', file_path: '/repo/a.test.ts', content: '' })
  expect(ran.context?.join('')).toContain('removes test code')
})

test('a delete command is recognized only in command position', async ($, on) => {
  stubEngine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const chained = await $.tool.call({ tool: 'Bash', command: 'cd src && rm a.test.ts' })
  const piped = await $.tool.call({ tool: 'Bash', command: 'ls *.test.ts | xargs rm' })
  const argument = await $.tool.call({ tool: 'Bash', command: 'grep del a.test.ts' })
  expect(chained.context?.join('')).toContain('a.test.ts')
  expect(piped.context).toBeUndefined()
  expect(argument.context).toBeUndefined()
})

test('an EF Core async single-element lookup is flagged', async ($, on) => {
  stubEngine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const ran = await $.tool.call({ tool: 'Edit', file_path: '/repo/Orders.cs', old_string: 'var x = 1;', new_string: 'var order = await db.Orders.FirstOrDefaultAsync(o => o.Id == id);' })
  expect(ran.context?.join('')).toContain('takes one element from a collection')
})

test('a C# catch of a specific exception type is a deliberate handler and is not flagged', async ($, on) => {
  stubEngine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const cancelled = await $.tool.call({ tool: 'Write', file_path: '/repo/A.cs', content: 'try { Run(); } catch (OperationCanceledException) { }' })
  const format = await $.tool.call({ tool: 'Write', file_path: '/repo/B.cs', content: 'try { return Parse(s); } catch (FormatException) { return null; }' })
  const named = await $.tool.call({ tool: 'Write', file_path: '/repo/C.java', content: 'try { run(); } catch (final IOException | SQLException e) { }' })
  expect(cancelled.context).toBeUndefined()
  expect(format.context).toBeUndefined()
  expect(named.context).toBeUndefined()
})

test('catch-all handlers that discard the exception are still flagged', async ($, on) => {
  stubEngine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const bodies = [
    ['/repo/A.cs', 'try { Run(); } catch { }'],
    ['/repo/B.cs', 'try { Run(); } catch (Exception) { return null; }'],
    ['/repo/C.cs', 'try { Run(); } catch (System.Exception ex) { return null; }'],
    ['/repo/D.java', 'try { run(); } catch (Throwable t) { }'],
    ['/repo/E.kt', 'try { run() } catch (e: Exception) { }'],
    ['/repo/f.ts', 'try { run() } catch (e) { }'],
  ] as const
  for (const [file_path, content] of bodies) {
    const ran = await $.tool.call({ tool: 'Write', file_path, content })
    expect(ran.context?.join('')).toContain('discards the exception')
  }
})

test('an awl or loom config leaves every lam check running, because the marker does not confirm the analyzer covers the rule', async ($, on) => {
  stubEngine(on, { files: { [`${CWD}/.awl/awl.json`]: '{}', [`${CWD}/.loom/loom.json`]: '{}' } })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })

  const csharp = await $.tool.call({ tool: 'Write', file_path: `${CWD}/A.cs`, content: 'var a = xs.First();' })
  const script = await $.tool.call({ tool: 'Write', file_path: `${CWD}/a.test.ts`, content: 'it.skip("x", () => { const v = y as any })' })
  expect(csharp.context?.join('')).toContain('takes one element from a collection')
  expect(script.context?.join('')).toContain('skips or disables a test')
  expect(script.context?.join('')).toContain('escape hatch')
})

test('a test or build run piped into a filter is flagged, with the hidden exit code named', async ($, on) => {
  stubEngine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const commands = [
    'cargo test -p core 2>&1 | tail -n 20',
    'cd src && dotnet test | grep -E "Failed|Passed"',
    'RUST_LOG=debug timeout 600 cargo nextest run |& head',
    'bun run test | tee out.log',
  ]
  for (const command of commands) {
    const ran = await $.tool.call({ tool: 'Bash', command })
    expect(ran.context?.join('')).toContain('Without pipefail')
  }
})

test('a pipeline that keeps the exit code, or pipes something other than a verification run, is not flagged', async ($, on) => {
  stubEngine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const commands = [
    'set -o pipefail; cargo test 2>&1 | tail -n 20',
    'cargo test | tail; echo "exit ${PIPESTATUS[0]}"',
    'git log --oneline | head',
    'cargo test > out.log 2>&1; tail -n 20 out.log',
    'cargo test || echo failed',
    'grep "cargo test | tail" notes.md',
    'ls | cargo-testing-tool',
    'cat log | cargo test',
  ]
  for (const command of commands) {
    const ran = await $.tool.call({ tool: 'Bash', command })
    expect(ran.context).toBeUndefined()
  }
})
