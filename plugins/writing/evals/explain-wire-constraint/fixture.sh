#!/usr/bin/env bash
set -euo pipefail
mkdir -p src tests
cat > src/receipt.ts <<'TS'
export function receipt(total: number) {
  return { recieptTotal: total }
}
TS
cat > tests/receipt.test.ts <<'TS'
import { expect, test } from 'bun:test'
import { receipt } from '../src/receipt'

test('legacy till accepts the original wire spelling', () => {
  expect(receipt(12)).toEqual({ recieptTotal: 12 })
})
TS
