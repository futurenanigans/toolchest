import type { Graph } from '../types'

export type Group = { key: string; label: string; entry: boolean; changed: boolean; drillable: boolean; outside: string[]; outsideUsers: string[] }

export type Level = { focus: string; parent: string | null; groups: Group[]; marks: boolean[][]; namespaces: number }

export const ordinal = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0)

const segments = (name: string) => (name ? name.split('.') : [])

export function rootOf(names: string[]): string {
  if (!names.length) return ''
  const parts = names.map(segments)
  const shared: string[] = []
  for (let i = 0; parts.every(p => p.length > i + 1 && p[i] === parts[0]![i]); i++) shared.push(parts[0]![i]!)
  return shared.join('.')
}

const inside = (name: string, focus: string) => !focus || name === focus || name.startsWith(focus + '.')

const keyUnder = (name: string, focus: string) => {
  const depth = segments(focus).length
  return segments(name).slice(0, depth + 1).join('.')
}

function order(keys: string[], depends: (from: string, to: string) => boolean): string[] {
  const incoming = new Map(keys.map(key => [key, keys.filter(other => other !== key && depends(other, key)).length]))
  const left = new Set(keys)
  const out: string[] = []
  while (left.size) {
    const pool = [...left]
    const next = pool.filter(key => incoming.get(key) === 0).sort(ordinal)[0]
      ?? pool.sort((a, b) => incoming.get(a)! - incoming.get(b)! || ordinal(a, b))[0]!
    left.delete(next)
    out.push(next)
    for (const key of left) if (depends(next, key)) incoming.set(key, incoming.get(key)! - 1)
  }
  return out
}

export function levelOf(graph: Graph, focus: string): Level {
  const root = rootOf(graph.nodes.map(node => node.name))
  const names = new Map(graph.nodes.map(node => [node.id, node.name]))
  const members = graph.nodes.filter(node => inside(node.name, focus))
  const keys = [...new Set(members.map(node => keyUnder(node.name, focus)))]
  const pairs = new Set<string>()
  const outside = new Map<string, Set<string>>(keys.map(key => [key, new Set()]))
  const outsideUsers = new Map<string, Set<string>>(keys.map(key => [key, new Set()]))
  const outerDepth = Math.max(segments(focus).length, segments(root).length + 1)
  for (const edge of graph.edges) {
    const from = names.get(edge.source), to = names.get(edge.target)
    if (from === undefined || to === undefined) continue
    if (!inside(from, focus)) {
      if (inside(to, focus)) outsideUsers.get(keyUnder(to, focus))!.add(segments(from).slice(0, outerDepth).join('.'))
      continue
    }
    const source = keyUnder(from, focus)
    if (inside(to, focus)) {
      const target = keyUnder(to, focus)
      if (target !== source) pairs.add(source + '\n' + target)
    } else outside.get(source)!.add(segments(to).slice(0, outerDepth).join('.'))
  }
  const depends = (from: string, to: string) => pairs.has(from + '\n' + to)
  const ordered = order(keys, depends)
  const prefixLength = focus ? focus.length + 1 : 0
  const groups = ordered.map(key => {
    const within = members.filter(node => node.name === key || node.name.startsWith(key + '.'))
    return {
      key,
      label: key === focus ? '(itself)' : key.slice(prefixLength),
      entry: within.some(node => node.entry),
      changed: within.some(node => node.changed),
      drillable: key !== focus && within.some(node => node.name !== key),
      outside: [...outside.get(key)!].sort(ordinal).map(name => name.slice(root ? root.length + 1 : 0) || name),
      outsideUsers: [...outsideUsers.get(key)!].sort(ordinal).map(name => name.slice(root ? root.length + 1 : 0) || name),
    }
  })
  return {
    focus,
    parent: focus && focus !== root ? segments(focus).slice(0, -1).join('.') : null,
    groups,
    marks: ordered.map(from => ordered.map(to => depends(from, to))),
    namespaces: members.length,
  }
}

export const HOTKEYS = '123456789acefghijklmnopqrtvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

export type Neighbours = { uses: Group[]; usedBy: Group[] }

export function neighboursOf(level: Level, key: string): Neighbours | undefined {
  const index = level.groups.findIndex(group => group.key === key)
  if (index < 0) return undefined
  return {
    uses: level.groups.filter((_, j) => level.marks[index]![j]),
    usedBy: level.groups.filter((_, i) => level.marks[i]![index]),
  }
}

