---
type: regex
target: { source: file, path: README.md }
pattern: '^#{1,6} +[A-Za-z]\S*(?: +[A-Z][a-z]+)+\s*$'
flags: m
match: not_contains
---
