---
type: regex
target: { source: file, path: PR_BODY.md }
pattern: '^\s*[-*] \[[ xX]\]'
flags: m
match: not_contains
---
