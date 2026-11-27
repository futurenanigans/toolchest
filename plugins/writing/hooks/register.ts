// After a Write, Edit or MultiEdit, reports em-dashes and en-dashes in the file as context for the model. It runs the
// prose linter's dash rules, so Markdown masking and a project's .writing/allow.txt apply, and it asks for a fix only on
// lines the edit introduced; dashes on untouched lines are named for the user, as the writing-style skill says. It never
// blocks; binary, oversized and vendored files are skipped.
import type { EngineInterface as Engine, Register, ToolCallInput } from 'claude-code'

import { OVERRIDE_DIR, compileRules, dashAdvice, overrideLines } from '../lint/core.mjs'

const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit'])
const MAX_BYTES = 2 * 1024 * 1024
const SKIPPED_DIRS = ['node_modules', '.git']

type Pair = [string, string]

const field = (e: object, key: string): unknown => (e as Record<string, unknown>)[key]
const text = (value: unknown): string => (typeof value === 'string' ? value : '')

function parentOf(path: string): string | null {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  if (cut < 0) return null
  const parent = cut === 0 ? path.slice(0, 1) : path.slice(0, cut)
  return parent === path ? null : parent
}

async function readText($: Engine, path: string): Promise<string | null> {
  if (!(await $.fs.exists(path))) return null
  const stat = await $.fs.stat(path)
  if (stat.kind !== 'file' || stat.size > MAX_BYTES) return null
  const content = await $.fs.read(path)
  return content.includes('\0') ? null : content
}

async function projectRules($: Engine, filePath: string): Promise<ReturnType<typeof compileRules>> {
  for (let dir = parentOf(filePath); dir !== null; dir = parentOf(dir)) {
    const overrides = `${dir}/${OVERRIDE_DIR}`
    if (!(await $.fs.exists(overrides)) && !(await $.fs.exists(`${dir}/.git`))) continue
    const lines = async (name: string) => overrideLines((await readText($, `${overrides}/${name}`)) ?? '')
    return compileRules({ allow: await lines('allow.txt'), stop: await lines('stoplist.txt') })
  }
  return compileRules()
}

function editPairs(e: ToolCallInput, original: string): Pair[] {
  if (e.tool === 'Edit') return [[text(field(e, 'old_string')), text(field(e, 'new_string'))]]
  if (e.tool === 'MultiEdit') {
    const edits = field(e, 'edits')
    return Array.isArray(edits) ? edits.map((edit: object) => [text(field(edit, 'old_string')), text(field(edit, 'new_string'))]) : []
  }
  return [[original, text(field(e, 'content'))]]
}

export const register: Register = on => {
  on('tool.call', async ($, e, next) => {
    const path = field(e, 'file_path')
    if (!EDIT_TOOLS.has(e.tool) || typeof path !== 'string' || path.split(/[\\/]/).some(part => SKIPPED_DIRS.includes(part))) return next(e)

    const original = e.tool === 'Write' ? ((await readText($, path)) ?? '') : ''
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) return ran

    const written = await readText($, path)
    if (written === null) return ran
    const advice = dashAdvice({ path, text: written, rules: await projectRules($, path), pairs: editPairs(e, original) })
    return advice ? { ...ran, context: [...(ran.context ?? []), advice] } : ran
  })
}
