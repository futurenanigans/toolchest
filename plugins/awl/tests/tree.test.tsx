import { expect, test } from 'claude-code/testing'

import { levelOf, neighboursOf } from '../hooks/levels'
import { keyed } from '../hooks/tree-view'
import { DISPATCH_MARK, GUTTER, MARKS, fitted, layoutSequence, windowOf } from '../hooks/sequence-layout'
import { START, sequenceKeyed } from '../hooks/sequence-view'
import { subtreeEnd, zoomed } from '../hooks/sequence-zoom'
import { PROPS_BUDGET, listOf, shownOf, showOf } from '../hooks/pane-props'

const node = (id: string, name: string, extra: { entry?: boolean; changed?: boolean } = {}) =>
  ({ id, name, entry: extra.entry ?? false, changed: extra.changed ?? false })

const GRAPH = {
  state: 'ready',
  base: 'main',
  changedOutside: [],
  nodes: [
    node('n0', 'App.Cli', { entry: true }), node('n1', 'App.Cli.Graph', { changed: true }),
    node('n2', 'App.Core'), node('n3', 'App.Core.Data'), node('n4', 'App.Contracts'),
  ],
  edges: [
    { source: 'n0', target: 'n1' }, { source: 'n1', target: 'n2' }, { source: 'n1', target: 'n4' },
    { source: 'n3', target: 'n4' }, { source: 'n2', target: 'n3' },
  ],
  complete: true,
  errors: [],
}

const ENV = { CLAUDE_PROJECT_DIR: '/repo' }

const lifeline = (name: string, namespace: string) => ({ name, namespace })
const call = (from: number, to: number, label: string, depth: number, repeat: 'recursive' | 'repeated' | null = null, dispatched = false) =>
  ({ from, to, label, depth, repeat, dispatched })
const RUN = {
  id: 's0', entry: 'App.Cli.Program.Main()', function: 'App.Cli.Program.Main()', defined: 'src/App/Program.cs',
  lifelines: [lifeline('App.Cli.Program', 'App.Cli'), lifeline('App.Ui.View', 'App.Ui'), lifeline('App.Data.Store', 'App.Data'), lifeline('App.Data.Cache', 'App.Data')],
  messages: [
    call(0, 0, 'Main()', 0), call(0, 1, 'Render()', 1, null, true), call(1, 2, 'Save()', 2), call(2, 3, 'Put(string)', 3),
    call(3, 3, 'Flush()', 4), call(3, 3, 'Flush()', 5, 'recursive'), call(0, 0, 'Exit()', 1),
  ],
}
const SEQUENCES = { state: 'ready', sequences: [RUN], complete: true, errors: [] }
const SHOWN = { ...RUN, omitted: 0 }
const settle = () => new Promise(resolve => setTimeout(resolve, 50))
const answer = (argv: readonly string[], sequences: object = SEQUENCES, graph: object = GRAPH) =>
  argv[0] === 'git' ? ran(1, '') : ran(0, JSON.stringify(argv.includes('--sequences') ? sequences : graph))

const ran = (exitCode: number, stdout: string) =>
  ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })

