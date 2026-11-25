# API design and idioms

Condensed from the Rust API Guidelines (rust-lang.github.io/api-guidelines), Canonical's Rust best practices, and common code-review feedback.

## Naming (C-CASE, C-CONV, C-GETTER, C-ITER)

| Item | Convention |
|---|---|
| Crates | `kebab-case` package, `snake_case` lib target (automatic) |
| Modules, functions, methods, locals, macros | `snake_case` |
| Types, traits, enum variants | `UpperCamelCase` (acronyms too: `Uuid`, `HttpClient`, not `UUID`) |
| Constants, statics | `SCREAMING_SNAKE_CASE` |
| Lifetimes | short lowercase: `'a`, `'de`, `'src` |
| Type parameters | single uppercase or short CamelCase: `T`, `K, V`, `Item` |
| Feature names | `kebab-case`, named for what they enable |

Conversions:
- `as_foo(&self) -> &Foo`: free, borrowed view
- `to_foo(&self) -> Foo`: expensive, borrowed to owned
- `into_foo(self) -> Foo`: consuming, free or cheap
- `from_*` / `try_from` / `FromStr` for constructors that parse

Getters: `fn name(&self) -> &str`, not `get_name`. `get_` is reserved for lookups that take a key (`get(&key)`), or the `get()`/`get_mut()` pair on smart types. Setters `set_name`; mutable access `name_mut`.

Iterators: `iter()` → `&T`, `iter_mut()` → `&mut T`, `into_iter()` → `T`. Iterator type names match: `Iter`, `IterMut`, `IntoIter`. Also implement `IntoIterator` for `&T`, `&mut T`, `T`.

Predicates: `is_empty`, `has_children`, `contains`. Bool-returning methods read as questions.

## Types, traits and derives

- Derive everything that is cheap and sensible: `Debug` on all public types (`missing_debug_implementations`), `Clone`, `Copy` for small POD types, `PartialEq/Eq`, `Hash` for keys, `PartialOrd/Ord` when there's a total order, `Default` when there's an obvious empty value.
- Implement `Display` for user-facing types; `Debug` output is for developers and is derived, not hand-written, unless it leaks secrets.
- `FromStr` + `Display` should round-trip. `serde::Serialize`/`Deserialize` behind a `serde` feature in libraries.
- Implement `From<A> for B` rather than `Into<B> for A`; `Into` comes free.
- Return `impl Trait` for closures, iterators, futures; return concrete types otherwise so callers can name them.
- `impl AsRef<str>`, `impl AsRef<Path>`, `impl Into<String>` at the *edges* of a public API for ergonomics; plain `&str` internally to keep monomorphisation down.
- `impl IntoIterator<Item = T>` beats `Vec<T>` or `&[T]` for "give me a sequence" parameters.
- Bounds on `impl` blocks, not on struct definitions (`struct Cache<K, V>` with `impl<K: Hash + Eq, V> Cache<K, V>`).
- Newtypes are zero-cost and idiomatic for IDs, units, and validated strings. Implement `Deref` on a newtype only if it's truly a transparent wrapper (rare; prefer `as_str()` / `inner()`).
- Sealed traits for traits users must not implement: `mod private { pub trait Sealed {} }` + `pub trait Foo: private::Sealed`.
- Trait objects: `Box<dyn Trait>` / `Arc<dyn Trait>`. `dyn` is mandatory in edition 2021+. Prefer generics unless heterogeneity or compile-time is the goal.

## Invalid states unrepresentable

```rust
// Bad: two bools, four states, two of them meaningless
fn connect(host: &str, tls: bool, verify_cert: bool)

// Good
pub enum Tls { Off, On { verify: bool } }
fn connect(host: &str, tls: Tls)
```

- Enums over bool params and over "stringly typed" values.
- Private fields + constructor that validates ("parse, don't validate"). Provide `TryFrom<&str>` / `FromStr`.
- Typestate (`Request<NoAuth>` → `Request<Authed>`) for sequenced construction where misordering is a real risk; don't reach for it for simple cases.
- `NonZeroU32`, `NonNull`, `std::num::Saturating` / `Wrapping` when they express intent.

## Builders

Use when a type has 3+ optional settings. Consuming builder (`self` by value, returns `Self`) is the current default; the `&mut self` style is for builders reused across many builds.

