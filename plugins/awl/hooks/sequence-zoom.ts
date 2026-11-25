//! Raises or lowers a call sequence's level of detail: lifelines are namespaces or declaring types, a call
//! that stays inside one lifeline at that level folds into the call that entered it, and any call can
//! become the root of the view. Only calls down to a chosen depth below the root are drawn, and each drawn
//! call says how many calls its subtree holds.

import type { Sequence, SequenceMessage } from '../types'
import { rootOf } from './levels'

export type ZoomLevel = 'namespace' | 'type'
export type DrawnMessage = SequenceMessage & { hidden: number; source: number }
export type Drawn = { lifelines: string[]; messages: DrawnMessage[] }

const SEPARATOR = '.'
const GLOBAL = '(global)'
const PARAMETERS = '('

const afterRoot = (name: string, root: string) => (root && name.startsWith(root + SEPARATOR) ? name.slice(root.length + 1) : name) || GLOBAL

const baseName = (label: string) => (label.includes(PARAMETERS) ? label.slice(0, label.indexOf(PARAMETERS)) : label)

export function subtreeEnd(messages: readonly SequenceMessage[], index: number): number {
  const depth = messages[index]?.depth ?? 0
  let end = index + 1
  while (end < messages.length && (messages[end]?.depth ?? 0) > depth) end++
  return end
}

function overloaded(messages: readonly SequenceMessage[]): Set<string> {
  const labels = new Map<string, Set<string>>()
  for (const message of messages) {
    const base = baseName(message.label)
    labels.set(base, (labels.get(base) ?? new Set()).add(message.label))
  }
  return new Set([...labels].filter(([, variants]) => variants.size > 1).map(([base]) => base))
}

export function zoomed(sequence: Sequence, root: number, level: ZoomLevel, maxDepth = Number.POSITIVE_INFINITY): Drawn {
  const messages = sequence.messages
  const start = Math.min(Math.max(0, root), Math.max(0, messages.length - 1))
  const end = subtreeEnd(messages, start)
  const namespaceRoot = rootOf(sequence.lifelines.map(lifeline => lifeline.namespace))
  const keyOf = (lane: number) => (level === 'type' ? `${lane}` : sequence.lifelines[lane]?.namespace ?? '')
  const nameOf = (lane: number) => {
    const lifeline = sequence.lifelines[lane]
    return afterRoot(level === 'type' ? lifeline?.name ?? '' : lifeline?.namespace ?? '', namespaceRoot)
  }
  const repeatedNames = overloaded(messages)
  const lanes = new Map<string, number>()
  const lifelines: string[] = []
  const lane = (index: number) => {
    const key = keyOf(index)
    const known = lanes.get(key)
    if (known !== undefined) return known
    lanes.set(key, lifelines.length)
    lifelines.push(nameOf(index))
    return lifelines.length - 1
  }
  const drawn: DrawnMessage[] = []
  const ancestors: { depth: number; shown: boolean }[] = []
  for (let index = start; index < end; index++) {
    const message = messages[index]
    if (!message) continue
    while (ancestors.length && (ancestors[ancestors.length - 1]?.depth ?? 0) >= message.depth) ancestors.pop()
    const depth = ancestors.filter(ancestor => ancestor.shown).length
    const shown = index === start || (keyOf(message.from) !== keyOf(message.to) && depth <= maxDepth)
    if (shown) {
      const base = baseName(message.label)
      drawn.push({
        ...message,
        from: lane(message.from),
        to: lane(message.to),
        label: repeatedNames.has(base) ? message.label : base,
        depth,
        hidden: subtreeEnd(messages, index) - index - 1,
        source: index,
      })
    }
    ancestors.push({ depth: message.depth, shown })
  }
  return { lifelines, messages: drawn }
}
