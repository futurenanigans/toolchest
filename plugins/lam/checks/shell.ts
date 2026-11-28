// Shell command text as pipelines of stages for the checks that read commands. Quoted text and comments are masked
// so a separator inside them splits nothing, a piped group is read as stages of its pipe, and each stage starts at
// its command word.

export type Stage = { masked: string; raw: string }

const QUOTED_OR_COMMENT = /'[^']*'|"(?:[^"\\]|\\.)*"|(?<![^\s;&|(])#[^\r\n]*/g
const GROUP_SEPARATOR = /&&|\|\||[;\r\n]/g
const PIPELINE_SEPARATOR = /&&|\|\||[;\r\n]|(?<![<>|])&(?![>&])/g
const STAGE_SEPARATOR = /\|&?/g
const PIPED_GROUP = /[({]([^(){}]*)[)}]((?:\s*\d*[<>]{1,2}&?\s*[^\s|&;]*)*\s*\|(?!\|))/g
const COMMAND_PREFIX =
  /^\s*(?:[({!]\s*|(?:if|then|else|elif|do|while|until|time|env|nice|sudo|command|exec|xargs|timeout\s+\S+|(?:uv|poetry|pdm|pipenv)\s+run|\w+=\S*)\s+)*/

const blank = (text: string): string => ' '.repeat(text.length)

export const maskQuoted = (command: string): string => command.replace(QUOTED_OR_COMMENT, blank)

export const maskComments = (command: string): string =>
  command.replace(QUOTED_OR_COMMENT, hidden => (hidden.startsWith('#') ? blank(hidden) : hidden))

function inlinePipedGroups(masked: string): string {
  const inlined = masked.replace(PIPED_GROUP, (_, inner: string, pipe: string) => ` ${inner.replace(GROUP_SEPARATOR, separator => '|'.padStart(separator.length))} ${pipe}`)
  return inlined === masked ? masked : inlinePipedGroups(inlined)
}

function split({ masked, raw }: Stage, separator: RegExp): Stage[] {
  const parts: Stage[] = []
  let start = 0
  for (const found of masked.matchAll(separator)) {
    parts.push({ masked: masked.slice(start, found.index), raw: raw.slice(start, found.index) })
    start = found.index + found[0].length
  }
  return [...parts, { masked: masked.slice(start), raw: raw.slice(start) }]
}

function atCommandWord({ masked, raw }: Stage): Stage {
  const lead = COMMAND_PREFIX.exec(masked)?.[0].length ?? 0
  return { masked: masked.slice(lead).trimEnd(), raw: raw.slice(lead).trimEnd() }
}

export const pipelines = (command: string): Stage[][] =>
  split({ masked: inlinePipedGroups(maskQuoted(command)), raw: maskComments(command) }, PIPELINE_SEPARATOR).map(pipeline =>
    split(pipeline, STAGE_SEPARATOR).map(atCommandWord),
  )
