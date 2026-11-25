---
paths:
  - "**/*.cs"
  - "**/*.fs"
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
  - "**/*.mjs"
  - "**/*.cjs"
  - "**/*.vue"
  - "**/*.svelte"
  - "**/*.py"
  - "**/*.rs"
  - "**/*.go"
  - "**/*.java"
  - "**/*.kt"
  - "**/*.rb"
  - "**/*.swift"
  - "**/*.sql"
  - "**/*.ps1"
  - "**/*.sh"
---

# Comments

Code here is written and read by agents, and an agent treats every comment as a claim to verify, update or obey, so a comment that only restates the code is a cost. Write only two kinds:

1. A module doc: one short paragraph at the top of a file saying what it is responsible for, so a reader can decide whether to read the rest.
2. A constraint comment the code cannot express, carrying its anchor: the name of the test that keeps it true. A link or issue number is not an anchor; it records where a claim came from and proves nothing about the code beside it. When no test can pin the constraint, encode it in the code (a named constant, a type, a guard) instead of a comment.

Delete every other comment in lines you touch: doc comments on items, inline explanations, history, banners, commented-out code. Where an analyzer enforces this (Mortise in Rust), its finding is the rule.
