import type { ClientElements } from 'claude-code'

import type { SequenceList, ShownSequence } from '../types'
import { DISPATCH_MARK, MARKS, clamp, fitted, layoutSequence, windowOf } from './sequence-layout'
import { zoomed } from './sequence-zoom'
import type { ZoomLevel } from './sequence-zoom'

export type SequenceState = { selected: number; open: boolean; x: number; cursor: number; roots: number[]; level: ZoomLevel; depth: number }

export const SEQUENCE_KEY = 's'
export const START: SequenceState = { selected: 0, open: false, x: 0, cursor: 0, roots: [], level: 'namespace', depth: 1 }

const BACK_KEY = 'b'
const ZOOM_KEY = 'z'
const DEEPER_KEYS = ['+', '=']
const SHALLOWER_KEY = '-'
const PAGE_ROWS = 10
const CHROME_ROWS = 5
const MIN_ROWS = 3
const MIN_COLUMNS = 20
const UNMEASURED_COLUMNS = 160
const UNMEASURED_ROWS = 40
const LIST_PREFIX = 2

const page = (rows: number) => Math.max(1, rows - CHROME_ROWS)

export function sequenceKeyed(state: SequenceState, key: string, count: number, chosen: ShownSequence | null, rows: number): SequenceState | undefined {
  if (!state.open) {
    if (key === 'up') return { ...state, selected: Math.max(0, state.selected - 1) }
    if (key === 'down') return { ...state, selected: Math.min(count - 1, state.selected + 1) }
    if (key === 'pagedown') return { ...state, selected: Math.min(count - 1, state.selected + PAGE_ROWS) }
    if (key === 'pageup') return { ...state, selected: Math.max(0, state.selected - PAGE_ROWS) }
    if ((key === 'return' || key === 'right') && state.selected < count) return { ...state, open: true, x: 0, cursor: 0, roots: [] }
    return undefined
  }
  const back = (): SequenceState => (state.roots.length
    ? { ...state, roots: state.roots.slice(0, -1), cursor: 0, x: 0 }
    : { ...state, open: false })
  if (key === BACK_KEY || key === 'backspace') return back()
  if (!chosen) return key === 'left' ? { ...state, open: false } : undefined
  const drawn = zoomed(chosen, state.roots[state.roots.length - 1] ?? 0, state.level, state.depth)
  const layout = layoutSequence(drawn)
  const bottom = Math.max(0, drawn.messages.length - 1)
  if (key === 'down') return { ...state, cursor: Math.min(bottom, state.cursor + 1) }
  if (key === 'up') return { ...state, cursor: Math.max(0, state.cursor - 1) }
  if (key === 'pagedown') return { ...state, cursor: Math.min(bottom, state.cursor + page(rows)) }
  if (key === 'pageup') return { ...state, cursor: Math.max(0, state.cursor - page(rows)) }
  if (DEEPER_KEYS.includes(key)) return { ...state, depth: state.depth + 1 }
  if (key === SHALLOWER_KEY) return { ...state, depth: Math.max(1, state.depth - 1), cursor: 0 }
  if (key === ZOOM_KEY) return { ...state, level: state.level === 'namespace' ? 'type' : 'namespace', cursor: 0, x: 0 }
  const target = drawn.messages[state.cursor]
  if (key === 'return' && state.cursor > 0 && target && target.hidden > 0) return { ...state, roots: [...state.roots, target.source], cursor: 0, x: 0 }
  if (key === 'right') return { ...state, x: Math.min(Math.max(0, layout.width - 1), state.x + layout.column) }
  if (key === 'left') return state.x > 0 ? { ...state, x: Math.max(0, state.x - layout.column) } : back()
  return undefined
}

export function sequencePanel(elements: ClientElements, data: SequenceList | null, chosen: ShownSequence | null, state: SequenceState, columns: number, rows: number) {
  const { Box, Text } = elements
  const width = columns > 0 ? Math.max(MIN_COLUMNS, columns) : UNMEASURED_COLUMNS
  const visible = rows > 0 ? Math.max(MIN_ROWS, rows - CHROME_ROWS) : UNMEASURED_ROWS
  if (state.open) {
    if (!chosen) return <Text dimColor>Loading the sequence. b returns to the list.</Text>
    const drawn = zoomed(chosen, state.roots[state.roots.length - 1] ?? 0, state.level, state.depth)
    const layout = layoutSequence(drawn)
    const cursor = Math.min(state.cursor, Math.max(0, drawn.messages.length - 1))
    const first = clamp(cursor - Math.floor(visible / 2), layout.rows.length - visible)
    const shown = windowOf(layout, state.x, first, width, visible)
    const path = [chosen.function, ...state.roots.map(root => chosen.messages[root]?.label ?? '')].join(' › ')
    const position = `${state.level === 'namespace' ? 'namespaces' : 'types'} · depth ${state.depth} · rows ${first + 1}-${first + shown.rows.length} of ${layout.rows.length}${layout.width > width ? ' · ←→ scrolls' : ''}`
    return (
      <Box flexDirection="column">
        <Text wrap="truncate-end"><Text bold>{path}</Text><Text dimColor> · {position}</Text></Text>
        {chosen.omitted > 0 && <Text color="yellow">{chosen.omitted} later calls left out to fit the pane</Text>}
        <Text bold>{shown.header}</Text>
        {shown.rows.map((line, i) => <Text inverse={first + i === cursor}>{line}</Text>)}
        <Text dimColor wrap="truncate-end">+N calls inside ·{MARKS.recursive} recursive ·{MARKS.repeated} expanded above ·{DISPATCH_MARK} virtual or interface call · ↑↓ select · Enter opens a call · + - depth · z namespaces or types · ← or b back</Text>
      </Box>
    )
  }
  if (!data) return <Text dimColor>Call sequences are still building. s returns to the tree.</Text>
  const errors = data.errors.map(error => <Text color="red">{error}</Text>)
  if (data.state !== 'ready' || data.sequences.length === 0) {
    const reason = data.state === 'ready' ? 'No compiler entry point calls a production method Awl could follow.' : `Call sequences are ${data.state}.`
    return <Box flexDirection="column"><Text dimColor>{reason} s returns to the tree.</Text>{errors}</Box>
  }
  const incomplete = data.complete ? null : <Text color="yellow">evidence incomplete: some calls could not be followed</Text>
  const top = clamp(state.selected - Math.floor(visible / 2), data.sequences.length - visible)
  return (
    <Box flexDirection="column">
      <Text><Text bold>call sequences</Text><Text dimColor> · {data.sequences.length} production entry points · ↑↓ select · Enter opens · s back to the tree</Text></Text>
      {data.omitted > 0 && <Text color="yellow">{data.omitted} more left out to fit the pane</Text>}
      {incomplete}
      {errors}
      {data.sequences.slice(top, top + visible).map((sequence, i) => (
        <Text inverse={top + i === state.selected}>{fitted(`${sequence.function} (${sequence.defined}, ${sequence.calls} calls)`, width - LIST_PREFIX)}</Text>
      ))}
    </Box>
  )
}
