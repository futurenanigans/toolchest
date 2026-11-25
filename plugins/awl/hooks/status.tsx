import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Report } from '../types'
import { registerModel, startModel } from './model'
import { refreshTree, registerTree, startTree } from './tree'

const PANE = 'awl'
const POLL_MS = 15_000
const HISTORY = 40
const RECENT = 15
const WRITES = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash'])

const report = atom({ plugin: 'awl', key: 'report' } as const, null, { shape: 'report-1' })
const memory = atom({ plugin: 'awl', key: 'memory' } as const, [], { shape: 'memory-1' })

const gb = (bytes: number | null | undefined) => (bytes == null ? '?' : (bytes / 2 ** 30).toFixed(1))

type Segment = { text: string; color?: string }

function segments(r: Report): Segment[] | undefined {
  if (r.state === 'disabled') return undefined
  const w = r.worker
  if (!w) return [{ text: `awl ○ ${r.state}${r.errors[0] ? `: ${r.errors[0]}` : ''}`, color: 'red' }]
  const phase = w.stopping ? 'stopping' : !w.hasPublishedRevision ? 'warming' : r.state === 'busy' ? 'busy' : 'warm'
  const res = w.resources
  const parts: Segment[] = [
    { text: `awl ● ${phase}`, color: phase === 'warm' ? 'green' : 'yellow' },
    { text: `${gb(res?.processTreeWorkingSetBytes)}/${gb(res?.memoryTargetBytes)} GB${res?.cgroupMemoryLimitBytes != null ? ` (cgroup ${gb(res.cgroupMemoryLimitBytes)} GB)` : ''}`, color: res?.memoryPressed ? 'yellow' : 'cyan' },
  ]
  if (res?.memoryPressed) parts.push({ text: 'memory pressure', color: 'yellow' })
  parts.push({ text: `${w.activeRequests} running · ${w.queuedRequests} queued`, color: w.queuedRequests > 0 ? 'yellow' : 'magenta' })
  const s = r.session
  if (s) {
    parts.push({ text: `${s.evaluated} eval`, color: 'blue' })
    parts.push({ text: `${s.denied} blocked`, color: s.denied > 0 ? 'red' : undefined })
    parts.push({ text: `${s.advised} advised`, color: s.advised > 0 ? 'yellow' : undefined })
  }
  return parts
}

let running = false

async function fail($: EngineInterface, reason: string) {
  await update($, report, () => ({ state: 'unavailable', worker: null, session: null, errors: [reason.slice(0, 120)], checkedAt: Date.now() }))
}

async function refresh($: EngineInterface) {
  if (running) return
  running = true
  try {
    const session = await $.session.id()
    const ran = await $.process.run(['awl', 'status', '--session', session], { timeoutMs: 5_000 })
    if (ran.exitCode !== 0) {
      await fail($, `status failed (exit ${ran.exitCode})`)
      return
    }
    const next: Report = { ...JSON.parse(ran.stdout), checkedAt: Date.now() }
    await update($, report, () => next)
    const bytes = next.worker?.resources?.processTreeWorkingSetBytes
    if (bytes != null) await update($, memory, list => [...list, bytes].slice(-HISTORY))
  } catch (failure) {
    await fail($, failure instanceof Error ? failure.message : String(failure))
  } finally {
    running = false
  }
}

