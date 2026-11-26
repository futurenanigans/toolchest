---
name: rust
description: Rust conventions. Edition 2024 idioms, module layout, error types, unsafe, async and the pre-completion checks. Load before writing, editing or reviewing Rust files (.rs) or Cargo.toml, rustfmt.toml and clippy.toml.
---

# Rust conventions

Prefer the newer convention when both work. An existing project's consistent convention wins over the modern default; mention the modern alternative once where it matters.

- **Manifest**: `edition = "2024"` and `rust-version` set in every package. Lint policy lives in `[workspace.lints]` and dependency versions in `[workspace.dependencies]`, each inherited with `workspace = true`.
- **Modules**: `foo.rs` beside a `foo/` directory in new crates, and no `mod.rs` outside `tests/common/mod.rs`. The parent file holds `mod` declarations, re-exports and items its children share.
- **Errors**: anything that can fail returns `Result` and propagates with `?`. A library defines a `thiserror` enum and keeps `anyhow::Error` and `Box<dyn Error>` out of its public API. A binary uses `anyhow` with `.context(...)` and reports once in `main`. Panics are for bugs, and `expect("...")` states why the invariant holds.
- **Ownership**: parameters take the most general borrowed form (`&str`, `&[T]`, `&Path`); a function takes ownership only when it stores or consumes the value. A `.clone()` is a design decision.
- **Idioms**: `let ... else` and let-chains over nested `match`, inline format arguments (`format!("{name}")`), native `async fn` in traits, and `#[expect(lint, reason = "...")]` where a lint is wrong for one spot.
- **Unsafe**: `#![forbid(unsafe_code)]` in every crate that needs none. Each `unsafe {}` block does one thing and carries a `// SAFETY:` comment naming the invariant and the test that pins it.
- **Async**: no `std::sync::Mutex` guard held across `.await`, blocking work in `spawn_blocking`, a timeout on every network call.
- **Comments**: the `writing:comments` skill governs. A file opens with a `//!` module doc and items carry no `///`, except the `# Safety` section clippy requires on a public `unsafe fn`; where Mortise runs, its finding is the rule.

Before reporting Rust work done, run `cargo fmt --all`, `cargo clippy --all-targets --all-features -- -D warnings` and the fast pool (`cargo test`, unless the project names its own command or the default run includes slow tests; see the global testing discipline). Keep every change `cargo fmt --all` makes, including in files the task did not touch; a workspace that is not rustfmt-clean gets formatted, not reverted to keep the diff narrow.

The `modern-rust` skill holds the full reference (the old-versus-modern table, workspace layout, lint tables, API design). Load it when scaffolding a crate or workspace, or when a convention here needs detail.
