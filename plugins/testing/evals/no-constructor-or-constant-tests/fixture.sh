#!/usr/bin/env bash
set -euo pipefail
mkdir -p src
cat > src/account.ts <<'TS'
export const MAX_WITHDRAWAL_CENTS = 50_000

export class Account {
  constructor(public readonly owner: string, private balanceCents: number) {}

  get balance(): number {
    return this.balanceCents
  }

  withdraw(cents: number): void {
    if (cents <= 0) throw new RangeError('amount must be positive')
    if (cents > MAX_WITHDRAWAL_CENTS) throw new RangeError('over the withdrawal limit')
    if (cents > this.balanceCents) throw new RangeError('insufficient funds')
    this.balanceCents -= cents
  }
}
TS
