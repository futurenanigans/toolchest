#!/usr/bin/env bash
set -euo pipefail
mkdir -p src
cat > Cargo.toml <<'TOML'
[package]
name = "netcfg"
version = "0.1.0"
edition = "2024"
rust-version = "1.88"
TOML
cat > src/lib.rs <<'RS'
pub struct Endpoint {
    pub host: String,
    pub port: u16,
}
RS
