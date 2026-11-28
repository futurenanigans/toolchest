---
type: regex
pattern: '/\*|//(?! Prices a cart)'
match: not_contains
target: { source: file, path: src/pricing.ts }
---
