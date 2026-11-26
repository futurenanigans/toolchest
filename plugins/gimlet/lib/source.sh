# The scanners that read files without building them: opengrep with the bundled rules, Betterleaks
# for secrets in files and git history, and OSV-Scanner for vulnerable packages in manifests and
# lock files of any ecosystem.

RULES_DIR="$GIMLET_ROOT/rules"
AUDIT_RULES_DIR="$GIMLET_ROOT/rules-audit"

scan_opengrep() {
  ensure_opengrep
  local configs=() out="$RESULTS/opengrep.raw.json" rc=0 d
  if [[ ${#RULE_DIRS[@]} -gt 0 ]]; then
    for d in "${RULE_DIRS[@]}"; do configs+=(--config "$d"); done
  else
    configs=(--config "$RULES_DIR")
  fi
  [[ $AUDIT -eq 1 ]] && configs+=(--config "$AUDIT_RULES_DIR")

  local args=(scan "${configs[@]}" --quiet --no-rewrite-rule-ids --json-output="$out" --max-lines-per-finding=3)
  [[ $SARIF -eq 1 ]] && args+=(--sarif-output "$RESULTS/opengrep.sarif")
  [[ -n "$BASELINE" ]] && args+=(--baseline-commit "$BASELINE")
  local rules=()
  for ((d = 1; d < ${#configs[@]}; d += 2)); do rules+=("${configs[d]#"$GIMLET_ROOT"/}"); done
  echo "gimlet: opengrep $(opengrep_current_tag); rules ${rules[*]}"

  # Exit status 1 means findings were reported; anything higher is an opengrep failure.
  "$(opengrep_bin)" "${args[@]}" "${REL_PATHS[@]}" > "$RESULTS/opengrep.log" 2>&1 || rc=$?
  if [[ $rc -gt 1 || ! -f "$out" ]]; then
    echo '[]' > "$RESULTS/opengrep.json"
    record opengrep failed "opengrep exited with status $rc; see $RESULTS/opengrep.log"
    return
  fi
  jq '[ .results[] | {
        tool: "opengrep",
        rule: .check_id,
        severity: ({"ERROR": "error", "WARNING": "warning", "INFO": "note"}[.extra.severity] // "warning"),
        file: .path,
        line: .start.line,
        message: .extra.message
      } ]' "$out" > "$RESULTS/opengrep.json"

  local partial
  partial="$(jq -r '[.errors[]? | select(.type == "PartialParsing" or (.type | tostring | test("PartialParsing"))) | .path // (.spans[0].file // empty)] | unique | join(", ")' "$out")"
  if [[ -n "$partial" ]]; then
    record opengrep partial "parser skipped regions of: $partial (findings there are missed)"
  else
    record opengrep ok
  fi
}

test_opengrep() {
  local rc=0
  ensure_opengrep
  "$(opengrep_bin)" scan --test "$RULES_DIR" || rc=$?
  "$(opengrep_bin)" scan --test "$AUDIT_RULES_DIR" || rc=$?
  return $rc
}

# Without a baseline and without explicit paths this scans the whole git history; with a baseline
# it scans the commits since it plus the staged changes; with explicit paths it scans those files
# as they are on disk. Secrets are redacted in every report.
scan_secrets() {
  ensure_betterleaks
  local bl common reports=() rc=0 log="$RESULTS/secrets.log"
  bl="$(betterleaks_bin)"
  common=(--redact --no-banner --no-color --exit-code 0 --report-format json)
  : > "$log"
  rm -f "$RESULTS"/secrets-*.raw.json

  local mode
  if [[ -n "$BASELINE" ]]; then
    mode="commits since $BASELINE plus staged changes"
    "$bl" git . --log-opts="$BASELINE..HEAD" "${common[@]}" --report-path "$RESULTS/secrets-commits.raw.json" >> "$log" 2>&1 || rc=$?
    [[ $rc -eq 0 ]] && { "$bl" git . --staged "${common[@]}" --report-path "$RESULTS/secrets-staged.raw.json" >> "$log" 2>&1 || rc=$?; }
  elif [[ "${REL_PATHS[*]}" == "." ]] && git rev-parse --git-dir >/dev/null 2>&1; then
    mode="full git history"
    "$bl" git . "${common[@]}" --report-path "$RESULTS/secrets-history.raw.json" >> "$log" 2>&1 || rc=$?
  else
    mode="files on disk"
    "$bl" dir "${REL_PATHS[@]}" "${common[@]}" --report-path "$RESULTS/secrets-files.raw.json" >> "$log" 2>&1 || rc=$?
  fi
  if [[ $rc -ne 0 ]]; then
    echo '[]' > "$RESULTS/secrets.json"
    record secrets failed "betterleaks exited with status $rc; see $log"
    return
  fi

  local f
  {
    echo '[]'
    for f in "$RESULTS"/secrets-*.raw.json; do
      [[ -f "$f" ]] || continue
      jq '[ .[] | {
            tool: "secrets",
            rule: .RuleID,
            severity: "error",
            file: .File,
            line: .StartLine,
            message: ("\(.Description)" + (if (.Commit // "") != "" then " (commit \(.Commit[0:12]))" else " (working tree)" end))
          } ]' "$f"
    done
  } | jq -s 'add | unique_by([.rule, .file, .line, .message])' > "$RESULTS/secrets.json"
  record secrets ok "scanned $mode"
}

scan_osv() {
  if [[ -n "$BASELINE" ]] && ! manifests_changed; then
    record osv skipped "no package manifest or lock file changed since $BASELINE"
    return
  fi
  ensure_osv
  local out="$RESULTS/osv.raw.json" rc=0
  "$(osv_bin)" scan source -r "${REL_PATHS[@]}" --format json --output-file "$out" > "$RESULTS/osv.log" 2>&1 || rc=$?
  case $rc in
    0|1) ;;
    128) echo '[]' > "$RESULTS/osv.json"; record osv skipped "no package manifests or lock files found"; return ;;
    *) echo '[]' > "$RESULTS/osv.json"; record osv failed "osv-scanner exited with status $rc; see $RESULTS/osv.log"; return ;;
  esac
  jq --arg root "${ROOT%/}/" '
    [ .results[]? as $r
      | $r.packages[]
      | . as $p
      | .vulnerabilities[]
      | {
          tool: "osv",
          rule: .id,
          package: $p.package.name,
          severity: ({"CRITICAL": "error", "HIGH": "error", "MODERATE": "warning", "MEDIUM": "warning", "LOW": "note"}[(.database_specific.severity // "") | ascii_upcase] // "warning"),
          file: ($r.source.path | if startswith($root) then .[($root | length):] else . end),
          line: null,
          message: "\($p.package.ecosystem) \($p.package.name) \($p.package.version): \(.summary // .id)"
        }
    ] | unique_by([.rule, .file, .package])' "$out" > "$RESULTS/osv.json"
  record osv ok
}
