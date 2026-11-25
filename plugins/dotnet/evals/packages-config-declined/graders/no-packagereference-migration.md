---
type: regex
target: { source: file, path: Legacy/Legacy.csproj }
pattern: 'PackageReference|Sdk="Microsoft\.NET\.Sdk"'
match: not_contains
---
