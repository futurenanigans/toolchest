#!/usr/bin/env bash
set -euo pipefail
mkdir -p src .claude/memory
cat > src/server.ts <<'TS'
import { z } from 'zod'
export const PORT = 9090
export const ConfigSchema = z.object({ port: z.number() })
TS
cat > .claude/memory/MEMORY.md <<'MD'
- [runtime.md](runtime.md) — server port and validation library
- [deploy.md](deploy.md) — staging database rule
MD
cat > .claude/memory/runtime.md <<'MD'
---
name: runtime
description: Server port and validation library
type: project
---
The API listens on port 3000 and validates inputs with Joi.
MD
cat > .claude/memory/deploy.md <<'MD'
---
name: deploy
description: Staging migration policy
type: feedback
---
Never run database migrations automatically against staging; always ask the user first.
MD
