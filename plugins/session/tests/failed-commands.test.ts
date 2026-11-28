import { expect, test } from 'claude-code/testing'

test('records non-exploratory failed shell commands and ignores exploratory or passing commands', async ($, on) => {
  on('prompt.compose', () => ({ sections: [] }))
  on('tool.call', async (_$, e) => {
    const cmd = String((e as Record<string, unknown>).command ?? '')
    if (cmd.includes('fail') || cmd.includes('grep') || cmd.startsWith('[')) {
      return { result: 'failed', isError: true }
    }
    return { result: 'ok', isError: false }
  })

  await $.tool.call({ tool: 'Bash', command: 'bun test ok.spec.ts' })
  await $.tool.call({ tool: 'Bash', command: 'grep -rn foo src/' })
  await $.tool.call({ tool: 'Bash', command: '[ -f build/out.js ]' })
  await $.tool.call({ tool: 'Bash', command: 'cd src && grep -rn bar .' })
  await $.tool.call({ tool: 'Bash', command: 'cd web && bun run fail-build' })
  await $.tool.call({ tool: 'Bash', command: 'bun test fail-auth.spec.ts' })
  await $.tool.call({ tool: 'Bash', command: 'bun test fail-auth.spec.ts' })
  await $.tool.call({ tool: 'Bash', command: 'cargo build --fail-fast' })

  const composed = await $.prompt.compose({
    model: 'claude-haiku-5-5',
    promptModel: 'claude-haiku-5-5',
    surfaces: ['terminal'],
    tools: [],
    outputStyle: null,
    traits: [],
  })
  const section = composed.sections.find(s => s.id === 'session:failed-commands')
  expect(section?.text).toContain('- bun test fail-auth.spec.ts')
  expect(section?.text).toContain('- cargo build --fail-fast')
  expect(section?.text).toContain('- cd web && bun run fail-build')
  expect(section?.text).not.toContain('grep -rn')
  expect(section?.text).not.toContain('build/out.js')
  expect(section?.text).not.toContain('ok.spec.ts')
  // Deduplicated: appears once
  expect(section?.text.match(/fail-auth\.spec\.ts/g)?.length).toBe(1)
})
