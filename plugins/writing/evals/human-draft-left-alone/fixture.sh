#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.invalid
git config user.name eval
cat > README.md <<'MD'
# Receipt worker

Polls the `receipts` queue and writes PDF files to S3.

Run locally:

```bash
export QUEUE_URL=http://localhost:4566/000000000000/receipts
node worker.mjs
```

Health checks respond at `http://localhost:8080/healthz`.
Logs go to stdout as newline-delimited JSON.
MD
git add . && git commit -qm "Seed human README"
