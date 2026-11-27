# Installs the scanners gimlet runs into the plugin data directory. Every download is checked
# against a SHA-256 pinned in config/defaults.env and refused on mismatch; opengrep releases other
# than the pinned one are accepted only after cosign verifies their signature.

TOOLS_DIR="$DATA_DIR/tools"
OPENGREP_DIR="$DATA_DIR/opengrep"
OPENGREP_CURRENT_FILE="$OPENGREP_DIR/current"

pinned_value() {
  local key="$1"
  echo "${!key:-}"
}

# Downloads URL to FILE and checks it against the pinned SHA-256 named by KEY.
download_pinned() {
  local url="$1" file="$2" key="$3" expected actual
  expected="$(pinned_value "$key")"
  [[ -n "$expected" ]] || die "no pinned SHA-256 $key in config/defaults.env"
  echo "downloading $url" >&2
  curl_get -o "$file" "$url" || die "download failed: $url"
  actual="$(sha256_of "$file")"
  [[ "$actual" == "$expected" ]] || die "SHA-256 mismatch for $url: expected $expected, got $actual"
}

# --- opengrep -------------------------------------------------------------------------------

opengrep_exe() {
  if is_windows; then echo opengrep.exe; else echo opengrep; fi
}

opengrep_asset() {
  case "$(platform)" in
    linux-x64)    echo opengrep_linux_x86 ;;
    linux-arm64)  echo opengrep_linux_aarch64 ;;
    darwin-arm64) echo opengrep_osx_arm64 ;;
    darwin-x64)   echo opengrep_osx_x86 ;;
    windows-x64)  echo opengrep_windows_x86.zip ;;
  esac
}

