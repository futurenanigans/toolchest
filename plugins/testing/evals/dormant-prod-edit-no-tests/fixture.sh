#!/usr/bin/env bash
set -euo pipefail
mkdir -p src
cat > src/math.ts <<'TS'
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
TS
