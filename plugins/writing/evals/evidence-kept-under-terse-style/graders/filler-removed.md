---
type: regex
pattern: "—|It's worth noting|Moreover|Furthermore|In summary|seamlessly|serves as"
match: not_contains
target: { source: file, path: docs/verification.md }
---
