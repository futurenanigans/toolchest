#!/usr/bin/env bash
set -euo pipefail
mkdir -p src
cat > src/money.ts <<'TS'
export function addCents(a: number, b: number): number {
  return a + b
}

export function splitEvenly(totalCents: number, parts: number): number[] {
  const base = Math.floor(totalCents / parts)
  const rem = totalCents - base * parts
  return Array.from({ length: parts }, (_, i) => base + (i < rem ? 1 : 0))
}
TS
