---
type: llm
---
PASS if the report identifies `formatLegacySku` in `src/utils/legacyFormat.ts` as dead/unused code AND keeps `GET` in `src/routes/health/route.ts` alive (recognizing it as a Next.js / file-based route entry point, not dead code).
FAIL if it marks `GET` in `route.ts` as dead code to delete, or fails to flag `formatLegacySku`.
