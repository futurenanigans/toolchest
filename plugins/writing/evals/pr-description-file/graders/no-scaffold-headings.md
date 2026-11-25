---
type: regex
target: { source: file, path: PR_BODY.md }
pattern: '^#{1,6}\s*(Summary|Changes|Testing|Test plan)\b'
flags: mi
match: not_contains
---
