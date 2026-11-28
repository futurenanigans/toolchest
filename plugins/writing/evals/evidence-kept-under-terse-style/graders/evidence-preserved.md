---
type: command
---
python3 -c "t = open('docs/verification.md').read(); missing = [s for s in ['src/auth/token.ts:84', 'ERR_TOKEN_EXPIRED', 'bun test src/auth/', '14'] if s not in t]; assert not missing, f'Missing: {missing}'"
