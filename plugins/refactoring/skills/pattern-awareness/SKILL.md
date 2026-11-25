---
name: pattern-awareness
description: This skill should be used when writing new code, adding a class or service, creating a component, or building something structurally similar to existing code. Recognizes when new code converges toward an existing pattern in the codebase or adds another instance of a pattern with 3 or more occurrences, and surfaces library reimplementations and convention divergences without forcing adoption.
---

# Pattern awareness

While writing code, recognize when the new code is converging toward an existing pattern in the codebase, or adding another instance of a pattern that already has 3 or more occurrences.

## What to watch for

**Adding instance N+1 of a behavioral shape.** If the codebase already has 3 or more pieces of code sharing the same behavioral structure (manual retry with backoff, manual mapping between similar types, manual validation pipelines, custom event dispatch loops), and the code being written adds another, flag it: "This is the 4th manual retry implementation. Extract a shared utility or adopt a library?"

**Reimplementing functionality a library handles.** If the code does what a mature library in this ecosystem already handles, mention the library as an option. Do not force adoption; surface the alternative so the user can decide. In some projects "no new dependencies" is a load-bearing constraint and rolling your own is correct. The job is to make the trade-off visible.

**Diverging from an existing convention.** If the codebase has an established way of doing something (all repositories follow one interface shape, all services use one error handling approach, all event handlers register through one mechanism), and the new code does it differently, note the divergence before it is committed.

## Steering

- **Do not interrupt flow for every similarity.** Flag only when the pattern has 3 or more existing instances, or when a clear ecosystem-standard library exists for what is being written. Two similar pieces of code are coincidence.
- **Mention, do not mandate.** "The codebase has 3 similar retry implementations. Continue with a 4th, or consolidate?" beats refusing to write the code.
- **Behavioral similarity matters; syntactic similarity does not.** Two classes with similar constructor signatures follow a DI convention. Two pieces of code that both build, cache, and invalidate the same kind of resource are a pattern.
- **Check before claiming.** Before saying "the codebase has N instances of X", verify by searching. Never guess from one file.
- **Respect intentional duplication.** Three near-identical implementations sometimes exist because the right abstraction has not surfaced yet, and forcing one prematurely costs more than it saves. If the codebase shows signs of deliberately preserving the duplication, defer.
