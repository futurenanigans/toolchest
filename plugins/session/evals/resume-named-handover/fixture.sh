#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.invalid
git config user.name eval
cat > cart.py <<'CART_EOF'
from decimal import Decimal, ROUND_HALF_EVEN

def receipt_cents(amount: Decimal) -> int:
    return int((amount * 100).quantize(Decimal("1"), rounding=ROUND_HALF_EVEN))
CART_EOF
cat > discount.py <<'DISC_EOF'
def ten_percent(cents: int) -> int:
    return cents // 10
DISC_EOF
cat > test_cart.py <<'TEST_EOF'
import unittest
from decimal import Decimal
from cart import receipt_cents

class ReceiptTests(unittest.TestCase):
    def test_half_cent_rounds_up(self):
        self.assertEqual(receipt_cents(Decimal("1.005")), 101)
TEST_EOF
git add . && git commit -qm "Seed cart fixture"
mkdir -p .claude/handover
cat > .claude/handover/cart.md <<'MD_EOF'
# Handover: positive receipt rounding

## Goal
Make positive half-cent receipt amounts round up (so `Decimal("1.005")` returns `101` cents) without changing negative amounts or the public signature `receipt_cents(amount: Decimal) -> int`.

## Failing test
Run `python3 -m unittest test_cart`. Currently `ReceiptTests.test_half_cent_rounds_up` fails with `100 != 101`.

## Scope
Only edit `cart.py`. Do not modify `discount.py`.
MD_EOF
