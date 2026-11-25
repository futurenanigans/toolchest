<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `blocking-in-async`

Awl finds bound blocking calls or synchronous task consumption in the nearest async function, including configured blocking members. Follow the exact wait, the awaited work and any admission limit held across it. Awl rule definition (`docs/reliability-blocking.md`)

**Async all the way** includes the waits around the I/O. A semaphore can enforce the same one-at-a-time rule through `WaitAsync`. Pair each successful acquisition with a release and pass the request token through both acquisition and work. [Microsoft, Asynchronous programming scenarios](https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/async-scenarios) · [Microsoft, Cooperative cancellation](https://learn.microsoft.com/en-us/dotnet/standard/threading/cancellation-in-managed-threads)

**Before**

```csharp
async Task FlushAsync(CancellationToken token)
{
    gate.Wait(token);
    try { await writer.FlushAsync(token); }
    finally { gate.Release(); }
}
```

**After**

```csharp
async Task FlushAsync(CancellationToken token)
{
    await gate.WaitAsync(token);
    try { await writer.FlushAsync(token); }
    finally { gate.Release(); }
}
```

Cancellation during acquisition must leave the semaphore count alone. If a task result is needed, awaiting a captured task also works when it has already completed. A completion check on a mutable variable or a getter that can return another task is a poor ownership boundary.

## When independent reads must finish together

An async method can start two reads and then block its thread with `Task.WaitAll(header, index)`. If both reads are already in flight and can use the source concurrently, await their joint completion.

```csharp
Task<Header> header = source.ReadHeaderAsync(token);
Task<IndexData> index = source.ReadIndexAsync(token);
Task joined = Task.WhenAll(header, index);
await joined;
return new Snapshot(await header, await index);
```

The caller gets a snapshot only after both reads succeed, and the two reads still overlap. `WaitAll` exposes an `AggregateException` on failure. Awaiting the joined task propagates an exception directly. If the caller’s contract needs every fault, the completed task retains them in `joined.Exception`. [Microsoft, Task.WhenAll](https://learn.microsoft.com/en-us/dotnet/api/system.threading.tasks.task.whenall?view=net-10.0)
