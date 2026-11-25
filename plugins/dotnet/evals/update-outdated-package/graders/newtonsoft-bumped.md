---
type: regex
target: { source: file, path: src/Ledger/Ledger.csproj }
pattern: 'Include="Newtonsoft\.Json" Version="13\.0\.1"'
match: not_contains
---
