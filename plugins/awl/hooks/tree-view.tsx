import type { ClientModule } from 'claude-code'

import type { TreeProps, TreeShow } from '../types'
import { HOTKEYS, levelOf, neighboursOf, rootOf } from './levels'
import type { Group, Level } from './levels'
import { SEQUENCE_KEY, START, sequenceKeyed, sequencePanel } from './sequence-view'
import type { SequenceState } from './sequence-view'

type View = { focus: string; index: number; sequences?: SequenceState | null }

const HEADER_ROWS = 2

export function keyed(view: View, key: string, level: Level): View | undefined {
  const count = level.groups.length
  const current = level.groups[view.index]
  if (key === 'up') return { ...view, index: Math.max(0, view.index - 1) }
  if (key === 'down') return { ...view, index: Math.min(count - 1, view.index + 1) }
  if ((key === 'right' || key === 'return') && current?.drillable) return { focus: current.key, index: 0 }
  if (key === 'left' && level.parent !== null) return { focus: level.parent, index: -1 }
  const jump = HOTKEYS.indexOf(key)
  if (key.length === 1 && jump >= 0 && jump < count) return { ...view, index: jump }
  return undefined
}

function shown(state: SequenceState | null | undefined, props: TreeProps): TreeShow {
  if (!state) return { show: 'tree' }
  const id = props.list?.sequences[state.selected]?.id ?? props.sequence?.id
  return state.open && id ? { show: 'sequence', id } : { show: 'list' }
}

const TreeView: ClientModule<TreeProps, View> = (props, surface) => {
  const { Box, Text } = surface.elements
  const move = (next: View) => {
    const before = shown(surface.state?.sequences, props)
    const after = shown(next.sequences, props)
    surface.setState(next)
    if (JSON.stringify(before) !== JSON.stringify(after)) surface.post(after)
  }
  const traced = surface.state?.sequences
  if (traced) {
    const held = surface.state ?? { focus: '', index: 0 }
    surface.onKey(event => {
      if (event.key === SEQUENCE_KEY) return move({ ...held, sequences: null })
      const next = sequenceKeyed(traced, event.key, props.list?.sequences.length ?? 0, props.sequence, surface.rows)
      if (next) move({ ...held, sequences: next })
    })
    surface.onPointer(() => undefined)
    return sequencePanel(surface.elements, props.list, props.sequence, traced, surface.columns, surface.rows)
  }
  const graph = props.graph
  if (!graph) return <Text dimColor>Loading the namespace graph.</Text>
  const root = rootOf(graph.nodes.map(node => node.name))
  const state = surface.state ?? { focus: root, index: 0 }
  const level = levelOf(graph, state.focus)
  const groups = level.groups
  const index = Math.min(state.index, Math.max(0, groups.length - 1))
  const view = { ...state, index }
  surface.onKey(event => {
    if (event.key === SEQUENCE_KEY) return move({ ...view, sequences: START })
    const next = keyed(view, event.key, level)
    if (!next) return
    if (next.index < 0) {
      const parentLevel = levelOf(graph, next.focus)
      surface.setState({ focus: next.focus, index: Math.max(0, parentLevel.groups.findIndex(group => group.key === view.focus)) })
    } else surface.setState(next)
  })
  surface.onPointer(event => {
    const row = event.y - HEADER_ROWS
    if (event.type === 'down' && row >= 0 && row < groups.length) surface.setState({ ...view, index: row })
  })
  const width = Math.max(...groups.map(group => group.label.length), 8)
  const chosen = groups[index]
  const near = chosen ? neighboursOf(level, chosen.key) : undefined
  const names = (items: Group[], extra: string[]) => {
    const parts = [...items.map(item => ({ text: item.label, color: item.changed ? 'yellow' : undefined, dim: false })),
      ...extra.map(text => ({ text, color: undefined, dim: true }))]
    if (!parts.length) return [<Text dimColor>nothing</Text>]
    return parts.flatMap((part, i) => [...(i ? [<Text dimColor>, </Text>] : []), <Text color={part.color} dimColor={part.dim}>{part.text}</Text>])
  }
  return (
    <Box flexDirection="column">
      <Text wrap="truncate-end"><Text bold>{level.focus || '(all)'}</Text><Text dimColor> · {groups.length} groups of {level.namespaces} namespaces{level.parent !== null ? ' · ← up' : ''}</Text></Text>
      <Text dimColor wrap="truncate-end">{' '.repeat(width + 4)}{groups.map((_, i) => HOTKEYS[i] ?? '·').join(' ')}</Text>
      {groups.map((group, i) => (
        <Text wrap="truncate-end">
          <Text color="green">{group.entry ? '▸' : ' '}</Text>
          <Text dimColor>{(HOTKEYS[i] ?? ' ') + ' '}</Text>
          <Text inverse={i === index} bold={i === index} color={group.changed ? 'yellow' : group.entry ? 'green' : undefined}>{group.label.padEnd(width)}</Text>
          <Text> </Text>
          {level.marks[i]!.map((mark, j) => <Text color={mark && j < i ? 'red' : undefined} dimColor={!mark}>{mark ? '● ' : '· '}</Text>)}
          {group.outside.length > 0 && <Text dimColor> + {group.outside.join(', ')}</Text>}
        </Text>
      ))}
      {chosen && near && (
        <Box flexDirection="column">
          <Text><Text bold>{chosen.label}</Text>{chosen.drillable && <Text dimColor> · → drills in</Text>}</Text>
          <Text><Text dimColor>  uses    </Text>{names(near.uses, chosen.outside)}</Text>
          <Text><Text dimColor>  used by </Text>{names(near.usedBy, chosen.outsideUsers)}</Text>
        </Box>
      )}
      <Text>
        <Text>●</Text><Text dimColor> row depends on column · </Text><Text color="red">●</Text><Text dimColor> points back up (cycle) · + outside this level</Text>
      </Text>
      <Text>
        <Text color="green">▸ green</Text><Text dimColor> holds a program entry point · </Text><Text color="yellow">yellow</Text><Text dimColor> changed on this branch</Text>
      </Text>
      <Text dimColor>click to focus · ↑↓ select · → or Enter drills in · ← goes up · s call sequences</Text>
    </Box>
  )
}

export default TreeView