const PANE = {
  plugin: 'awl', component: 'Pane', requestId: 'awl-tree', surface: 'terminal',
  props: { title: 'Awl tree', isFocused: true, bodyColumns: 120, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

test('the top level lists each namespace under the shared root once, dependents above their dependencies', () => {
  const level = levelOf(GRAPH, 'App')
  expect(level.groups.map(group => group.label)).toEqual(['Cli', 'Core', 'Contracts'])
  expect(level.groups.map(group => [group.entry, group.changed, group.drillable])).toEqual([[true, true, true], [false, false, true], [false, false, false]])
  expect(level.marks).toEqual([[false, true, true], [false, false, true], [false, false, false]])
  expect(level.parent).toBeNull()
})

test('drilling in groups one level further and names dependencies that leave the level', () => {
  const level = levelOf(GRAPH, 'App.Cli')
  expect(level.groups.map(group => group.label)).toEqual(['(itself)', 'Graph'])
  expect(level.groups[1]?.outside).toEqual(['Contracts', 'Core'])
  expect(level.marks).toEqual([[false, true], [false, false]])
  expect(level.parent).toBe('App')
})

test('an edge naming a node the graph does not hold is skipped', () => {
  const dangling = { ...GRAPH, edges: [...GRAPH.edges, { source: 'n0', target: 'missing' }, { source: 'missing', target: 'n2' }] }
  expect(levelOf(dangling, 'App').marks).toEqual(levelOf(GRAPH, 'App').marks)
})

test('independent groups order by code unit, the same in every locale', () => {
  const flat = { ...GRAPH, nodes: [node('n0', 'App.b'), node('n1', 'App.B'), node('n2', 'App.a')], edges: [] }
  expect(levelOf(flat, 'App').groups.map(group => group.label)).toEqual(['B', 'a', 'b'])
})

test('a cycle keeps both groups once with one mark pointing back up', () => {
  const cyclic = { ...GRAPH, edges: [...GRAPH.edges, { source: 'n4', target: 'n2' }] }
  const level = levelOf(cyclic, 'App')
  expect(level.groups.map(group => group.label).sort()).toEqual(['Cli', 'Contracts', 'Core'])
  expect(level.marks.flatMap((row, i) => row.filter((mark, j) => mark && j < i))).toHaveLength(1)
})

test('selecting a group names what it uses and what uses it, inside and outside the level', () => {
  const level = levelOf(GRAPH, 'App.Cli')
  const near = neighboursOf(level, 'App.Cli.Graph')
  expect(near?.usedBy.map(group => group.label)).toEqual(['(itself)'])
  expect(levelOf(GRAPH, 'App').groups.find(group => group.key === 'App.Core')?.outsideUsers).toEqual([])
  expect(levelOf(GRAPH, 'App.Core').groups.find(group => group.key === 'App.Core')?.outsideUsers).toEqual(['Cli'])
})

test('arrows move the selection, right or Enter drills into a namespace with children, left goes up', () => {
  const top = levelOf(GRAPH, 'App')
  expect(keyed({ focus: 'App', index: 0 }, 'down', top)).toEqual({ focus: 'App', index: 1 })
  expect(keyed({ focus: 'App', index: 0 }, 'up', top)).toEqual({ focus: 'App', index: 0 })
  expect(keyed({ focus: 'App', index: 0 }, 'right', top)).toEqual({ focus: 'App.Cli', index: 0 })
  expect(keyed({ focus: 'App', index: 0 }, 'return', top)).toEqual({ focus: 'App.Cli', index: 0 })
  expect(keyed({ focus: 'App', index: 2 }, 'right', top)).toBeUndefined()
  expect(keyed({ focus: 'App', index: 0 }, 'left', top)).toBeUndefined()
  expect(keyed({ focus: 'App.Cli', index: 1 }, 'left', levelOf(GRAPH, 'App.Cli'))).toEqual({ focus: 'App', index: -1 })
})

test('/awl-tree draws the levels in a client that the arrows drive', async ($, on) => {
  const argv: string[][] = []
  on('process.hookEnv', () => ({ value: ENV }))
  on('process.run', (_, e) => {
    argv.push([...e.argv])
    return e.argv[0] === 'git' ? ran(0, 'origin/trunk\n') : answer(e.argv)
  })
  on('ui.panes', () => ({ value: [] }))
  on('ui.open', () => ({ value: { isPlaced: true } }))

  await $.command.run({ command: 'awl-tree' })
  await new Promise(resolve => setTimeout(resolve, 50))

  expect(argv.filter(run => run[0] === 'awl')).toEqual([['awl', 'graph', '--base', 'origin/trunk'], ['awl', 'graph', '--sequences']])
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: /1 changed vs main/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /3 groups of 5 namespaces/, in: 'tree' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /uses\s+Core, Contracts/, in: 'tree' })).toBeTruthy()
  await ui.key({ key: 'down', in: 'tree' })
  expect(await ui.find({ type: 'Text', text: /used by\s+Cli/, in: 'tree' })).toBeTruthy()
  await ui.key({ key: 'up', in: 'tree' })
  await ui.key({ key: 'right', in: 'tree' })
  expect(await ui.find({ type: 'Text', text: /2 groups of 2 namespaces/, in: 'tree' })).toBeTruthy()
  await ui.key({ key: 'left', in: 'tree' })
  expect(await ui.find({ type: 'Text', text: /3 groups of 5 namespaces/, in: 'tree' })).toBeTruthy()
  await ui.unmount()
})

test('without a default branch the graph draws with changes unmarked, and a write rebuilds an open pane', async ($, on) => {
  const argv: string[][] = []
  let open = false
  on('process.hookEnv', () => ({ value: ENV }))
  on('process.run', (_, e) => {
    argv.push([...e.argv])
    return answer(e.argv, SEQUENCES, { ...GRAPH, base: null })
  })
  on('ui.panes', () => ({ value: open ? [{ id: 'awl-tree' }] : [] }))
  on('ui.open', () => { open = true; return { value: { isPlaced: true } } })
  on('tool.call', () => ({ result: {} }))

  await $.command.run({ command: 'awl-tree' })
  await new Promise(resolve => setTimeout(resolve, 50))
  expect(argv.filter(run => run[0] === 'awl')).toEqual([['awl', 'graph'], ['awl', 'graph', '--sequences']])
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: /no default branch, changes unmarked/ })).toBeTruthy()
  await ui.unmount()

  await $.tool.call({ tool: 'Edit', file_path: '/repo/A.cs', old_string: 'a', new_string: 'b' })
  await new Promise(resolve => setTimeout(resolve, 50))
  expect(argv.filter(run => run[0] === 'awl' && !run.includes('--sequences'))).toHaveLength(2)
})

