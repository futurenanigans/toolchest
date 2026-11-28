#!/usr/bin/env bash
set -euo pipefail
mkdir -p src/parsers src/ingest/decoders .claude/state
cat > .claude/state/structure-report.md <<'MD'
# Sensor ingest layout

During migration, existing parsers stay in src/parsers. New wire decoders belong in src/ingest/decoders, one file per unit. Callers import each decoder directly.
MD
cat > src/parsers/seconds.ts <<'TS'
export function decodeSeconds(text: string): number {
  const match = /^(-?\d+(?:\.\d+)?) s$/.exec(text)
  if (!match) throw new RangeError('invalid seconds')
  return Number(match[1])
}
TS
