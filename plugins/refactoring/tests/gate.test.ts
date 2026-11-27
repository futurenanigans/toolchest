import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

type On = Parameters<TestBody>[1]

function stubEngine(on: On): void {
  on('agent.list', () => ({
    value: [
      { id: 'impl', type: 'refactoring:task-implementer', description: 'build step', status: 'running' },
      { id: 'explore', type: 'Explore', description: 'search', status: 'running' },
    ] as never,
  }))
  on('tool.call', () => ({ result: {} }))
}

const denied = { deny: expect.stringContaining('task-implementer is not allowed to run git') }

test('task-implementer is denied git however the command reaches it', async ($, on) => {
  stubEngine(on)
  for (const command of ['git status', 'bash -c "git log -1"', 'command git diff', '/usr/bin/git add .', 'dotnet build && git commit -m x', 'GIT.EXE status']) {
    expect(await $.tool.call({ tool: 'Bash', command, agentId: 'impl' })).toEqual(denied)
  }
  expect(await $.tool.call({ tool: 'PowerShell', command: 'git stash', agentId: 'impl' } as never)).toEqual(denied)
})

test('task-implementer keeps commands that only mention git inside another word', async ($, on) => {
  stubEngine(on)
  for (const command of ['dotnet test', 'cat .gitignore', 'ls legit/', 'cargo build --features digit']) {
    expect((await $.tool.call({ tool: 'Bash', command, agentId: 'impl' })).deny).toBeUndefined()
  }
})

test('other agents and the main session keep git', async ($, on) => {
  stubEngine(on)
  expect((await $.tool.call({ tool: 'Bash', command: 'git status', agentId: 'explore' })).deny).toBeUndefined()
  expect((await $.tool.call({ tool: 'Bash', command: 'git status' })).deny).toBeUndefined()
})
