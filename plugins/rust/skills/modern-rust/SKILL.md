---
name: modern-rust
description: Reference for modern Rust (edition 2024, current stable toolchain), covering old-versus-modern idioms, Cargo workspace and lint setup, module layout, error types, API design, and clippy and rustfmt config. Use when scaffolding, reviewing or refactoring Rust code or a Cargo workspace, or when the user asks "is this idiomatic". The always-apply conventions live in the plugin's rust rule.
---

# Modern Rust

The always-apply conventions are in `${CLAUDE_SKILL_DIR}/../../rules/rust.md`; read it before writing or reviewing Rust. This skill is the full reference behind it.

Rust has evolved steadily since 2015. Much older code (and older training data) is still *valid* but no longer *preferred*. This skill captures what current, idiomatic Rust looks like so generated code reads like it was written by someone who follows the ecosystem today.

The guiding rule: **prefer the newer convention when both work; never break a codebase's existing, consistent convention just to modernise it.** When editing an existing project, match what's there and mention the modern alternative once if it matters.

## Quick reference: old vs. modern

| Area | Older (still compiles) | Modern preference |
|---|---|---|
| Edition | 2015 / 2018 / 2021 | `edition = "2024"` (needs Rust 1.85+; let-chains need 1.88+) |
| Module files | `foo/mod.rs` | `foo.rs` next to `foo/` directory |
| Crate imports | `extern crate serde;` | Just `use serde::...` |
| Paths | `::std::...`, `crate::` everywhere | `crate::` for local, bare name for external |
| Trait objects | `Box<Error>` | `Box<dyn Error>` |
| Anonymous params | `fn f(u32)` | Always named: `fn f(_: u32)` |
| Try | `try!(x)` | `x?` |
| Format args | `format!("{}", name)` | `format!("{name}")` (inline captured identifiers) |
| Optional-handling | nested `match` / `if let ... else { return }` | `let Some(x) = opt else { return };` and let-chains (`if let Some(a) = x && a > 3`) |
| Lints | CLI flags / `#![deny]` in every file | `[lints]` / `[workspace.lints]` in Cargo.toml |
| Dependency versions | repeated per crate | `[workspace.dependencies]` + `dep.workspace = true` |
| `impl Trait` capture | implicit | `use<'a, T>` precise capturing when needed |
| Silencing lints | `#[allow(...)]` | `#[expect(...)]` (warns if the lint stops firing) |
| Async in traits | `async-trait` crate | Native `async fn` in traits (add `Send` bound or keep `async-trait` for object safety only) |
| Unsafe FFI | `extern "C" { ... }` | `unsafe extern "C" { pub safe fn ...; pub unsafe fn ...; }` |

## Module layout (the mod.rs question)

Since Rust 2018 a module with children may live at `foo.rs` with its children in `foo/`. The Rust Book calls `foo/mod.rs` the *older style*: still supported, never deprecated, but the official docs encourage the new layout because it avoids a project full of identically named `mod.rs` tabs.

```
src/
├── lib.rs
├── auth.rs          # `pub mod session; pub mod token;` + shared items
├── auth/
│   ├── session.rs
│   └── token.rs
└── storage.rs
```

Rules of thumb:
- New crates: use `foo.rs` + `foo/`. Do not create `mod.rs`.
- Existing crates that consistently use `mod.rs`: keep using it (Tokio does, deliberately). Consistency beats style.
- Never mix both styles for the *same* module; rustc errors on `foo.rs` + `foo/mod.rs` both existing.
- The one place `mod.rs` still has semantic meaning: `tests/common/mod.rs` keeps a shared helper module from being compiled as its own integration-test binary.
- Keep the parent file thin: `mod` declarations, re-exports (`pub use`), and items shared by children. Real logic goes in the child files.
- Declare modules explicitly with `mod name;`. Rust has no automatic module discovery, and `#[cfg]` on `mod` lines is a feature, not a limitation.

See `references/project-layout.md` for workspace structure, visibility conventions and re-export patterns.

## Cargo.toml conventions

```toml
[package]
name = "payments"
version = "0.1.0"
edition = "2024"
rust-version = "1.88"      # MSRV; resolver 3 (default for 2024) respects it

[lints]
workspace = true           # or inline [lints.rust] / [lints.clippy]

[dependencies]
serde = { workspace = true, features = ["derive"] }
```

