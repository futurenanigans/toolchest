// The pattern advisories: credentials, skipped tests and test deletion, each firing only when an edit holds more
// matches than the text it replaces, and a verification command whose exit code a pipe hides.
import { type Check, type CheckInput, type LabelledPattern, countMatches, isBlank, isEditOrWrite, isShell, looksLikeTestFile, newlyAddedLabels } from './text'
import { maskComments, maskQuoted, pipelines } from './shell'

const PLACEHOLDER = String.raw`[{$<*%]|your|change|placeholder|example|x{3}`

const TOKEN_PATTERNS: readonly LabelledPattern[] = [
  { pattern: /\b(?:AKIA|ASIA)(?!X{16}|[A-Z0-9]{9}EXAMPLE)[A-Z0-9]{16}\b/, label: 'AWS access key' },
  { pattern: /\bgh[pousr]_[A-Za-z0-9]{36}\b/, label: 'GitHub token' },
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{82}\b/, label: 'GitHub fine-grained PAT' },
  { pattern: /\bsk-ant-[A-Za-z0-9_-]{40,}/, label: 'Anthropic API key' },
  { pattern: /\bsk-proj-[A-Za-z0-9_-]{32,}/, label: 'OpenAI project API key' },
  { pattern: /\bsk-[A-Za-z0-9]{48}/, label: 'OpenAI API key' },
  { pattern: /\b[sr]k_live_[A-Za-z0-9]{20,}/, label: 'Stripe live key' },
  { pattern: /\bxox[abposr]-[A-Za-z0-9-]{10,}/, label: 'Slack token' },
  { pattern: /\bAIza[0-9A-Za-z_-]{35}\b/, label: 'Google API key' },
  { pattern: /AccountKey=[A-Za-z0-9+/]{86}==/, label: 'Azure Storage account key' },
  { pattern: /[?&]sig=[A-Za-z0-9%+/=]{40,}/, label: 'Azure SAS signature' },
]

const FILE_PATTERNS: readonly LabelledPattern[] = [
  ...TOKEN_PATTERNS,
  { pattern: new RegExp(String.raw`(?:^|[;"'][ \t]*)(?:password|pwd)=(?!${PLACEHOLDER})[^;"'\s]{8,}`, 'im'), label: 'connection-string password' },
  { pattern: new RegExp(String.raw`\bpassword["']?\s*[:=]\s*["'](?!${PLACEHOLDER})[^"'\s]{8,}["']`, 'i'), label: 'password literal' },
  { pattern: /-----BEGIN[ A-Z]*PRIVATE KEY-----/, label: 'private key header' },
]

const YAML_FILE = /\.ya?ml$/i
const YAML_PATTERNS: readonly LabelledPattern[] = [
  ...FILE_PATTERNS,
  { pattern: new RegExp(String.raw`^\s*(?:-\s+)?password:[ \t]+(?!${PLACEHOLDER}|[!&|>])[^\s"'#]{8,}[ \t]*(?:#.*)?$`, 'im'), label: 'YAML password' },
]

