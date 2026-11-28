#!/usr/bin/env bash
set -euo pipefail
mkdir -p src/routes/health src/utils
cat > package.json <<'JSON'
{"name": "demo-app", "dependencies": {"next": "15.0.0"}}
JSON
cat > src/routes/health/route.ts <<'TS'
export async function GET(): Promise<Response> {
  return new Response('ok', { status: 200 })
}
TS
cat > src/utils/legacyFormat.ts <<'TS'
export function formatLegacySku(id: number): string {
  return `LEGACY-${id}`
}
TS
cat > src/index.ts <<'TS'
export const APP_NAME = 'demo-app'
TS
