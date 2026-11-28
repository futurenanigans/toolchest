---
type: llm
---
PASS if `.claude/memory/` no longer claims the API runs on port 3000 or uses Joi (either deleted as stale/derivable from code or corrected to 9090/zod), AND the durable staging migration preference ("never run migrations automatically against staging") is preserved.
FAIL if port 3000 / Joi remains unchallenged in memory or the staging rule was deleted.
