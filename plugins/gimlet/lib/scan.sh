# `gimlet scan`: parses options, runs the selected scanners from the repository root, records each
# scanner's status, and merges their normalized findings into findings.json with a printed summary.

ALL_SCANNERS=(opengrep analyzers dotnetarium packages osv secrets)

# The physical path, symlinks resolved, so it compares equal to repo_root's.
abs_path() {
  local p="$1"
  if [[ -d "$p" ]]; then (cd "$p" && pwd -P); else echo "$(cd "$(dirname "$p")" && pwd -P)/$(basename "$p")"; fi
}

relative_to_root() {
  local p="$1"
  if [[ "$p" == "$ROOT" ]]; then echo .; else echo "${p#"$ROOT"/}"; fi
}

relative_to_root_list() {
  local line paths=()
  while IFS= read -r line; do paths+=("$(relative_to_root "$line")"); done
  echo "${paths[*]}"
}

selected() {
  local tool="$1" t
  for t in ${SCANNERS[@]+"${SCANNERS[@]}"}; do [[ "$t" == "$tool" ]] && return 0; done
  return 1
}

# Sets TOOL's status (ok, partial, skipped, failed) and an optional detail in status.tsv,
# replacing an earlier status for the same tool.
record() {
  local file="$RESULTS/status.tsv"
  awk -F'\t' -v t="$1" '$1 != t' "$file" > "$file.tmp"
  printf '%s\t%s\t%s\n' "$1" "$2" "${3:-}" >> "$file.tmp"
  mv "$file.tmp" "$file"
}

# Succeeds when TOOL's status in FILE (default: this run's status.tsv) is STATUS.
has_status() {
  awk -F'\t' -v t="$1" -v s="$2" '$1 == t && $2 == s { found = 1 } END { exit !found }' "${3:-$RESULTS/status.tsv}"
}

# The files staged in the index that differ from the baseline, the set opengrep's baseline mode
# compares.
changed_files() {
  git diff --cached --name-only "$BASELINE" --
}

manifests_changed() {
  grep -qiE '(\.csproj|\.fsproj|\.vbproj|\.props|\.targets|packages\.lock\.json|packages\.config|\.deps\.json|nuget\.config|package(-lock)?\.json|yarn\.lock|pnpm-lock\.yaml)$' "$RESULTS/changed.txt"
}

# Restricts a findings array on stdin to the scan paths.
apply_scope() {
  filter_findings "${REL_PATHS[@]}"
}

parse_scanner_list() {
  local list="$1" t
  IFS=, read -ra list_items <<< "$list"
  for t in "${list_items[@]}"; do
    [[ " ${ALL_SCANNERS[*]} " == *" $t "* ]] || die "unknown scanner '$t' (known: ${ALL_SCANNERS[*]})"
  done
}

write_report() {
  local tool files=()
  for tool in "$@"; do
    [[ -f "$RESULTS/$tool.json" ]] && files+=("$RESULTS/$tool.json")
  done
  if [[ ${#files[@]} -gt 0 ]]; then
    jq -s 'add' "${files[@]}" > "$RESULTS/findings.json"
  else
    echo '[]' > "$RESULTS/findings.json"
  fi
  jq -Rn --slurpfile findings "$RESULTS/findings.json" '
    {scanners: [inputs | split("\t") | {tool: .[0], status: .[1], detail: .[2]}],
     findings: $findings[0]}' "$RESULTS/status.tsv" > "$RESULTS/report.json"
}

print_summary() {
  local tool status detail file count
  echo
  while IFS=$'\t' read -r tool status detail; do
    file="$RESULTS/$tool.json"
    count=0
    [[ -f "$file" ]] && count="$(jq length "$file")"
    case "$status" in
      ok)      printf '%-12s %4s findings%s\n' "$tool" "$count" "${detail:+  ($detail)}" ;;
      partial) printf '%-12s %4s findings  INCOMPLETE: %s\n' "$tool" "$count" "$detail" ;;
      skipped) printf '%-12s    -           SKIPPED: %s\n' "$tool" "$detail" ;;
      failed)  printf '%-12s    -           FAILED: %s\n' "$tool" "$detail" ;;
    esac
  done < "$RESULTS/status.tsv"

  jq -r --argjson n "$GIMLET_FINDINGS_SHOWN_PER_TOOL" '
    def rank: {"error": 0, "warning": 1, "note": 2}[.severity] // 3;
    group_by(.tool)[]
    | sort_by(rank, .file, .line)
    | "\n[\(.[0].tool)]",
      (.[:$n][] | "  \(.severity | ascii_upcase | .[0:4]) \(.file)\(if .line then ":\(.line)" else "" end)  \(.rule)  \(.message | gsub("\\s+"; " ") | .[0:160])"),
      (if length > $n then "  ... \(length - $n) more" else empty end)
  ' "$RESULTS/findings.json"
}

