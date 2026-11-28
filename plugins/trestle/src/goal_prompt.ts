import type { CheckRunReport, CheckStepResult } from './checks'
import type { Contract } from './contract'

export function buildGoalPrompt(
  contract: Contract,
  iteration: number,
  maxIterations: number,
  deadEnds: string,
  lastFailureReport?: CheckRunReport,
  lastAgentError?: string,
  options: {
    baseRef?: string
    newFailures?: readonly CheckStepResult[]
    baseRedUnchanged?: readonly CheckStepResult[]
  } = {},
): string {
  const criteria = contract.acceptanceCriteria
    .map(c => `- [${c.passed ? 'x' : ' '}] (${c.id}) ${c.description}`)
    .join('\n')

  const sections = [
    `# Goal Contract: ${contract.title} (Iteration ${iteration}/${maxIterations})`,
    '',
    '## Objective',
    contract.goal,
    '',
    '## Definition of Done / Acceptance Criteria',
    criteria,
    '',
    '## Rules',
    '- Work directly in this repository checkout. Do not leave TODOs, stubs, or placeholders.',
    '- Prefer fast, targeted tests/checks while iterating; the harness will independently run the full contract verification suite after your turn.',
  ]

  if (iteration > 1) {
    sections.push(
      '',
      '## Current Worktree State (Continued Work)',
      `Changes from iteration ${iteration - 1} are still present in this worktree as continued work (not discarded). Inspect and build on them rather than starting over.`,
    )
  }

  if (deadEnds) {
    sections.push('', '## Known Dead Ends / Prior Attempts (Do Not Repeat)', deadEnds)
  }

  if (lastAgentError) {
    sections.push('', '## Previous Iteration Agent Error (Recover From This)', lastAgentError)
  }

  const baseRed = options.baseRedUnchanged ?? []
  if (baseRed.length > 0) {
    const refLabel = options.baseRef ?? 'base'
    const baseDetails = baseRed
      .map(r => {
        const ids = r.failedIds && r.failedIds.length > 0 ? `\nFailing tests on ${refLabel}: ${r.failedIds.join(', ')}` : ''
        return `### ${r.name} (exit ${r.exitCode})${ids}\n\`\`\`\n${r.excerpt}\n\`\`\``
      })
      .join('\n\n')
    sections.push(
      '',
      `## Failing on \`${refLabel}\` before your change; do not fix unless the objective says so`,
      baseDetails,
    )
  }

  const fixFailures =
    options.newFailures ??
    (lastFailureReport && !lastFailureReport.passed ? lastFailureReport.results.filter(r => !r.passed) : [])

  if (fixFailures.length > 0) {
    const failedDetails = fixFailures
      .map(r => `### ${r.name} (exit ${r.exitCode})\n\`\`\`\n${r.excerpt}\n\`\`\``)
      .join('\n\n')
    sections.push(
      '',
      '## Previous Iteration Verification Failures (Fix These)',
      lastFailureReport?.summary ?? `${fixFailures.length} check(s) failed`,
      failedDetails,
    )
  }

  return sections.join('\n')
}
