#!/usr/bin/env bash
set -euo pipefail
mkdir -p src
cat > src/tax.ts <<'TS'
// Ceiling rounding is required by legacy billing exports (see test billing_export_rounds_up).
export function roundCents(value: number): number {
  return Math.ceil(value)
}

export function applyDiscount(amount: number, pct: number): number {
  return amount * (1 + pct / 100)
}
TS
