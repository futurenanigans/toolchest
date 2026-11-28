---
name: dotnet
description: C# and .NET conventions. Formatting and naming, DI lifetimes, async and CancellationToken, IOptions config, XML docs, analyzer codes, build discipline and hot paths. Load before writing, editing or reviewing C# files (.cs, .razor, .cshtml) or MSBuild files (.csproj, .props, .targets).
---

# .NET conventions

## Policy: standard conventions win over project conventions

Follow [Microsoft's official C# coding conventions](https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/coding-style/coding-conventions) and the .NET runtime naming guidelines, even when the surrounding code, the project's `CLAUDE.md`, or a deviating `.editorconfig` establishes a different style. This deliberately overrides the usual rule to write code that reads like the surrounding code; the goal is to converge every touched file toward standard conventions.

**Exception: the user outranks this rule.** If the user directly instructs, in the session, to follow a project's local style (contributing to an OSS repo, or a codebase owned by another team), that instruction wins. Follow the local style for that work and do not relitigate it.

Apply the conventions from existing knowledge rather than re-deriving them from the codebase being edited: Allman braces (always braced, even single statements), PascalCase, `_camelCase`, `s_`, and `t_` (thread-static) naming, the `I` interface prefix, the `T` generic type parameter prefix, the `Async` suffix, 4-space indentation, modifier ordering, `is null` patterns, file-scoped namespaces, `System.*`-first usings, language keywords over BCL names, `readonly` fields, precise exception types, `using` declarations.

- **New code**: always standard conventions, regardless of the rest of the file or project.
- **Editing existing code**: the lines written or rewritten follow standard conventions. Do not mimic a deviating local style because neighboring lines use it (a file using K&R braces still gets Allman in the added block).
- **Asked to refactor or format**: use the `dotnet-project-standards` skill, which converts the target code wholesale.

## House choices where the standard allows variance

- **`var`**: only when the type is apparent from the right-hand side; explicit types for built-in types and everywhere else, including `foreach`.
- **Expression bodies**: yes for read-only properties, indexers, accessors, and lambdas; block bodies for methods, constructors, operators, and local functions.
- **Switch expressions** over switch statements for concise value mapping.
- **`sealed`**: not by default; only attribute types and security-sensitive classes.
- **Nullable reference types**: `<Nullable>enable</Nullable>` for new projects and new code. On an existing codebase with it disabled, do not enable it during a format or refactor pass; annotating a legacy codebase is its own project. Propose it separately.
- **Primary constructors**: fine for records, DTOs, and simple single-dependency services; avoid for classes with multiple constructor overloads. Their parameters are not implicitly `readonly`.
- **`required` with `init`**: for properties callers must set through an object initializer, when a constructor parameter would be the only other way to enforce it.
- **Method chains**: one chained call per line, indented one level below the receiver.

## Wiring

- **Dependency injection**: every service is registered and injected through its interface (`services.AddScoped<IOrderRepository, OrderRepository>()`, constructor parameter `IOrderRepository`), including the first and only implementation. Appropriate lifetimes: Singleton for long-lived, Scoped for request-bound, Transient for stateless.
- **Async/await**: all I/O async, with `CancellationToken` threaded through. `ConfigureAwait(false)` on awaits in library code; application code omits it.
- **Configuration**: strongly typed classes with the `IOptions<T>` pattern and validation. URLs, timeouts, limits, and feature flags belong in `appsettings.json`.
- **Security**: Microsoft's cryptographic APIs (`IDataProtector`, `RandomNumberGenerator`), never hand-rolled crypto.
- **Data access**: complete transaction handling on multi-statement writes.
- **Type safety and validation**: strongly typed DTOs. Validate at boundaries with data annotations and FluentValidation instead of hand-rolled guards scattered through interior code.

## XML doc comments

The `writing:comments` skill governs `///` exactly as it governs `//`. A public or protected member of a packaged library, in an assembly other codebases reference, carries a `<summary>` and the `<param>`, `<returns>` and `<exception>` elements that tell a caller something the signature does not; `<inheritdoc/>` is right where the member overrides or implements a documented one. Every other member carries no doc comment: its name and signature carry the meaning, and a constraint they cannot express goes in a type, a guard, or a test-anchored constraint comment.

- Delete an internal member's `///` in the lines a task touches, `<inheritdoc/>` included. `public` in an application is internal for this purpose.
- `CS1591` reports every public member without a doc comment. A packaged library leaves it on, so a gap in its public API documentation fails the build. Application code puts `CS1591` in `NoWarn`. Both keep `GenerateDocumentationFile` on: build-time IDE0005 (unused usings) reports only when the documentation file is generated.

## Analyzer rules that bite here

- Collection properties are get-only (CA2227), and public APIs expose `Collection<T>` or `ReadOnlyCollection<T>` instead of `List<T>` (CA1002)
- Explicit `StringComparison` on string comparison and ordering calls (CA1310)
- No TODO comments. The `writing:comments` skill bans them; the work goes in the tracker or gets finished.

Fix warnings when they appear. Suppress only with a written reason at the suppression site.

A C# project without the standard `.editorconfig` and `Directory.Build.props` gets one mention and an offer to add them; the `dotnet-project-standards` skill holds the canonical files and the setup procedure.

## Build discipline

`TreatWarningsAsErrors` fails the build on unused code, so clean up orphaned fields, usings, and helper methods after any refactor. Run a full build after a refactoring pass before moving on.

## Limits on the convention override

The override applies to style and conventions, never to semantics or contracts:

1. **Behavior-preserving**: refactors and reformats must not change observable behavior. Build after non-trivial changes; run tests if present.
2. **Public API surface**: renaming `public` or `protected` members, types, or namespaces to fix naming violations can break external consumers and serialized contracts (JSON property names, EF mappings, reflection lookups). Flag these instead of renaming silently, unless the user asked for a full rename pass.
3. **Functional conventions**: if a project convention exists for a functional reason (a source generator requires a naming pattern), respect that case and note the exception.

## Hot paths only

Apply where a cost is demonstrated, never preemptively: compiled queries for Entity Framework and LINQ hot paths, connection pooling, `Span<T>` and `Memory<T>` to avoid allocations in tight loops.
