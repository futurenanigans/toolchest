---
type: command
---
python3 -c "t = open('HANDOVER.md').read(); missing = [s for s in ['tools/greet.mjs', 'GREET_PREFIX', '--name'] if s not in t]; assert not missing, f'Missing: {missing}'"
