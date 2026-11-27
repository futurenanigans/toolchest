// The engine beneath lam in tests: a git repository, a session, files on disk and tool answers, each settable per test.
import type { SessionRateLimit } from 'claude-code'
import type { TestBody } from 'claude-code/testing'

export const CWD = '/repo/widget'

type On = Parameters<TestBody>[1]
type TestEngine = Parameters<TestBody>[0]
type GitOutput = { exitCode: number; stdout?: string; stderr?: string }
export type ProcessRun = { argv: readonly string[]; env?: Readonly<Record<string, string>> }
export type EngineSetup = { git?: Record<string, GitOutput>; files?: Record<string, string>; env?: Record<string, string>; runs?: ProcessRun[]; fetchGate?: Promise<void>; denial?: string; denyFirstCall?: string; gitMissing?: boolean; contextTokens?: number; contextWindow?: number; settings?: Record<string, unknown>; compaction?: { rawMaxTokens: number; autoCompactThreshold?: number }; rateLimits?: SessionRateLimit[] }

export function stubEngine(on: On, { git = {}, files = {}, env = {}, runs = [], fetchGate, denial, denyFirstCall, gitMissing = false, contextTokens = 234_000, contextWindow = 1_000_000, settings = { effortLevel: 'high' }, compaction, rateLimits = [] }: EngineSetup = {}): void {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'guard-stats' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.repo', () => ({ value: { root: CWD, remote: 'git@github.com:example/widget.git', internal: false, name: 'widget' } }))
  on('session.cwd', () => ({ value: CWD }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('settings.read', () => ({ value: settings }))
  on('session.usage', () => {
    const breakdown = {
      rawMaxTokens: compaction?.rawMaxTokens ?? contextWindow,
      autoCompactThreshold: compaction?.autoCompactThreshold,
      isAutoCompactEnabled: compaction?.autoCompactThreshold !== undefined,
    }
    const context = { window: contextWindow, tokens: contextTokens, percent: Math.round((contextTokens / contextWindow) * 100), breakdown }
    return { value: { startedAt: 0, context, rateLimits, cost: { usd: 1.234 } } as never }
  })
  on('clock.now', () => ({ value: Date.UTC(2026, 10, 25, 9, 30, 0) }))
  on('env.get', (_, e) => ({ value: env[e.name] }))
  on('process.run', async (_, e) => {
    if (gitMissing) throw new Error('spawn git ENOENT')
    runs.push({ argv: e.argv, env: e.init?.env })
    const key = e.argv.filter(arg => !arg.startsWith('-') && arg !== 'git' && arg !== CWD)[0] ?? ''
    if (key === 'fetch' && fetchGate !== undefined) await fetchGate
    const out = git[key] ?? { exitCode: 0 }
    return { value: { exitCode: out.exitCode, stdout: out.stdout ?? '', stderr: out.stderr ?? '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('fs.exists', (_, e) => ({ value: e.path in files }))
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: 0, isLink: false } }))
  on('fs.read', (_, e) => ({ value: files[e.path] ?? '' }))
  let toolCalls = 0
  on('tool.call', () => {
    const deny = toolCalls++ === 0 ? (denyFirstCall ?? denial) : denial
    return deny === undefined ? { result: {} } : { deny }
  })
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'engine intro', scope: 'shared' }] }))
  on('turn.complete', () => ({ text: '' }))
}

const PROMPT_HINT = { plugin: 'lam', component: 'PromptHint', surface: 'terminal', props: { isDraft: false, isWorking: false, hint: '? for shortcuts' } } as const

export type StatusRow = { text: string | undefined; colorOf: (segment: string) => Promise<unknown> }

export async function statusRow($: TestEngine): Promise<StatusRow> {
  const ui = await $.ui.mount(PROMPT_HINT)
  const text = (await ui.find({ type: 'Text', text: / \| ctx / }))?.text
  const colors = new Map<string, unknown>()
  for (const segment of text?.split(' | ') ?? []) colors.set(segment, (await ui.find({ type: 'Text', text: new RegExp(`^${segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }))?.props.color)
  await ui.unmount()
  return { text, colorOf: async segment => colors.get(segment) }
}
