---
type: llm
---
PASS if the report identifies `OrderManager` in `src/orderManager.ts` as mixing multiple unrelated responsibilities (HTTP parsing, persistence/SQL, email notification, CSV formatting) and proposes concrete module/collaborator extraction seams with file:line evidence.
FAIL if it reports no maintainability findings or gives only vague style advice.
