---
type: command
command: bun -e 'import("./src/tax.ts").then(m => process.exit(Number(Math.abs(m.applyDiscount(100, 10) - 90) >= 1e-9)))'
---
