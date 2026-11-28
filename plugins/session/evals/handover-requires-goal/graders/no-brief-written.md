---
type: command
---
python3 -c "from pathlib import Path; p = Path('.claude/handover'); assert not p.exists() or not list(p.glob('*.md')), list(p.glob('*.md'))"
