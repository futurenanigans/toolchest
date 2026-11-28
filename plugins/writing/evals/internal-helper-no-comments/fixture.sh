#!/usr/bin/env bash
set -euo pipefail
mkdir -p src
cat > src/pricing.ts <<'TS'
// Prices a cart for checkout: line totals and the order total, in integer cents.
interface Line {
  unitCents: number
  quantity: number
}

export function orderTotal(lines: Line[]): number {
  return lines.reduce((sum, line) => sum + line.unitCents * line.quantity, 0)
}
TS