opengrep_latest_tag() {
  local url
  url="$(curl_get --head -o /dev/null -w '%{url_effective}' "$GIMLET_GITHUB_DOWNLOAD/$GIMLET_OPENGREP_REPO/releases/latest")"
  [[ "$url" == */releases/tag/* ]] || die "could not resolve the latest opengrep release (landed on $url)"
  echo "${url##*/releases/tag/}"
}

opengrep_current_tag() {
  [[ -f "$OPENGREP_CURRENT_FILE" ]] && cat "$OPENGREP_CURRENT_FILE" || true
}

verify_signature() {
  local file="$1" url="$2" dir="$3"
  curl_get -o "$dir/asset.sig" "$url.sig" || die "download failed: $url.sig"
  curl_get -o "$dir/asset.cert" "$url.cert" || die "download failed: $url.cert"
  cosign verify-blob \
    --signature "$dir/asset.sig" --certificate "$dir/asset.cert" \
    --certificate-identity-regexp "$GIMLET_COSIGN_IDENTITY_REGEXP" \
    --certificate-oidc-issuer "$GIMLET_COSIGN_OIDC_ISSUER" \
    "$file" >/dev/null || die "cosign signature verification failed for $url"
}

# Runs in a subshell so the EXIT trap removes the download directory when it returns.
install_opengrep() (
  need curl
  local tag="${1:-$GIMLET_OPENGREP_PINNED_TAG}"
  local asset exe dest tmp url
  asset="$(opengrep_asset)"; exe="$(opengrep_exe)"
  dest="$OPENGREP_DIR/$tag"
  if [[ -x "$dest/$exe" ]]; then
    echo "$tag" > "$OPENGREP_CURRENT_FILE"
    echo "opengrep $tag already installed at $dest/$exe"
    return
  fi

  mkdir -p "$OPENGREP_DIR"
  tmp="$(mktemp -d "$OPENGREP_DIR/.download.XXXXXX")"
  trap 'rm -rf "$tmp"' EXIT
  if [[ "$tag" != "$GIMLET_OPENGREP_PINNED_TAG" ]] && ! have cosign; then
    die "opengrep $tag is not the pinned release ($GIMLET_OPENGREP_PINNED_TAG); install cosign (https://github.com/sigstore/cosign) to verify it, or run 'gimlet install' for the pinned release"
  fi
  url="$GIMLET_GITHUB_DOWNLOAD/$GIMLET_OPENGREP_REPO/releases/download/$tag/$asset"
  if [[ "$tag" == "$GIMLET_OPENGREP_PINNED_TAG" ]]; then
    download_pinned "$url" "$tmp/$asset" "GIMLET_SHA256_${asset//./_}"
    echo "SHA-256 matches the pinned value"
  else
    echo "downloading $url"
    curl_get -o "$tmp/$asset" "$url" || die "download failed: $url"
    verify_signature "$tmp/$asset" "$url" "$tmp"
    echo "signature verified with cosign"
  fi

  mkdir -p "$tmp/unpacked"
  if [[ "$asset" == *.zip ]]; then
    unpack_zip "$tmp/$asset" "$tmp/unpacked" || die "could not unpack $asset"
  else
    mv "$tmp/$asset" "$tmp/unpacked/$exe"
  fi
  chmod +x "$tmp/unpacked/$exe"
  "$tmp/unpacked/$exe" --version >/dev/null || die "downloaded opengrep does not run on this machine"
  rm -rf "$dest"
  mv "$tmp/unpacked" "$dest"
  echo "$tag" > "$OPENGREP_CURRENT_FILE"
  echo "installed opengrep $tag at $dest/$exe"
)

# Installs the pinned release when none is usable. Called directly, never inside $(...), where
# bash drops errexit and a failed install would fall through to running a missing binary.
ensure_opengrep() {
  local tag
  tag="$(opengrep_current_tag)"
  if [[ -z "$tag" || ! -x "$OPENGREP_DIR/$tag/$(opengrep_exe)" ]]; then
    warn "opengrep not installed; installing the pinned release"
    install_opengrep >&2
  fi
}

opengrep_bin() {
  echo "$OPENGREP_DIR/$(opengrep_current_tag)/$(opengrep_exe)"
}

# --- single-binary GitHub releases (betterleaks, osv-scanner) --------------------------------

betterleaks_asset() {
  local v="${GIMLET_BETTERLEAKS_TAG#v}"
  case "$(platform)" in
    linux-x64)    echo "betterleaks_${v}_linux_x64.tar.gz" ;;
    linux-arm64)  echo "betterleaks_${v}_linux_arm64.tar.gz" ;;
    darwin-x64)   echo "betterleaks_${v}_darwin_x64.tar.gz" ;;
    darwin-arm64) echo "betterleaks_${v}_darwin_arm64.tar.gz" ;;
    windows-x64)  echo "betterleaks_${v}_windows_x64.zip" ;;
  esac
}

osv_asset() {
  case "$(platform)" in
    linux-x64)    echo osv-scanner_linux_amd64 ;;
    linux-arm64)  echo osv-scanner_linux_arm64 ;;
    darwin-x64)   echo osv-scanner_darwin_amd64 ;;
    darwin-arm64) echo osv-scanner_darwin_arm64 ;;
    windows-x64)  echo osv-scanner_windows_amd64.exe ;;
  esac
}

tool_bin() {
  local name="$1" tag="$2"
  echo "$TOOLS_DIR/$name/$tag/$name$(exe_suffix)"
}

