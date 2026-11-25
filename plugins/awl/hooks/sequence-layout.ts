import type { Drawn, DrawnMessage } from './sequence-zoom'

export const GUTTER = 4
export const MIN_COLUMN = 14
export const MAX_COLUMN = 30
export const MARKS = { recursive: ' ↻', repeated: ' ⋯' } as const
export const DISPATCH_MARK = ' ◇'

const LIFELINE = '│'
const ARROW = '─'
const RIGHT_HEAD = '▶'
const LEFT_HEAD = '◀'
const SELF_TURN = '┐'
const ELLIPSIS = '…'
const SPACE = ' '
const ARROW_ROOM = 6
const HEADER_ROOM = 2
const SELF_LABEL_OFFSET = 4
const LABEL_OFFSET = 2

export type Layout = { width: number; column: number; header: string; rows: string[] }

const center = (lane: number, column: number) => GUTTER + lane * column + Math.floor(column / 2)

export function fitted(text: string, room: number): string {
  if (room <= 0) return ''
  return text.length <= room ? text : `${ELLIPSIS}${text.slice(text.length - room + 1)}`
}

const labelled = (message: DrawnMessage) => `${message.label}${message.dispatched ? DISPATCH_MARK : ''}${message.repeat ? MARKS[message.repeat] : ''}${message.hidden > 0 && message.repeat === null ? ` +${message.hidden}` : ''}`

function put(cells: string[], start: number, text: string) {
  for (let i = 0; i < text.length && start + i < cells.length; i++) if (start + i >= 0) cells[start + i] = text[i] ?? SPACE
}

function blank(lanes: number, column: number): string[] {
  const cells = Array.from({ length: GUTTER + lanes * column }, () => SPACE)
  for (let lane = 0; lane < lanes; lane++) cells[center(lane, column)] = LIFELINE
  return cells
}

function row(message: DrawnMessage, lanes: number, column: number): string {
  const cells = blank(lanes, column)
  put(cells, 0, `${message.depth}`.padStart(GUTTER - 1).slice(-(GUTTER - 1)))
  const from = center(message.from, column), to = center(message.to, column), label = labelled(message)
  if (from === to) {
    put(cells, from + 1, `${ARROW}${SELF_TURN}`)
    put(cells, from + SELF_LABEL_OFFSET, fitted(label, column - SELF_LABEL_OFFSET - 1))
    return cells.join('')
  }
  const [low, high] = from < to ? [from, to] : [to, from]
  for (let i = low + 1; i < high; i++) cells[i] = ARROW
  if (from < to) cells[high - 1] = RIGHT_HEAD
  else cells[low + 1] = LEFT_HEAD
  put(cells, low + LABEL_OFFSET + (from < to ? 0 : 1), ` ${fitted(label, high - low - ARROW_ROOM)} `)
  return cells.join('')
}

export function layoutSequence(sequence: Drawn): Layout {
  const lanes = sequence.lifelines.length
  const widest = Math.max(0, ...sequence.messages.map(message => labelled(message).length + ARROW_ROOM), ...sequence.lifelines.map(name => name.length + HEADER_ROOM))
  const column = Math.min(MAX_COLUMN, Math.max(MIN_COLUMN, widest))
  const heading = Array.from({ length: GUTTER + lanes * column }, () => SPACE)
  sequence.lifelines.forEach((name, lane) => {
    const text = fitted(name, column - 1)
    put(heading, center(lane, column) - Math.floor(text.length / 2), text)
  })
  return { width: GUTTER + lanes * column, column, header: heading.join(''), rows: sequence.messages.map(message => row(message, lanes, column)) }
}

export function clamp(value: number, limit: number): number {
  return Math.max(0, Math.min(value, Math.max(0, limit)))
}

export function windowOf(layout: Layout, x: number, y: number, columns: number, rows: number): { header: string; rows: string[] } {
  const left = clamp(x, layout.width - columns), top = clamp(y, layout.rows.length - rows)
  const cut = (line: string) => line.slice(left, left + columns)
  return { header: cut(layout.header), rows: layout.rows.slice(top, top + Math.max(0, rows)).map(cut) }
}
