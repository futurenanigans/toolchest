---
type: regex
pattern: '(?:(?://|/\*)[^\n]*(?:[Ll]egacy|[Cc]ompatib|older|consumer|client|till|wire))'
target: { source: file, path: src/receipt.ts }
arm: both
---
