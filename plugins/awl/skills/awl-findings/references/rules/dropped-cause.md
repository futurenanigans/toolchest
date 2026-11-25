<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `dropped-cause`

Awl follows whether the caught exception instance reaches the construction of a replacement exception. Copying its message drops the type, stack and other context that downstream diagnostics may need. Awl rule definition (`docs/reliability-causes.md`)

**Translate exceptions at the boundary** where the vocabulary changes. Preserve the original as the inner exception and add context that only this layer knows. If callers already understand the original failure, let it propagate. [Microsoft, Best practices for exceptions](https://learn.microsoft.com/en-us/dotnet/standard/exceptions/best-practices-for-exceptions)

**Before**

```csharp
catch (IOException error)
{
    throw new InvalidDataException($"Cannot read catalog {catalogId}. {error.Message}");
}
```

**After**

```csharp
catch (IOException error)
{
    throw new InvalidDataException($"Cannot read catalog {catalogId}.", error);
}
```

The outer message identifies the failed catalog and the inner exception preserves the actual I/O failure. For a custom exception, verify that its constructor forwards the cause to `base(message, inner)`. Merely accepting it as an argument can satisfy the reported source transfer.
