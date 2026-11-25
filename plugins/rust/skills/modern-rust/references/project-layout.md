# Project and module layout

## Single crate

```
my-tool/
├── Cargo.toml
├── Cargo.lock
├── rustfmt.toml          # optional; style_edition = "2024"
├── deny.toml             # optional; cargo-deny policy
├── src/
│   ├── main.rs           # binary: config + composition only
│   ├── lib.rs            # if the binary has any logic worth testing, put it here
│   ├── cli.rs
│   ├── config.rs
│   ├── net.rs            # parent module: `pub mod client; pub mod server;`
│   └── net/
│       ├── client.rs
│       └── server.rs
├── tests/
│   ├── cli.rs            # each file = one integration-test binary
│   └── common/
│       └── mod.rs        # shared helpers; mod.rs here keeps it from being a test binary
├── benches/
├── examples/
└── build.rs              # only if genuinely needed
```

Even for a CLI, split into `lib.rs` + a thin `main.rs`. Integration tests and benches can only see the library.

## Workspace

Use a workspace as soon as there's more than one concern or more than one binary.

```
├── Cargo.toml            # [workspace] only; usually no [package] (virtual manifest)
├── Cargo.lock
├── crates/
│   ├── core/             # domain types, no I/O
│   ├── storage/
│   └── api/
└── bins/  (or apps/)
    └── server/
```

```toml
[workspace]
resolver = "3"                     # default when root edition is 2024; set explicitly in virtual manifests
members = ["crates/*", "bins/*"]

[workspace.package]
edition = "2024"
rust-version = "1.88"
license = "MIT OR Apache-2.0"
repository = "https://github.com/org/repo"

[workspace.dependencies]
serde = { version = "1", features = ["derive"] }
tokio = { version = "1", features = ["rt-multi-thread", "macros"] }
thiserror = "2"
anyhow = "1"

[workspace.lints.rust]
unsafe_code = "forbid"

[workspace.lints.clippy]
all = { level = "warn", priority = -1 }
pedantic = { level = "warn", priority = -1 }
unwrap_used = "warn"
undocumented_unsafe_blocks = "deny"
```

Member crate:

```toml
[package]
name = "payments-core"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true
license.workspace = true

[lints]
workspace = true

[dependencies]
serde.workspace = true
thiserror.workspace = true
```

Crate naming: `kebab-case` package names; the library target becomes `snake_case` automatically. Prefix workspace-internal crates with the project name (`payments-core`, `payments-api`) to avoid crates.io collisions and make `cargo tree` readable.

## Module files: `foo.rs` vs `foo/mod.rs`

Both resolve identically. The 2018 edition added `foo.rs` + `foo/` specifically so projects don't accumulate dozens of files all named `mod.rs`, and the official book and Rust by Example now present that as the default. `mod.rs` is *not* deprecated and will never be removed; some large projects (Tokio among them) keep it because they prefer all of a module's files in one directory.

Decision procedure:
1. Project already uses one style consistently → use that style.
2. New project or no consistent style → `foo.rs` + `foo/`.
3. `tests/common/mod.rs` → always `mod.rs` (semantic reason, see above).

Never have both `foo.rs` and `foo/mod.rs`; rustc rejects it with E0761.

## Visibility and re-exports

- Default to private. Expose with `pub` only what the crate's users need; use `pub(crate)` for items shared across modules but not exported.
- Flatten the public API with `pub use`: users should write `payments::Payment`, not `payments::domain::payment::Payment`. Keep the internal tree deep, the public surface shallow.
- A `prelude` module (`pub mod prelude { pub use ...; }`) is appropriate for crates whose users need 5+ items together (traits especially). Don't add one to small crates.
- Glob imports (`use foo::*`) are fine for preludes and inside `mod tests` (`use super::*`), discouraged elsewhere.
- Avoid `pub mod` on internal-structure modules just to make items reachable; re-export the items instead.

## `use` conventions

- One `use` block at the top of the file, grouped: `std`/`core`/`alloc`, then external crates, then `crate::`/`super::`/`self::`. rustfmt with `group_imports = "StdExternalCrate"` (unstable) automates this; without it, keep the groups by hand with blank lines.
- Import types and traits; refer to functions through their module (`fs::read_to_string`, `mem::take`). This is the std convention and reads better.
- Never import enum variants globally (`use Color::*`) outside a tight scope such as a `match` inside a function.
- `use crate::` for anything in the same crate; don't use `super::super::`.
- Don't `use` inside functions except for very local trait-method or variant imports.
- rustfmt (style edition 2024) handles ordering; don't hand-sort.

## Feature flags

- Features are additive. Never have a feature that *removes* functionality or a `no-foo` feature.
- Name features after the thing they enable (`serde`, `tokio`, `tracing`), and use `dep:` syntax so optional dependencies aren't implicitly features:

```toml
[features]
default = []
serde = ["dep:serde", "chrono/serde"]

[dependencies]
serde = { version = "1", optional = true }
```

- Gate code with `#[cfg(feature = "serde")]`, and document features in `lib.rs` docs (`#![cfg_attr(docsrs, feature(doc_cfg))]` with `docs.rs` metadata if it's published).

## Binaries

- `main` returns `anyhow::Result<()>` (or `Result<(), Box<dyn Error>>` with no deps) so `?` works at top level.
- `clap` with derive for argument parsing; `tracing` + `tracing-subscriber` for logging (over `log` + `env_logger` in new async code).
- Read config from a typed struct (`serde` + `figment`/`config`/plain env), validate once, pass the struct down.