const centers = (layout: { column: number }, lanes: number) => Array.from({ length: lanes }, (_, lane) => GUTTER + lane * layout.column + Math.floor(layout.column / 2))
const shape = (drawn: ReturnType<typeof zoomed>) => drawn.messages.map(message =>
  `${message.depth} ${drawn.lifelines[message.from]}->${drawn.lifelines[message.to]} ${message.label}${message.hidden ? ` +${message.hidden}` : ''}`)

test('at namespace level only calls between namespaces are drawn, each with the calls folded inside it', () => {
  const drawn = zoomed(RUN, 0, 'namespace')
  expect(drawn.lifelines).toEqual(['Cli', 'Ui', 'Data'])
  expect(shape(drawn)).toEqual(['0 Cli->Cli Main +6', '1 Cli->Ui Render +4', '2 Ui->Data Save +3'])
})

test('at type level calls between types are drawn, labels keep parameters only for overloads, and a call can become the root', () => {
  expect(shape(zoomed(RUN, 0, 'type'))).toEqual(['0 Cli.Program->Cli.Program Main +6', '1 Cli.Program->Ui.View Render +4', '2 Ui.View->Data.Store Save +3', '3 Data.Store->Data.Cache Put +2'])
  expect(shape(zoomed(RUN, 2, 'type'))).toEqual(['0 Ui.View->Data.Store Save +3', '1 Data.Store->Data.Cache Put +2'])
  expect(subtreeEnd(RUN.messages, 2)).toBe(6)
  expect(shape(zoomed(RUN, 0, 'type', 1))).toEqual(['0 Cli.Program->Cli.Program Main +6', '1 Cli.Program->Ui.View Render +4'])
  const overloads = { ...RUN, messages: [...RUN.messages, call(0, 2, 'Save(int)', 1)] }
  expect(zoomed(overloads, 0, 'type').messages.filter(message => message.label.startsWith('Save')).map(message => message.label)).toEqual(['Save()', 'Save(int)'])
})

test('a drawn sequence lays out one column per lifeline with arrows, marks and folded counts on the labels', () => {
  const layout = layoutSequence(zoomed(RUN, 0, 'type'))
  const [program = 0, view = 0, store = 0] = centers(layout, 4)
  expect([layout.header, ...layout.rows].every(line => line.length === layout.width)).toBe(true)
  expect(layout.header.slice(program - 5, program + 6)).toBe('Cli.Program')
  const right = layout.rows[1] ?? ''
  expect([right[program], right[program + 1], right[view - 1], right[view]]).toEqual(['│', '─', '▶', '│'])
  expect(right.slice(program, view)).toContain(`Render${DISPATCH_MARK} +4`)
  expect((layout.rows[0] ?? '').slice(program, program + 3)).toBe('│─┐')
  expect(layout.rows[2]?.slice(view, store)).toContain('Save +3')
  expect(fitted('Awl.Cli.Graph.SequenceCommand', 12)).toBe('…enceCommand')
  expect(windowOf(layout, 0, 0, 20, 2).rows.every(line => line.length === 20)).toBe(true)
  expect(MARKS.recursive).toBe(' ↻')
})

test('keys move the cursor, Enter opens a call with folded calls, z switches level, and left goes back up then to the list', () => {
  const opened = sequenceKeyed(START, 'return', 1, SHOWN, 40)
  expect(opened).toEqual({ ...START, open: true })
  const second = sequenceKeyed(opened ?? START, 'down', 1, SHOWN, 40)
  expect(second?.cursor).toBe(1)
  const inside = sequenceKeyed(second ?? START, 'return', 1, SHOWN, 40)
  expect(inside?.roots).toEqual([1])
  expect(inside?.cursor).toBe(0)
  expect(sequenceKeyed(inside ?? START, 'z', 1, SHOWN, 40)?.level).toBe('type')
  expect(sequenceKeyed(inside ?? START, '+', 1, SHOWN, 40)?.depth).toBe(2)
  expect(sequenceKeyed(inside ?? START, '-', 1, SHOWN, 40)?.depth).toBe(1)
  expect(sequenceKeyed(inside ?? START, 'left', 1, SHOWN, 40)?.roots).toEqual([])
  expect(sequenceKeyed(opened ?? START, 'return', 1, SHOWN, 40)).toBeUndefined()
  expect(sequenceKeyed(opened ?? START, 'left', 1, SHOWN, 40)?.open).toBe(false)
})

