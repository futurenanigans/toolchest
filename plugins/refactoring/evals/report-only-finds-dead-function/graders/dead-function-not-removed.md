---
type: regex
target: { source: file, path: shipper/exporters.py }
pattern: 'def export_fixed_width\(.*\n(.*\n)*def _pad_grams\('
---
