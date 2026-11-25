<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `over-broad-catch`

Awl reports a general or untyped catch unless the supported filter/exit evidence narrows it or establishes transparent rethrow. Consider exactly which failures the fallback is designed to recover from. Awl rule definition (`docs/reliability-exception-flow.md`)

**Catch at the recovery boundary.** A parser can return an invalid-input outcome for malformed JSON while letting resource failures and programming defects keep their proper handling. At an outer host boundary, a general handler can be justified when it records failure and terminates the operation. [Microsoft, CA1031](https://learn.microsoft.com/en-us/dotnet/fundamentals/code-analysis/quality-rules/ca1031) · [Microsoft, Best practices for exceptions](https://learn.microsoft.com/en-us/dotnet/standard/exceptions/best-practices-for-exceptions)

**Before**

```csharp
try { return ParseResult.Success(ParseDocument(text)); }
catch (Exception error) { return ParseResult.Invalid(error.Message); }
```

**After**

```csharp
try { return ParseResult.Success(ParseDocument(text)); }
catch (JsonException error)
{
    return ParseResult.Invalid(error.Message);
}
```

The example assumes malformed JSON is the specified recoverable failure. Identify the actual exception types of the dependency. When recording and rethrowing is the boundary contract, use a bare `throw;`.

## Share recovery for a known set of failures

If an optional preview may be unavailable either because its file cannot be read or because access is denied, both cases can share one recovery operation. List the recoverable types in the filter. An opaque helper such as `when (CanRecover(error))` leaves their set unresolved for this rule. [Microsoft, Exception handling statements](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/statements/exception-handling-statements)

```csharp
try { return Preview.Read(path); }
catch (Exception error) when (error is IOException or UnauthorizedAccessException)
{
    return Preview.Unavailable(path, error);
}
```

Here the preview result carries the original failure for diagnostics. Unrelated errors still escape, and the type restriction gives Awl evidence that the handler selects a proper subset.

## Report unexpected failure at a command boundary

A command runner may promise its host a nonzero status for any failed command. This is a reason to retain a broad catch at that one boundary. Forward requested cancellation to the host that owns it.

```csharp
try
{
    await command.RunAsync(stop);
    return 0;
}
catch (OperationCanceledException canceled) when (stop.IsCancellationRequested && canceled.CancellationToken == stop)
{
    throw;
}
catch (Exception failure)
{
    Console.Error.WriteLine(failure);
    return 1;
}
```

Narrowing the last catch to parsing errors would abandon the exit-status contract for other failures. Awl can still flag the catch because it accepts general exceptions and returns normally. Inside the command, let failures reach this owner.
