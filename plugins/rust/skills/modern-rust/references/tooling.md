# Tooling, lints and CI

## Recommended `[lints]` table

Put in `[workspace.lints]` (workspace) or `[lints]` (single crate). Lint groups need `priority = -1` so individual overrides win.

```toml
[workspace.lints.rust]
unsafe_code = "forbid"                 # drop in crates that need unsafe
missing_debug_implementations = "warn"
rust_2018_idioms = { level = "warn", priority = -1 }
unreachable_pub = "warn"               # catches pub items that aren't actually exported

[workspace.lints.clippy]
all = { level = "warn", priority = -1 }
pedantic = { level = "warn", priority = -1 }
nursery = { level = "warn", priority = -1 }   # optional; some lints are noisy
# pedantic lints commonly turned back off:
module_name_repetitions = "allow"
must_use_candidate = "allow"
missing_errors_doc = "allow"           # items carry no `///` under the comments rule
missing_panics_doc = "allow"
# stricter than the defaults:
unwrap_used = "warn"                   # `expect("why")` stays allowed for invariants
undocumented_unsafe_blocks = "deny"
dbg_macro = "warn"
todo = "warn"
print_stdout = "warn"                  # for libraries/services that use tracing
cast_possible_truncation = "warn"
cast_sign_loss = "warn"
```

Adjust to taste; the point is that policy is declared once, in the manifest, and applies identically to every developer and CI job.

## Silencing lints

```rust
#[expect(clippy::too_many_arguments, reason = "mirrors the C API signature")]
fn ffi_shim(...)
```

`#[expect]` (stable since 1.81) is preferred over `#[allow]`: it warns if the lint stops firing, so stale suppressions are cleaned up. Always give a `reason`. Scope attributes as narrowly as possible (item, not module or crate).

## rustfmt

`rustfmt.toml` at repo root:

```toml
style_edition = "2024"
# Everything below is optional. Stable options only unless the team runs nightly fmt.
max_width = 100
use_field_init_shorthand = true
use_try_shorthand = true
# nightly-only, popular:
# imports_granularity = "Module"
# group_imports = "StdExternalCrate"
# wrap_comments = true
# format_code_in_doc_comments = true
```

Run `cargo fmt --all` before every commit; CI runs `cargo fmt --all --check`. Never fight rustfmt with `#[rustfmt::skip]` outside of tables/matrices that genuinely need it.

## Dependency hygiene

- `cargo add <crate>` / `cargo add --dev` / `cargo add --features x` instead of hand-editing.
- `cargo update` regularly; `cargo outdated` or Renovate/Dependabot to notice major bumps.
- `cargo audit` (RustSec advisories) and `cargo deny check` (advisories + licenses + duplicate versions + source allowlist) in CI.
- `cargo tree -d` to find duplicate versions; `cargo machete` or `cargo udeps` to find unused deps.
- Prefer crates from [blessed.rs](https://blessed.rs) for the standard tasks (serde, tokio, thiserror/anyhow, clap, tracing, reqwest, sqlx/diesel, regex, chrono/jiff, rand, uuid, itertools, rayon).

Minimal `deny.toml`:

```toml
[advisories]
yanked = "deny"
unmaintained = "workspace"

[licenses]
allow = ["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "Unicode-3.0", "Zlib"]

[bans]
multiple-versions = "warn"
wildcards = "deny"

[sources]
unknown-registry = "deny"
unknown-git = "deny"
```

## Release profile

```toml
[profile.release]
lto = "thin"            # "fat" for maximum, slower builds
codegen-units = 1
strip = "symbols"       # or debug = 1 if you profile in prod
overflow-checks = true  # cheap; turns silent wraparound into a panic
panic = "unwind"        # keep unless embedded; Tokio isolates panicked tasks
```

For faster dev builds, optimize dependencies while keeping your own crates at the default with `[profile.dev.package."*"] opt-level = 2`, and consider the `mold`/`lld` linker.

## CI baseline

```bash
cargo fmt --all --check
cargo clippy --all-targets --all-features --locked -- -D warnings
cargo test --all-features --locked          # or: cargo nextest run
cargo doc --no-deps --all-features          # with RUSTDOCFLAGS="-D warnings" for libraries
cargo audit
cargo deny check
# extra for crates with unsafe:
cargo +nightly miri test -p <crate>
# extra for libraries with an MSRV:
cargo +1.88 check --all-features            # matches rust-version
```

Cache `~/.cargo/registry`, `~/.cargo/git` and `target/`; `Swatinem/rust-cache` does this on GitHub Actions. Use `dtolnay/rust-toolchain@stable`.

`rust-toolchain.toml` pins the toolchain for everyone:

```toml
[toolchain]
channel = "stable"      # or "1.90.0" for reproducibility
components = ["rustfmt", "clippy"]
```

## Useful cargo extensions

| Tool | Purpose |
|---|---|
| `cargo nextest` | faster, per-test-process runner |
| `cargo llvm-cov` | coverage |
| `cargo insta` | snapshot tests |
| `cargo fuzz` | libFuzzer targets for parsers |
| `cargo semver-checks` | catch accidental breaking changes before publish |
| `cargo expand` | see macro output |
| `cargo flamegraph` | profiling |
| `cargo watch -x check` / `bacon` | continuous checking |
| `cargo release` | version bump + tag + publish |

## Docs

- `cargo doc --open` locally; enable `#![doc = include_str!("../README.md")]` on `lib.rs` so README and crate docs stay in sync.
- Intra-doc links in the `//!` module doc: `` [`Config`] ``, `` [`Self::parse`] ``; never bare URLs to docs.rs.
- Items carry no `///`; the writing plugin's `comments` rule allows a `//!` module doc and a test-anchored constraint comment only.
