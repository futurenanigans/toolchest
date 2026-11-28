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

const AWS_KEY = ['AKIA', 'Q7RZ2M4KX9WPL3TN'].join('')
const SECOND_AWS_KEY = ['AKIA', 'B5HJ8N2DV6YC1FGS'].join('')
const TEMPORARY_AWS_KEY = ['ASIA', 'Q7RZ2M4KX9WPL3TN'].join('')

test('an edit adding a credential reaches the model as context and is counted per check', async ($, on) => {
  stubEngine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const ran = await $.tool.call({ tool: 'Edit', file_path: '/repo/a.ts', old_string: 'const key = load()', new_string: `const key = '${AWS_KEY}'` })
  await $.tool.call({ tool: 'Bash', command: 'rm tests/a_test.py' })
  await $.tool.call({ tool: 'Edit', file_path: '/repo/b.ts', old_string: 'a', new_string: 'b' })

  expect(ran.context?.join('')).toContain('real credential (AWS access key)')
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /advisor(y|ies) this session/ }))?.text).toBe('2 advisories this session')
  expect((await ui.find({ type: 'Text', text: /^secrets/ }))?.text).toMatch(/secrets\s+1$/)
  expect((await ui.find({ type: 'Text', text: /^test-deletion/ }))?.text).toMatch(/test-deletion\s+1$/)
  expect((await ui.find({ type: 'Text', text: /^skip-attributes/ }))?.text).toMatch(/skip-attributes\s+0$/)
  await ui.unmount()
})

test('a denied call keeps its deny, gains no context and is not counted', async ($, on) => {
  stubEngine(on, { denial: 'not allowed' })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const ran = await $.tool.call({ tool: 'Write', file_path: '/repo/a.ts', content: `const key = '${AWS_KEY}'` })
  expect(ran.deny).toBe('not allowed')
  expect(ran.context).toBeUndefined()
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /^secrets/ }))?.text).toMatch(/secrets\s+0$/)
  await ui.unmount()
})

test('an edit the tool reports as failed gains no context and is not counted, while a failed shell command is still advised', async ($, on) => {
  stubEngine(on, { toolError: 'String to replace not found in file.' })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const edit = await $.tool.call({ tool: 'Edit', file_path: '/repo/a.ts', old_string: 'const key = load()', new_string: `const key = '${AWS_KEY}'` })
  const shell = await $.tool.call({ tool: 'Bash', command: 'rm a.test.ts && false' })
  expect(edit.context).toBeUndefined()
  expect(shell.context?.join('')).toContain('a.test.ts')
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /^secrets/ }))?.text).toMatch(/secrets\s+0$/)
  expect((await ui.find({ type: 'Text', text: /^test-deletion/ }))?.text).toMatch(/test-deletion\s+1$/)
  await ui.unmount()
})

test('an edit is measured by count: one more marker than the text it replaces fires, the same number does not', async ($, on) => {
  stubEngine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const oneSkip = 'it.skip("a", () => {})\nit("b", () => {})'
  const secondSkip = await $.tool.call({ tool: 'Edit', file_path: '/repo/a.test.ts', old_string: oneSkip, new_string: 'it.skip("a", () => {})\nit.skip("b", () => {})' })
  const sameSkips = await $.tool.call({ tool: 'Edit', file_path: '/repo/a.test.ts', old_string: oneSkip, new_string: 'it.skip("a renamed", () => {})\nit("b", () => {})' })
  const secondKey = await $.tool.call({ tool: 'Edit', file_path: '/repo/keys.ts', old_string: `['${AWS_KEY}']`, new_string: `['${AWS_KEY}', '${SECOND_AWS_KEY}']` })
  const sameKeys = await $.tool.call({ tool: 'Edit', file_path: '/repo/keys.ts', old_string: `['${AWS_KEY}']`, new_string: `[ '${AWS_KEY}' ]` })
  expect(secondSkip.context?.join('')).toContain('skips or disables a test')
  expect(sameSkips.context).toBeUndefined()
  expect(secondKey.context?.join('')).toContain('AWS access key')
  expect(sameKeys.context).toBeUndefined()
})

