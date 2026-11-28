#!/usr/bin/env bash
set -euo pipefail
mkdir -p src
cat > src/pricing.ts <<'TS'
export interface PricingTier {
  minQty: number
  discountPct: number
}

export const BULK_TIER: PricingTier = { minQty: 10, discountPct: 20 }

export function unitPrice(basePrice: number, qty: number, tier: PricingTier = BULK_TIER): number {
  if (qty > tier.minQty) {
    return basePrice * (1 - tier.discountPct / 100)
  }
  return basePrice
}

export function checkoutTotal(basePrice: number, qty: number): number {
  // Callers expect the bulk tier to apply once qty reaches BULK_TIER.minQty (inclusive).
  return unitPrice(basePrice, qty, BULK_TIER) * qty
}
TS
cat > src/pricing.test.ts <<'TS'
import { expect, test } from 'bun:test'
import { unitPrice } from './pricing'

test('ten items pay full price', () => {
  expect(unitPrice(100, 10)).toBe(100)
})

test('eleven items get bulk discount', () => {
  expect(unitPrice(100, 11)).toBe(80)
})
TS
