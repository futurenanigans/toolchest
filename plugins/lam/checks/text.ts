// What a check reads from one tool call, and the path and pattern helpers the checks share.

export type CheckInput = {
  tool: string
  filePath?: string
  command?: string
  newText?: string
  oldText: string
  isFirstReadmeEdit: boolean
}

export type Check = { name: string; advise: (input: CheckInput) => string | null; guidance?: true; deny?: true }

export const isEditOrWrite = (tool: string): boolean => tool === 'Edit' || tool === 'Write'

export const isRead = (tool: string): boolean => tool === 'Read'

export const isShell = (tool: string): boolean => tool === 'Bash' || tool === 'PowerShell'

export const isBlank = (text: string | undefined): text is undefined => text === undefined || text.trim() === ''

const TEST_PATH_INSENSITIVE = [
  /\.test\.(ts|tsx|js|jsx|mjs|cjs)$/i,
  /\.spec\.(ts|tsx|js|jsx|mjs|cjs)$/i,
  /(^|\/)test_[^/]*\.py$/i,
  /_test\.py$/i,
  /_test\.go$/i,
  /_test\.rs$/i,
  /_spec\.rb$/i,
  /(^|\/)tests?\//i,
  /(^|\/)__tests__\//i,
  /(^|\/)spec\//i,
]

// Case-sensitive so Contest.cs is not a test file (test: a .NET Tests suffix is matched case-sensitively).
const TEST_PATH_SENSITIVE = [/Tests?\.cs$/, /(^|\/)[^/]*\.(Unit|Integration|Functional|Acceptance|E2E)?Tests?\//]

export function looksLikeTestFile(path: string | undefined): boolean {
  if (isBlank(path)) return false
  const normalized = path.replaceAll('\\', '/')
  return [...TEST_PATH_INSENSITIVE, ...TEST_PATH_SENSITIVE].some(pattern => pattern.test(normalized))
}

export const countMatches = (text: string, pattern: RegExp): number =>
  [...text.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`))].length

export type LabelledPattern = { pattern: RegExp; label: string }

export function newlyAddedLabels(newText: string, oldText: string, patterns: readonly LabelledPattern[]): string[] {
  return patterns.filter(({ pattern }) => countMatches(newText, pattern) > countMatches(oldText, pattern)).map(({ label }) => label)
}
