<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `compiler-error`

Awl groups actual C# compiler errors by project, diagnostic ID and message. Start with the compiler’s named types and locations. A design pattern only earns its place when the error exposes a repeated boundary mistake. Awl rule definition (`src/Awl.Rules/Integrity/CompilerDiagnosticRule.cs`)

**Parse once at the input boundary** when human-readable input and typed application code meet. The example assumes a positive numeric order ID. Invalid text gets an explicit input response and the core has one representation. [Microsoft, Parameter and argument mismatches](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/compiler-messages/parameter-argument-mismatch) · [Fowler, Value Object](https://martinfowler.com/bliki/ValueObject.html)

**Before**

```csharp
// OpenOrder takes an OrderId. The argument is a string.
return OpenOrder(request.RouteId);
```

**After**

```csharp
if (!int.TryParse(request.RouteId, out int number) || number <= 0)
    return BadRequest("Expected a positive order ID.");

return OpenOrder(new OrderId(number));
```

For a simple wrong member name or missing argument, fix that use directly. A cast or dynamic dispatch that postpones an incompatible call until runtime loses the compiler’s help. For external identifiers with a defined culture or text grammar, use that exact parser.

## When an implementation no longer matches its interface

If a sink interface now promises cancellable writes, an old one-argument implementation leaves the interface member unimplemented. Start with the failed contract named by `CS0535`. Give the sink the required parameter and carry it to the actual write.

```csharp
interface IReportSink
{
    Task WriteAsync(Report report, CancellationToken token);
}

// Previously declared WriteAsync(Report report) only.
sealed class FileSink(ReportStore store) : IReportSink
{
    public Task WriteAsync(Report report, CancellationToken token) =>
        store.WriteAsync(report, token);
}
```

Callers through `IReportSink` can now cancel the write. If existing callers still require the one-argument overload, it can forward to the corrected implementation under its original cancellation contract. [Microsoft, Interface implementation errors](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/compiler-messages/interface-implementation-errors)
