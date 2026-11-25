---
type: regex
target: { source: file, path: README.md }
pattern: '^\s*[-*] \*\*[^*]+\*\*:'
flags: m
match: not_contains
---
