---
type: regex
pattern: 'expect\(MAX_WITHDRAWAL_CENTS\)\.to(Be|Equal)\('
match: not_contains
target: { source: file, path: src/account.test.ts }
---
