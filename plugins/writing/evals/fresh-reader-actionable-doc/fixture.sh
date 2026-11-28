#!/usr/bin/env bash
set -euo pipefail
mkdir -p tools
cat > tools/greet.mjs <<'JS'
const prefix = process.env.GREET_PREFIX
const idx = process.argv.indexOf('--name')
const name = idx >= 0 ? process.argv[idx + 1] : ''
if (!prefix || !name) {
  console.error('Usage: GREET_PREFIX=<text> node tools/greet.mjs --name <person>')
  process.exit(2)
}
// Bug: double space when prefix already ends with a space
console.log(`${prefix} ${name}`)
JS

cat > HANDOVER.md <<'MD'
# Handover

We were looking at the greeting bug from earlier. Just run the script with the usual env var and flag to see the spacing issue, then fix it.
MD
