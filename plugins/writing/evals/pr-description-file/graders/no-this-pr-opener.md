---
type: regex
target: { source: file, path: PR_BODY.md }
pattern: '^\s*This (PR|pull request|commit|change)\b'
flags: mi
match: not_contains
---