export const register: Register = on => {
  registerModel(on)
  registerTree(on)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await startModel($)
    $.ui.status(undefined)
    await startTree($)
    await $.command.register({ name: 'awl-details', description: 'Toggle a pane with the Awl worker and this session\'s activity' })
    void refresh($)
    $.clock.every(POLL_MS, () => refresh($))
    return started
  })

  on('command.run', { command: 'awl-details' }, async $ => {
    if ((await $.ui.panes()).some(pane => pane.id === PANE)) {
      await $.ui.close({ id: PANE })
      return { text: 'Awl pane closed.' }
    }
    await refresh($)
    await $.ui.open({ id: PANE, title: 'Awl' })
    return { text: 'Awl pane opened.' }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (WRITES.has(e.tool)) {
      void refresh($)
      void refreshTree($)
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const r = await read($, report)
    const parts = r && segments(r)
    if (!parts) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {await next(e)}
        <Text>
          {parts.map((part, index) => (
            <Text color={part.color} dimColor={!part.color}>{index ? ' · ' : ''}{part.text}</Text>
          ))}
        </Text>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const r = await read($, report)
    const history = await read($, memory)
    if (!r) return <Text dimColor>Waiting for the first awl status.</Text>
    const w = r.worker
    const s = r.session
    const res = w?.resources
    const peak = history.length ? Math.max(...history) : undefined
    const uptime = w ? Math.round((Date.now() - Date.parse(w.started)) / 60_000) : 0
    return (
      <Box flexDirection="column">
        <Text bold>Worker: {r.state}</Text>
        {r.errors.map(error => <Text color="red">{error}</Text>)}
        {w && (
          <Box flexDirection="column">
            <Text>pid {w.processId} · up {uptime} min · {w.hasPublishedRevision ? 'analysis warm' : 'warming'}{w.stopping ? ' · stopping' : ''}</Text>
            <Text>requests {w.activeRequests} active, {w.queuedRequests} queued · {w.retainedRevisions} retained revision(s)</Text>
            <Text>memory {gb(res?.processTreeWorkingSetBytes)} GB of {gb(res?.memoryCeilingBytes)} GB ceiling{res?.cgroupMemoryLimitBytes != null ? ` of ${gb(res.cgroupMemoryLimitBytes)} GB cgroup limit` : ''} · heap {gb(res?.managedHeapBytes)} GB · peak seen {gb(peak)} GB</Text>
            <Text dimColor>{res?.retainedSessions ?? 0} session base(s) retained · {res?.releasedForMemory ?? 0} released for memory</Text>
            {res && (
              <Text color={res.memoryPressed ? 'yellow' : undefined}>
                target {gb(res.memoryTargetBytes)} GB · machine available {gb(res.machineAvailableBytes)} GB, keeps {gb(res.machineReserveBytes)} GB free · admission {res.memoryPressed ? 'one at a time under memory pressure' : 'concurrent'}
              </Text>
            )}
          </Box>
        )}
        <Text bold>This session</Text>
        {s ? (
          <Box flexDirection="column">
            <Text>{s.callbacks} callbacks · {s.evaluated} writes evaluated</Text>
            <Text color={s.denied > 0 ? 'red' : undefined}>{s.denied} edit(s) blocked</Text>
            <Text color={s.advised > 0 ? 'yellow' : undefined}>{s.advised} advisory report(s) · {s.findings} finding(s) total</Text>
            <Text dimColor>{s.unverified} unverified gap(s)</Text>
            <Text dimColor>last: {s.lastEvent} at {new Date(s.lastAt).toLocaleTimeString()} in {(s.lastMilliseconds / 1000).toFixed(2)} s</Text>
          </Box>
        ) : (
          <Text dimColor>No callbacks recorded by this worker yet.</Text>
        )}
        <Text bold>Recent findings</Text>
        {s?.recent?.length ? (
          <Box flexDirection="column">
            {s.recent.slice(0, RECENT).map(finding => (
              <Box flexDirection="column">
                <Text>
                  <Text color={finding.blocking ? 'red' : 'yellow'}>{finding.blocking ? 'blocked' : 'advised'}</Text>
                  <Text> {finding.rule} </Text>
                  <Text dimColor>{finding.file}{finding.line > 0 ? `:${finding.line}` : ''}</Text>
                </Text>
                <Text dimColor>  {finding.message}</Text>
              </Box>
            ))}
          </Box>
        ) : (
          <Text dimColor>No findings reported in this session.</Text>
        )}
        <Text dimColor>checked {new Date(r.checkedAt).toLocaleTimeString()}</Text>
      </Box>
    )
  })
}
