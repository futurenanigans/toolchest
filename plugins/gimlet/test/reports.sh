#!/usr/bin/env bash
set -euo pipefail
GIMLET_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=../config/defaults.env
source "$GIMLET_ROOT/config/defaults.env"
# shellcheck source=../lib/common.sh
source "$GIMLET_ROOT/lib/common.sh"
# shellcheck source=../lib/install.sh
source "$GIMLET_ROOT/lib/install.sh"
# shellcheck source=../lib/scan.sh
source "$GIMLET_ROOT/lib/scan.sh"
# shellcheck source=../lib/probe.sh
source "$GIMLET_ROOT/lib/probe.sh"

RESULTS="$(mktemp -d)"
trap 'rm -rf "$RESULTS"' EXIT
: > "$RESULTS/status.tsv"
ensure_jq

# Replay the CLI report without a server or installed Python dependencies.
uv() { return 0; }
run_schemathesis() {
  local dir="$RESULTS/schemathesis-report"
  mkdir -p "$dir"
  cat > "$dir/example.json" <<'JSON'
{"seed":42,"stop_reason":"completed","failures":[{"code":"fixture","severity":"medium","title":"Fixture mismatch","count":1,"operations":["GET /example"]}]}
JSON
  return 1
}
TARGET=http://127.0.0.1 AUTH_HEADER='' GIMLET_SCHEMATHESIS_MAX_SECONDS=1 probe_schemathesis
write_report schemathesis
jq -e '.scanners == [{tool:"schemathesis",status:"ok",detail:"seed 42; stopped by completed"}] and
  (.findings | map([.tool,.rule,.severity,.file])) == [["schemathesis","fixture","warning","GET /example"]]' "$RESULTS/report.json" >/dev/null

# Exercise gimlet query filtering and SARIF 2.1.0 output.
bash "$GIMLET_ROOT/bin/gimlet" query "$RESULTS" --severity warning --tool schemathesis --format text | grep -q "schemathesis/fixture"
bash "$GIMLET_ROOT/bin/gimlet" query "$RESULTS" --severity error --format json | jq -e '.findings | length == 0' >/dev/null
bash "$GIMLET_ROOT/bin/gimlet" query "$RESULTS" --format sarif | jq -e '.version == "2.1.0" and
  .runs[0].invocations == [{executionSuccessful: true, toolExecutionNotifications: []}] and
  (.runs[0].results | map([.ruleId, .locations])) ==
    [["schemathesis/fixture", [{logicalLocations: [{fullyQualifiedName: "GET /example"}]}]]]' >/dev/null

# A failed scanner with no findings must not read as a clean SARIF run.
record spectral failed "fixture failure"
echo '[{"tool":"spectral","rule":"r","severity":"error","file":"api docs/openapi.json","line":null,"message":"m"}]' > "$RESULTS/spectral.json"
write_report spectral
bash "$GIMLET_ROOT/bin/gimlet" query "$RESULTS" --format sarif | jq -e '
  .runs[0].invocations[0].executionSuccessful == false and
  (.runs[0].invocations[0].toolExecutionNotifications | map([.level, .message.text])) ==
    [["error", "spectral failed: fixture failure"]] and
  .runs[0].results[0].locations == [{physicalLocation: {artifactLocation: {uri: "api%20docs/openapi.json"}}}]' >/dev/null

if is_windows; then
  # Force the PowerShell fallback on hosts where Git Bash also supplies unzip.
  have() { [[ "$1" != unzip ]] && command -v "$1" >/dev/null; }
  printf fixture > "$RESULTS/input.txt"
  GIMLET_TEST_INPUT="$(cygpath -w "$RESULTS/input.txt")" GIMLET_TEST_ARCHIVE="$(cygpath -w "$RESULTS/tool's archive.zip")" \
    powershell.exe -NoProfile -NonInteractive -Command \
      'Compress-Archive -LiteralPath $env:GIMLET_TEST_INPUT -DestinationPath $env:GIMLET_TEST_ARCHIVE'
  unpack_zip "$RESULTS/tool's archive.zip" "$RESULTS/tool's directory"
  cmp "$RESULTS/input.txt" "$RESULTS/tool's directory/input.txt"
fi
