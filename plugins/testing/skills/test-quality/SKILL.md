---
name: test-quality
description: Which tests are worth writing and which are noise. Load before writing, editing, reviewing or deleting tests, or touching any test file (test projects, test/ and tests/ folders, *.test.*, *.spec.*, test_*.py, *_test.go and similar).
---

# Adversarial test quality gate

Before writing any test, answer: **if this test were deleted, would confidence in the codebase decrease?** If no, do not write it.

## Noise: do not write tests that verify these

1. **Constructor or property assignment**: DI wiring assigns fields. The container guarantees this; if it fails the app will not start.
2. **Mock configuration verification**: asserting a mock was called with particular arguments tests the test's own setup.
3. **Trivial mapping**: field-for-field copies arriving intact after a mapper or serializer runs, unless the mapping has conditional logic or transforms data.
4. **Framework behavior**: that the ORM persists, the HTTP client sends, the logger logs, the queue enqueues. Trust the framework.
5. **Constant or enum value assertions**: a constant equals its literal value. These cannot regress independently of their definition.
6. **Configuration binding**: the config loader picks up values from the file or environment.

## Valuable: write tests that verify these

1. **State transitions**: calling method X moves the system from state A to state B, especially when the transition has conditions or side effects.
2. **Boundary conditions**: edge cases where off-by-one, null propagation, or empty collections change the behavior path.
3. **Business rules**: domain logic that enforces invariants. "Cannot withdraw more than balance." "Expired tokens are rejected."
4. **Error paths with consequences**: "throws and rolls back partial work and notifies the caller", not merely "throws".
5. **Integration boundaries**: where code meets external systems. Queries return expected shapes; responses parse correctly.
6. **Regression anchors**: reproducing a bug that was found and fixed, to prevent recurrence.

## The adversarial stance

- **Fewer, better tests.** Three tests that catch real regressions beat ten that test wiring.
- **If in doubt, drop it.** A missing test can be added when a real bug reveals the gap. A noise test inflates count, slows CI, and creates false confidence.
- **Challenge every assertion.** For each, ask: what production bug would make this fail? No concrete answer means remove the assertion. If that empties the test, drop the test.
- **No reflection.** A test that needs reflection to reach private members means the code wants restructuring: extract the logic to an internal method or a separate class and test that.
- **Match production shape.** Fixtures use realistic data structures. Partial objects that omit fields the code reads downstream pass in isolation and miss real bugs.
