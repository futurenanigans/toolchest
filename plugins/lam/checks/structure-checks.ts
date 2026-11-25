// The advisories that walk code structure: taking one element of a collection, a catch that discards its exception,
// and README content guidance.
import { type Check, countMatches, fileExtension, isBlank, isEditOrWrite } from './text'

const LOOP_HEADER = /\b(for|foreach|while|do)\b|\.(forEach|ForEach|map|Select)\s*\(/
const INDEX_ZERO = String.raw`(?<!\bnew\s{1,50}[\w.<>]{1,200})(?:[\w)\]]|\?\.?)\s*\[\s*0\s*\]`
const SCRIPT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])

type SelectionPatterns = { select: RegExp; remove: RegExp }

function selectionPatterns(extension: string): SelectionPatterns | null {
  if (extension === '.cs') {
    return {
      select: new RegExp(String.raw`\.(First|Last|Single)(OrDefault)?\s*\(|\.ElementAt(OrDefault)?\s*\(\s*0\s*\)|${INDEX_ZERO}`, 'g'),
      remove: /\.(Pop|Dequeue)\s*\(\s*\)/g,
    }
  }
  if (SCRIPT_EXTENSIONS.has(extension)) {
    return {
      select: new RegExp(String.raw`\.find(Last)?\s*\(|\.at\s*\(\s*-?\d+\s*\)|\b(const|let|var)\s+\[\s*\w+\s*\]\s*=|${INDEX_ZERO}`, 'g'),
      remove: /\.(pop|shift)\s*\(\s*\)/g,
    }
  }
  return null
}

const statementStart = (text: string, before: number): number =>
  Math.max(text.lastIndexOf(';', before), text.lastIndexOf('{', before), text.lastIndexOf('}', before)) + 1

function isInsideLoop(text: string, index: number): boolean {
  const start = statementStart(text, Math.max(index - 1, 0))
  if (LOOP_HEADER.test(text.slice(start, index))) return true

  let depth = 0
  for (let i = index - 1; i >= 0; i--) {
    const ch = text[i]
    if (ch === '}') {
      depth++
      continue
    }
    if (ch !== '{') continue
    if (depth > 0) {
      depth--
      continue
    }
    const headerStart = i > 0 ? statementStart(text, i - 1) : 0
    if (LOOP_HEADER.test(text.slice(headerStart, i))) return true
  }
  return false
}

function selectionCount(context: string, region: string, patterns: SelectionPatterns): number {
  const text = context + region
  let count = countMatches(region, patterns.select)
  for (const match of text.matchAll(patterns.remove)) {
    if (match.index < context.length) continue
    if (!isInsideLoop(text, match.index)) count++
  }
  return count
}

export const collectionFirst: Check = {
  name: 'collection-first',
  advise: ({ tool, newText, oldText, filePath, contextBefore }) => {
    if (!isEditOrWrite(tool) || isBlank(newText) || isBlank(filePath)) return null
    const patterns = selectionPatterns(fileExtension(filePath))
    if (patterns === null) return null
    if (selectionCount(contextBefore, newText, patterns) <= selectionCount(contextBefore, oldText, patterns)) return null
    return `This edit takes one element from a collection. The question is not whether the result is null-checked; it is whether the logic should operate on one item at all. Taking one is correct only when you can name which of these holds:

- Unique key: the predicate identifies exactly one item by design, and duplicates are impossible.
- Intentional first or last: the first or last item is genuinely what is wanted, and discarding the rest is correct.
- Singleton branch: the count was checked, and this line only runs when exactly one item exists.

If none holds, the code works on the single-item case and silently drops the rest when there are more. Iterate the matches; a null check on the dropped result does not make it correct.`
  },
}

