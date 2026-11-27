---
type: regex
pattern: 'public class Cart \{[\s\S]*public void Add\(decimal price\) \{'
target: { source: file, path: src/Cart.cs }
arm: both
---
