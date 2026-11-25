<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `comment-anchor`

The main plan asks for an executable test behind an explanatory comment. Awl checks in-scope comment units, with an exception for anchorless leading documentation on a top-level type or delegate. It can resolve the named test-project method and check its relationship to the bound code. Choose a test that would fail if the stated property were broken. Main-plan requirement (`docs/implementation-plan.md`) · Awl rule definition (`docs/comment-anchors.md`)

Use **Specification by Example** for a non-obvious contract. An empty append preserving object identity matters to a caller caching by reference. Checking equality alone would let an unnecessary allocation slip through. [Fowler, Specification by Example](https://martinfowler.com/bliki/SpecificationByExample.html)

**Before**

```csharp
// Empty appends preserve identity because readers cache by reference.
public TextBuffer Append(string value) =>
    value.Length == 0 ? this : new TextBuffer(Text + value);
```

**After**

```csharp
// Empty appends preserve identity because readers cache by reference.
// test: {"project":"../../tests/Example.Tests/Example.Tests.csproj","framework":"net10.0","member":"M:Example.Tests.BufferTests.EmptyAppend"}
public TextBuffer Append(string value) =>
    value.Length == 0 ? this : new TextBuffer(Text + value);

// In Example.Tests.BufferTests
[Fact]
public void EmptyAppend()
{
    var original = new TextBuffer("abc");
    Assert.Same(original, original.Append(""));
}
```

The illustrative project path is relative to the commented project and both projects must be loaded. Use the real framework and Roslyn method identity. The assertion protects the behavior, and the direct call gives Awl a semantic witness. A URL can document an external constraint while the test anchors the behavior promised by your code.

## Remove a comment that repeats the code

Consider a member preceded by `// Return true when the queue contains no items.` The property name and expression already communicate everything the comment says. Delete that line.

```csharp
public bool IsEmpty => items.Count == 0;
```

A test asserting emptiness may still protect queue behavior. This comment adds no separate claim for an anchor to explain. Keep API documentation that callers actually need.
