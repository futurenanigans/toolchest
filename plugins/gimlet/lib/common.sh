# Shared helpers for bin/gimlet: errors, downloads, platform detection, the data and results
# directories, and the normalized findings format every scanner writes.

DATA_DIR="${CLAUDE_PLUGIN_DATA:-${XDG_DATA_HOME:-$HOME/.local/share}/gimlet}"

die() { echo "gimlet: $*" >&2; exit 1; }
warn() { echo "gimlet: $*" >&2; }
need() { command -v "$1" >/dev/null 2>&1 || die "required tool '$1' is not installed"; }
have() { command -v "$1" >/dev/null 2>&1; }

curl_get() {
  curl --fail --silent --show-error --location --max-time "$GIMLET_HTTP_TIMEOUT_SECONDS" "$@"
}

is_windows() {
  case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) return 0 ;; *) return 1 ;; esac
}

exe_suffix() {
  if is_windows; then echo .exe; fi
}

# One of linux-x64, linux-arm64, darwin-x64, darwin-arm64, windows-x64.
platform() {
  local os arch
  os="$(uname -s)"; arch="$(uname -m)"
  case "$os/$arch" in
    Linux/x86_64)              echo linux-x64 ;;
    Linux/aarch64|Linux/arm64) echo linux-arm64 ;;
    Darwin/arm64)              echo darwin-arm64 ;;
    Darwin/x86_64)             echo darwin-x64 ;;
    MINGW*/x86_64|MSYS*/x86_64|CYGWIN*/x86_64) echo windows-x64 ;;
    *) die "unsupported platform $os/$arch" ;;
  esac
}

sha256_of() {
  if have sha256sum; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d' ' -f1
}

unpack_zip() {
  local zip="$1" dest="$2"
  if have unzip; then
    unzip -q -o "$zip" -d "$dest"
  elif have powershell.exe; then
    powershell.exe -NoProfile -NonInteractive -Command \
      "Expand-Archive -Force -LiteralPath '$(cygpath -w "$zip")' -DestinationPath '$(cygpath -w "$dest")'"
  else
    die "cannot unpack $zip: neither unzip nor powershell.exe is available"
  fi
}

repo_root() {
  local top
  if top="$(git rev-parse --show-toplevel 2>/dev/null)"; then (cd "$top" && pwd -P); else pwd -P; fi
}

# Results live in the plugin data directory, keyed by the scanned repository, so a scan never
# writes into the repository it reads.
results_dir() {
  local root
  root="$(repo_root)"
  echo "${GIMLET_RESULTS_DIR:-$DATA_DIR/results/$(basename "$root")-$(printf '%s' "$root" | cksum | cut -d' ' -f1)}"
}

# Converts SARIF 2.1.0 on stdin into normalized findings (a JSON array) for TOOL. URIs are made
# relative to ROOT; relative URIs resolve against the run's originalUriBaseIds. CATEGORY, when
# non-empty, keeps only results whose rule carries that properties.category.
sarif_to_findings() {
  local tool="$1" root="$2" category="${3:-}"
  jq --arg tool "$tool" --arg root "${root%/}/" --arg category "$category" '
    def strip_file: sub("^file://"; "");
    [ .runs[]? as $run
      | ($run.originalUriBaseIds // {}) as $bases
      | ([$run.tool.driver.rules[]? | {key: .id, value: (.properties.category // "")}] | from_entries) as $cats
      | $run.results[]?
      | select($category == "" or $cats[.ruleId] == $category)
      | (.locations[0].physicalLocation // {}) as $loc
      | ($loc.artifactLocation.uri // "") as $uri
      | (if ($uri | startswith("file://")) then ($uri | strip_file)
         elif ($loc.artifactLocation.uriBaseId // "") != "" then
           (($bases[$loc.artifactLocation.uriBaseId].uri // "") | strip_file) + $uri
         else $uri end) as $abs
      | {
          tool: $tool,
          rule: .ruleId,
          severity: (.level // "warning"),
          file: (if ($abs | startswith($root)) then $abs[($root | length):] else $abs end),
          line: ($loc.region.startLine // null),
          message: .message.text
        }
    ]'
}

# Keeps findings whose file is under one of PREFIXES (repo-relative, "." for all). Reads and
# writes a findings array.
filter_findings() {
  local prefixes
  prefixes="$(printf '%s\n' "$@" | jq -R . | jq -s .)"
  jq --argjson prefixes "$prefixes" '
    def under($f): any($prefixes[]; . as $p | $p == "." or $f == $p or ($f | startswith($p + "/")));
    [ .[] | select(under(.file)) ]'
}
