// Keeps git out of the task-implementer subagent. The agent has unrestricted Bash and PowerShell for builds and tests,
// but the parent workflow owns every repo-state operation; this hook is the deterministic layer beneath the prose rule
// in agents/task-implementer.md. Any word `git` in the command counts, including `bash -c "git ..."`, `command git`
// and `/usr/bin/git`. A shell can still build the name at run time, so this guards against habit, and the prose rule
// stays the contract.
import type { Register } from 'claude-code'

const SHELL_TOOLS = new Set(['Bash', 'PowerShell'])
const GATED_AGENT = /^(refactoring:)?task-implementer$/
const GIT_WORD = /(?<![\w.-])(?:[\w.~-]*[\\/])?git(?:\.exe)?(?=$|[\s"'`;&|)}])/im

export const gateReason = (command: string): string =>
  'task-implementer is not allowed to run git. The parent workflow owns all repo-state operations: staging, committing, ' +
  'history inspection, branch/stash/checkout, everything. This hook layered on top of the prose rule in your system prompt.\n\n' +
  'If the step genuinely requires a git operation (revert a file, inspect a prior commit, etc.), do not retry with a ' +
  'different invocation. Return one of:\n\n' +
  '  - NEEDS_CONTEXT: describe the git operation the orchestrator needs to do on your behalf.\n' +
  '  - BLOCKED: if the step cannot be completed without git access you do not have.\n\n' +
  `Attempted command: ${command}`

export const invokesGit = (command: string): boolean => GIT_WORD.test(command)

export const register: Register = on => {
  on('tool.call', async ($, e, next) => {
    if (!SHELL_TOOLS.has(e.tool) || e.agentId === undefined) return next(e)
    const command = (e as { command?: unknown }).command
    if (typeof command !== 'string' || !invokesGit(command)) return next(e)
    const agent = (await $.agent.list()).find(a => a.id === e.agentId)
    if (agent === undefined || !GATED_AGENT.test(agent.type)) return next(e)
    return { deny: gateReason(command) }
  })
}