test('a password literal, a temporary AWS key and a key written by a shell command are flagged as credentials', async ($, on) => {
  stubEngine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const calls = [
    { tool: 'Write', file_path: '/repo/settings.json', content: '{"password": "hunter2hunter2"}' },
    { tool: 'Write', file_path: '/repo/compose.yaml', content: 'db:\n  password: hunter2hunter2\n' },
    { tool: 'Write', file_path: '/repo/appsettings.json', content: '{"Db": "Server=db;Password=hunter2hunter2;"}' },
    { tool: 'Write', file_path: '/repo/aws.ts', content: `const key = '${TEMPORARY_AWS_KEY}'` },
    { tool: 'Bash', command: `echo ${AWS_KEY} >> .env` },
    { tool: 'PowerShell', command: `Add-Content .env ${AWS_KEY}` },
  ] as const
  for (const call of calls) {
    const ran = await $.tool.call(call)
    expect(ran.context?.join('')).toContain('real credential')
  }
})

test('a password taken from a call, an environment lookup or a path, and the documented AWS example key, are not credentials', async ($, on) => {
  stubEngine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const calls = [
    { tool: 'Write', file_path: '/repo/A.cs', content: 'var password = GetPasswordFromVault();' },
    { tool: 'Write', file_path: '/repo/a.py', content: 'password = os.environ["DB_PASSWORD"]' },
    { tool: 'Write', file_path: '/repo/b.py', content: 'pwd = pathlib.Path.cwd()' },
    { tool: 'Write', file_path: '/repo/c.py', content: 'connect(host=host, password=db_password)' },
    { tool: 'Write', file_path: '/repo/types.ts', content: 'type Login = {\n  password: PasswordHash\n}' },
    { tool: 'Write', file_path: '/repo/compose.yaml', content: 'db:\n  password: ${DB_PASSWORD}\n' },
    { tool: 'Write', file_path: '/repo/docs.md', content: 'aws_access_key_id = AKIAIOSFODNN7EXAMPLE' },
    { tool: 'Bash', command: 'aws configure set aws_access_key_id AKIAIOSFODNN7EXAMPLE' },
  ] as const
  for (const call of calls) {
    const ran = await $.tool.call(call)
    expect(ran.context).toBeUndefined()
  }
})

test('skip markers beyond the plain skip call are flagged, and a Rust ignore attribute is flagged in a source file', async ($, on) => {
  stubEngine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const writes = [
    ['/repo/a.test.ts', 'test.skipIf(isCI)("a", () => {})'],
    ['/repo/b.test.ts', 'it.skip.each([1, 2])("b %i", () => {})'],
    ['/repo/c.test.ts', 'test.todo("c")'],
    ['/repo/tests/d.rs', '#[test]\n#[ignore = "flaky"]\nfn d() {}'],
    ['/repo/tests/test_e.py', '@pytest.mark.xfail\ndef test_e(): ...'],
    ['/repo/f_test.go', 'func TestF(t *testing.T) { t.Skipf("no %s", "db") }'],
    ['/repo/src/parser.rs', '#[cfg(test)]\nmod tests {\n    #[test]\n    #[ignore]\n    fn parses() {}\n}'],
  ] as const
  for (const [file_path, content] of writes) {
    const ran = await $.tool.call({ tool: 'Write', file_path, content })
    expect(ran.context?.join('')).toContain('skips or disables a test')
  }
})

