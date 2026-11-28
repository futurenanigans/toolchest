#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.invalid
git config user.name eval
mkdir -p src tests
cat > src/account.ts <<'TS'
export const MAX_DAILY_WITHDRAWAL = 50000

export class Account {
  constructor(private balance: number) {}
  withdraw(amount: number): number {
    if (amount > this.balance) throw new Error('insufficient funds')
    this.balance -= amount
    return this.balance
  }
}
TS
cat > tests/account.test.ts <<'TS'
import { expect, test } from 'bun:test'
import { Account, MAX_DAILY_WITHDRAWAL } from '../src/account'

test('daily withdrawal limit constant is 50000', () => {
  expect(MAX_DAILY_WITHDRAWAL).toBe(50000)
})

test('withdraw rejects overdraft beyond balance', () => {
  const acct = new Account(100)
  expect(() => acct.withdraw(150)).toThrow('insufficient funds')
})
TS
git add . && git commit -qm "Seed account suite"
