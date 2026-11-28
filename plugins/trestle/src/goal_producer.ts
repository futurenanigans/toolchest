import { resolveAgentConfig, resolveEscalationAgentConfig, type TrestleConfig } from './config'
import type { GoalLoopParams } from './goal_types'
import { checkCliQuota, recordCliUsage } from './quota'
import type { AgentSupervisor } from './supervisor'

const MAX_TRANSIENT_RETRIES = 2

export async function runProducer(supervisor: AgentSupervisor, params: GoalLoopParams, config: TrestleConfig, options: {
  prompt: string
  iteration: number
  maxIterations: number
  escalationFailures: number
  homeDir: string
  freshContext: boolean
  lastSessionId?: string
  finalText?: string
}) {
  const { prompt, iteration, maxIterations, escalationFailures, homeDir, freshContext } = options
  let { lastSessionId, finalText } = options
  const transientDelayMs = params.transientRetryDelayMs ?? 1_500
  let iterAgent = resolveEscalationAgentConfig(config, params.cli, params.model, escalationFailures, params.effort)

  const primaryQuota = await checkCliQuota(iterAgent.cli, config.agents?.[iterAgent.cli]?.quota, homeDir)
  if (!primaryQuota.allowed) {
    const fallbacks = config.escalation?.fallbackClis ?? []
    let switched = false
    for (const fbCli of fallbacks) {
      if (fbCli === iterAgent.cli) continue
      const fbQuota = await checkCliQuota(fbCli, config.agents?.[fbCli]?.quota, homeDir)
      if (!fbQuota.allowed) continue
      const fbResolved = resolveAgentConfig(config, fbCli, iterAgent.tier ?? params.model, params.effort)
      iterAgent = {
        cli: fbCli,
        model: fbResolved.model,
        effort: fbResolved.effort,
        commandOverride: fbResolved.commandOverride,
        tier: fbResolved.resolvedFromTier,
        escalatedToFallbackCli: true,
      }
      switched = true
      break
    }
    if (!switched) {
      return { status: 'failed' as const, iterations: iteration - 1, finalText,
        failureKind: 'usage_limit' as const, error: primaryQuota.reason ?? `${iterAgent.cli} quota cap reached` }
    }
  }
  const activeCli = iterAgent.cli
  const effectiveModel = iterAgent.model
  const effectiveEffort = iterAgent.effort
  const effectiveCommandOverride = params.commandOverride ?? iterAgent.commandOverride
  const stageLabel = iterAgent.tier
    ? `goal(${iteration}/${maxIterations} · ${iterAgent.tier})`
    : `goal(${iteration}/${maxIterations})`

  let waited: Awaited<ReturnType<AgentSupervisor['wait']>>[number] | undefined
  let spawnedId = ''

  for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
    if (params.signal?.aborted) {
      return { status: 'cancelled' as const, iterations: iteration - 1, finalText, error: 'Goal loop cancelled' }
    }

    spawnedId = supervisor.allocateId(`${params.worktreeId}-i${iteration}`)
    const spawned = await supervisor.spawn({
      repoRoot: params.repoRoot,
      id: spawnedId,
      cli: activeCli,
      stage: stageLabel,
      worktreeId: params.worktreeId,
      worktreePath: params.worktreePath,
      branch: params.branch,
      prompt,
      mode: 'writer',
      model: effectiveModel,
      effort: effectiveEffort,
      resumeSessionId: freshContext ? undefined : lastSessionId,
      persistSession: !freshContext,
      commandOverride: effectiveCommandOverride,
      homeDir,
      resources: config.resources,
    })

    const onAbort = () => {
      void supervisor.stop(spawned.id)
    }
    params.signal?.addEventListener('abort', onAbort, { once: true })
    if (params.signal?.aborted) onAbort()
    try {
      const [res] = await supervisor.wait([spawned.id], { mode: 'all' })
      waited = res
    } finally {
      params.signal?.removeEventListener('abort', onAbort)
    }

    const tail = supervisor.tail(spawned.id, 10)
    finalText = tail.finalText
    lastSessionId = waited?.sessionId

    if (params.signal?.aborted) {
      return { status: 'cancelled' as const, iterations: iteration, finalText, error: 'Goal loop cancelled' }
    }

    if (waited?.usage) {
      await recordCliUsage(activeCli, waited.usage, homeDir).catch(() => {})
    }

    if (waited?.status === 'failed' && waited.failureKind === 'transient' && attempt < MAX_TRANSIENT_RETRIES) {
      await new Promise(r => setTimeout(r, transientDelayMs * (attempt + 1)))
      continue
    }
    break
  }
  return { status: 'finished' as const, activeCli, waited, spawnedId, finalText, lastSessionId }
}