test('a skip marker outside a test file is not flagged', async ($, on) => {
  stubEngine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const script = await $.tool.call({ tool: 'Write', file_path: '/repo/src/runner.ts', content: 'export const skipped = (t: Suite) => t.test.skip("x")' })
  const rust = await $.tool.call({ tool: 'Write', file_path: '/repo/src/walk.rs', content: 'let walker = WalkBuilder::new(root).ignore(true).build();' })
  expect(script.context).toBeUndefined()
  expect(rust.context).toBeUndefined()
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

test('a delete command behind a path, an assignment or a shell keyword, and the removal of a whole test directory, are flagged', async ($, on) => {
  stubEngine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const commands = [
    ['rm -rf tests', 'tests'],
    ['rm -r src/__tests__', 'src/__tests__'],
    ['/bin/rm a.test.ts', 'a.test.ts'],
    ['FOO=1 rm a.test.ts', 'a.test.ts'],
    ['if x; then rm a.test.ts; fi', 'a.test.ts'],
    ['(cd src && rm "b.test.ts")', 'b.test.ts'],
    ['git rm tests/test_orders.py', 'tests/test_orders.py'],
  ] as const
  for (const [command, path] of commands) {
    const ran = await $.tool.call({ tool: 'Bash', command })
    expect(ran.context?.join('')).toContain(`looks like test code (${path})`)
  }
})

test('a delete inside a quoted string or a comment, an index-only git rm and a coverage directory are not test deletions', async ($, on) => {
  stubEngine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const commands = [
    'echo "x; rm a.test.ts"',
    'git rm --cached tests/fixtures/big.bin',
    'rm -rf test/coverage',
    'rm notes.txt # then rm a.test.ts',
  ]
  for (const command of commands) {
    const ran = await $.tool.call({ tool: 'Bash', command })
    expect(ran.context).toBeUndefined()
  }
})

test('an edit that removes one test of several is flagged, and one that rewrites a test in place is not', async ($, on) => {
  stubEngine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const two = 'it("adds", () => { expect(add(1, 2)).toBe(3) })\nit("subtracts", () => { expect(sub(3, 2)).toBe(1) })'
  const removed = await $.tool.call({ tool: 'Edit', file_path: '/repo/math.test.ts', old_string: two, new_string: 'it("adds", () => { expect(add(1, 2)).toBe(3) })' })
  const rewritten = await $.tool.call({ tool: 'Edit', file_path: '/repo/math.test.ts', old_string: two, new_string: two.replace('toBe(1)', 'toEqual(1)') })
  expect(removed.context?.join('')).toContain('declares 2 tests and the new text declares 1')
  expect(rewritten.context).toBeUndefined()
})

test('a test or build run piped into a filter is flagged, with the hidden exit code named', async ($, on) => {
  stubEngine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const commands = [
    'cargo test -p core 2>&1 | tail -n 20',
    'cd src && dotnet test | grep -E "Failed|Passed"',
    'RUST_LOG=debug timeout 600 cargo nextest run |& head',
    'bun run test | tee out.log',
    '(cargo test) | tail',
    '{ cargo build; cargo test; } 2>&1 | tail',
    'uv run pytest | tail',
    './node_modules/.bin/jest | tail',
    '! cargo test | tail',
    'cargo test | tail # pipefail is not set here',
    'set +o pipefail; cargo test | tail',
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
    'set -euo pipefail; cargo test | tail',
    'make --version | head -1',
    'pytest --collect-only -q | head',
    'go test -list . | wc -l',
    '(cd docs && ls) | tail',
  ]
  for (const command of commands) {
    const ran = await $.tool.call({ tool: 'Bash', command })
    expect(ran.context).toBeUndefined()
  }
})


test('blocks reading credential files via Bash or Read, while allowing .env.example', async ($, on) => {
  stubEngine(on)
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })

  const catEnv = await $.tool.call({ tool: 'Bash', command: 'cat .env' })
  expect(catEnv.deny).toMatch(/Blocked reading credential file/)

  const pemRead = await $.tool.call({ tool: 'Read', file_path: '/app/certs/server.pem' })
  expect(pemRead.deny).toMatch(/Blocked reading credential file/)

  const exampleRead = await $.tool.call({ tool: 'Read', file_path: '/app/.env.example' })
  expect(exampleRead.deny).toBeUndefined()

  const exampleCat = await $.tool.call({ tool: 'Bash', command: 'cat .env.example' })
  expect(exampleCat.deny).toBeUndefined()
})

test('warns on destructive git commands but stays quiet on safe alternatives', async ($, on) => {
  stubEngine(on)
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })

  for (const command of ['git push --force origin main', 'git reset --hard HEAD~1', 'git add -A']) {
    const ran = await $.tool.call({ tool: 'Bash', command })
    expect(ran.context?.join('\n')).toMatch(/Destructive or overly broad git command/)
  }
  for (const command of ['git push --force-with-lease origin feature', 'git add src/index.ts', 'git status']) {
    const ran = await $.tool.call({ tool: 'Bash', command })
    expect(ran.context).toBeUndefined()
  }
})
