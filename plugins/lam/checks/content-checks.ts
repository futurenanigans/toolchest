// The pattern advisories: credentials, skipped tests, test deletion and type-system escape hatches, each firing
// only on what the edit adds beyond the text it replaces.
import { type Check, type LabelledPattern, isBlank, isEditOrWrite, fileExtension, looksLikeTestFile, newlyAddedLabels } from './text'

const SECRET_PATTERNS: readonly LabelledPattern[] = [
  { pattern: /\bAKIA(?!X{16})[A-Z0-9]{16}\b/, label: 'AWS access key' },
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
  { pattern: /\b(?:password|pwd)\s*=\s*(?![{$<*%]|your|change|placeholder|x{3})[^;"'\s]{8,}/i, label: 'connection-string password' },
  { pattern: /-----BEGIN[ A-Z]*PRIVATE KEY-----/, label: 'private key header' },
]

const SKIP_PATTERNS: readonly RegExp[] = [
  /@pytest\.mark\.skip(if)?\b/,
  /@unittest\.skip\b/,
  /\bpytest\.skip\s*\(/,
  /\b(it|test|describe)\.skip\s*\(/,
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
  /\bt\.Skip(Now)?\s*\(/,
  /#\[\s*ignore\s*\]/,
]

const SCRIPT_DOWNGRADES: readonly LabelledPattern[] = [
  { pattern: /:\s*any\b/, label: ': any' },
  { pattern: /\bas\s+any\b/, label: 'as any' },
  { pattern: /<\s*any\s*[,>]/, label: '<any>' },
  { pattern: /\/\/\s*@ts-ignore\b/, label: '@ts-ignore' },
  { pattern: /\/\/\s*@ts-nocheck\b/, label: '@ts-nocheck' },
  { pattern: /\/\/\s*@ts-expect-error\b/, label: '@ts-expect-error' },
  { pattern: /eslint-disable/, label: 'eslint-disable' },
]

const DOWNGRADES_BY_EXTENSION: Readonly<Record<string, readonly LabelledPattern[]>> = {
  '.ts': SCRIPT_DOWNGRADES,
  '.tsx': SCRIPT_DOWNGRADES,
  '.js': SCRIPT_DOWNGRADES,
  '.jsx': SCRIPT_DOWNGRADES,
  '.mjs': SCRIPT_DOWNGRADES,
  '.cjs': SCRIPT_DOWNGRADES,
  '.py': [
    { pattern: /:\s*Any\b/, label: ': Any' },
    { pattern: /->\s*Any\b/, label: '-> Any' },
    { pattern: /\bcast\(\s*Any\b/, label: 'cast(Any, ...)' },
    { pattern: /#\s*type:\s*ignore\b/, label: '# type: ignore' },
  ],
  '.cs': [
    { pattern: /\bdynamic\s+[A-Za-z_]\w*\s*[=;,)]/, label: 'dynamic declaration' },
    { pattern: /<\s*dynamic\s*[,>]/, label: '<dynamic>' },
    { pattern: /\(\s*dynamic\s*\)/, label: '(dynamic) cast' },
    { pattern: /#pragma\s+warning\s+disable\b/, label: '#pragma warning disable' },
    { pattern: /#nullable\s+disable\b/, label: '#nullable disable' },
    { pattern: /\[\s*(assembly:\s*)?SuppressMessage\b/, label: '[SuppressMessage]' },
  ],
}

const SHELL_DELETE = /(?:^|[;&|(\r\n]\s*|\b(?:sudo|xargs)\s+)(git\s+rm|rm|Remove-Item|ri|del|erase)\b([^&|;\r\n]*)/gim

export const secrets: Check = {
  name: 'secrets',
  advise: ({ tool, newText, oldText }) => {
    if (!isEditOrWrite(tool) || isBlank(newText)) return null
    const labels = newlyAddedLabels(newText, oldText, SECRET_PATTERNS)
    if (labels.length === 0) return null
    return `This write appears to contain a real credential (${labels.join(', ')}). If it is a documentation placeholder, replace it with an obvious dummy such as YOUR_API_KEY_HERE. If it is a real credential, move it to user-secrets, an environment variable, or a gitignored file, and reference it from the code instead.

A credential committed to git stays in history after deletion, and removing it afterwards means rotating the key.`
  },
}

export const skipAttributes: Check = {
  name: 'skip-attributes',
  advise: ({ tool, newText, oldText, filePath }) => {
    if (!isEditOrWrite(tool) || isBlank(newText) || !looksLikeTestFile(filePath)) return null
    if (!SKIP_PATTERNS.some(pattern => pattern.test(newText) && !pattern.test(oldText))) return null
    return `This edit skips or disables a test. If the test is failing, the working assumption is that the production code is wrong, not the test. Skipping or disabling a failing test is reward hacking; surface the failure and fix the underlying code instead.

Legitimate reasons exist: quarantining a known-flaky test, gating a test on its environment, marking a test for functionality not yet implemented. If that is the case here, say so explicitly in your report so the user can confirm.`
  },
}

export const testDeletion: Check = {
  name: 'test-deletion',
  advise: ({ tool, command, newText, oldText, filePath }) => {
    if (tool === 'Bash' || tool === 'PowerShell') {
      if (isBlank(command)) return null
      const deleted = new Set<string>()
      for (const match of command.matchAll(SHELL_DELETE)) {
        for (const token of (match[2] ?? '').split(/\s+/)) {
          if (token === '' || token.startsWith('-')) continue
          const cleaned = token.replace(/^['",]+|['",]+$/g, '')
          if (looksLikeTestFile(cleaned)) deleted.add(cleaned)
        }
      }
      if (deleted.size === 0) return null
      return `This command deletes what looks like test code (${[...deleted].join(', ')}). If a test was failing, the working assumption is that the production code is wrong, not the test. Deleting, skipping, or renaming a failing test to make the suite green is reward hacking; surface the failure instead. If the test is genuinely obsolete because the feature it covered was removed, say so explicitly before proceeding.`
    }
    if (isEditOrWrite(tool) && looksLikeTestFile(filePath) && !isBlank(oldText) && isBlank(newText)) {
      return 'This change removes test code by replacing it with empty content. If the test was failing, the working assumption is that the production code is wrong, not the test. Deleting test bodies to make the suite green is reward hacking; surface the failure instead. If the test is genuinely obsolete, say so explicitly before proceeding.'
    }
    return null
  },
}

export const typeDowngrade: Check = {
  name: 'type-downgrade',
  advise: ({ tool, newText, oldText, filePath }) => {
    if (!isEditOrWrite(tool) || isBlank(newText) || isBlank(filePath)) return null
    const patterns = DOWNGRADES_BY_EXTENSION[fileExtension(filePath)]
    if (patterns === undefined) return null
    const labels = newlyAddedLabels(newText, oldText, patterns)
    if (labels.length === 0) return null
    return `This edit adds a type-system or analyzer escape hatch (${labels.join(', ')}). If it silences a type error or a warning, the working assumption is that the code is wrong, not the checker; downgrading types or suppressing the analyzer to get green is reward hacking. Fix the underlying mismatch instead.

Legitimate uses exist (a third-party library with wrong types, interop boundaries, a suppression with a written reason at the site). If that is the case here, name it explicitly in your report.`
  },
}
