import type { EngineInterface, On, PromptComposeSection } from 'claude-code'

const GUIDANCE = `# Awl findings in this repository

Awl runs Roslyn semantic analysis on every edit here and reports through hook output. Its findings are this codebase's own design standards applied to your change; they guide how the task is done and are part of doing it, not an obstacle to route around.

- A denied edit introduces something this repository's configuration blocks. Change the code so the finding no longer applies. Do not get the same change in another way (a Bash write, a split edit, a suppression, a loosened awl.json or threshold) unless the user asks for that.
- Advisory findings your edit introduced belong to the same task: address each before reporting completion, or state why it does not apply, quoting the code that shows it. "Unrelated", "pre-existing" and "only advisory" are not reasons.
- Findings reported from an earlier edit or at a session's stop are yours when they are in code you changed this session.
- "Analysis limits" and "not verified" lines describe what Awl could not establish; they need no action and are no licence to ignore the findings that were established.
- Before refactoring for a rule you have not met, load the awl-findings skill for its pattern guide and remedy.`

let enabled = false

/** Learns whether this repository opts in to Awl, which decides whether the guidance is sent. */
export async function startModel($: EngineInterface) {
  try {
    const ran = await $.process.run(['awl', 'status'], { timeoutMs: 5_000 })
    enabled = ran.exitCode === 0 && (JSON.parse(ran.stdout) as { state: string }).state !== 'disabled'
  } catch {
    enabled = false
  }
}

/** The system prompt's sections, with the findings guidance last while this repository opts in to Awl. */
export function withGuidance(sections: readonly PromptComposeSection[], isEnabled: boolean): readonly PromptComposeSection[] {
  return isEnabled ? [...sections, { id: 'awl:findings', text: GUIDANCE, scope: 'session' }] : sections
}

export function registerModel(on: On) {
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    return { sections: withGuidance(composed.sections, enabled) }
  })
}
