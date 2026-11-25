<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `async-void-method`

Awl reports functions that bind as both async and void, including lambdas. A bound event subscription supplies context. A real event handler can still be reported because its caller cannot await it. Awl rule definition (`docs/reliability-binding.md`)

**Task-returning core with an event adapter.** Put the reusable operation behind a Task contract. Reserve async void for the outer method when the event API requires a void delegate. Give that boundary an explicit policy for failure. [Microsoft, Async return types](https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/async-return-types)

**Before**

```csharp
async void Save()
{
    await store.FlushAsync();
    status.ShowSaved();
}
```

**After**

```csharp
async Task SaveAsync()
{
    await store.FlushAsync();
    status.ShowSaved();
}

async void SaveClicked(object? sender, EventArgs args)
{
    try { await SaveAsync(); }
    catch (IOException error) { status.ShowSaveFailure(error); }
}
```

Application callers and tests can await `SaveAsync`. The event adapter still has a reviewable async-void signature. Handle recoverable UI errors there and decide how the application reports unexpected failures. Changing its signature to `Task` would break a void event contract.

## When a collection callback silently converts an async lambda to void

`List<T>.ForEach` takes an `Action<T>`. An async lambda passed there returns control at its first incomplete await, so the containing method may finish before the uploads. If the contract calls for sequential uploads and stopping on the first failure, let the containing method await them.

```csharp
// Before
files.ForEach(async file => await uploader.SendAsync(file, token));

// After, inside the task-returning upload method
foreach (var file in files)
    await uploader.SendAsync(file, token);
```

Now the next upload starts only after its predecessor succeeds, and a failure or cancellation reaches the caller. If the uploads should overlap, use a task-returning coordinator with an explicit concurrency limit. [Bounded concurrency example](blocking-coordination.md) · [Toub, Pitfalls of async lambdas](https://devblogs.microsoft.com/dotnet/potential-pitfalls-to-avoid-when-passing-around-async-lambdas/)
