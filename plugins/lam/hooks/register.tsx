// Local Agent Monitor. Runs the advisory checks on every Edit, Write and shell call and attaches their warnings to
// the tool result for the model, counts each warning per check, keeps the status line current, draws the counts in
// the /guard-stats pane, and tells the model how the session-start git fetch went.
import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register, ToolCallInput } from 'claude-code'

import type { LamCounts, StatusSegment } from '../types'
import { type CheckInput, CHECKS, adviseAll, isReadme } from '../checks'
import { fetchRemotes, statusSegments } from './status'

const PANE = 'guard-stats'
const PANE_TITLE = 'Guardrail corrections'
const corrections = atom({ plugin: 'lam', key: 'counts' } as const, {} as LamCounts, { shape: 'counts-1' })
const status = atom({ plugin: 'lam', key: 'status' } as const, [] as StatusSegment[], { shape: 'status-1' })
const STATUS_SEPARATOR = ' | '
const FETCH_SECTION = 'lam:fetch'
const SHELL_TOOLS = new Set(['Bash', 'PowerShell'])

const readmeGuided = { plugin: 'lam', key: 'readmeGuided' } as const

const stringField = (e: object, key: string): string | undefined => {
  const value = (e as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

async function readIfFile($: Engine, path: string | undefined): Promise<string> {
  if (path === undefined || !(await $.fs.exists(path))) return ''
  return (await $.fs.stat(path)).kind === 'file' ? $.fs.read(path) : ''
}

async function checkInput($: Engine, e: ToolCallInput): Promise<CheckInput | null> {
  const tool = e.tool
  if (SHELL_TOOLS.has(tool)) {
    return { tool, command: stringField(e, 'command'), oldText: '', contextBefore: '', isFirstReadmeEdit: false }
  }
  if (tool !== 'Edit' && tool !== 'Write') return null

  const filePath = stringField(e, 'file_path')
  const onDisk = await readIfFile($, filePath)
  const oldString = stringField(e, 'old_string') ?? ''
  const regionStart = tool === 'Edit' ? onDisk.indexOf(oldString) : -1
  const isFirstReadmeEdit = isReadme(filePath) && (await $.state.get(readmeGuided)).value !== true

  return {
    tool,
    filePath,
    newText: tool === 'Edit' ? stringField(e, 'new_string') : stringField(e, 'content'),
    oldText: tool === 'Edit' ? oldString : onDisk,
    contextBefore: regionStart > 0 ? onDisk.slice(0, regionStart) : '',
    isFirstReadmeEdit,
  }
}

async function refreshStatus($: Engine): Promise<void> {
  const segments = await statusSegments($)
  await update($, status, () => segments)
}

export const register: Register = on => {
  let fetchOutcome: Promise<string | null> = Promise.resolve(null)

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'guard-stats', description: 'Show how often each guardrail check corrected the model this session' })
    const started = await next(e)
    fetchOutcome = fetchRemotes($, e.cwd)
    await refreshStatus($)
    return started
  })

  on('turn.complete', async ($, e, next) => {
    const completed = await next(e)
    await refreshStatus($)
    return completed
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const fetched = await fetchOutcome
    if (!fetched) return composed
    return { sections: [...composed.sections, { id: FETCH_SECTION, text: fetched, scope: 'session' as const }] }
  })

  on('command.run', { command: 'guard-stats' }, async $ => {
    await $.ui.open({ id: PANE, title: PANE_TITLE })
    return { text: 'Guardrail corrections pane opened.' }
  })

  on('tool.call', async ($, e, next) => {
    const input = await checkInput($, e)
    const advice = input === null ? [] : adviseAll(input)
    if (advice.length === 0) return next(e)

    const ran = await next(e)
    if (ran.deny !== undefined) return ran

    await update($, corrections, current => {
      const tallied: LamCounts = { ...current }
      for (const { check } of advice) tallied[check] = (tallied[check] ?? 0) + 1
      return tallied
    })
    await refreshStatus($)
    if (input?.isFirstReadmeEdit) await $.state.set(readmeGuided, true)
    return { ...ran, context: [...(ran.context ?? []), advice.map(a => a.message).join('\n\n')] }
  })

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const segments = await read($, status)
    if (segments.length === 0) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {await next(e)}
        <Text>
          {segments.flatMap((segment, index) => [
            ...(index ? [<Text dimColor>{STATUS_SEPARATOR}</Text>] : []),
            <Text color={segment.color}>{segment.text}</Text>,
          ])}
        </Text>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const current = await read($, corrections)
    const total = Object.values(current).reduce((sum, n) => sum + n, 0)
    const width = Math.max(...CHECKS.map(c => c.name.length))
    const rows = CHECKS.map(c => ({ name: c.name, count: current[c.name] ?? 0 })).sort((a, b) => b.count - a.count)

    return (
      <Box flexDirection="column">
        <Text bold>{total} correction{total === 1 ? '' : 's'} this session</Text>
        {rows.map(row => (
          <Text dimColor={row.count === 0}>
            {row.name.padEnd(width)}  {String(row.count).padStart(4)}
          </Text>
        ))}
      </Box>
    )
  })
}
