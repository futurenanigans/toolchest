---
type: regex
pattern: 'impl\s+(?:std::fmt::|fmt::)?Display\s+for\s+PortError|#\[derive\([^)]*Error'
target: { source: file, path: src/lib.rs }
---
