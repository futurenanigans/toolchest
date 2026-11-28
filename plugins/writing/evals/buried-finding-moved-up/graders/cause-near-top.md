---
type: command
---
python3 -c "t = open('docs/incident-2026-11.md').read()[:420]; assert 'idleTimeoutMs' in t or '5000' in t or 'v2.4.1' in t, t"
