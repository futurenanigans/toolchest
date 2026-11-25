---
name: file-decomposition
description: Splits a large file into well-bounded modules. Presents a decomposition plan first, then executes step by step with characterization tests before each move. Use only when the user explicitly asks to "decompose this file", "split this file into modules", or "break up this large file". Files under 300 lines rarely benefit.
argument-hint: '"path/to/large-file.ext"'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Edit, Write, Bash, Agent
---

`--auto` is not applicable: decomposition requires interactive plan approval and sequential extraction steps that depend on each other. If present, abort with that explanation.

Break a large file into well-bounded modules. Files under 300 lines with clear internal structure rarely benefit. Focus on files where distinct responsibilities are entangled, not merely co-located.

Justify why members belong together rather than being split further or merged elsewhere.

Read the file in full. Map who imports what from it. Present the plan before executing:

```markdown
## Decomposition Plan: {filename} ({lines} lines to {n} modules)

### Module {n}: `{proposed-file-name}`
Responsibility: {what it owns}
Reason to change: {what would cause this module to change independently}
Members: {functions/types}
Consumers: {who imports from this}

### Rejected Alternatives
| Considered | Rejected because |
|-----------|-----------------|

### Extraction Order
| Step | Module | Risk | Why this order |
|------|--------|------|---------------|
```

After approval, execute step by step using a subagent per step. Start with modules that have the fewest consumers and fewest dependencies on other proposed modules. Write characterization tests for any untested code before moving it. Run build and tests in the main context after each step. Commit if passing.

After all extractions, the original file should contain only orchestration or re-exports. Remove any temporary facades that are no longer needed.

If the file's coupling is too tight for clean separation, say so instead of forcing it.
