<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `useless-rethrow`

Awl locates a throw whose operand is the caught local. Throwing that reference by value can reset the stack information a caller needs. Check whether the local still denotes the originally caught exception. Awl rule definition (`docs/reliability-exceptions.md`)

**Transparent rethrow** preserves the original exception after necessary boundary work. If the handler contributes nothing, remove the whole try/catch. For a deliberate change of exception type, use exception translation and preserve the cause. [Microsoft, CA2200](https://learn.microsoft.com/en-us/dotnet/fundamentals/code-analysis/quality-rules/ca2200) · [Microsoft, Best practices for exceptions](https://learn.microsoft.com/en-us/dotnet/standard/exceptions/best-practices-for-exceptions)

**Before**

```csharp
try { await transport.SendAsync(message, token); }
catch (IOException error)
{
    metrics.RecordFailure(error);
    throw error;
}
```

**After**

```csharp
try { await transport.SendAsync(message, token); }
catch (IOException error)
{
    metrics.RecordFailure(error);
    throw;
}
```

Both versions record a failure. The bare rethrow retains the original throw site.

## Keep a deliberate exception translation

Awl also reports `throw error;` after the handler has reassigned the caught local. Here retry logic has to be able to recognize an unavailable catalog. A bare rethrow would discard the new domain exception. Express construction directly and preserve the caught cause.

```csharp
// Before, CatalogUnavailableException derives from IOException.
catch (IOException error)
{
    error = new CatalogUnavailableException(catalogId, error);
    throw error;
}
```

```csharp
// After, the domain exception remains visible to the caller.
catch (IOException error)
{
    throw new CatalogUnavailableException(catalogId, error);
}
```

The custom constructor must pass the cause to its base constructor. Its public type gives the retry policy the same decision it had before. A bare rethrow always uses the exception originally caught, even after assigning a different exception to the variable. [C# specification, the try statement](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/language-specification/statements#1311-the-try-statement)
