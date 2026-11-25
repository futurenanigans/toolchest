import { expect, test } from 'claude-code/testing'

const STATUS = JSON.stringify({
  state: 'ready',
  worker: {
    processId: 7, started: '2026-11-23T21:00:00Z', target: '/r/A.slnx', activeRequests: 0, queuedRequests: 0,
    retainedRevisions: 1, hasPublishedRevision: true, stopping: false,
    resources: { processTreeWorkingSetBytes: 2 * 2 ** 30, processTreeProcesses: 2, managedHeapBytes: 2 ** 30,
      retainedSessions: 1, memoryCeilingBytes: 8 * 2 ** 30, releasedForMemory: 0, memoryPressed: false,
      memoryTargetBytes: 7 * 2 ** 30, machineAvailableBytes: 7 * 2 ** 30, machineReserveBytes: 2 * 2 ** 30, cgroupMemoryLimitBytes: null },
  },
  session: { callbacks: 5, evaluated: 4, denied: 1, advised: 2, findings: 6, unverified: 0,
    lastEvent: 'PostToolUse', lastAt: '2026-11-23T21:05:00Z', lastMilliseconds: 840,
    recent: [{ rule: 'swallowed-exception', file: 'src/A.cs', line: 12, blocking: true, message: 'The handler performs no operation.', at: '2026-11-23T21:05:00Z' }] },
  errors: [],
})

const PANE = {
  plugin: 'awl', component: 'Pane', requestId: 'awl', surface: 'terminal',
  props: { title: 'Awl', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

test('a write refreshes the status line and the pane shows the session counts', async ($, on) => {
  const lines: (string | undefined)[] = []
  const argv: string[][] = []
  on('session.id', () => ({ value: 's1' }))
  on('process.run', (_, e) => { argv.push([...e.argv]); return { value: { exitCode: 0, stdout: STATUS, stderr: '' } } })
  on('ui.status', (_, e) => { lines.push(e.text); return { value: undefined } })
  on('tool.call', () => ({ result: {} }))

  await $.tool.call({ tool: 'Edit', file_path: '/r/A.cs', old_string: 'a', new_string: 'b' })
  await new Promise(resolve => setTimeout(resolve, 10))

  expect(argv[0]).toEqual(['awl', 'status', '--session', 's1'])
  expect(lines).toEqual([])
  const band = await $.ui.mount({ plugin: 'awl', component: 'PromptHint', surface: 'terminal', props: { isDraft: false, isWorking: false, hint: '? for shortcuts' } } as never)
  expect((await band.find({ type: 'Text', text: /awl/ }))?.text).toBe('awl ● warm · 2.0/7.0 GB · 0 running · 0 queued · 4 eval · 1 blocked · 2 advised')
  expect((await band.find({ type: 'Text', text: /^ · 1 blocked$/ }))?.props.color).toBe('red')
  await band.unmount()
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /blocked/ }))?.text).toBe('1 edit(s) blocked')
  expect((await ui.find({ type: 'Text', text: /swallowed-exception/ }))?.text).toBe('blocked swallowed-exception src/A.cs:12')
  await ui.unmount()
})

test('a repository without awl.json shows nothing', async ($, on) => {
  const lines: (string | undefined)[] = []
  on('session.id', () => ({ value: 's1' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '{"state":"disabled","worker":null,"session":null,"errors":[]}', stderr: '' } }))
  on('ui.status', (_, e) => { lines.push(e.text); return { value: undefined } })
  on('tool.call', () => ({ result: {} }))

  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await new Promise(resolve => setTimeout(resolve, 10))

  expect(lines).toEqual([])
  const band = await $.ui.mount({ plugin: 'awl', component: 'PromptHint', surface: 'terminal', props: { isDraft: false, isWorking: false, hint: '? for shortcuts' } } as never)
  expect(await band.find({ type: 'Text', text: /awl/ })).toBeUndefined()
  await band.unmount()
})

test('/awl-details opens the pane and a second /awl-details closes it', async ($, on) => {
  const open: string[] = []
  const calls: string[] = []
  on('session.id', () => ({ value: 's1' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: STATUS, stderr: '' } }))
  on('ui.panes', () => ({ value: open.map(id => ({ id, title: 'Awl', isShown: true })) }))
  on('ui.open', (_, e) => { calls.push('open'); open.push(e.id); return { value: { isPlaced: true } } })
  on('ui.close', (_, e) => { calls.push('close'); open.splice(open.indexOf(e.id), 1); return { value: undefined } })

  expect((await $.command.run({ command: 'awl-details' })).text).toBe('Awl pane opened.')
  expect((await $.command.run({ command: 'awl-details' })).text).toBe('Awl pane closed.')
  expect(calls).toEqual(['open', 'close'])
})

test('memory pressure marks the status line and the pane shows the target, available machine memory and serialized admission', async ($, on) => {
  const pressed = STATUS.replace('"memoryPressed":false', '"memoryPressed":true')
  on('session.id', () => ({ value: 's1' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: pressed, stderr: '' } }))
  on('ui.status', () => ({ value: undefined }))
  on('tool.call', () => ({ result: {} }))

  await $.tool.call({ tool: 'Edit', file_path: '/r/A.cs', old_string: 'a', new_string: 'b' })
  await new Promise(resolve => setTimeout(resolve, 10))

  const band = await $.ui.mount({ plugin: 'awl', component: 'PromptHint', surface: 'terminal', props: { isDraft: false, isWorking: false, hint: '? for shortcuts' } } as never)
  expect((await band.find({ type: 'Text', text: /awl/ }))?.text).toContain('memory pressure')
  await band.unmount()
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /machine available/ }))?.text).toContain('one at a time')
  await ui.unmount()
})

test('a cgroup limit is shown beside the ceiling it bounds', async ($, on) => {
  const limited = STATUS.replace('"cgroupMemoryLimitBytes":null', `"cgroupMemoryLimitBytes":${5 * 2 ** 30}`)
  on('session.id', () => ({ value: 's1' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: limited, stderr: '' } }))
  on('ui.status', () => ({ value: undefined }))
  on('tool.call', () => ({ result: {} }))

  await $.tool.call({ tool: 'Edit', file_path: '/r/A.cs', old_string: 'a', new_string: 'b' })
  await new Promise(resolve => setTimeout(resolve, 10))

  const band = await $.ui.mount({ plugin: 'awl', component: 'PromptHint', surface: 'terminal', props: { isDraft: false, isWorking: false, hint: '? for shortcuts' } } as never)
  expect((await band.find({ type: 'Text', text: /awl/ }))?.text).toContain('2.0/7.0 GB (cgroup 5.0 GB)')
  await band.unmount()
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /ceiling/ }))?.text).toContain('8.0 GB ceiling of 5.0 GB cgroup limit')
  await ui.unmount()
})
