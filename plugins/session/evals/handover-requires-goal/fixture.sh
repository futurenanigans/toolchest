#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.invalid
git config user.name eval
cat > cart.py <<'PY'
from decimal import Decimal, ROUND_HALF_EVEN
def receipt_cents(amount: Decimal) -> int:
    return int((amount * 100).quantize(Decimal("1"), rounding=ROUND_HALF_EVEN))
PY
cat > README.md <<'MD'
# Receipt service
MD
git add . && git commit -qm "Seed fixture"
printf "
# TODO: switch receipt rounding to half-up
" >> cart.py
printf "
Draft: document the nightly export schedule.
" >> README.md
