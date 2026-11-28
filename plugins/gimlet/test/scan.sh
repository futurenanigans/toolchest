#!/usr/bin/env bash
set -euo pipefail
GIMLET_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
gimlet="$GIMLET_ROOT/bin/gimlet"
# shellcheck source=../config/defaults.env
source "$GIMLET_ROOT/config/defaults.env"
# shellcheck source=../lib/common.sh
source "$GIMLET_ROOT/lib/common.sh"
# shellcheck source=../lib/install.sh
source "$GIMLET_ROOT/lib/install.sh"
ensure_jq
fixture="$(mktemp -d)"
trap 'rm -rf "$fixture"' EXIT
export GIMLET_RESULTS_DIR="$fixture/scan results"
mkdir "$fixture/project with spaces" "$fixture/empty project" "$fixture/rules"
cat > "$fixture/rules/marker.yaml" <<'RULE'
rules:
  - id: smoke-marker
    languages: [python]
    pattern: print("smoke marker")
    message: Fixture marker found
    severity: INFO
RULE

cd "$fixture/project with spaces"
git init -q
echo 'print("smoke marker")' > marker.py
git add marker.py
scan() { bash "$gimlet" scan --only opengrep,analyzers --rules "$fixture/rules"; }
report="$GIMLET_RESULTS_DIR/report.json"
assert_clean() {
  jq -e '.findings == [] and
    ([.scanners[] | [.tool,.status]] | sort) == [["analyzers","skipped"],["opengrep","ok"]]' "$report" >/dev/null
}
scan
jq -e --slurpfile legacy "$GIMLET_RESULTS_DIR/findings.json" '
  .findings == $legacy[0] and (.findings | map([.rule,.file])) == [["smoke-marker","marker.py"]]' "$report" >/dev/null

bash "$gimlet" query --rule smoke-marker --format json | jq -e '.findings | length == 1' >/dev/null

echo 'print("ordinary text")' > marker.py
scan
assert_clean
cd "$fixture/empty project"
git init -q
scan
assert_clean

echo 'malformed: [' > "$fixture/rules/marker.yaml"
rc=0
scan || rc=$?
[[ "$rc" == 1 ]]
jq -e '.findings == [] and any(.scanners[]; .tool == "opengrep" and .status == "failed" and (.detail | length > 0))' "$report" >/dev/null