test('s in the pane lists the sequences, Enter draws the chosen one, and s returns to the tree', async ($, on) => {
  on('process.hookEnv', () => ({ value: ENV }))
  on('process.run', (_, e) => answer(e.argv))
  on('ui.panes', () => ({ value: [] }))
  on('ui.open', () => ({ value: { isPlaced: true } }))

  await $.command.run({ command: 'awl-tree' })
  await settle()
  const ui = await $.ui.mount(PANE)
  await ui.key({ key: 's', in: 'tree' })
  expect(await ui.find({ type: 'Text', text: /Program\.Main\(\) \(src\/App\/Program\.cs, 7 calls\)/, in: 'tree' })).toBeTruthy()
  await ui.key({ key: 'return', in: 'tree' })
  expect(await ui.find({ type: 'Text', text: /namespaces · depth 1 · rows 1-2 of 2/, in: 'tree' })).toBeTruthy()
  await ui.key({ key: '+', in: 'tree' })
  expect(await ui.find({ type: 'Text', text: /namespaces · depth 2 · rows 1-3 of 3/, in: 'tree' })).toBeTruthy()
  await ui.key({ key: 'down', in: 'tree' })
  await ui.key({ key: 'return', in: 'tree' })
  expect(await ui.find({ type: 'Text', text: /Main\(\) › Render\(\) · namespaces · depth 2 · rows 1-2 of 2/, in: 'tree' })).toBeTruthy()
  await ui.key({ key: 'z', in: 'tree' })
  expect(await ui.find({ type: 'Text', text: /types · depth 2 · rows 1-3 of 3/, in: 'tree' })).toBeTruthy()
  await ui.key({ key: 'left', in: 'tree' })
  expect(await ui.find({ type: 'Text', text: /types · depth 2 · rows 1-3 of 3/, in: 'tree' })).toBeTruthy()
  await ui.key({ key: 's', in: 'tree' })
  expect(await ui.find({ type: 'Text', text: /3 groups of 5 namespaces/, in: 'tree' })).toBeTruthy()
  await ui.unmount()
})

test('sequences that are empty or unavailable explain themselves instead of drawing', async ($, on) => {
  let sequences: object = { ...SEQUENCES, sequences: [] }
  on('process.hookEnv', () => ({ value: ENV }))
  on('process.run', (_, e) => answer(e.argv, sequences))
  on('ui.panes', () => ({ value: [] }))
  on('ui.open', () => ({ value: { isPlaced: true } }))

  await $.command.run({ command: 'awl-tree' })
  await settle()
  const ui = await $.ui.mount(PANE)
  await ui.key({ key: 's', in: 'tree' })
  expect(await ui.find({ type: 'Text', text: /No compiler entry point calls a production method/, in: 'tree' })).toBeTruthy()
  await ui.unmount()

  sequences = { state: 'unavailable', sequences: [], complete: false, errors: ['worker stopped'] }
  await $.command.run({ command: 'awl-tree' })
  await settle()
  const again = await $.ui.mount(PANE)
  await again.key({ key: 's', in: 'tree' })
  expect(await again.find({ type: 'Text', text: /Call sequences are unavailable/, in: 'tree' })).toBeTruthy()
  expect((await again.find({ type: 'Text', text: /worker stopped/, in: 'tree' }))?.props.color).toBe('red')
  await again.unmount()
})

const MANY = 600
const LONG = 4000
const bulky = Array.from({ length: MANY }, (_, i) => ({ ...RUN, id: `s${i}`, function: `Step${i}`, messages: i === 0 ? Array.from({ length: LONG }, (_, j) => call(0, 1, `Call${j}()`, 1)) : RUN.messages }))

test('props past the Client bound stay under it and say how much was left out', () => {
  const list = listOf({ ...SEQUENCES, sequences: bulky })
  expect(JSON.stringify(list).length).toBeLessThanOrEqual(PROPS_BUDGET)
  expect(list.sequences.length + list.omitted).toBe(MANY)
  const shown = shownOf(bulky[0]!)
  expect(JSON.stringify(shown).length).toBeLessThanOrEqual(PROPS_BUDGET)
  expect(shown.messages.length + shown.omitted).toBe(LONG)
  expect(shown.omitted).toBeGreaterThan(0)
  expect(showOf({ show: 'sequence' })).toBeNull()
})

test('the client region takes the pane body below the header', async ($, on) => {
  on('process.hookEnv', () => ({ value: ENV }))
  on('process.run', (_, e) => answer(e.argv))
  on('ui.panes', () => ({ value: [] }))
  on('ui.open', () => ({ value: { isPlaced: true } }))

  await $.command.run({ command: 'awl-tree' })
  await settle()
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Client' }))?.props.height).toBe(PANE.props.scroll.bodyRows - 1)
  await ui.unmount()
})
