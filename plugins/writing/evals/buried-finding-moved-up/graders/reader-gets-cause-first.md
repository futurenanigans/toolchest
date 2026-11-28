---
type: llm
---
PASS if `docs/incident-2026-11.md` opens with the concrete root cause (`idleTimeoutMs` lowered to 5000 in v2.4.1 exhausting Postgres connections and causing 503s) and the revert fix (`9f2a1c4`), without burying it under generic overview or background sections.
FAIL if the root cause remains buried below background/overview prose or key facts (5000 vs 30000, v2.4.1, 503, revert) are lost.