```rust
#[derive(Debug, Default)]
#[must_use = "builders do nothing until .build() is called"]
pub struct ClientBuilder { timeout: Option<Duration>, retries: u32 }

impl ClientBuilder {
    pub fn timeout(mut self, d: Duration) -> Self { self.timeout = Some(d); self }
    pub fn retries(mut self, n: u32) -> Self { self.retries = n; self }
    pub fn build(self) -> Result<Client, BuildError> { ... }
}

impl Client {
    pub fn builder() -> ClientBuilder { ClientBuilder::default() }
}
```

`bon` or `typed-builder` crates generate this when hand-writing gets tedious; `derive_builder` is older but still common.

## Ownership in signatures

| You need to... | Take |
|---|---|
| Read a string | `&str` |
| Read a sequence | `&[T]` |
| Read a path | `&Path` (or `impl AsRef<Path>` on public edges) |
| Read any borrowable thing generically | `&T` or `impl Borrow<T>` |
| Store the value | `String` / `Vec<T>` / `PathBuf` (or `impl Into<String>`) |
| Mutate in place | `&mut T` |
| Maybe modify, usually not | `Cow<'_, T>` in and/or out |
| Share across threads | `Arc<T>` (`Arc<Mutex<T>>` / `Arc<RwLock<T>>` if mutated) |
| Share single-threaded with interior mutability | `Rc<RefCell<T>>` (ask whether you need it) |

Return `String`, `Vec<T>`, `PathBuf` when you allocate; return `&str` / `&[T]` when you borrow from `self` or an argument.

Lifetimes in structs: acceptable for short-lived views (parsers, iterators, guards). If a struct with a lifetime ends up in an `Arc` or a long-lived field, it should own its data instead.

## Modern syntax preferences

```rust
// Inline format args
info!("user {user_id} logged in from {ip}");
let s = format!("{name:>10}");            // formatting spec works too
println!("{}", value.method());           // expressions still need the positional form

// Field init shorthand, struct update syntax
Config { host, port, ..Default::default() }

// Matches
if matches!(status, Status::Active | Status::Pending) { ... }

// Ranges & slices
let head = &data[..n];
for (i, item) in items.iter().enumerate() { ... }   // never for i in 0..items.len()

// Iterators, not loops with push
let names: Vec<_> = users.iter().filter(|u| u.active).map(|u| u.name.as_str()).collect();
let total: u64 = orders.iter().map(Order::amount).sum();

// Option/Result combinators for short transforms
let port = cfg.port.unwrap_or(8080);
let name = user.as_ref().map(|u| u.name.as_str()).unwrap_or("anonymous");

// Shadowing to narrow types is idiomatic
let input = input.trim();
let count: usize = count.try_into()?;

// Prefer `impl` blocks per concern; keep `impl` next to the type it's for
```

Avoid:
- `.clone()` to satisfy the borrow checker without thinking (`clippy::redundant_clone`).
- `&Vec<T>`, `&String`, `&Box<T>` parameters.
- `as` casts for narrowing; use `try_from`/`try_into` or explicit `u64::from(x)` for widening.
- `return x;` at the end of a function; the tail expression is the return.
- `unwrap()` on locks in library code without an argument; prefer `lock().expect("mutex poisoned")` or handle poisoning.
- `Box<dyn Error>` in public library signatures; that's an application-level type.
- Manual `impl Default` that just sets zeros; derive it.
- `static mut`; use `OnceLock`/`LazyLock` (std, 1.80+), atomics, or `Mutex`.
- `lazy_static!`/`once_cell` for new code; `std::sync::LazyLock` and `OnceLock` cover it.
- `#[macro_use]`; import macros with `use crate::my_macro;` (they're exported with `#[macro_export]` or `pub(crate) use`).

## Documentation shape

The `comments` rule governs: a file opens with a `//!` module doc of one short paragraph, and items carry no `///`. A contract a caller must know lives in the signature (a typed error enum for failures, a newtype for a valid range) or in a test that pins it.

## Semver-conscious public APIs (libraries)

- `#[non_exhaustive]` on public enums and on structs constructed by the library.
- Don't expose fields; provide accessors.
- Avoid exposing third-party types in your public API unless the crate is a de-facto standard (`serde`, `tokio`, `http`, `bytes`); otherwise a major bump of that dep becomes your major bump.
- Run `cargo semver-checks` before release.
