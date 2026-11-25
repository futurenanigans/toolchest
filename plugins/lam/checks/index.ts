// Every advisory check, in the order their warnings reach the model.
import { secrets, skipAttributes, testDeletion, typeDowngrade } from './content-checks'
import { collectionFirst, readmeGuidance, swallowedCatch } from './structure-checks'
import type { Check, CheckInput } from './text'

export type { CheckInput } from './text'
export { isReadme } from './structure-checks'

export const CHECKS: readonly Check[] = [collectionFirst, readmeGuidance, secrets, skipAttributes, swallowedCatch, testDeletion, typeDowngrade]

export type Advice = { check: string; message: string }

export const adviseAll = (input: CheckInput): Advice[] =>
  CHECKS.flatMap(({ name, advise }) => {
    const message = advise(input)?.trim()
    return message ? [{ check: name, message }] : []
  })
