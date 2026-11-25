<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Choosing a pattern for an Awl finding

When the same change keeps crossing projects, start with the solution-wide guide. It follows a renewal policy from a web page and a nightly job through one capability module to storage, then shows how Awl separates measuring fan-in, deciding when to deny an edit, and rendering the result. [Solution-wide design patterns](solution-wide-design.md)

For an individual finding, read its named consumers, fields, calls, inputs or before/after witnesses. These guides are for solutions analyzed with Awl. Examples from Awl’s own source show how to recognize the same decisions in another codebase. Ask what contract a caller relies on and which change would force unrelated code to change. Awl’s rule registry (`src/Awl.Rules/CanonicalRules.cs`) · How Awl classifies assessments (`docs/rule-execution.md`)

Check whether the source supports the finding before choosing a pattern. If each owner visits its own disjoint bucket once, the total number of element visits is the sum of the bucket sizes. A report that multiplies the number of owners by the size of the whole collection is a false positive. Keep the traversal and identify which bound the report got wrong. [Checking the size factors in `multiplicative-work`](rules/multiplicative-work.md#is-this-a-false-positive)

A six-argument constructor might take pieces of one value or services for two independent jobs. A snapshot can make it safe to remove items while visiting them. A feature disabled in staging may still be required in production. The caller’s contract determines which example fits. [Splitting unrelated jobs](rules/parameter-count.md#when-the-parameters-are-injected-services) · [Keeping a snapshot before mutation](rules/repeated-allocation.md#keep-a-snapshot-before-mutating-the-collection) · [Following a configuration override](rules/inactive-in-configuration.md#follow-the-winning-provider-when-an-active-deployment-is-disabled)

Each table summarizes what a rule analyzes and links to its C# examples. Use `awl explain --target <solution-or-project> --rule <id>` to read its registered description. The snippets often use fewer callers or branches than a default warning threshold. Each guide cites the Awl definition for the full predicate, defaults and evidence limits, and sources for the patterns it applies.

## Dependencies and module boundaries

| Rule | What it analyzes | Examples in the guide |
| --- | --- | --- |
| [wide-fan-in](rules/wide-fan-in.md) | Counts distinct declarations that depend on a target, separating test consumers for production targets. | Narrow different caller roles, centralize repeated construction, or keep widely shared vocabulary. |
| [namespace-fan-out](rules/namespace-fan-out.md) | Counts distinct solution namespaces that a namespace depends on directly. | Move wiring to startup or separate jobs that belong to different features. |
| [namespace-cycle](rules/namespace-cycle.md) | Finds groups of namespaces that depend on one another in a cycle. | Invert an operation or move a shared value where both sides can depend on it. |
| [layer-guard](rules/layer-guard.md) | Finds direct dependencies that the configured layer policy forbids. | Give the inner layer a port or move wire annotations into a transport model. |
| [concrete-layer-dependency](rules/concrete-layer-dependency.md) | Finds constructor parameters typed as a concrete class from an outer declared layer when an abstraction the inner layer may use exists. | Take the abstraction or extend it with the operation the use case needs. |
| [service-locator](rules/service-locator.md) | Finds service-provider resolutions outside a composition root. | Inject the service through the constructor or confine per-message resolution to one factory. |
| [fat-interface](rules/fat-interface.md) | Groups an interface’s members by the consumer types that use them together and reports two or more groups. | Split along the consumer groups or keep a contract that outside implementers must supply whole. |
| [coupling-between-objects](rules/coupling-between-objects.md) | Counts distinct solution types a class uses in its declarations and operations. | Separate independent analysis decisions and keep a cohesive evidence projection together. |
| [accessible-symbol-collision](rules/accessible-symbol-collision.md) | Finds unqualified uses where one declaration hides another accessible declaration of the same name. | Rename a local by its role or use explicit aliases for two published type names. |
| [depth-of-inheritance](rules/depth-of-inheritance.md) | Counts a class and the chain of base classes declared in the loaded source. | Compose a varying policy or collapse an unused intermediate base. |

## Responsibilities, data and duplication

| Rule | What it analyzes | Examples in the guide |
| --- | --- | --- |
| [response-for-class](rules/response-for-class.md) | Counts the distinct member bodies a class owns and the targets those bodies call directly. | Group calls that form one protocol and reconsider pass-through methods that add no policy. |
| [class-partition](rules/class-partition.md) | Finds groups of instance members with no shared state or direct calls between groups. | Separate independently owned state or keep fields that form one domain value together. |
| [class-facade](rules/class-facade.md) | Finds classes where internal calls connect three or more groups that otherwise share no instance state. | Keep an entry point for independent subsystems or inline private fragments of one operation. |
| [disjoint-collaborators](rules/disjoint-collaborators.md) | Finds separate groups of class members that each use their own set of constructor-injected dependencies. | Separate independent jobs or keep the single callback receiver a framework requires. |
| [foreign-data-access](rules/foreign-data-access.md) | Counts distinct instance fields and properties accessed on other solution types with behavior outside the class’s hierarchy. | Put a decision beside its data or let two owners supply distinct parts of the decision. |
| [god-class](rules/god-class.md) | Finds classes combining high total cyclomatic complexity, heavy use of other types’ data, and low cohesion. | Extract an invariant or separate workflows that use different data and services. |
| [weighted-methods-per-class](rules/weighted-methods-per-class.md) | Sums cyclomatic complexity across a class’s functions. | Split independent phases or express a classification shared by several methods once. |
| [class-cognitive-complexity](rules/class-cognitive-complexity.md) | Sums cognitive complexity across a class’s functions. | Separate decisions from effects or put the legal state transitions in one place. |
| [parameter-count](rules/parameter-count.md) | Counts value parameters on signatures the declaring code controls. | Group parts of one value, split unrelated injected services, or derive a redundant argument. |
| [data-clump](rules/data-clump.md) | Finds groups of at least three values passed together through calls across several declarations. | Introduce a value for forwarded parts or pass the existing immutable value intact. |
| [semantic-duplicate-body](rules/semantic-duplicate-body.md) | Finds function bodies with equivalent operations and calls, even when names or literal values differ. | Share a common calculation and keep separately promised policies independent. |
| [literal-guard](rules/literal-guard.md) | Counts distinct members that use the same unnamed, nontrivial literal value. | Distinguish protocol constants, deployment settings, and equal values with different meanings. |

## Branching, types and state

| Rule | What it analyzes | Examples in the guide |
| --- | --- | --- |
| [repeated-discriminator-switch](rules/repeated-discriminator-switch.md) | Counts the members that switch on the same enum, type hierarchy, field or property. | Move per-case behavior onto one type per case or keep exhaustive switches at separate boundaries. |
| [cyclomatic-complexity](rules/cyclomatic-complexity.md) | Counts one per function plus its decision points, including branches, loops, and Boolean conditions. | Use a decision table for fixed outcomes or Strategy for distinct algorithms. |
| [cognitive-complexity](rules/cognitive-complexity.md) | Measures complexity from nesting, branching, sequences of logical operators, and recursive call cycles in a function. | Flatten preconditions or separate lazy selection from the actions that consume it. |
| [same-value-branches](rules/same-value-branches.md) | Finds conditionals and switches whose branches all perform equivalent operations. | Consolidate a common action or restore an accidentally lost outcome. |
| [nullable-state-assertion](rules/nullable-state-assertion.md) | Finds uses of `!` that make the compiler treat a null or possibly null value as non-null. | Validate a required value or express an ordinary miss in a typed lookup. |
| [dynamic-type](rules/dynamic-type.md) | Finds declarations using `dynamic` and operations whose binding is deferred to runtime. | Adapt flexible input at the boundary or give owned types a checked common interface. |
| [lossy-numeric-conversion](rules/lossy-numeric-conversion.md) | Finds built-in numeric conversions that can silently change a value or lose precision. | Reject invalid fractions, apply a promised rounding rule, or preserve exact identifiers. |
| [unordered-selection](rules/unordered-selection.md) | Finds position-based selections from sources the configuration declares unordered. | Rank candidates, look up a known ID, or enforce exactly one match. |
| [mutable-static-field](rules/mutable-static-field.md) | Finds reassignable static fields and `static readonly` fields whose types expose mutable state. | Freeze a shared lookup or give mutable state the lifetime of one operation. |
| [discouraged-member](rules/discouraged-member.md) | Finds uses of API members the configuration marks as discouraged. | Isolate a replaceable dependency or select the overload the policy requires. |
| [compiler-error](rules/compiler-error.md) | Groups C# compiler errors by project, diagnostic code, and message. | Repair the input conversion or implement the contract named in the compiler diagnostic. |

## Asynchronous work and cancellation

| Rule | What it analyzes | Examples in the guide |
| --- | --- | --- |
| [unawaited-task](rules/unawaited-task.md) | Finds `Task` or `ValueTask` results discarded by a statement or a void-returning expression body. | Await work promised by the request or give accepted background work an owner. |
| [async-void-method](rules/async-void-method.md) | Finds `async void` functions, including lambdas and event handlers. | Bridge a required event signature or replace a void callback with an awaited loop. |
| [blocking-in-async](rules/blocking-in-async.md) | Finds direct uses of blocking operations such as `Thread.Sleep` or `Task.Wait` inside an async function. | Await admission to a resource or join independent tasks without blocking a thread. |
| [sync-over-async](rules/sync-over-async.md) | Finds synchronous functions that wait for async work through `.Result`, `.Wait()`, or `.GetAwaiter().GetResult()`. | Carry async to the entry point or finish I/O before invoking a synchronous callback. |
| [unforwarded-cancellation-token](rules/unforwarded-cancellation-token.md) | Finds calls that omit or default a cancellation token when a token parameter is available to forward. | Forward the operation’s token or let a caller cancel only its wait for shared work. |

## Exceptions and recovery

| Rule | What it analyzes | Examples in the guide |
| --- | --- | --- |
| [catch-null-reference](rules/catch-null-reference.md) | Finds catch clauses that explicitly catch `NullReferenceException`. | Represent an optional value or reject a missing required argument. |
| [throw-base-exception](rules/throw-base-exception.md) | Finds direct throws of newly constructed `Exception`, `SystemException`, or `ApplicationException` instances. | Throw a specific exception or return a normal outcome the caller can handle. |
| [useless-rethrow](rules/useless-rethrow.md) | Finds throws of the caught variable (`throw ex;`) that reset the stack trace. | Rethrow the original failure or construct the translated exception the caller expects. |
| [dropped-cause](rules/dropped-cause.md) | Finds replacement exceptions thrown from a catch without passing the caught exception into their construction. | Retain the caught instance when translating a failure. For unchanged failures, see [rethrowing](rules/useless-rethrow.md). |
| [swallowed-exception](rules/swallowed-exception.md) | Finds empty catch handlers and handlers that can finish without reading the caught exception. | Return a recovery outcome, let failure propagate, or use an operation that already accepts absence. |
| [over-broad-catch](rules/over-broad-catch.md) | Finds general catches without a proven type restriction or a bare rethrow on every exit. | Narrow recovery to one or several known types, or report unexpected failure at a command boundary. |
| [throw-in-finally](rules/throw-in-finally.md) | Finds explicit throws that can escape a `finally` block and mask an earlier failure. | Separate success validation from cleanup and decide what happens if both operations fail. |

## Work, allocation and measurement

| Rule | What it analyzes | Examples in the guide |
| --- | --- | --- |
| [multiplicative-work](rules/multiplicative-work.md) | Finds element comparisons that multiply with input sizes, such as a linear search inside a loop. | Trace per-element data, keyed buckets and fixed bounds before indexing a repeated scan. |
| [repeated-work](rules/repeated-work.md) | Finds loops that repeatedly sort, parse, or build collections from unchanged inputs. | Compute a batch-wide value once, at entry or on the first item that needs it. |
| [repeated-allocation](rules/repeated-allocation.md) | Finds loops that rebuild collections from changing inputs or keep copying a growing value. | Keep a mutation snapshot, drop a redundant copy around sorting, or freeze each owner’s own data. |
| [repeated-external-effect](rules/repeated-external-effect.md) | Finds file, network, or process-start operations repeated inside a loop. | Batch remote calls or reuse immutable reads within one job. |
| [blocking-coordination](rules/blocking-coordination.md) | Finds waits, locks, or sequential awaits in loops, and blocking work reached through synchronous helpers from async code. | Distinguish completed tasks, short sequential file lists and workloads that benefit from concurrency. |
| [introduced-expensive-work](rules/introduced-expensive-work.md) | Compares revisions for new cost patterns or increases in how quickly work grows with input size. | Remove repeated scans and recognize new work the feature actually requires. |
| [measured-benchmark-change](rules/measured-benchmark-change.md) | Compares BenchmarkDotNet reports for increases in time or bytes allocated per operation. | Trace extra allocations to copies and extra lookup time to the search algorithm. |

## Reachability and configuration

| Rule | What it analyzes | Examples in the guide |
| --- | --- | --- |
| [unreferenced-declaration](rules/unreferenced-declaration.md) | Finds source methods with no static path from any modeled production, test, or other entry point. | Remove a retired group or restore the entry point for a promised command. |
| [newly-orphaned-group](rules/newly-orphaned-group.md) | Finds method groups that lost their last production path since the base revision. | Restore a required step or remove a deliberately retired route and its private implementation. |
| [newly-conditional-group](rules/newly-conditional-group.md) | Finds method groups whose production paths now all require a condition the base revision did not require. | Keep a rollout gate around its optional step and move required work outside it. |
| [inactive-in-configuration](rules/inactive-in-configuration.md) | Finds method groups whose production paths all require a condition disabled in the captured configuration. | Retire an obsolete feature or follow provider precedence to a mistaken override. |

## Tests, evidence and change history

| Rule | What it analyzes | Examples in the guide |
| --- | --- | --- |
| [untested-public-member](rules/untested-public-member.md) | Finds externally visible production members with no static path from a test-project declaration. | Test a public contract or narrow an accidentally exposed helper. |
| [untested-throw](rules/untested-throw.md) | Finds explicit throws whose containing function has no static path from a test-project declaration. | Assert a public exception or the observable result when the boundary handles it. |
| [comment-anchor](rules/comment-anchor.md) | Checks that required comment anchors name a test method related to the commented code. | Tie a real constraint to a test or remove commentary that repeats the code. |
| [suppression-guard](rules/suppression-guard.md) | Finds diagnostic suppressions declared through pragmas, attributes, or compiler settings. | Repair the diagnostic or confine a justified suppression to its compatibility adapter. |
| [temporal-coupling](rules/temporal-coupling.md) | Finds pairs of production files that repeatedly change together in Git commits. | Consolidate duplicated policy or protect an intentional wire contract between independent releases. |
| [test-co-change](rules/test-co-change.md) | Measures how often a production file changes without a change to any test file that statically reaches it. | Add a distinguishing example for changed behavior or keep a test that already covers the contract. |