const CATCH = /\bcatch\b\s*(?:\(\s*(?:[\w.<>?]+\s+)?(?<name>[A-Za-z_]\w*)?\s*\))?/g
const HANDLED = [
  /\bthrow\b/,
  /\bconsole\.(?:error|warn)\b/,
  /\b(?:_?[Ll]ogger|_?[Ll]og|\w*Logger)\s*\.\s*\w+\s*\(/,
  /\bstderr\b/,
  /\breject\s*\(/,
  /\bExceptionDispatchInfo\b/,
]
const BRACE_CATCH_EXTENSIONS = new Set([...SCRIPT_EXTENSIONS, '.cs', '.java', '.kt', '.swift'])

type CatchBlock = { start: number; end: number; name: string }

function braceCatchBlocks(text: string): CatchBlock[] {
  const blocks: CatchBlock[] = []
  CATCH.lastIndex = 0
  for (let found = CATCH.exec(text); found !== null; found = CATCH.exec(text)) {
    let open = -1
    for (let scan = found.index + found[0].length; scan < text.length; scan++) {
      const ch = text[scan]
      if (ch === '{') {
        open = scan
        break
      }
      if (ch === ';' || ch === '}') break
    }
    if (open < 0) continue

    let depth = 1
    let i = open + 1
    while (i < text.length && depth > 0) {
      if (text[i] === '{') depth++
      else if (text[i] === '}') depth--
      if (depth > 0) i++
    }
    blocks.push({ start: open + 1, end: i, name: found.groups?.name ?? '' })
    CATCH.lastIndex = open + 1
  }
  return blocks
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function swallowingBraceCatchCount(text: string): number {
  const blocks = braceCatchBlocks(text)
  return blocks.filter(block => {
    const body = [...text.slice(block.start, block.end)]
    for (const inner of blocks) {
      if (inner.start <= block.start || inner.end > block.end) continue
      body.fill(' ', inner.start - block.start, inner.end - block.start)
    }
    const bodyText = body.join('')
    if (HANDLED.some(pattern => pattern.test(bodyText))) return false
    if (block.name === '') return true
    return !new RegExp(String.raw`(?:[(,:]|\breturn\b)\s*${escapeRegExp(block.name)}\s*[),;}]`).test(bodyText)
  }).length
}

function swallowingCount(text: string, extension: string): number {
  if (isBlank(text)) return 0
  if (BRACE_CATCH_EXTENSIONS.has(extension)) return swallowingBraceCatchCount(text)
  if (extension === '.py') return countMatches(text, /\bexcept\b[^\n:]*:\s*(\r?\n)\s*pass\b/)
  if (extension === '.rb') return countMatches(text, /\brescue\b[^\n]*(\r?\n)\s*end\b/)
  return 0
}

export const swallowedCatch: Check = {
  name: 'swallowed-catch',
  advise: ({ tool, newText, oldText, filePath }) => {
    if (!isEditOrWrite(tool) || isBlank(newText) || isBlank(filePath)) return null
    const extension = fileExtension(filePath)
    const added = swallowingCount(newText, extension)
    if (added === 0 || added <= swallowingCount(oldText, extension)) return null
    return `This edit adds an exception handler that discards the exception: it neither rethrows, logs, nor uses the caught exception. The call appears to succeed while the error is gone.

The right shape depends on where the handler sits:
  - At a boundary (HTTP handler, message consumer, CLI entry, file I/O): catch, attach the exception as the inner exception or cause, then rethrow or return a typed error that carries it.
  - In interior code: let the exception propagate and do not add a handler at all.
  - Intentional degradation (cleanup path or background task that must not fail its caller): log the exception with its stack trace, and pin the degradation with a test that names it.`
  },
}

export const isReadme = (path: string | undefined): boolean =>
  !isBlank(path) && /^readme\.md$/i.test(path.replaceAll('\\', '/').replace(/^.*\//, ''))

export const readmeGuidance: Check = {
  name: 'readme-guidance',
  advise: ({ tool, filePath, isFirstReadmeEdit }) => {
    if (!isEditOrWrite(tool) || !isReadme(filePath)) return null
    if (tool === 'Edit' && !isFirstReadmeEdit) return null
    return README_GUIDANCE
  },
}

const README_GUIDANCE = `README guidance. The job of this file is to get a reader from "what is this" to running code, and nothing else.

The list below is not a checklist to fill in. Write a section only where this project has something real to say under it, and read the answer out of the repo rather than recalling it. A heading with invented or padded content under it costs the reader more than a missing heading does.

Candidate sections, in the order they earn their place:
- What the project does and why it exists, in a line or two. The "why" heads off "why not just use X".
- Prerequisites and external dependencies that actually gate a first run (toolchain version, database, message broker, Docker).
- Clone, restore, build, run as literal copy-pasteable commands.
- A minimal working example: the smallest snippet that does something useful. Usually the highest-value section in the file, and often the only one a reader reaches. Link it to a compiled call site (a test, a sample project) where one exists, so the build catches the snippet going stale instead of a reader catching it.
- Configuration a reader cannot start without, pointing at an example config file for the full set.
- Further usage examples, where the API surface is non-obvious (fluent builders, middleware or plugin registration, dependency wiring).
- Project layout, only where it is non-standard or spans several projects. Give the top-level split and the convention that decides where new code goes, which is the part that constrains a contributor.
- How to run the tests, plus any setup they need (test containers, local DB).
- Contributing conventions, where others touch the repo.

Prefer content that stays true after the next commit, and keep this file off the maintenance path of ordinary development. Adding a folder, renaming a class, or taking a package reference must not require an edit here. So do not enumerate folder names, file names, types, or the packages a project consumes; state the convention that governs them and let the reader read the specifics from the repo. What a repo publishes is a separate matter from what it contains: the packages a library ships are its public contract, and adding one is a deliberate release rather than a routine commit, so name them and say what each is for. Name a version only where it gates a first run, and link the source of truth instead of copying values out of a project manifest or config file.

Leave out entirely:
- Full API documentation. Generated API docs own that.
- Changelog. That is CHANGELOG.md.
- Architecture rationale and ADRs. Link to /docs/adr/ instead of burying the getting-started content.
- Screenshots of code. Paste a fenced block.
- An inventory of the packages a project consumes. That list already lives in the project manifest. Call out a dependency only where its presence needs explaining. Packages the repo publishes are the opposite case and belong here.
- Deployment secrets, connection strings, and infra topology. Those live in the internal runbook.
- A license section in a private repo.

Two litmus tests. Could someone who cloned this cold get something running in under five minutes, and find every claim in the file still true when they did? And does any routine change to the code force an edit here? Content that fails the second one is too specific to be worth carrying.`
