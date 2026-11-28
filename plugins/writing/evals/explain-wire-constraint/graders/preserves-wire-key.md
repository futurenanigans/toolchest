---
type: regex
pattern: 'return\s*\{\s*recieptTotal:\s*total\s*\}'
target: { source: file, path: src/receipt.ts }
arm: both
---
