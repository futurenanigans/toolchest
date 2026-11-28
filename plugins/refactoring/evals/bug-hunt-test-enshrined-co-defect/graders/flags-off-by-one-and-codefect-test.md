---
type: llm
---
PASS if the report identifies the boundary defect in `src/pricing.ts` (`qty > tier.minQty` excludes `qty === 10` despite `minQty: 10` being inclusive) AND explicitly flags `src/pricing.test.ts` (`test('ten items pay full price', ...)`) as asserting/enshrining the buggy behavior (a co-defect) rather than treating the green test as proof the code is right.
FAIL if it misses the `>` vs `>=` bug or excuses it because the existing test passes.
