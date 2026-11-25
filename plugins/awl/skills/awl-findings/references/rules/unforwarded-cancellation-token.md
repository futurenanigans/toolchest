<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `unforwarded-cancellation-token`

Awl reports an omitted or established non-cancelable token when the owning function has an available token and the bound invocation accepts one. Read the selected parameter and call witness. APIs can have distinct tokens for request lifetime and service shutdown. Awl rule definition (`docs/reliability-cancellation.md`)

**Cooperative cancellation** gives the request owner the choice to cancel and passes its token down to each operation it owns. [Microsoft, Cooperative cancellation](https://learn.microsoft.com/en-us/dotnet/standard/threading/cancellation-in-managed-threads)

**Before**

```csharp
async Task<string> ReadTemplateAsync(string path, CancellationToken token) =>
    await File.ReadAllTextAsync(path);
```

**After**

```csharp
Task<string> ReadTemplateAsync(string path, CancellationToken token) =>
    File.ReadAllTextAsync(path, token);
```

Returning the file task preserves completion and cancellation.

## When a parallel loop schedules cancellable work

Even if every render receives the token, the loop also needs to know when to stop scheduling pages. Pass the token to its options and to each render.

```csharp
void RenderAll(IEnumerable<Page> pages, CancellationToken token)
{
    var options = new ParallelOptions { CancellationToken = token };
    Parallel.ForEach(pages, options, page => Render(page, token));
}
```

Awl checks token parameters on the selected signature. An option such as `ParallelOptions.CancellationToken` requires a separate look. [Microsoft, Cancelling a parallel loop](https://learn.microsoft.com/en-us/dotnet/standard/parallel-programming/how-to-cancel-a-parallel-for-or-foreach-loop)

## When callers share work but can abandon their own wait

Suppose several requests wait for one catalog warm-up. Passing the first request’s token to the shared load lets one disconnect cancel everyone’s result. Start the load once under the host’s lifetime, and let each request cancel its own wait.

```csharp
sealed class CatalogWarmup
{
    public Task<Catalog> Ready { get; }

    public CatalogWarmup(CatalogSource source, CancellationToken hostStopping)
    {
        Ready = source.LoadAsync(hostStopping);
    }

    public Task<Catalog> GetAsync(CancellationToken requestToken) =>
        Ready.WaitAsync(requestToken);
}
```

The host owns the single instance and observes `Ready` for failure even if every requester leaves. A canceled waiter leaves the shared load running. A fault in the shared load reaches the host and any callers still waiting. [Microsoft, Task.WaitAsync](https://learn.microsoft.com/en-us/dotnet/api/system.threading.tasks.task-1.waitasync?view=net-10.0)