cmd_scan() {
  BASELINE="" AUDIT=0 SARIF=0 RULE_DIRS=() SCAN_PATHS=() SCAN_PROJECTS=()
  local only="" skip=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --baseline) BASELINE="${2:?--baseline needs a git ref}"; shift 2 ;;
      --audit) AUDIT=1; shift ;;
      --sarif) SARIF=1; shift ;;
      --rules) RULE_DIRS+=("$(abs_path "${2:?--rules needs a directory}")"); shift 2 ;;
      --project) SCAN_PROJECTS+=("${2:?--project needs a .sln, .slnx or .csproj}"); shift 2 ;;
      --only) only="${2:?--only needs a scanner list}"; shift 2 ;;
      --skip) skip="${2:?--skip needs a scanner list}"; shift 2 ;;
      --) shift; SCAN_PATHS+=("$@"); break ;;
      -*) die "scan: unknown option $1" ;;
      *) SCAN_PATHS+=("$1"); shift ;;
    esac
  done
  ensure_jq
  [[ ${#SCAN_PATHS[@]} -gt 0 ]] || SCAN_PATHS=(.)
  local p
  for p in "${SCAN_PATHS[@]}"; do [[ -e "$p" ]] || die "scan path $p does not exist"; done

  SCANNERS=("${ALL_SCANNERS[@]}")
  local list_items=()
  if [[ -n "$only" ]]; then parse_scanner_list "$only"; SCANNERS=("${list_items[@]}"); fi
  if [[ -n "$skip" ]]; then
    parse_scanner_list "$skip"
    local kept=() t
    for t in "${SCANNERS[@]}"; do [[ " ${list_items[*]} " == *" $t "* ]] || kept+=("$t"); done
    SCANNERS=(${kept[@]+"${kept[@]}"})
  fi

  ROOT="$(repo_root)"
  RESULTS="$(results_dir)"
  mkdir -p "$RESULTS"
  rm -f "$RESULTS"/*.json "$RESULTS"/*.sarif "$RESULTS"/status.tsv "$RESULTS"/changed.txt
  : > "$RESULTS/status.tsv"
  local abs=()
  for p in "${SCAN_PATHS[@]}"; do abs+=("$(abs_path "$p")"); done
  SCAN_PATHS=("${abs[@]}")
  abs=()
  for p in ${SCAN_PROJECTS[@]+"${SCAN_PROJECTS[@]}"}; do
    [[ -f "$p" ]] || die "--project $p does not exist"
    abs+=("$(abs_path "$p")")
  done
  SCAN_PROJECTS=(${abs[@]+"${abs[@]}"})
  REL_PATHS=()
  for p in "${SCAN_PATHS[@]}"; do
    [[ "$p" == "$ROOT" || "$p" == "$ROOT"/* ]] || die "scan path $p is outside the repository at $ROOT"
    REL_PATHS+=("$(relative_to_root "$p")")
  done
  cd "$ROOT"
  if [[ -n "$BASELINE" ]]; then
    git rev-parse --verify --quiet "$BASELINE^{commit}" >/dev/null || die "--baseline $BASELINE is not a git commit"
    changed_files > "$RESULTS/changed.txt"
  fi

  echo "gimlet: scanners ${SCANNERS[*]}; baseline ${BASELINE:-none}; paths ${REL_PATHS[*]}"
  selected opengrep && scan_opengrep
  run_dotnet_scanners
  selected osv && scan_osv
  selected secrets && scan_secrets

  if selected packages && selected osv && [[ -f "$RESULTS/packages.json" && -f "$RESULTS/osv.json" ]]; then
    # OSV reads NuGet references without restoring them; the SDK's resolved list is authoritative
    # for every package it reports, so OSV keeps only the advisories it adds.
    jq --slurpfile pkgs "$RESULTS/packages.json" \
      '[ .[] | select([.rule, .package] as $k | [$pkgs[0][] | [.rule, .package]] | index([$k]) | not) ]' \
      "$RESULTS/osv.json" > "$RESULTS/osv.dedup.json"
    mv "$RESULTS/osv.dedup.json" "$RESULTS/osv.json"
  fi

  write_report "${ALL_SCANNERS[@]}"
  print_summary
  echo
  echo "results: $RESULTS/report.json"
  if cut -f2 "$RESULTS/status.tsv" | grep -qx failed; then
    die "one or more scanners failed; their findings are missing from the results"
  fi
}
