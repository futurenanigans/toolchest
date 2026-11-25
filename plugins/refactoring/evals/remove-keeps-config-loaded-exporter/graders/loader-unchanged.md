---
type: regex
target: { source: file, path: shipper/__main__.py }
pattern: 'getattr\(importlib\.import_module\(module_name\), function_name\)'
---
