---
type: regex
target: { source: file, path: PR_BODY.md }
pattern: '[\u2013\u2014]'
match: not_contains
---
