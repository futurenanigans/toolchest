---
type: regex
target: { source: file, path: .git/COMMIT_EDITMSG }
pattern: '^\s*[-*] \[[ xX]\]'
flags: m
match: not_contains
---
