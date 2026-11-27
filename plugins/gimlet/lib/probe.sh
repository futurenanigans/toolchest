# `gimlet probe`: tests a running HTTP API through its OpenAPI document. Spectral lints the
# document with the OWASP API Security ruleset, Schemathesis fuzzes every operation against its
# contract, and ZAP runs an active scan. The API must already be running; gimlet does not start it.

ALL_PROBES=(spectral schemathesis zap)
OPENAPI_CANDIDATES=(openapi/v1.json swagger/v1/swagger.json)

# Active scanning sends attack payloads, so a target off this machine needs --allow-remote.
is_local_url() {
  [[ "$1" =~ ^https?://(localhost|127\.[0-9.]+|\[::1\])(:[0-9]+)?(/|$) ]]
}

fetch_openapi() {
  local dest="$1" candidate
  if [[ -n "$OPENAPI" ]]; then
    if [[ -f "$OPENAPI" ]]; then cp "$OPENAPI" "$dest"; return; fi
    curl_get -o "$dest" "$OPENAPI" || die "could not fetch the OpenAPI document from $OPENAPI"
    return
  fi
  for candidate in "${OPENAPI_CANDIDATES[@]}"; do
    if curl_get -o "$dest" "${TARGET%/}/$candidate" 2>/dev/null && jq -e '.openapi // .swagger' "$dest" >/dev/null 2>&1; then
      OPENAPI="${TARGET%/}/$candidate"
      return
    fi
  done
  die "no OpenAPI document at ${OPENAPI_CANDIDATES[*]} under $TARGET; pass --openapi URL or FILE"
}

ensure_spectral() (
  local dest="$TOOLS_DIR/spectral/$GIMLET_SPECTRAL_VERSION-$GIMLET_SPECTRAL_OWASP_VERSION"
  [[ -x "$dest/node_modules/.bin/spectral" ]] && exit 0
  need npm
  rm -rf "$dest"; mkdir -p "$dest"
  npm install --prefix "$dest" --no-audit --no-fund --ignore-scripts --save-exact \
    "@stoplight/spectral-cli@$GIMLET_SPECTRAL_VERSION" \
    "@stoplight/spectral-owasp-ruleset@$GIMLET_SPECTRAL_OWASP_VERSION" >&2 \
    || { rm -rf "$dest"; die "npm install of spectral failed"; }
)

spectral_dir() { echo "$TOOLS_DIR/spectral/$GIMLET_SPECTRAL_VERSION-$GIMLET_SPECTRAL_OWASP_VERSION"; }

probe_spectral() {
  if ! have npm; then record spectral skipped "npm is not installed"; return; fi
  ensure_spectral
  local dir out="$RESULTS/spectral.raw.json" rc=0
  dir="$(spectral_dir)"
  # The ruleset names the OWASP package, which Spectral resolves from the ruleset's own directory.
  cp "$GIMLET_ROOT/config/spectral-ruleset.yaml" "$dir/ruleset.yaml"
  "$dir/node_modules/.bin/spectral" lint "$RESULTS/openapi.json" --ruleset "$dir/ruleset.yaml" \
    -f json -o "$out" --quiet > "$RESULTS/spectral.log" 2>&1 || rc=$?
  if [[ $rc -gt 1 || ! -f "$out" ]]; then
    echo '[]' > "$RESULTS/spectral.json"
    record spectral failed "spectral exited with status $rc; see $RESULTS/spectral.log"
    return
  fi
  jq '[ .[] | {
        tool: "spectral",
        rule: .code,
        severity: (["error", "warning", "note", "note"][.severity] // "warning"),
        file: "openapi.json",
        line: (.range.start.line + 1),
        message: "\(.path | map(tostring) | join(".")): \(.message)"
      } ]' "$out" > "$RESULTS/spectral.json"
  record spectral ok
}

probe_schemathesis() {
  if ! have uv; then record schemathesis skipped "uv is not installed (https://docs.astral.sh/uv/)"; return; fi
  local rc=0 report_dir="$RESULTS/schemathesis-report" args=()
  rm -rf "$report_dir"
  args=(run "$RESULTS/openapi.json" --url "$TARGET" --max-time "$GIMLET_SCHEMATHESIS_MAX_SECONDS"
        --report json --report-dir "$report_dir")
  [[ -n "$AUTH_HEADER" ]] && args+=(-H "$AUTH_HEADER")
  # Schemathesis writes .schemathesis/ and .hypothesis/ caches into its working directory.
  (cd "$RESULTS" && uv tool run --from "schemathesis==$GIMLET_SCHEMATHESIS_VERSION" schemathesis "${args[@]}") \
    > "$RESULTS/schemathesis.log" 2>&1 || rc=$?
  local report
  report="$(ls "$report_dir"/*.json 2>/dev/null | head -1)"
  if [[ $rc -gt 1 || -z "$report" ]]; then
    echo '[]' > "$RESULTS/schemathesis.json"
    record schemathesis failed "schemathesis exited with status $rc; see $RESULTS/schemathesis.log"
    return
  fi
  jq '[ .failures[] as $f
        | $f.operations[]
        | {
            tool: "schemathesis",
            rule: $f.code,
            severity: ({"critical": "error", "high": "error", "medium": "warning", "low": "note"}[$f.severity] // "warning"),
            file: .,
            line: null,
            message: "\($f.title) (\($f.count) failing cases across the run; reproductions in schemathesis.log)"
          } ]' "$report" > "$RESULTS/schemathesis.json"
  record schemathesis ok "seed $(jq -r .seed "$report"); stopped by $(jq -r .stop_reason "$report")"
}

zap_dir() { echo "$TOOLS_DIR/zap/$GIMLET_ZAP_TAG"; }

ensure_zap() (
  local dest tmp asset url
  dest="$(zap_dir)"
  [[ -f "$dest/zap.sh" ]] && exit 0
  need curl
  asset="ZAP_${GIMLET_ZAP_TAG#v}_Crossplatform.zip"
  mkdir -p "$TOOLS_DIR/zap"
  tmp="$(mktemp -d "$TOOLS_DIR/zap/.download.XXXXXX")"
  trap 'rm -rf "$tmp"' EXIT
  url="$GIMLET_GITHUB_DOWNLOAD/$GIMLET_ZAP_REPO/releases/download/$GIMLET_ZAP_TAG/$asset"
  download_pinned "$url" "$tmp/$asset" "GIMLET_SHA256_${asset//[.-]/_}"
  unpack_zip "$tmp/$asset" "$tmp/unpacked"
  rm -rf "$dest"
  mv "$tmp/unpacked/ZAP_${GIMLET_ZAP_TAG#v}" "$dest"
  echo "installed ZAP $GIMLET_ZAP_TAG at $dest" >&2
)

probe_zap() {
  if is_windows; then record zap skipped "gimlet runs ZAP through zap.sh, which needs Linux or macOS"; return; fi
  if ! have java; then record zap skipped "Java 17 or later is not installed"; return; fi
  ensure_zap
  local rc=0 home="$RESULTS/zap-home" report_dir="$RESULTS/zap-report"
  rm -rf "$home" "$report_dir"; mkdir -p "$home" "$report_dir"
  # ZAP validates integer plan fields before substituting ${VAR}, so the plan is rendered here.
  local plan
  plan="$(< "$GIMLET_ROOT/config/zap-plan.yaml")"
  plan="${plan//\$\{GIMLET_TARGET\}/${TARGET%/}}"
  plan="${plan//\$\{GIMLET_OPENAPI_FILE\}/$RESULTS/openapi.json}"
  plan="${plan//\$\{GIMLET_ZAP_REPORT_DIR\}/$report_dir}"
  plan="${plan//\$\{GIMLET_ZAP_MAX_MINUTES\}/$GIMLET_ZAP_MAX_MINUTES}"
  printf '%s\n' "$plan" > "$RESULTS/zap-plan.yaml"

  local env_vars=(GIMLET=1)
  if [[ -n "$AUTH_HEADER" ]]; then
    env_vars+=(ZAP_AUTH_HEADER="${AUTH_HEADER%%:*}" ZAP_AUTH_HEADER_VALUE="$(echo "${AUTH_HEADER#*:}" | sed 's/^ *//')")
  fi
  env "${env_vars[@]}" bash "$(zap_dir)/zap.sh" -cmd -silent -dir "$home" \
    -autorun "$RESULTS/zap-plan.yaml" > "$RESULTS/zap.log" 2>&1 || rc=$?
  if [[ ! -f "$report_dir/zap.json" ]]; then
    echo '[]' > "$RESULTS/zap.json"
    record zap failed "ZAP exited with status $rc without a report; see $RESULTS/zap.log"
    return
  fi
  jq '[ .site[]?.alerts[]?
        | {
            tool: "zap",
            rule: "zap-\(.pluginid)",
            severity: ({"3": "error", "2": "warning", "1": "note", "0": "note"}[.riskcode] // "warning"),
            file: ((.instances[0].method // "") + " " + (.instances[0].uri // "")),
            line: null,
            message: "\(.alert) (\(.instances | length) instances, confidence \(.confidence)); cwe \(.cweid)"
          } ]' "$report_dir/zap.json" > "$RESULTS/zap.json"
  if [[ $rc -ne 0 ]]; then
    record zap partial "ZAP exited with status $rc after writing its report; see $RESULTS/zap.log"
  else
    record zap ok
  fi
}

cmd_probe() {
  TARGET="" OPENAPI="" AUTH_HEADER=""
  local only="" allow_remote=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --url) TARGET="${2:?--url needs the API base URL}"; shift 2 ;;
      --openapi) OPENAPI="${2:?--openapi needs a URL or file}"; shift 2 ;;
      --auth-header) AUTH_HEADER="${2:?--auth-header needs 'Name: value'}"; shift 2 ;;
      --only) only="${2:?--only needs a probe list}"; shift 2 ;;
      --allow-remote) allow_remote=1; shift ;;
      *) die "probe: unknown option $1" ;;
    esac
  done
  [[ -n "$TARGET" ]] || die "probe: --url is required"
  [[ -z "$AUTH_HEADER" || "$AUTH_HEADER" == *:* ]] || die "--auth-header must look like 'Name: value'"
  if ! is_local_url "$TARGET" && [[ $allow_remote -eq 0 ]]; then
    die "$TARGET is not on this machine; probing sends attack traffic, so pass --allow-remote only for a target you are authorized to test"
  fi
  need curl; ensure_jq

  local probes=("${ALL_PROBES[@]}") list_items=() t
  if [[ -n "$only" ]]; then
    IFS=, read -ra list_items <<< "$only"
    for t in "${list_items[@]}"; do
      [[ " ${ALL_PROBES[*]} " == *" $t "* ]] || die "unknown probe '$t' (known: ${ALL_PROBES[*]})"
    done
    probes=("${list_items[@]}")
  fi

  ROOT="$(repo_root)"
  RESULTS="$(results_dir)/probe"
  rm -rf "$RESULTS"; mkdir -p "$RESULTS"
  : > "$RESULTS/status.tsv"
  fetch_openapi "$RESULTS/openapi.json"
  echo "gimlet: probes ${probes[*]}; target $TARGET; openapi ${OPENAPI}"
  for t in "${probes[@]}"; do "probe_$t"; done

  local files=()
  for t in "${ALL_PROBES[@]}"; do [[ -f "$RESULTS/$t.json" ]] && files+=("$RESULTS/$t.json"); done
  if [[ ${#files[@]} -gt 0 ]]; then jq -s 'add' "${files[@]}" > "$RESULTS/findings.json"; else echo '[]' > "$RESULTS/findings.json"; fi
  print_summary
  echo
  echo "results: $RESULTS/findings.json"
  if cut -f2 "$RESULTS/status.tsv" | grep -qx failed; then
    die "one or more probes failed; their findings are missing from the results"
  fi
}
