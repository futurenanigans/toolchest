#!/usr/bin/env bash
set -euo pipefail
mkdir -p src
cat > Cargo.toml <<'TOML'
[package]
name = "orders"
version = "0.1.0"
edition = "2021"
rust-version = "1.70"
TOML
cat > src/lib.rs <<'RS'
pub struct Order {
    pub id: u32,
    pub coupon: Option<String>,
}
RS
