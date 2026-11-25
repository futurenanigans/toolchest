# Error handling patterns

## The two crates and when to use each

| | `thiserror` | `anyhow` / `eyre` |
|---|---|---|
| Where | Library crates, any public API | Binaries, tests, internal tooling |
| What it gives | `#[derive(Error)]` on your own enum/struct | One opaque `Error` type, `.context()`, backtraces |
| Callers can | `match` on variants | Only `downcast_ref` or display |
| Never | expose `anyhow::Error` from a library | make callers string-match error messages |

Most real projects use both: `thiserror` enums inside crates, converted into `anyhow::Error` at the binary boundary via `?`.

## Library error enum

```rust
#[derive(Debug, thiserror::Error)]
#[non_exhaustive]                          // adding a variant later isn't a semver break
pub enum ConfigError {
    #[error("could not read config file {path}")]
    Read {
        path: PathBuf,
        #[source] source: std::io::Error,  // #[source] preserves the chain; #[from] also generates From
    },

    #[error("config is not valid TOML")]
    Parse(#[from] toml::de::Error),

    #[error("field `{field}` is invalid: {reason}")]
    Invalid { field: &'static str, reason: String },
}
```

Guidelines:
- Error messages: lowercase, no trailing period, no "Error:" prefix, describe *what* failed not *that* something failed. They will be joined by `: ` in a chain.
- Don't repeat the source's message in yours. `Display` should describe this layer only; the chain supplies the rest.
- Use `#[from]` only when the conversion is unambiguous (one variant per source type). Otherwise `#[source]` plus `.map_err(|source| ConfigError::Read { path, source })?`.
- One error type per module or per "operation family", not one giant crate-wide enum with 40 variants, and not one per function. `pub type Result<T, E = MyError> = std::result::Result<T, E>;` is acceptable at crate root; don't shadow `Result` in a way that surprises users.
- Implement `Error` for structs when there's a single failure mode with context fields; enums when there are multiple.
- Errors should be `Send + Sync + 'static` so they work across threads and in `anyhow`.
- Keep error types small (`Box` large payloads); `Result<T, E>` costs `max(size_of T, size_of E)`.

## Application code

```rust
use anyhow::{Context, Result, bail, ensure};

fn main() -> Result<()> {
    let cfg = load_config(&path).with_context(|| format!("loading config from {}", path.display()))?;
    ensure!(cfg.workers > 0, "workers must be positive");
    if cfg.dry_run { bail!("dry run requested; refusing to start"); }
    run(cfg).context("running server")
}
```

- `.context("static")` vs `.with_context(|| format!(..))`: the closure form avoids allocating on the success path.
- Context strings describe what you were *trying to do*, in present participle ("reading config", "connecting to db").
- Report once, at the top: `main` returning `Result` prints `Error: <chain>` via `Debug`. For nicer output use `color-eyre` or a custom `Report`.

## `?`, `let else`, and friends

```rust
// Prefer let-else when the failure arm diverges
let Some(user) = users.get(&id) else {
    return Err(ApiError::NotFound(id));
};

// Option -> Result
let host = headers.get("host").ok_or(ApiError::BadRequest("missing host"))?;
let n: u32 = s.parse().map_err(|_| ApiError::BadRequest("not a number"))?;

// Combinators for small transforms, match for anything with logic
let port = env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8080);

// Let-chains (edition 2024) replace nested if-let
if let Some(cfg) = config
    && let Some(tls) = &cfg.tls
    && tls.enabled
{
    serve_tls(tls)?;
}
```

- `?` on `Option` inside functions returning `Option` is idiomatic.
- Avoid `.unwrap_or_default()` when the default hides a real error condition.
- `Result<Option<T>>` for "operation may fail; item may not exist". `Option<Result<T>>` mainly from iterators; use `.transpose()` to switch.

## Panics

- `panic!`, `unwrap`, `expect`, indexing `v[i]`, `unreachable!` = "this is a bug if it fires".
- `expect("reason")` message states *why the invariant holds* ("regex is a valid literal", "mutex not poisoned"), not what went wrong.
- `todo!()` for unfinished code; `unimplemented!()` for deliberately unsupported paths.
- `debug_assert!` for invariants that are expensive to check.
- In services, allow `clippy::unwrap_used` / `expect_used` only in `#[cfg(test)]` code.
- Don't use `std::panic::catch_unwind` as an exception mechanism; only at FFI boundaries and test harnesses.

## Error conversion across layers

```
io::Error ──From──▶ storage::Error ──From──▶ service::Error ──?──▶ anyhow (binary)
```

Each layer adds context about *its* operation and wraps the lower one as `#[source]`. Handlers at the edge (HTTP, CLI) convert `service::Error` into a status code / exit code with a `match` that is exhaustive. `#[non_exhaustive]` on external error enums forces a `_ =>` arm, which is fine.

## Testing errors

```rust
let err = Email::parse("no-at-sign").unwrap_err();
assert!(matches!(err, ValidationError::Email { .. }));
```

Match on variants, never on `to_string()` output, unless you are explicitly testing the message.
