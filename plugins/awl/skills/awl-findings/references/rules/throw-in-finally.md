<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `throw-in-finally`

Awl examines explicit throws in a finally block and whether a local handler can intercept them. A second failure during cleanup can become the only exception seen by the caller. Awl rule definition (`docs/reliability-exception-flow.md`)

**Scope cleanup, then validate normal completion.** Let a using statement own disposal and perform the success check after the work has returned. If work fails, the caller should receive the failure that interrupted it. [Microsoft, The using statement](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/statements/using) · [Microsoft, CA2219](https://learn.microsoft.com/en-us/dotnet/fundamentals/code-analysis/quality-rules/ca2219)

**Before**

```csharp
long written = 0;
try { written = Copy(source, destination); }
finally
{
    destination.Dispose();
    if (written != expected)
        throw new InvalidDataException("Incomplete copy.");
}
```

**After**

```csharp
long written;
using (destination)
{
    written = Copy(source, destination);
}
if (written != expected)
    throw new InvalidDataException("Incomplete copy.");
```

This example owns the destination. A short successful copy still fails validation, while a thrown read error survives the length check. Disposal itself can throw.

## Keep the original failure when cleanup also fails

Suppose the writer owns its destination and closing it can report an I/O failure. Awl inspects explicit throws inside `finally`. The documented effects of `Dispose` matter to the design as well. To propagate the first failure and record a second I/O failure during cleanup, track whether the copy completed. [Microsoft, How to use finally blocks](https://learn.microsoft.com/en-us/dotnet/standard/exceptions/how-to-use-finally-blocks)

```csharp
bool copied = false;
try
{
    Copy(source, destination);
    copied = true;
}
finally
{
    try { destination.Dispose(); }
    catch (IOException cleanup) when (!copied)
    {
        diagnostics.RecordCleanupFailure(cleanup);
    }
}
```

A close failure after a successful copy reaches the caller. If both steps fail, the original copy error propagates and diagnostics receives the cleanup error. This design requires a nonthrowing diagnostic sink and covers the named I/O failure from cleanup.
