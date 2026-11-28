# The compiler-based scanners: the .NET SDK's Security analyzers (a build with
# config/analyzers.targets imported), Dotnetarium's taint analysis, and the NuGet
# vulnerable-package listing. All three share one restore whose bin/ and obj/ output goes to the
# results directory, so the scanned repository is never written to.

# Prints the project and solution files to analyze, one absolute path per line. Explicit
# --project values win; otherwise each scan path contributes the solutions directly inside it,
# else the projects below it, else the nearest project above it.
dotnet_targets() {
  if [[ ${#SCAN_PROJECTS[@]} -gt 0 ]]; then
    printf '%s\n' "${SCAN_PROJECTS[@]}"
    return
  fi
  local path dir found
  for path in "${SCAN_PATHS[@]}"; do
    case "$path" in
      *.sln|*.slnx|*.csproj) abs_path "$path"; continue ;;
    esac
    if [[ -d "$path" ]]; then dir="$(abs_path "$path")"; else dir="$(abs_path "$(dirname "$path")")"; fi
    if [[ -d "$path" ]]; then
      found="$(solutions_in "$dir")"
      [[ -z "$found" ]] && found="$(find "$dir" \( -name bin -o -name obj -o -name node_modules -o -name .git \) -prune -o -name '*.csproj' -print | sort)"
    else
      found=""
    fi
    [[ -z "$found" ]] && found="$(nearest_project_above "$dir")"
    if [[ -n "$found" ]]; then printf '%s\n' "$found"; fi
  done | awk '!seen[$0]++'
}

# The solutions directly in DIR; a .slnx wins over a .sln of the same name.
solutions_in() {
  local dir="$1" f stem
  for f in "$dir"/*.slnx; do [[ -f "$f" ]] && echo "$f"; done
  for f in "$dir"/*.sln; do
    [[ -f "$f" ]] || continue
    stem="${f%.sln}"
    [[ -f "$stem.slnx" ]] || echo "$f"
  done
}

nearest_project_above() {
  local dir="$1" root f
  root="$(repo_root)"
  while :; do
    for f in "$dir"/*.csproj; do [[ -f "$f" ]] && { echo "$f"; return; }; done
    [[ "$dir" == "$root" || "$dir" == / ]] && return
    dir="$(dirname "$dir")"
  done
}

dotnet_artifacts_dir() { echo "$RESULTS/dotnet-artifacts"; }

# Environment that sends MSBuild output to the results directory for tools that evaluate projects
# themselves (Dotnetarium, `dotnet list package`); environment variables are MSBuild properties.
dotnet_env() {
  env ArtifactsPath="$(dotnet_artifacts_dir)" UseArtifactsOutput=true DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1 "$@"
}

# Restores every target once; the dotnet scanners that follow reuse the assets. NuGetAudit is off
# because restore stores its advisory warnings in the assets file, Dotnetarium then reports them
# as workspace errors and marks its input degraded; the packages scanner reports those advisories.
# Returns non-zero when any restore fails, after logging it.
dotnet_restore_all() {
  local log="$RESULTS/dotnet-restore.log" t rc=0
  : > "$log"
  while IFS= read -r t; do
    dotnet_env dotnet restore "$t" --artifacts-path "$(dotnet_artifacts_dir)" -p:NuGetAudit=false \
      -nologo -v:q >> "$log" 2>&1 || rc=$?
  done < "$RESULTS/dotnet-targets.txt"
  return $rc
}

# Runs TOOLS over a `git archive` export of the baseline commit, in a subshell with ROOT and
# RESULTS pointed at the export, and removes from each tool's findings those the baseline already
# had. Findings match on tool, rule, file and message, so moved lines still match. The match is
# counted: when the scan has more findings with one rule, file and message than the baseline had,
# the extra ones are kept (those on the highest lines; which of them is new cannot be told).
subtract_dotnet_baseline() {
  local tools=("$@") tree="$RESULTS/baseline-tree" base="$RESULTS/baseline" tool
  rm -rf "$tree" "$base"; mkdir -p "$tree" "$base"
  git archive --format=tar "$BASELINE" | tar -x -C "$tree"
  local t
  while IFS= read -r t; do
    t="$tree/${t#"$ROOT"/}"
    [[ -f "$t" ]] && echo "$t"
  done < "$RESULTS/dotnet-targets.txt" > "$base/dotnet-targets.txt"

  (
    ROOT="$tree"; RESULTS="$base"; BASELINE=""
    : > "$RESULTS/status.tsv"
    [[ -s "$RESULTS/dotnet-targets.txt" ]] || exit 0
    dotnet_restore_all || exit 0
    for tool in "${tools[@]}"; do "scan_$tool"; done
  ) > "$base/run.log" 2>&1 || true

  for tool in "${tools[@]}"; do
    if has_status "$tool" failed || has_status "$tool" skipped; then continue; fi
    if [[ ! -f "$base/$tool.json" ]] || has_status "$tool" failed "$base/status.tsv"; then
      record "$tool" partial "the baseline $BASELINE could not be analyzed, so these are all findings in the scanned paths, not only new ones; see $base"
      continue
    fi
    jq --slurpfile old "$base/$tool.json" '
      def key: [.rule, .file, .message] | tojson;
      (reduce ($old[0][] | key) as $k ({}; .[$k] += 1)) as $known
      | [ group_by(key)[] | sort_by(.line) | .[($known[.[0] | key] // 0):][] ]
      | sort_by([.rule, .file, .line, .message])' \
      "$RESULTS/$tool.json" > "$RESULTS/$tool.new.json"
    mv "$RESULTS/$tool.new.json" "$RESULTS/$tool.json"
  done
  rm -rf "$tree"
}

scan_analyzers() {
  local sarif_dir="$RESULTS/analyzers-sarif" log="$RESULTS/analyzers.log" t rc=0
  rm -rf "$sarif_dir"; mkdir -p "$sarif_dir"
  : > "$log"
  while IFS= read -r t; do
    dotnet_env dotnet build "$t" --no-restore --no-incremental -nologo -v:q \
      --artifacts-path "$(dotnet_artifacts_dir)" \
      -p:CustomBeforeMicrosoftCommonTargets="$GIMLET_ROOT/config/analyzers.targets" \
      -p:GimletSarifDir="$sarif_dir" >> "$log" 2>&1 || rc=$?
  done < "$RESULTS/dotnet-targets.txt"

  local f sarif=()
  for f in "$sarif_dir"/*.sarif; do
    if [[ -f "$f" ]]; then sarif+=("$f"); fi
  done
  if [[ ${#sarif[@]} -eq 0 ]]; then
    echo '[]' > "$RESULTS/analyzers.json"
    record analyzers failed "the build (exit $rc) wrote no SARIF, so no project was analyzed; see $log"
    return
  fi
  {
    echo '[]'
    for f in "${sarif[@]}"; do sarif_to_findings analyzers "$ROOT" Security < "$f"; done
  } | jq -s 'add | unique_by([.rule, .file, .line, .message])' | apply_scope > "$RESULTS/analyzers.json"

  if [[ $rc -ne 0 ]]; then
    record analyzers partial "build failed (exit $rc); projects that did not compile were not analyzed; see $log"
  else
    record analyzers ok
  fi
}

scan_dotnetarium() {
  if ! dotnet --list-runtimes 2>/dev/null | grep -qE '^Microsoft\.NETCore\.App 1[0-9]\.'; then
    record dotnetarium skipped "needs the .NET 10 or later runtime"
    return
  fi
  try_install ensure_dotnetarium
  if [[ $INSTALL_RC -ne 0 ]]; then
    echo '[]' > "$RESULTS/dotnetarium.json"
    record dotnetarium failed "dotnetarium could not be installed; the error is printed above the summary"
    return
  fi
  local log="$RESULTS/dotnetarium.log" t i=0 rc out
  rm -f "$RESULTS"/dotnetarium-*.sarif
  : > "$log"
  local failures=() degraded=0
  while IFS= read -r t; do
    i=$((i + 1)); out="$RESULTS/dotnetarium-$i.sarif"; rc=0
    dotnet_env "$(dotnetarium_bin)" "$t" -p --sarif "$out" >> "$log" 2>&1 || rc=$?
    if [[ $rc -ge 2 || ! -f "$out" ]]; then
      failures+=("$(relative_to_root "$t") (exit $rc)")
      continue
    fi
    jq -e '.runs[0].invocations[0].properties["dotnetarium.inputStatus"] == "degraded"' "$out" >/dev/null && degraded=1
  done < "$RESULTS/dotnet-targets.txt"

  local f
  {
    echo '[]'
    for f in "$RESULTS"/dotnetarium-*.sarif; do
      [[ -f "$f" ]] || continue
      sarif_to_findings dotnetarium "$ROOT" < "$f"
    done
  } | jq -s 'add | unique_by([.rule, .file, .line, .message])' | apply_scope > "$RESULTS/dotnetarium.json"

  if [[ ${#failures[@]} -eq $i ]]; then
    record dotnetarium failed "failed on every target: ${failures[*]}; see $log"
  elif [[ ${#failures[@]} -gt 0 ]]; then
    record dotnetarium partial "failed on ${failures[*]}; see $log"
  elif [[ $degraded -eq 1 ]]; then
    record dotnetarium partial "input status degraded (unresolved references or compiler errors reduce coverage); see the 'Input warning' lines in $log"
  else
    record dotnetarium ok
  fi
}

scan_packages() {
  local log="$RESULTS/packages.log" t i=0 rc out failures=()
  rm -f "$RESULTS"/packages-*.raw.json
  : > "$log"
  while IFS= read -r t; do
    i=$((i + 1)); out="$RESULTS/packages-$i.raw.json"; rc=0
    dotnet_env dotnet list "$t" package --vulnerable --include-transitive --format json > "$out" 2>> "$log" || rc=$?
    if [[ $rc -ne 0 ]] || ! jq -e '.projects' "$out" >/dev/null 2>&1; then
      failures+=("$(relative_to_root "$t") (exit $rc)")
      cat "$out" >> "$log" 2>/dev/null
      rm -f "$out"
    fi
  done < "$RESULTS/dotnet-targets.txt"

  local f
  {
    echo '[]'
    for f in "$RESULTS"/packages-*.raw.json; do
      [[ -f "$f" ]] || continue
      jq --arg root "${ROOT%/}/" '
        [ .projects[] as $p
          | $p.frameworks[]?
          | (.topLevelPackages[]? | . + {direct: true}), (.transitivePackages[]? | . + {direct: false})
          | . as $pkg
          | .vulnerabilities[]?
          | {
              tool: "packages",
              rule: (.advisoryurl | sub(".*/"; "")),
              package: $pkg.id,
              severity: ({"Critical": "error", "High": "error", "Moderate": "warning", "Low": "note"}[.severity] // "warning"),
              file: ($p.path | if startswith($root) then .[($root | length):] else . end),
              line: null,
              message: "\($pkg.id) \($pkg.resolvedVersion) (\(if $pkg.direct then "direct" else "transitive" end)): \(.severity) advisory \(.advisoryurl)"
            }
        ]' "$f"
    done
  } | jq -s 'add | unique_by([.rule, .file, .message])' > "$RESULTS/packages.json"

  if [[ ${#failures[@]} -gt 0 ]]; then
    record packages partial "could not list packages for ${failures[*]}; see $log"
  else
    record packages ok
  fi
}

# Runs the selected compiler-based scanners over the discovered targets.
run_dotnet_scanners() {
  local wanted=() tool
  for tool in analyzers dotnetarium packages; do
    selected "$tool" || continue
    if [[ "$tool" == packages && -n "$BASELINE" ]] && ! manifests_changed; then
      record packages skipped "no project, props or lock file changed since $BASELINE"
      continue
    fi
    wanted+=("$tool")
  done
  [[ ${#wanted[@]} -gt 0 ]] || return 0

  if ! have dotnet; then
    for tool in "${wanted[@]}"; do record "$tool" skipped "the dotnet CLI is not installed"; done
    return
  fi
  dotnet_targets > "$RESULTS/dotnet-targets.txt"
  if [[ ! -s "$RESULTS/dotnet-targets.txt" ]]; then
    for tool in "${wanted[@]}"; do record "$tool" skipped "no .sln, .slnx or .csproj found for the scanned paths"; done
    return
  fi
  echo "gimlet: dotnet targets: $(relative_to_root_list < "$RESULTS/dotnet-targets.txt")"

  if ! dotnet_restore_all; then
    for tool in "${wanted[@]}"; do record "$tool" failed "dotnet restore failed; see $RESULTS/dotnet-restore.log"; done
    return
  fi
  local code_tools=()
  for tool in "${wanted[@]}"; do
    "scan_$tool"
    [[ "$tool" == packages ]] && continue
    has_status "$tool" skipped || has_status "$tool" failed || code_tools+=("$tool")
  done
  if [[ -n "$BASELINE" && ${#code_tools[@]} -gt 0 ]]; then
    echo "gimlet: analyzing $BASELINE to subtract the findings it already had"
    subtract_dotnet_baseline "${code_tools[@]}"
  fi
}
