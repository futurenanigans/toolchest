---
type: regex
target: { source: file, path: README.md }
pattern: '^#{1,6} .*\b(overview|key features|features|contributing|license)\b'
flags: mi
match: not_contains
---
