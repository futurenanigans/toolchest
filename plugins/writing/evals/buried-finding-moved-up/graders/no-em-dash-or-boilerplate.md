---
type: regex
pattern: '—|## Overview|In summary'
match: not_contains
target: { source: file, path: docs/incident-2026-11.md }
---
