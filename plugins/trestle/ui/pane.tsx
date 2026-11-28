import type { EngineInterface as Engine } from 'claude-code'

import type {
  AgentSummary,
  AgentUsage,
  CheckSummary,
  ContractSummary,
  DisabledCliSummary,
  QueueSummary,
  TrestlePaneState,
  WorktreeSummary,
} from '../types'

type ResolvedUi = ReturnType<Engine['ui']['resolve']>

const STATUS_COLORS: Record<string, string> = {
  running: 'green',
  starting: 'cyan',
  idle: 'yellow',
  needs_input: 'magenta',
  done: 'blue',
  failed: 'red',
  stopped: 'gray',
}

function isActiveStatus(status: AgentSummary['status']): boolean {
  return status === 'starting' || status === 'running' || status === 'idle' || status === 'needs_input'
}

function formatElapsed(startedAt: number, endAt: number): string {
  const secs = Math.max(0, Math.floor((endAt - startedAt) / 1000))
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  return `${mins}m${secs % 60}s`
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function formatCost(usd: number): string {
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(3)}`
}

function formatAgentUsageSuffix(usage: AgentUsage | undefined): string {
  if (!usage) return ''
  const total = usage.inputTokens + usage.outputTokens
  if (total === 0 && usage.costUsd === undefined) return ''
  const cost = usage.costUsd !== undefined ? ` (${formatCost(usage.costUsd)})` : ''
  return ` · ${formatTokens(total)} tok${cost}`
}

function renderUsageSummary(ui: ResolvedUi, agents: AgentSummary[]) {
  const withUsage = agents.filter(a => a.usage)
  if (withUsage.length === 0) return null
  let input = 0
  let output = 0
  let cacheRead = 0
  let costUsd = 0
  let hasCost = false
  for (const a of withUsage) {
    const u = a.usage!
    input += u.inputTokens
    output += u.outputTokens
    cacheRead += u.cacheReadTokens
    if (u.costUsd !== undefined) {
      costUsd += u.costUsd
      hasCost = true
    }
  }
  const { Text } = ui
  const cacheStr = cacheRead > 0 ? ` (${formatTokens(cacheRead)} cached)` : ''
  const costStr = hasCost ? ` · ${formatCost(costUsd)}` : ''
  return (
    <Text dimColor>
      Usage: {formatTokens(input)} in / {formatTokens(output)} out{cacheStr}
      {costStr}
    </Text>
  )
}

function renderDisabledClisSection(ui: ResolvedUi, disabled: DisabledCliSummary[] | undefined, now: number) {
  if (!disabled || disabled.length === 0) return null
  const active = disabled.filter(d => d.blockedUntil === undefined || d.blockedUntil > now)
  if (active.length === 0) return null
  const { Text } = ui
  const summary = active
    .map(d => {
      if (d.blockedUntil === undefined) return `${d.cli} (manual re-enable)`
      const remMins = Math.max(1, Math.ceil((d.blockedUntil - now) / 60_000))
      const timeStr = remMins >= 60 ? `${Math.floor(remMins / 60)}h${remMins % 60}m` : `${remMins}m`
      return `${d.cli} (${d.window}, ${timeStr})`
    })
    .join(' · ')
  return <Text color="yellow">Disabled CLIs: {summary}</Text>
}

function formatHeader(agents: AgentSummary[]): string {
  if (agents.length === 0) return 'Trestle · 0 active agent(s)'
  const active = agents.filter(a => isActiveStatus(a.status)).length
  const needsInput = agents.filter(a => a.status === 'needs_input').length
  const done = agents.filter(a => a.status === 'done').length
  const failed = agents.filter(a => a.status === 'failed').length
  const stopped = agents.filter(a => a.status === 'stopped').length
  const parts: string[] = [`${active} active`]
  if (needsInput > 0) parts.push(`${needsInput} needs input`)
  if (done > 0) parts.push(`${done} done`)
  if (failed > 0) parts.push(`${failed} failed`)
  if (stopped > 0) parts.push(`${stopped} stopped`)
  return `Trestle · ${parts.join(' · ')}`
}

function pickSelected(agents: AgentSummary[], selectedId?: string): AgentSummary | undefined {
  return (
    agents.find(a => a.id === selectedId) ??
    agents.find(a => isActiveStatus(a.status)) ??
    agents[0]
  )
}

function renderQueueSection(ui: ResolvedUi, queue: QueueSummary | undefined) {
  if (!queue) return null
  const { Box, Text } = ui
  const blockedCount = queue.counts.blocked ?? 0
  const blockedSuffix = blockedCount > 0 ? ` · ${blockedCount} blocked` : ''
  const failedSuffix = queue.counts.failed > 0 ? ` · ${queue.counts.failed} failed` : ''
  return (
    <Box flexDirection="column">
      <Text bold>
        Queue: {queue.counts.queued} queued · {queue.counts.running} running · {queue.counts.landed} landed
        {blockedSuffix}
        {failedSuffix}
      </Text>
      {queue.items.map(item => (
        <Text
          key={`q-${item.id}`}
          color={item.status === 'failed' ? 'red' : item.status === 'blocked' ? 'yellow' : undefined}
          dimColor={item.status === 'landed'}
        >
          - [{item.status}] {item.id} ({item.cli}): {item.title}
          {item.dependsOn.length > 0 ? ` (after ${item.dependsOn.join(',')})` : ''}
          {item.error ? ` · ${item.error.slice(0, 80)}` : ''}
        </Text>
      ))}
      {queue.total !== undefined && queue.total > queue.items.length && (
        <Text dimColor>  … (+{queue.total - queue.items.length} more)</Text>
      )}
    </Box>
  )
}

function renderContractsSection(
  ui: ResolvedUi,
  contractsByWorktree: Record<string, ContractSummary> | undefined,
  fallbackContract: ContractSummary | undefined,
) {
  const contracts = contractsByWorktree && Object.keys(contractsByWorktree).length > 0
    ? Object.values(contractsByWorktree)
    : fallbackContract
      ? [fallbackContract]
      : []
  if (contracts.length === 0) return null
  const { Box, Text } = ui
  return (
    <Box flexDirection="column">
      {contracts.map(contract => (
        <Box key={`contract-${contract.worktreeId ?? contract.id}`} flexDirection="column">
          <Text bold>
            Contract{contract.worktreeId ? ` [${contract.worktreeId}]` : ''}: {contract.title} (iter {contract.iteration}/{contract.maxIterations})
          </Text>
          {contract.baseRedChecks && contract.baseRedChecks.length > 0 && (
            <Text color="yellow">
              Base-red on {contract.baseRef ?? 'base'}: {contract.baseRedChecks.join(', ')}
            </Text>
          )}
          {contract.acceptanceCriteria.map(c => (
            <Text key={`ac-${contract.id}-${c.id}`} color={c.passed ? 'green' : 'yellow'}>
              [{c.passed ? 'x' : ' '}] {c.id}: {c.description}
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  )
}

function renderChecksSection(
  ui: ResolvedUi,
  checksByWorktree: Record<string, CheckSummary> | undefined,
  fallbackCheck: CheckSummary | undefined,
) {
  const checks = checksByWorktree && Object.keys(checksByWorktree).length > 0
    ? Object.values(checksByWorktree)
    : fallbackCheck
      ? [fallbackCheck]
      : []
  if (checks.length === 0) return null
  const { Box, Text } = ui
  return (
    <Box flexDirection="column">
      {checks.map(check => {
        const label = check.worktreeId ? ` [${check.worktreeId}]` : ''
        return (
          <Box key={`check-${check.worktreeId ?? check.worktreePath}`} flexDirection="column">
            <Text bold color={check.passed ? 'green' : 'red'}>
              Checks{label}: {check.summary}
            </Text>
            {check.results.map(r => {
              const firstLine = r.excerpt?.split('\n').find(l => l.trim())?.trim()
              return (
                <Box key={`chk-${check.worktreeId ?? 'main'}-${r.name}`} flexDirection="column">
                  <Text color={r.passed ? 'green' : 'red'}>
                    {r.passed ? 'PASS' : 'FAIL'} {r.name} ({r.durationMs}ms){r.metric ? ` [${r.metric}]` : ''}
                  </Text>
                  {!r.passed && firstLine && <Text dimColor>  {firstLine.slice(0, 120)}</Text>}
                </Box>
              )
            })}
          </Box>
        )
      })}
    </Box>
  )
}

function formatAgentBadge(a: AgentSummary): string {
  const target = a.model ? `${a.cli}/${a.model}` : a.cli
  return a.effort ? `${target} · effort:${a.effort}` : target
}

function renderAgentsSection(
  ui: ResolvedUi,
  agents: AgentSummary[],
  selected: AgentSummary | undefined,
  onSelectAgent: ((id: string) => void | Promise<void>) | undefined,
  now: number,
) {
  const { Box, Text, Button } = ui
  if (agents.length === 0) {
    return <Text dimColor>No agents running. Use /trestle or orchestrate skill to launch.</Text>
  }

  return (
    <Box flexDirection="column">
      {agents.map(a => {
        const isSelected = selected?.id === a.id
        const marker = isSelected ? '>' : ' '
        const color = STATUS_COLORS[a.status] ?? 'white'
        const endAt = isActiveStatus(a.status) ? now : (a.finishedAt ?? a.lastActivityAt ?? now)
        return (
          <Box key={`agent-${a.id}`} flexDirection="column">
            <Box flexDirection="row">
              <Text>
                {marker} <Text color={color}>[{a.status}]</Text> {a.id} ({formatAgentBadge(a)}) · {a.stage} · {formatElapsed(a.startedAt, endAt)}
                {formatAgentUsageSuffix(a.usage)}
              </Text>
              {onSelectAgent && !isSelected && (
                <Button key={`select-${a.id}`} label="Inspect" onPress={() => onSelectAgent(a.id)} />
              )}
            </Box>
            {a.status === 'failed' && a.error && (
              <Text color="red">  error: {a.error.slice(0, 120)}</Text>
            )}
            {a.status === 'needs_input' && (
              <Text color="magenta">  needs input: {(a.needsInputReason ?? 'waiting for user decision or approval').slice(0, 120)}</Text>
            )}
          </Box>
        )
      })}
      {selected && (
        <Box flexDirection="column">
          <Text bold>--- Tail: {selected.id} ({selected.branch}) ---</Text>
          {selected.tail.length === 0 ? (
            <Text dimColor>(no activity yet)</Text>
          ) : (
            selected.tail.slice(-15).map((line, i) => (
              <Text key={`tail-${selected.id}-${i}`} dimColor>
                {line}
              </Text>
            ))
          )}
        </Box>
      )}
    </Box>
  )
}

function renderFooterSections(ui: ResolvedUi, worktrees: WorktreeSummary[], experiments: string[]) {
  const { Box, Text } = ui
  return (
    <Box flexDirection="column">
      {worktrees.length > 0 && (
        <Box flexDirection="column">
          <Text bold>Worktrees ({worktrees.length}):</Text>
          {worktrees.map(w => (
            <Text key={`wt-${w.id}`} dimColor>
              - {w.id} ({w.branch} from {w.baseRef})
            </Text>
          ))}
        </Box>
      )}
      {experiments.length > 0 && (
        <Box flexDirection="column">
          <Text bold>Recent Experiments:</Text>
          {experiments.map((exp, i) => (
            <Text key={`exp-${i}`} dimColor>
              {exp}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  )
}

export function renderTrestlePane(
  ui: ResolvedUi,
  state: TrestlePaneState,
  onSelectAgent?: (id: string) => void | Promise<void>,
  now = Date.now(),
) {
  const { Box, Text } = ui
  const selected = pickSelected(state.agents, state.selectedId)
  return (
    <Box flexDirection="column">
      <Text bold>{formatHeader(state.agents)}</Text>
      {renderUsageSummary(ui, state.agents)}
      {renderDisabledClisSection(ui, state.disabledClis, now)}
      {renderQueueSection(ui, state.queue)}
      {renderContractsSection(ui, state.contractsByWorktree, state.activeContract)}
      {renderChecksSection(ui, state.checksByWorktree, state.lastCheck)}
      {renderAgentsSection(ui, state.agents, selected, onSelectAgent, now)}
      {renderFooterSections(ui, state.worktrees ?? [], state.recentExperiments ?? [])}
    </Box>
  )
}
