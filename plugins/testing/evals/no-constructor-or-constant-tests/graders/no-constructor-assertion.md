---
type: regex
pattern: '\.owner\)\.to(Be|Equal|StrictEqual)\('
match: not_contains
target: { source: file, path: src/account.test.ts }
---
