import type { AgentCli, AgentEffort } from '../types'
import type { CheckCommandSpec } from './checks'
import { contractCreate } from './contract'
import { queueAdd } from './queue'

export interface BlueprintTask {
  number: number
  title: string
  files: string
  acceptance: string
  context: string
  dependencies: number[]
  bundle?: string
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

/**
 * Parse a `feature-architect` Markdown blueprint into structured tasks and context sections.
 */
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

    const field = (label: string): string => {
      const fRe = new RegExp(`^\\s*${label}\\s*:\\s*(.+)$`, 'im')
      return fRe.exec(block)?.[1]?.trim() ?? ''
    }

    const acceptance = field('Acceptance')
    if (!acceptance) {
      throw new Error(`Task ${num} (${title}) is missing an Acceptance field`)
    }

    tasks.push({
      number: num,
      title,
      files: field('Files'),
      acceptance,
      context: field('Context'),
      dependencies: parseDependencies(field('Dependencies')),
      bundle: field('Bundle') || undefined,
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

/**
 * Convert a `feature-architect` blueprint into Trestle contracts and dependency-wired queue items.
 */
export async function importBlueprint(repoRoot: string, options: ImportBlueprintOptions) {
  const parsed = parseBlueprint(options.blueprintMarkdown)
  const cleanPrefix = options.prefix.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '')
  if (!cleanPrefix) throw new Error('prefix must contain at least one alphanumeric character')

  const taskNumbers = new Set(parsed.tasks.map(t => t.number))
  for (const t of parsed.tasks) {
    for (const dep of t.dependencies) {
      if (!taskNumbers.has(dep)) {
        throw new Error(`Task ${t.number} depends on unknown Task ${dep}`)
      }
    }
  }

  const imported: Array<{ taskNumber: number; id: string; contractId: string; dependsOn: string[] }> = []
  for (const task of parsed.tasks) {
    const id = `${cleanPrefix}-task-${task.number}`
    const dependsOn = task.dependencies.map(d => `${cleanPrefix}-task-${d}`)
    const goalLines = [
      `Task ${task.number}: ${task.title}`,
      task.files ? `Predicted files: ${task.files}` : '',
      `Acceptance: ${task.acceptance}`,
      task.context && task.context.toLowerCase() !== 'none' ? `Referenced blueprint context: ${task.context}` : '',
      parsed.criticalDetails ? `\nCritical Details:\n${parsed.criticalDetails}` : '',
      parsed.workedExamples ? `\nWorked Examples:\n${parsed.workedExamples}` : '',
    ].filter(Boolean)

    const acceptanceCriteria = [{ id: 'ac-1', description: task.acceptance }]
    const goal = goalLines.join('\n')
    const contract = await contractCreate(
      repoRoot,
      {
        id,
        title: task.title,
        goal,
        acceptanceCriteria,
        checks: options.checks,
        maxIterations: options.maxIterations,
      },
      options.homeDir,
    )

    await queueAdd(
      repoRoot,
      {
        id,
        title: task.title,
        goal,
        acceptanceCriteria,
        cli: options.cli,
        model: options.model,
        effort: options.effort,
        checks: options.checks,
        maxIterations: options.maxIterations,
        dependsOn,
      },
      options.homeDir,
    )

    imported.push({ taskNumber: task.number, id, contractId: contract.id, dependsOn })
  }

  return { prefix: cleanPrefix, count: imported.length, items: imported }
}
