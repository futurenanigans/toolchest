// Every advisory check, in the order their warnings reach the model, and the checks the awl and loom analyzers take over.
import { secrets, skipAttributes, testDeletion, typeDowngrade } from './content-checks'
import { collectionFirst, readmeGuidance, swallowedCatch } from './structure-checks'
import type { Check, CheckInput } from './text'

export type { CheckInput } from './text'
export { isReadme } from './structure-checks'

export const CHECKS: readonly Check[] = [collectionFirst, readmeGuidance, secrets, skipAttributes, swallowedCatch, testDeletion, typeDowngrade]

export type Advice = { check: string; message: string; corrects: boolean }

export const CORRECTING_CHECKS: readonly Check[] = CHECKS.filter(check => !check.guidance)

export type Delegation = { marker: string; extensions: ReadonlySet<string>; checks: ReadonlySet<string> }

const ANALYZER_COVERED = [collectionFirst.name, swallowedCatch.name, typeDowngrade.name]

export const DELEGATIONS: readonly Delegation[] = [
  { marker: '.awl/awl.json', extensions: new Set(['.cs']), checks: new Set(ANALYZER_COVERED) },
  {
    marker: '.loom/loom.json',
    extensions: new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.vue']),
    checks: new Set([...ANALYZER_COVERED, skipAttributes.name]),
  },
]

export const adviseAll = (input: CheckInput, skipped: ReadonlySet<string> = new Set()): Advice[] =>
  CHECKS.filter(({ name }) => !skipped.has(name)).flatMap(({ name, advise, guidance }) => {
    const message = advise(input)?.trim()
    return message ? [{ check: name, message, corrects: !guidance }] : []
  })