const RUST_FILE = /\.rs$/i
const RUST_IGNORE = /#\[\s*ignore\b/
const SKIP_PATTERNS: readonly RegExp[] = [
  /@pytest\.mark\.(?:skip(?:if)?|xfail)\b/,
  /@unittest\.skip\b/,
  /\bpytest\.(?:skip|xfail)\s*\(/,
  /\b(?:it|test|describe)(?:\.\w+)*\.(?:skip|skipIf|todo|fixme)\b/,
  /\bx(it|test|describe)\s*\(/,
  /@Ignore\b/,
  /@Disabled\b/,
  /\[\s*(Fact|Theory)\s*\([^)]*Skip\s*=/,
  /\[\s*Skip\s*[(\]]/,
  /\[\s*Ignore\b/,
  /\[\s*Explicit\b/,
  /\bAssert\.(Skip(When|Unless)?|Ignore|Inconclusive)\s*\(/,
  /\bSkip\.(If|IfNot|Unless)\s*\(/,
  /\/\/\s*\[\s*(Fact|Theory|Test|TestMethod|TestCase|DataTestMethod)\b/,
  /\bt\.Skip(Now|f)?\s*\(/,
  RUST_IGNORE,
]

const TEST_DECLARATIONS: readonly RegExp[] = [
  /\b(?:it|test)(?:\.\w+)*\s*\(/,
  /\[\s*(?:Fact|Theory|Test|TestMethod|TestCase|DataTestMethod)\b/,
  /@(?:Test|ParameterizedTest)\b/,
  /\bdef\s+test_\w*\s*\(/,
  /\bfunc\s+Test\w*\s*\(/,
  /#\[\s*(?:\w+::)*test\b/,
]

const COMMAND_PATH = String.raw`^(?:[\w.~/-]*\/)?`
const VERIFICATION_COMMAND = new RegExp(
  COMMAND_PATH +
    '(?:' +
    [
      String.raw`cargo\s+(?:\+\S+\s+)?(?:test|build|check|clippy|nextest)`,
      String.raw`dotnet\s+(?:test|build)`,
      String.raw`(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|build|lint|typecheck|check)\b`,
      String.raw`(?:npx|bunx|pnpm\s+exec|yarn)\s+(?:tsc|jest|vitest|eslint|playwright)`,
      String.raw`(?:tsc|jest|vitest|eslint|pytest|mypy|ruff|tox|ctest|make|mvn|gradle|gradlew|mvnw)\b`,
      String.raw`python3?\s+-m\s+(?:pytest|unittest|mypy)`,
      String.raw`go\s+(?:test|build|vet)`,
      String.raw`claude\s+plugin\s+(?:test|validate)`,
    ].join('|') +
    String.raw`)(?![\w-])`,
)
const INFORMATION_ONLY = /\s(?:--version|--help|--collect-only|--co|-list|--list|--list-tests|--listTests|--dry-run)(?![\w-])/
const PIPEFAIL_SET = /\bset\s+(?:-\w+\s+)*-\w*o\s+pipefail\b/
const PIPESTATUS_READ = /\bPIPESTATUS\b/

const DELETE_COMMAND = new RegExp(COMMAND_PATH + String.raw`(?:git\s+rm|rm|Remove-Item|ri|del|erase)(?=\s|$)`, 'i')
const INDEX_ONLY = /\s--cached(?=\s|$)/
const TEST_ARTIFACT = /(^|\/)(coverage|\.nyc_output|__pycache__|\.pytest_cache|node_modules|TestResults|bin|obj)(\/|$)/
const REWARD_HACKING = 'If the test was failing, the working assumption is that the production code is wrong, not the test. Deleting test bodies to make the suite green is reward hacking; surface the failure instead. If the test is genuinely obsolete, say so explicitly before proceeding.'

export const pipedExitCode: Check = {
  name: 'piped-exit-code',
  advise: ({ tool, command }) => {
    if (tool !== 'Bash' || isBlank(command)) return null
    if (PIPEFAIL_SET.test(maskQuoted(command)) || PIPESTATUS_READ.test(maskComments(command))) return null
    const hidden = pipelines(command).flatMap(stages =>
      stages.slice(0, -1).flatMap(({ masked }) => {
        const match = VERIFICATION_COMMAND.exec(masked)
        if (match === null || INFORMATION_ONLY.test(masked)) return []
        return [`${match[0].replace(/\s+/g, ' ')} | ${stages.at(-1)?.masked.split(/\s+/)[0] ?? ''}`]
      }),
    )
    if (hidden.length === 0) return null
    return `This command pipes a build or test run into another command (${[...new Set(hidden)].join(', ')}). Without pipefail a pipeline exits with its last command's status, so a failing run reports success and only the visible excerpt says otherwise.

Read the run's own exit code before reporting a result: prefix the command with \`set -o pipefail;\`, or write the output to a file and read its tail in a second step. If the excerpt shown is cut, the failure may not be in it.`
  },
}

function secretLabels({ tool, command, newText, oldText, filePath }: CheckInput): string[] {
  if (isShell(tool)) return isBlank(command) ? [] : newlyAddedLabels(command, '', TOKEN_PATTERNS)
  if (!isEditOrWrite(tool) || isBlank(newText)) return []
  return newlyAddedLabels(newText, oldText, YAML_FILE.test(filePath ?? '') ? YAML_PATTERNS : FILE_PATTERNS)
}

export const secrets: Check = {
  name: 'secrets',
  advise: input => {
    const labels = secretLabels(input)
    if (labels.length === 0) return null
    return `This ${isShell(input.tool) ? 'command' : 'write'} appears to contain a real credential (${labels.join(', ')}). If it is a documentation placeholder, replace it with an obvious dummy such as YOUR_API_KEY_HERE. If it is a real credential, move it to user-secrets, an environment variable, or a gitignored file, and reference it from the code instead.

A credential committed to git stays in history after deletion, and removing it afterwards means rotating the key.`
  },
}

function skipPatterns(filePath: string | undefined): readonly RegExp[] {
  if (looksLikeTestFile(filePath)) return SKIP_PATTERNS
  return RUST_FILE.test(filePath ?? '') ? [RUST_IGNORE] : []
}

export const skipAttributes: Check = {
  name: 'skip-attributes',
  advise: ({ tool, newText, oldText, filePath }) => {
    if (!isEditOrWrite(tool) || isBlank(newText)) return null
    if (!skipPatterns(filePath).some(pattern => countMatches(newText, pattern) > countMatches(oldText, pattern))) return null
    return `This edit skips or disables a test. If the test is failing, the working assumption is that the production code is wrong, not the test. Skipping or disabling a failing test is reward hacking; surface the failure and fix the underlying code instead.

Legitimate reasons exist: quarantining a known-flaky test, gating a test on its environment, marking a test for functionality not yet implemented. If that is the case here, say so explicitly in your report so the user can confirm.`
  },
}

function isTestTarget(argument: string): boolean {
  const path = argument.replaceAll('\\', '/')
  return !TEST_ARTIFACT.test(path) && (looksLikeTestFile(path) || looksLikeTestFile(`${path}/`))
}

function deletedTestPaths(command: string): string[] {
  const deleted = new Set<string>()
  for (const { masked, raw } of pipelines(command).flat()) {
    const match = DELETE_COMMAND.exec(masked)
    if (match === null || INDEX_ONLY.test(masked)) continue
    for (const token of raw.slice(match[0].length).split(/\s+/)) {
      if (token === '' || token.startsWith('-')) continue
      const cleaned = token.replace(/^['",(]+|['",);]+$/g, '')
      if (isTestTarget(cleaned)) deleted.add(cleaned)
    }
  }
  return [...deleted]
}

const declaredTests = (text: string): number => TEST_DECLARATIONS.reduce((sum, pattern) => sum + countMatches(text, pattern), 0)

export const testDeletion: Check = {
  name: 'test-deletion',
  advise: ({ tool, command, newText, oldText, filePath }) => {
    if (isShell(tool)) {
      const deleted = isBlank(command) ? [] : deletedTestPaths(command)
      if (deleted.length === 0) return null
      return `This command deletes what looks like test code (${deleted.join(', ')}). If a test was failing, the working assumption is that the production code is wrong, not the test. Deleting, skipping, or renaming a failing test to make the suite green is reward hacking; surface the failure instead. If the test is genuinely obsolete because the feature it covered was removed, say so explicitly before proceeding.`
    }
    if (!isEditOrWrite(tool) || !looksLikeTestFile(filePath) || isBlank(oldText)) return null
    if (isBlank(newText)) return `This change removes test code by replacing it with empty content. ${REWARD_HACKING}`
    const [before, after] = [declaredTests(oldText), declaredTests(newText)]
    if (after >= before) return null
    return `This change removes test code: the text it replaces declares ${before} tests and the new text declares ${after}. ${REWARD_HACKING}`
  },
}
