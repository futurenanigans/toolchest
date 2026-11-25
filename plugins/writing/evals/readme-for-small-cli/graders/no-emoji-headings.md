---
type: regex
target: { source: file, path: README.md }
pattern: '^#.*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]'
flags: mu
match: not_contains
---
