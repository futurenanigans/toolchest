---
type: regex
target: { source: file, path: .git/COMMIT_EDITMSG }
pattern: '^\s*This (PR|commit|change)\b'
flags: mi
match: not_contains
---
