---
type: command
---
python3 -c "n = len(open('docs/verification.md').read()); assert n < 380, f'Too long: {n} chars'"
