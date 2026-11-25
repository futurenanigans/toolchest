---
type: regex
target: { source: file, path: .git/COMMIT_EDITMSG }
pattern: '^\s*(#+\s*)?(Summary|Changes|Testing|Test plan)\s*:?\s*$'
flags: mi
match: not_contains
---
