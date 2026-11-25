# rust

Modern Rust conventions for Claude Code: a short rule for everyday edits and a longer reference for scaffolding and review. Install it if Claude keeps producing Rust that compiles but reads like 2018, with `mod.rs` files, `format!("{}", x)`, `#[allow]` and per-file lint attributes.

## The rust rule

`rules/rust.md` is scoped to `*.rs`, `Cargo.toml`, `rustfmt.toml` and `clippy.toml`. Plugin rules do not load on their own. The `modern-rust` skill names the rule's path and reads it first, and the toolchest `CLAUDE.md` (installed as `~/.claude/CLAUDE.md`) lists it with the instruction to read it before touching Rust files and Cargo manifests.

The rule prefers the newer convention when both work, but a project's existing, consistent convention wins; Claude mentions the modern alternative once and moves on. It covers:

| Area | What the rule asks for |
| :- | :- |
| Manifest | `edition = "2024"` and `rust-version` in every package; lints in `[workspace.lints]`, versions in `[workspace.dependencies]` |
| Modules | `foo.rs` beside `foo/`, no `mod.rs` except `tests/common/mod.rs` |
| Errors | `thiserror` enums in libraries, `anyhow` with `.context(...)` in binaries, panics only for bugs |
| Ownership | most general borrowed parameter types; `.clone()` treated as a design decision |
| Idioms | `let ... else`, let-chains, inline format arguments, native `async fn` in traits, `#[expect(..., reason = "...")]` |
| Unsafe | `#![forbid(unsafe_code)]` where possible; one job per `unsafe {}` block with a `// SAFETY:` comment |
| Async | no `std::sync::Mutex` guard across `.await`, blocking work in `spawn_blocking`, timeouts on network calls |
| Comments | a `//!` module doc per file and no `///` on items, except a required `# Safety` section |

Before calling Rust work done, Claude runs `cargo fmt --all`, `cargo clippy --all-targets --all-features -- -D warnings` and `cargo test`, unless the project names its own commands. Formatting changes in files the task did not touch are kept, not reverted.

## The modern-rust skill

`modern-rust` is a reference skill. Claude can load it on its own when scaffolding, reviewing or refactoring Rust, or when you ask whether code is idiomatic, and you can call it directly as `/rust:modern-rust`. It takes no arguments, changes nothing on disk by itself, and never commits.

`SKILL.md` opens with an old-versus-modern table (edition, module files, `try!`, format captures, `let else`, `[lints]`, `#[expect]`, precise `use<..>` capturing, `unsafe extern`). It then covers module layout, `Cargo.toml` conventions such as committing `Cargo.lock` for libraries too and building with `--locked` in CI, error handling, ownership and API design, edition 2024 changes like `if let` temporary scope and tail-expression drop order, unsafe, async, testing, and the pre-completion checks.

Four files in `references/` hold the detail:

| File | Contents |
| :- | :- |
| `project-layout.md` | single crate and workspace trees, `foo.rs` versus `foo/mod.rs`, visibility and re-exports, `use` conventions, feature flags, binaries |
| `error-handling.md` | choosing `thiserror` or `anyhow`, a `#[non_exhaustive]` library error enum, application errors, `?` and `let else`, panics, conversion across layers, testing errors |
| `api-design.md` | Rust API Guidelines naming, derives, making invalid states unrepresentable, builders, ownership in signatures, modern syntax, semver-conscious public APIs |
| `tooling.md` | a recommended `[lints]` table, silencing lints with `#[expect]`, `rustfmt.toml`, dependency hygiene and `cargo-deny`, release profile, CI baseline, useful cargo extensions |

There are no prerequisites beyond a Rust toolchain recent enough for edition 2024 (1.85, or 1.88 for let-chains).
