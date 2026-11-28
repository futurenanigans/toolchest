import type { AgentCli, AgentEffort } from '../types'
import type { CheckCommandSpec } from './checks'
import { queueAddAll, queueWorktreeId, type QueueAddParams } from './queue'

export interface BlueprintTask {
  number: number
  title: string
  files: string
  acceptance: string
  context: string
  dependencies: number[]
  bundle?: { first: number; last: number }
}

export interface ParsedBlueprint {
  orientation: string
  architectureDecision: string
  criticalDetails: string
  workedExamples: string
  tasks: BlueprintTask[]
}

function extractSection(markdown: string, heading: string): string {
  const re = new RegExp(`^###\\s+${heading}\\s*$`, 'im')
  const match = re.exec(markdown)
  if (!match) return ''
  const after = markdown.slice(match.index + match[0].length)
  const nextHeading = /^###\s+/m.exec(after)
  return (nextHeading ? after.slice(0, nextHeading.index) : after).trim()
}

const TASK_FIELDS = ['Files', 'Acceptance', 'Context', 'Dependencies', 'Bundle']
const FIELD_LINE = new RegExp(`^\\s*(${TASK_FIELDS.join('|')})\\s*:\\s*(.*)$`, 'i')

function taskFields(block: string): Map<string, string> {
  const fields = new Map<string, string[]>()
  let current: string[] | undefined
  for (const line of block.split(/\r?\n/)) {
    const start = FIELD_LINE.exec(line)
    if (start) {
      const key = start[1]!.toLowerCase()
      current = fields.get(key) ? undefined : [start[2]!]
      if (current) fields.set(key, current)
    } else if (!line.trim()) {
      current = undefined
    } else {
      current?.push(line.trim())
    }
  }
  return new Map(Array.from(fields, ([key, lines]) => [key, lines.join('\n').trim()]))
}

function parseBundle(raw: string, taskNumber: number): { first: number; last: number } | undefined {
  if (!raw || raw.toLowerCase() === 'none') return undefined
  const range = /^(\d+)\s*\.\.\s*(\d+)\b/.exec(raw)
  const first = Number(range?.[1])
  const last = Number(range?.[2])
  if (!range || first >= last || taskNumber < first || taskNumber > last) {
    throw new Error(`Task ${taskNumber} has an unusable Bundle marker '${raw}'; expected a range such as 2..3 that includes the task`)
  }
  return { first, last }
}

function parseDependencies(raw: string): number[] {
  const trimmed = raw.trim().toLowerCase()
  if (!trimmed || trimmed === 'none' || trimmed === 'n/a') return []
  const nums: number[] = []
  for (const m of trimmed.matchAll(/\b(\d+)\b/g)) {
    const digit = m[1]
    if (!digit) continue
    const n = Number.parseInt(digit, 10)
    if (Number.isFinite(n) && !nums.includes(n)) nums.push(n)
  }
  return nums
}

export function parseBlueprint(markdown: string): ParsedBlueprint {
  const orientation = extractSection(markdown, 'Orientation')
  const architectureDecision = extractSection(markdown, 'Architecture Decision')
  const criticalDetails = extractSection(markdown, 'Critical Details')
  const workedExamples = extractSection(markdown, 'Worked Examples')
  const buildSequence = extractSection(markdown, 'Build Sequence')

  if (!buildSequence) {
    throw new Error('Blueprint is missing a "### Build Sequence" section')
  }

  const tasks: BlueprintTask[] = []
  const taskHeaderRe = /(?:^|\n)(?:[-*]|\d+\.)?\s*Task\s+(\d+)\s*:\s*([^\n]+)/gi
  const matches = [...buildSequence.matchAll(taskHeaderRe)]

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const numStr = m?.[1]
    const rawTitle = m?.[2]
    if (!m || !numStr || !rawTitle) continue
    const num = Number.parseInt(numStr, 10)
    const title = rawTitle.trim()
    const blockStart = (m.index ?? 0) + m[0].length
    const nextMatch = matches[i + 1]
    const blockEnd = nextMatch?.index ?? buildSequence.length
    const block = buildSequence.slice(blockStart, blockEnd)

    const fields = taskFields(block)
    const field = (label: string): string => fields.get(label) ?? ''

    const acceptance = field('acceptance')
    if (!acceptance) {
      throw new Error(`Task ${num} (${title}) is missing an Acceptance field`)
    }

    tasks.push({
      number: num,
      title,
      files: field('files'),
      acceptance,
      context: field('context'),
      dependencies: parseDependencies(field('dependencies')),
      bundle: parseBundle(field('bundle'), num),
    })
  }

  if (tasks.length === 0) {
    throw new Error('No "Task N: <title>" entries found under "### Build Sequence"')
  }

  return { orientation, architectureDecision, criticalDetails, workedExamples, tasks }
}

