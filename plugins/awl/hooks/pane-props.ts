//! Builds the tree pane's Client props for what it shows: the graph, the sequence list or one
//! sequence, each cut to fit the engine's 100000-character bound on a Client's serialized props.

import type { Sequence, SequenceList, Sequences, ShownSequence, Tree, TreeProps, TreeShow } from '../types'

export const PROPS_BUDGET = 90_000

const size = (value: unknown) => JSON.stringify(value).length

function largestFitting(count: number, fits: (kept: number) => boolean): number {
  let low = 0
  let high = count
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (fits(middle)) low = middle
    else high = middle - 1
  }
  return low
}

export function listOf(data: Sequences): SequenceList {
  const summaries = data.sequences.map(sequence => ({ id: sequence.id, entry: sequence.entry, function: sequence.function, defined: sequence.defined, calls: sequence.messages.length }))
  const shaped = (kept: number): SequenceList => ({ state: data.state, sequences: summaries.slice(0, kept), omitted: summaries.length - kept, complete: data.complete, errors: data.errors })
  return shaped(largestFitting(summaries.length, kept => size(shaped(kept)) <= PROPS_BUDGET))
}

export function shownOf(sequence: Sequence): ShownSequence {
  const shaped = (kept: number): ShownSequence => ({ ...sequence, messages: sequence.messages.slice(0, kept), omitted: sequence.messages.length - kept })
  return shaped(largestFitting(sequence.messages.length, kept => size(shaped(kept)) <= PROPS_BUDGET))
}

export function propsFor(tree: Tree, show: TreeShow): TreeProps {
  if (show.show === 'tree' || !tree.sequences) return { graph: tree.graph, list: null, sequence: null }
  if (show.show === 'list') return { graph: null, list: listOf(tree.sequences), sequence: null }
  const chosen = tree.sequences.sequences.find(sequence => sequence.id === show.id)
  return { graph: null, list: null, sequence: chosen ? shownOf(chosen) : null }
}

export function showOf(data: unknown): TreeShow | null {
  if (typeof data !== 'object' || data === null || !('show' in data)) return null
  if (data.show === 'tree' || data.show === 'list') return { show: data.show }
  if (data.show === 'sequence' && 'id' in data && typeof data.id === 'string') return { show: 'sequence', id: data.id }
  return null
}
