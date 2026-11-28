#!/usr/bin/env bash
set -euo pipefail
cat > BLUEPRINT.md <<'MD'
### Orientation
Read src/store.ts.

### Critical Details
All public functions return typed errors.

### Build Sequence
Task 1: Add cache store
Files: src/cache.ts
Acceptance: bun test src/cache.spec.ts passes
Context: Critical Details
Dependencies: none

Task 2: Wire cache into store
Files: src/store.ts
Acceptance: bun test src/store.spec.ts passes
Context: Critical Details
Dependencies: 1
MD