export interface ImportBlueprintOptions {
  blueprintMarkdown: string
  prefix: string
  cli?: AgentCli
  model?: string
  effort?: AgentEffort
  checks?: CheckCommandSpec[]
  maxIterations?: number
  homeDir?: string
}

function bundleGroups(tasks: readonly BlueprintTask[]): BlueprintTask[][] {
  const ranges: Array<{ first: number; last: number }> = []
  for (const range of tasks.flatMap(t => t.bundle ?? []).sort((a, b) => a.first - b.first)) {
    const previous = ranges.at(-1)
    if (previous && range.first <= previous.last) previous.last = Math.max(previous.last, range.last)
    else ranges.push({ ...range })
  }
  const groups = new Map<number, BlueprintTask[]>()
  for (const task of tasks) {
    const range = ranges.find(r => task.number >= r.first && task.number <= r.last)
    const key = range?.first ?? task.number
    groups.set(key, [...(groups.get(key) ?? []), task])
  }
  return Array.from(groups.values())
}

function taskGoal(task: BlueprintTask): string {
  return [
    `Task ${task.number}: ${task.title}`,
    task.files ? `Predicted files: ${task.files}` : '',
    `Acceptance: ${task.acceptance}`,
    task.context && task.context.toLowerCase() !== 'none' ? `Referenced blueprint context: ${task.context}` : '',
  ].filter(Boolean).join('\n')
}

export async function importBlueprint(repoRoot: string, options: ImportBlueprintOptions) {
  const parsed = parseBlueprint(options.blueprintMarkdown)
  const cleanPrefix = options.prefix.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '')
  if (!cleanPrefix) throw new Error('prefix must contain at least one alphanumeric character')

  const groups = bundleGroups(parsed.tasks)
  const itemIdByTask = new Map<number, string>()
  for (const group of groups) {
    for (const task of group) {
      if (itemIdByTask.has(task.number)) throw new Error(`Task ${task.number} appears more than once in the Build Sequence`)
      itemIdByTask.set(task.number, `${cleanPrefix}-task-${group[0]!.number}`)
    }
  }
  for (const t of parsed.tasks) {
    for (const dep of t.dependencies) {
      if (!itemIdByTask.has(dep)) {
        throw new Error(`Task ${t.number} depends on unknown Task ${dep}`)
      }
    }
  }

  const shared = [
    parsed.criticalDetails ? `Critical Details:\n${parsed.criticalDetails}` : '',
    parsed.workedExamples ? `Worked Examples:\n${parsed.workedExamples}` : '',
  ].filter(Boolean)

  const batch: QueueAddParams[] = groups.map(group => {
    const id = itemIdByTask.get(group[0]!.number)!
    const dependsOn = new Set(group.flatMap(t => t.dependencies).map(d => itemIdByTask.get(d)!))
    dependsOn.delete(id)
    return {
      id,
      title: group.map(t => t.title).join(' + '),
      goal: [...group.map(taskGoal), ...shared].join('\n\n'),
      acceptanceCriteria: group.map((t, i) => ({ id: `ac-${i + 1}`, description: t.acceptance })),
      cli: options.cli,
      model: options.model,
      effort: options.effort,
      checks: options.checks,
      maxIterations: options.maxIterations,
      dependsOn: [...dependsOn],
    }
  })
  await queueAddAll(repoRoot, batch, options.homeDir)

  const items = parsed.tasks.map(task => {
    const item = batch.find(b => b.id === itemIdByTask.get(task.number))!
    return { taskNumber: task.number, id: item.id, contractId: queueWorktreeId(item.id), dependsOn: item.dependsOn ?? [] }
  })
  return { prefix: cleanPrefix, count: batch.length, items }
}