- Always set `edition` and `rust-version`.
- Lint policy lives in `[lints]` (stable since 1.74), once per workspace, not in per-file attributes or CI flags.
- Use `cargo add` rather than hand-editing versions; it picks the latest compatible version.
- Commit `Cargo.lock` for binaries *and* libraries (cargo's current default is to keep it for both); build with `--locked` in CI.
- See `references/tooling.md` for a recommended lint table, `rustfmt.toml`, `deny.toml`, and CI commands.

## Error handling

- Anything that can fail returns `Result`. Propagate with `?`; let `From` conversions do the work.
- **Libraries**: define an error enum with `thiserror`, expose concrete variants callers can match on. Never leak `anyhow::Error` (or `Box<dyn Error>`) from a public library API.
- **Applications / binaries**: use `anyhow` (or `eyre`) with `.context("what we were doing")`; report once at the top in `main`.
- `unwrap()`/`expect()` are for tests, examples, and invariants that cannot fail *by construction*, with `expect("why this cannot fail")` stating the reason. Enable `clippy::unwrap_used` in non-test code of services.
- Panics are for bugs, not for input. Anything that touches user or network input must return an error.
- Prefer `let ... else` over `match` when the only alternative arm diverges.

`references/error-handling.md` has full patterns, including `#[source]`, `#[from]`, error wrapping layers and `Error::source()` chains.

## Ownership & API design

- Accept the most general borrowed form: `&str` not `&String`, `&[T]` not `&Vec<T>`, `&Path` not `&PathBuf`, `impl AsRef<Path>` for paths at API edges.
- Take ownership only when the function stores or consumes the value.
- `.clone()` is a design decision, not a borrow-checker escape hatch. Reach for `Cow<'_, str>` when ownership is conditional.
- Newtypes for domain IDs (`struct UserId(u64)`), enums instead of bool parameters, private fields + `parse`/`try_from` constructors ("parse, don't validate").
- Derive generously: `#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Default)]` where it makes sense. Public types should at minimum derive `Debug`.
- Mark public enums/structs that will grow `#[non_exhaustive]`; mark value-returning functions and builders `#[must_use]`.
- Iterators over index loops; `impl Iterator<Item = T>` in return position; `IntoIterator` in argument position when you'd otherwise take `Vec<T>`.
- Naming follows the API guidelines: `snake_case` fns/vars/modules, `UpperCamelCase` types/traits, `SCREAMING_SNAKE` consts; conversions `as_` (cheap borrow) / `to_` (expensive) / `into_` (consuming); getters without `get_` prefix; `iter`/`iter_mut`/`into_iter`.
- Prefer `impl Trait` in arguments for simple generic bounds; use explicit generics when the type is named more than once or the caller needs turbofish.

`references/api-design.md` expands on the Rust API Guidelines checklist and builder/typestate patterns.

## Edition 2024 specifics worth knowing

- `if let` temporaries drop at the end of the `if` body, not the whole statement, which fixes the classic `RwLock` read/write deadlock and enables let-chains.
- Tail-expression temporaries drop before locals.
- `unsafe` is required on `extern` blocks and on `#[no_mangle]`/`#[export_name]`/`#[link_section]`; items inside `unsafe extern` may be marked `safe`.
- `unsafe_op_in_unsafe_fn` warns: unsafe operations inside `unsafe fn` still need an `unsafe {}` block with a `// SAFETY:` comment.
- `gen` is reserved; use `r#gen` if you must.
- Return-position `impl Trait` captures all in-scope lifetimes by default; use `impl Trait + use<'a>` to narrow.
- Never-type fallback changed; `!` coerces less surprisingly.
- Match ergonomics are stricter about `ref`/`mut` in already-reference patterns.
- rustfmt `style_edition = "2024"`: imports sort with version-sort (`U8, U16, U32`) and uppercase-before-lowercase (`SOME_CONST, SomeType, detail`).

Migrate with `cargo fix --edition` then bump `edition`.

## Unsafe

- `#![forbid(unsafe_code)]` in every crate that doesn't need it.
- Each `unsafe {}` block does one thing and carries a `// SAFETY:` comment naming the invariant. `clippy::undocumented_unsafe_blocks` enforces this. It is a constraint comment under the writing plugin's `comments` rule, so it also names the test that pins the invariant.
- Public functions that are only sound under caller obligations are `unsafe fn` with a `# Safety` doc section.
- Wrap unsafe internals in a safe API; run Miri on crates that contain unsafe.

## Async

- Tokio is the de-facto runtime for applications; write library code against `std` traits or the `futures` crate where feasible.
- Never hold a `std::sync::Mutex` guard across `.await`. Scope the lock, or use `tokio::sync::Mutex` only if the guard truly must live across a yield.
- Blocking or CPU-heavy work goes in `spawn_blocking`. Timeouts on every network call. Dropping a `JoinHandle` detaches rather than cancels; use `JoinSet`, `abort()`, or `CancellationToken`.
- Check cancellation safety before putting a future in a `select!` arm.

## Testing & docs

- Unit tests in `#[cfg(test)] mod tests` next to the code; integration tests in `tests/` against the public API.
- `#![allow(clippy::unwrap_used)]` (or `#![cfg_attr(test, allow(...))]`) is fine in test modules.
- Property tests with `proptest`; fuzz parsers with `cargo fuzz`; `cargo nextest` as the runner, `insta` for snapshots.
- Comments follow the writing plugin's `comments` rule: a `//!` module doc of one short paragraph at the top of a file, and no `///` on items. Where Mortise runs, its finding is the rule. The one item doc that stays is the `# Safety` section clippy requires on a public `unsafe fn`.

## Workflow before declaring code done

1. `cargo fmt --all`
2. `cargo clippy --all-targets --all-features -- -D warnings`
3. `cargo test` (and `cargo doc --no-deps` for libraries)

Don't disable a clippy lint to make it pass unless the lint is wrong for that spot, and then use `#[expect(clippy::name, reason = "...")]` so it self-cleans.
