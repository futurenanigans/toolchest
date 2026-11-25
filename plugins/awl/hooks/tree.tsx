import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import type { Graph, Sequences, Tree, TreeShow } from '../types'
import { propsFor, showOf } from './pane-props'

const PANE = 'awl-tree'
const COMMAND = 'awl-tree'
const GRAPH_TIMEOUT_MS = 300_000
const SEQUENCES_FLAG = '--sequences'
const HEADER_ROWS = 1
const MIN_CLIENT_ROWS = 3
const GIT_TIMEOUT_MS = 5_000
const ERROR_CHARACTERS = 200
const ORIGIN_HEAD = ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']
const FALLBACK_BRANCHES = ['main', 'master']

const tree = atom({ plugin: 'awl', key: 'tree' } as const, null, { shape: 'tree-5' })
const TREE_SHOW: TreeShow = { show: 'tree' }
const treeShow = atom({ plugin: 'awl', key: 'treeShow' } as const, TREE_SHOW, { shape: 'tree-show-1' })

let building = false
let again = false
let opened = false

async function git($: EngineInterface, args: readonly string[]) {
  const env = await $.process.hookEnv()
  return $.process.run(['git', ...args], { cwd: env.CLAUDE_PROJECT_DIR, timeoutMs: GIT_TIMEOUT_MS })
}

export async function defaultBase($: EngineInterface): Promise<string | null> {
  const origin = await git($, ORIGIN_HEAD)
  const named = origin.stdout.trim()
  if (origin.exitCode === 0 && named) return named
  for (const branch of FALLBACK_BRANCHES) {
    if ((await git($, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])).exitCode === 0) return branch
  }
  return null
}

async function sequencesOf($: EngineInterface): Promise<Sequences> {
  try {
    return JSON.parse((await $.process.run(['awl', 'graph', SEQUENCES_FLAG], { timeoutMs: GRAPH_TIMEOUT_MS })).stdout) as Sequences
  } catch (failure) {
    const reason = failure instanceof Error ? failure.message : String(failure)
    return { state: 'unavailable', sequences: [], complete: false, errors: [reason.slice(0, ERROR_CHARACTERS)] }
  }
}

async function build($: EngineInterface) {
  await update($, tree, (previous): Tree => ({ state: 'building', graph: previous?.graph ?? null, sequences: previous?.sequences ?? null, errors: [], computedAt: previous?.computedAt ?? null }))
  try {
    const base = await defaultBase($)
    const ran = await $.process.run(['awl', 'graph', ...(base ? ['--base', base] : [])], { timeoutMs: GRAPH_TIMEOUT_MS })
    const graph = JSON.parse(ran.stdout) as Graph
    await update($, tree, (previous): Tree => ({ state: graph.state, graph, sequences: previous?.sequences ?? null, errors: graph.errors, computedAt: Date.now() }))
  } catch (failure) {
    const reason = failure instanceof Error ? failure.message : String(failure)
    await update($, tree, (previous): Tree => ({ state: 'unavailable', graph: previous?.graph ?? null, sequences: previous?.sequences ?? null, errors: [reason.slice(0, ERROR_CHARACTERS)], computedAt: previous?.computedAt ?? null }))
  }
  const sequences = await sequencesOf($)
  await update($, tree, (previous): Tree => ({ state: previous?.state ?? sequences.state, graph: previous?.graph ?? null, sequences, errors: previous?.errors ?? [], computedAt: previous?.computedAt ?? null }))
}

async function rebuild($: EngineInterface) {
  if (building) {
    again = true
    return
  }
  building = true
  try {
    do {
      again = false
      await build($)
    } while (again)
  } finally {
    building = false
  }
}

async function paneOpen($: EngineInterface) {
  return (await $.ui.panes()).some(pane => pane.id === PANE)
}

export async function refreshTree($: EngineInterface) {
  if (opened && await paneOpen($)) await rebuild($)
}

export async function startTree($: EngineInterface) {
  await $.command.register({ name: COMMAND, description: 'Toggle a pane with the production namespace graph, branch changes against the default branch highlighted; s lists entry call sequences' })
}

export function registerTree(on: On) {
  on('command.run', { command: COMMAND }, async $ => {
    if (await paneOpen($)) {
      opened = false
      await $.ui.close({ id: PANE })
      return { text: 'Awl tree pane closed.' }
    }
    opened = true
    await update($, treeShow, () => TREE_SHOW)
    void rebuild($)
    await $.ui.open({ id: PANE, title: 'Awl tree' })
    return { text: 'Awl tree pane opened; the graph builds in the background.' }
  })

  on('ui.message', { requestId: PANE }, async ($, e) => {
    const show = showOf(e.data)
    const t = await read($, tree)
    if (!show || !t) return {}
    await update($, treeShow, () => show)
    return { props: propsFor(t, show) }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Text } = elements
    const t = await read($, tree)
    if (!t) return <Text dimColor>Building the namespace graph.</Text>
    const g = t.graph
    const header = (
      <Text>
        <Text bold>{t.state === 'building' ? 'building…' : t.state}</Text>
        {g && <Text dimColor> · {g.nodes.length} namespaces · </Text>}
        {g && (g.base
          ? <Text color="yellow">{g.nodes.filter(node => node.changed).length} changed vs {g.base}{g.changedOutside.length > 0 ? `, ${g.changedOutside.length} changed outside the graph` : ''}</Text>
          : <Text dimColor>no default branch, changes unmarked</Text>)}
        {g && !g.complete && <Text color="yellow"> · evidence incomplete</Text>}
        {t.computedAt !== null && <Text dimColor> · computed {new Date(t.computedAt).toLocaleTimeString()}</Text>}
      </Text>
    )
    const errors = t.errors.map(error => <Text color="red">{error}</Text>)
    if (!g) return <Box flexDirection="column">{header}{errors}</Box>
    return (
      <Box flexDirection="column">
        {header}
        {errors}
        {'Client' in elements
          ? <elements.Client key="tree" module="./tree-view.tsx" props={propsFor(t, await read($, treeShow))} height={Math.max(MIN_CLIENT_ROWS, e.props.scroll.bodyRows - HEADER_ROWS - errors.length)} />
          : <Text dimColor>The namespace graph draws in the terminal.</Text>}
      </Box>
    )
  })
}
