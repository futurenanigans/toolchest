export type Resources = {
  processTreeWorkingSetBytes: number | null
  processTreeProcesses: number
  managedHeapBytes: number
  retainedSessions: number
  memoryCeilingBytes: number
  releasedForMemory: number
  memoryPressed: boolean
  memoryTargetBytes: number
  machineAvailableBytes: number | null
  cgroupMemoryLimitBytes?: number | null
  machineReserveBytes: number
}

export type Worker = {
  processId: number
  started: string
  target: string
  activeRequests: number
  queuedRequests: number
  retainedRevisions: number
  hasPublishedRevision: boolean
  stopping: boolean
  resources?: Resources
}

export type SessionFinding = {
  rule: string
  file: string
  line: number
  blocking: boolean
  message: string
  at: string
}

export type Activity = {
  callbacks: number
  evaluated: number
  denied: number
  advised: number
  findings: number
  unverified: number
  lastEvent: string
  lastAt: string
  lastMilliseconds: number
  recent: SessionFinding[]
}

/** One `awl status --session <id>` line, as the CLI prints it. */
export type Report = {
  state: string
  worker: Worker | null
  session: Activity | null
  errors: string[]
  checkedAt: number
}

/** One `awl graph` line, as the CLI prints it. */
export type Graph = {
  state: string
  base: string | null
  nodes: { id: string; name: string; entry: boolean; changed: boolean }[]
  edges: { source: string; target: string }[]
  changedOutside: string[]
  complete: boolean
  errors: string[]
}

/** One call in an `awl graph --sequences` sequence, between lifeline indices. */
export type SequenceMessage = { from: number; to: number; label: string; depth: number; repeat: 'recursive' | 'repeated' | null; dispatched: boolean }

export type SequenceLifeline = { name: string; namespace: string }

export type Sequence = { id: string; entry: string; function: string; defined: string; lifelines: SequenceLifeline[]; messages: SequenceMessage[] }

/** One `awl graph --sequences` line, as the CLI prints it. */
export type Sequences = {
  state: string
  sequences: Sequence[]
  complete: boolean
  errors: string[]
}

export type SequenceSummary = { id: string; entry: string; function: string; defined: string; calls: number }

export type SequenceList = {
  state: string
  sequences: SequenceSummary[]
  omitted: number
  complete: boolean
  errors: string[]
}

export type ShownSequence = Sequence & { omitted: number }

export type TreeShow = { show: 'tree' } | { show: 'list' } | { show: 'sequence'; id: string }

export type TreeProps = { graph: Graph | null; list: SequenceList | null; sequence: ShownSequence | null }

/** The last `awl graph` and `awl graph --sequences` results the tree pane groups and draws. */
export type Tree = {
  state: string
  graph: Graph | null
  sequences: Sequences | null
  errors: string[]
  computedAt: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'awl': { report: Shaped<Report | null>; memory: Shaped<number[]>; tree: Shaped<Tree | null>; treeShow: Shaped<TreeShow> }
  }
}
