---
type: regex
pattern: 'let\s+Some\([^)]*\)\s*=[^{;]*&&|&&\s*let\s+'
match: not_contains
target: { source: file, path: src/lib.rs }
arm: both
---
