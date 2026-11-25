---
type: regex
target: { source: file, path: .git/COMMIT_EDITMSG }
pattern: '[\u2013\u2014]'
match: not_contains
---
