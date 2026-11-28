// Every advisory check, in the order their warnings reach the model.
import { pipedExitCode, secrets, skipAttributes, testDeletion } from './content-checks'
import { readmeGuidance } from './readme-guidance'
import type { Check, CheckInput } from './text'

export type { CheckInput } from './text'
export { isShell } from './text'
export { isReadme } from './readme-guidance'

export const CHECKS: readonly Check[] = [pipedExitCode, readmeGuidance, secrets, skipAttributes, testDeletion]

export type Advice = { check: string; message: string; corrects: boolean }

export const CORRECTING_CHECKS: readonly Check[] = CHECKS.filter(check => !check.guidance)

export const adviseAll = (input: CheckInput): Advice[] =>
  CHECKS.flatMap(({ name, advise, guidance }) => {
    const message = advise(input)?.trim()
    return message ? [{ check: name, message, corrects: !guidance }] : []
  })
