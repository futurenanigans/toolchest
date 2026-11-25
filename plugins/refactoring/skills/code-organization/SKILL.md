---
name: code-organization
description: Where a new file goes and whether new code belongs in the file it is landing in. Load before creating a source file or folder, placing new code, or adding code to an existing source file in any language.
---

# Code organization

Two decisions recur whenever code is added: where a new file goes, and whether new code belongs in the file it is landing in. Placement follows the project's established pattern when one exists. Unit size and responsibility boundaries apply regardless of pattern, and they decide placement when no pattern exists or when the established pattern is itself a god-file pattern.

## Placement against an established pattern

Place files where the existing structure says they belong, not where it is convenient.

Determine the pattern in this order:

1. A structure report (`.claude/state/structure-report.md`, written by `architecture-scan`) or architecture documentation. If present, use the detected pattern.
2. Architectural conventions documented in the project's `CLAUDE.md`.
3. The directory structure itself: interfaces in the domain layer for Clean Architecture, all concerns together for Vertical Slice, layer-matching for N-Layer, feature folders for Feature-First.

When the pattern is clear:

- **Place files without commentary.** No need to explain the architecture.
- **Note briefly** when the user specifies a location that conflicts with the pattern: "The project places repository interfaces in `domain/`. Put this there instead of `services/`?"
- **Respect hybrids.** Layers at the project level with features inside each layer is a legitimate choice; both levels are valid.
- **Do not flag framework-prescribed locations.** Routes, public assets, build artifacts, and framework configuration files are framework conventions, not architectural choices.

If no clear pattern exists, do not invent one. Use the unit-of-decomposition defaults below and place the new unit next to the most related existing code.

## The append decision

God files accrete one "just add it here" at a time, so the load-bearing moment is the decision to add code to a file that already exists. Ask: is this a new reason for the file to change? A file should have one reason to change. If the new code introduces a second responsibility, it wants its own home.

Signals the new code does not belong in the file it is landing in:
- It shares no state or private helpers with what is already there; it is co-located for convenience only.
- It adds a new import cluster (a new external dependency, a new domain concept) the file did not need before.
- The file's job now needs "and" to describe ("handles auth and formats invoices").
- The file is already near a size boundary (below) and this pushes it over.

When these hold, extract to a sibling unit instead of appending.

## Size as a forcing function, not a hard limit

Line count is a smell. A threshold exists to force an active "should this split?" decision instead of letting the file drift to 2,000 lines unnoticed.

- **200 to 300 lines**: start looking for a natural seam. Usually fine; stay aware.
- **500 lines**: there is almost always a responsibility that wants to leave. Find the seam and extract before adding more.
- **Beyond that**: the file is a god file already; splitting is overdue.

Split at logical boundaries (a cohesive cluster of functions plus their private helpers, a distinct responsibility), never at an arbitrary line number. A clean 600-line file with one responsibility can be correct; a 250-line file doing three unrelated things is not.

## Unit of decomposition by project type

- **Frontend / SPA (React, Vue, Svelte)**: the unit is the component, the hook or composable, and the plain module. Pull data-fetching and stateful logic into a hook or composable; pull pure helpers into a module; keep the component to render plus wiring. A component growing past a screen of markup usually has a hook trying to escape.
- **Backend service, layered or Clean**: the unit is the class or module per responsibility, placed by layer (handler or controller, service or use case, repository, domain model). A new responsibility crosses into the layer it belongs to instead of fattening the handler.
- **Library / package**: the unit is public API surface versus internals. Keep the exported entry point thin and stable; push implementation into internal modules the public file re-exports.
- **CLI**: the unit is the command. One command or command group per file; shared logic in a lib module. A dispatcher growing a branch per command is a god file forming.
- **Data / pipeline**: the unit is the stage (extract, transform, load) or the step. Keep stages in separate modules with explicit inputs and outputs.

When the project type is ambiguous or hybrid, place the new unit next to the most related existing code and keep it single-responsibility. Discoverability beats cleverness.

## Steering: stay quiet unless a real boundary is crossed

- **Do not over-split.** One function per file and premature abstraction are their own anti-patterns and violate scope restraint. Introduce a new unit for a real second responsibility, a real size problem, or a boundary worth enforcing (a crate, package, or project that makes a dependency direction or visibility rule mechanical, where a folder of modules cannot), never for a hypothetical future caller. A floor of roughly 150 lines exists to prevent fragmentation; small cohesive files that grow together belong together.
- **Act without narrating.** When the right split is obvious, place the new code in its own unit with no lecture about single responsibility. Extract silently the way a null check gets added.
- **Flag, do not mandate, judgment calls.** If splitting an existing god file is warranted but touches how others import it, or the seam is not clean, surface it: "This file is at about 600 lines covering auth and billing. Extract billing into its own module, or keep going here?" Then let the user decide.
- **Do not reorganize adjacent code the task did not touch.** This rule governs the code being written. A pre-existing god file that is only being read is out of scope unless the user asks or the task actively adds to it; `file-decomposition` handles an explicit request to split one.
