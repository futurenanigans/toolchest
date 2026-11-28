---
type: regex
pattern: '\.(?:unwrap|expect)\s*\('
match: not_contains
target: { source: file, path: src/lib.rs }
---
