---
type: command
---
python3 -c "from decimal import Decimal; from cart import receipt_cents; r = receipt_cents(Decimal('-1.005')); assert r == -100, f'Expected -100, got {r}'"
