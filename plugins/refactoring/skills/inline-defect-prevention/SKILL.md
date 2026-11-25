---
name: inline-defect-prevention
description: Defect shapes to catch while writing code. Data loss paths, unvalidated input at trust boundaries, swallowed errors, resource leaks, race-prone sequences and defensive cruft. Load before writing or editing source code in any language.
---

# Inline defect prevention

Apply review-level defect awareness while writing code. Catch the bug before it is committed, not in a post-hoc review.

## Watch for these while writing

- **Data loss paths**: operations that write or delete without confirming success, or that proceed past failure without rollback.
- **Security boundaries**: user input reaching a query, command, or filesystem path without validation or parameterization; trust boundaries crossed without authorization checks.
- **Null and empty propagation**: defaulting a missing value to a usable-looking placeholder that silently changes behavior downstream; assuming non-empty when the source can be empty.
- **Concurrency hazards**: shared state mutated without coordination; ordering assumptions the runtime does not guarantee.
- **Resource leaks**: handles, connections, file descriptors, subscriptions, or timers acquired without a release path on every exit.
- **Misplaced or swallowing error handling**: interior code wrapped in try/catch that swallows or rethrows without context; bare `catch (e) {}` or `catch (e) { log(e.message) }` without rethrow; logging an error and returning success. The global error-handling rules say where catching belongs.
- **Defensive cruft**: null checks for values the type system or framework already guarantees; optional-chaining cascades on shapes the types declare non-nullable; validation duplicated at every layer when the boundary already enforced it; comments that narrate what the code says; `TODO` comments left in place of work.
- **Race-prone patterns**: read-then-write sequences without atomicity where the value can change between the two; loops that mutate the collection they iterate.

The mechanics vary by language and runtime. The shapes are the same: an operation that can fail, a code path that does not notice, a downstream consumer that proceeds anyway.

## How to respond

- **Fix silently** when the fix is obvious and does not change behavior: adding a null check, parameterizing a query, scoping a resource to its lifetime, narrowing an exception catch.
- **Flag explicitly** when the fix involves a design choice the user should weigh: transaction scope, auth strategy, error handling policy, concurrency model, retry behavior. These have multiple valid answers; the user picks.
- **Prioritize correctness and security** over style. Do not flag naming or formatting unless it masks a bug or creates concrete maintenance risk.