# Installs NAME at TAG from REPO's release ASSET; the asset is the executable itself or an
# archive holding it at its top level.
install_release_binary() (
  local name="$1" repo="$2" tag="$3" asset="$4"
  local exe dest tmp url
  exe="$name$(exe_suffix)"
  dest="$TOOLS_DIR/$name/$tag"
  [[ -x "$dest/$exe" ]] && exit 0
  need curl
  mkdir -p "$TOOLS_DIR/$name"
  tmp="$(mktemp -d "$TOOLS_DIR/$name/.download.XXXXXX")"
  trap 'rm -rf "$tmp"' EXIT
  url="$GIMLET_GITHUB_DOWNLOAD/$repo/releases/download/$tag/$asset"
  download_pinned "$url" "$tmp/$asset" "GIMLET_SHA256_${asset//[.-]/_}"
  mkdir -p "$tmp/unpacked"
  case "$asset" in
    *.tar.gz) tar -xzf "$tmp/$asset" -C "$tmp/unpacked" ;;
    *.zip)    unpack_zip "$tmp/$asset" "$tmp/unpacked" ;;
    *)        mv "$tmp/$asset" "$tmp/unpacked/$exe" ;;
  esac
  [[ -f "$tmp/unpacked/$exe" ]] || die "$asset does not contain $exe"
  chmod +x "$tmp/unpacked/$exe"
  rm -rf "$dest"
  mv "$tmp/unpacked" "$dest"
  echo "installed $name $tag at $dest/$exe" >&2
)

ensure_betterleaks() {
  install_release_binary betterleaks "$GIMLET_BETTERLEAKS_REPO" "$GIMLET_BETTERLEAKS_TAG" "$(betterleaks_asset)"
}

betterleaks_bin() { tool_bin betterleaks "$GIMLET_BETTERLEAKS_TAG"; }

ensure_osv() {
  install_release_binary osv-scanner "$GIMLET_OSV_REPO" "$GIMLET_OSV_TAG" "$(osv_asset)"
}

osv_bin() { tool_bin osv-scanner "$GIMLET_OSV_TAG"; }

jq_asset() {
  case "$(platform)" in
    linux-x64)    echo jq-linux-amd64 ;;
    linux-arm64)  echo jq-linux-arm64 ;;
    darwin-x64)   echo jq-macos-amd64 ;;
    darwin-arm64) echo jq-macos-arm64 ;;
    windows-x64)  echo jq-windows-amd64.exe ;;
  esac
}

# A jq on PATH is used as it is; without one, the pinned release is installed and put first on PATH.
ensure_jq() {
  have jq && return
  install_release_binary jq "$GIMLET_JQ_REPO" "$GIMLET_JQ_TAG" "$(jq_asset)"
  PATH="$TOOLS_DIR/jq/$GIMLET_JQ_TAG:$PATH"
}

# --- dotnetarium (a .NET tool from nuget.org) ------------------------------------------------

dotnetarium_bin() {
  echo "$TOOLS_DIR/dotnetarium/$GIMLET_DOTNETARIUM_VERSION/dotnetarium$(exe_suffix)"
}

# Downloads the pinned .nupkg, checks its SHA-256, and installs it from a feed holding only that
# file, so `dotnet tool install` cannot resolve the package from anywhere else.
ensure_dotnetarium() (
  local version="$GIMLET_DOTNETARIUM_VERSION" dest tmp pkg
  dest="$TOOLS_DIR/dotnetarium/$version"
  [[ -x "$(dotnetarium_bin)" ]] && exit 0
  need curl; need dotnet
  mkdir -p "$TOOLS_DIR/dotnetarium"
  tmp="$(mktemp -d "$TOOLS_DIR/dotnetarium/.download.XXXXXX")"
  trap 'rm -rf "$tmp"' EXIT
  pkg="dotnetarium.$version.nupkg"
  mkdir -p "$tmp/feed"
  download_pinned "$GIMLET_NUGET_FLATCONTAINER/dotnetarium/$version/$pkg" "$tmp/feed/$pkg" GIMLET_SHA256_dotnetarium_nupkg
  cat > "$tmp/nuget.config" <<EOF
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <clear />
    <add key="gimlet" value="$tmp/feed" />
  </packageSources>
</configuration>
EOF
  rm -rf "$dest"
  dotnet tool install dotnetarium --version "$version" --tool-path "$dest" --configfile "$tmp/nuget.config" >&2 \
    || die "dotnet tool install dotnetarium $version failed"
  echo "installed dotnetarium $version at $dest" >&2
)
