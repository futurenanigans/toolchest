<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `unawaited-task`

Awl locates expression statements that discard a bound Task or ValueTask result. A caller can return successfully while its intended work is still in flight. Look for which operation owns completion, cancellation and failure. Awl rule definition (`src/Awl.Rules/Reliability/Async/DroppedTaskRule.cs`)

**Return the task** through a forwarding method or **await** it where another action depends on success. For background work that must outlive the request, transfer it to a worker that owns execution, observes failures and has defined shutdown behavior. [Microsoft, Async return types](https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/async-return-types) · [Microsoft, Channels](https://learn.microsoft.com/en-us/dotnet/core/extensions/channels)

**Before**

```csharp
void Archive(Report report, CancellationToken token)
{
    store.SaveAsync(report, token);
    index.MarkArchived(report.Id);
}
```

**After**

```csharp
async Task ArchiveAsync(Report report, CancellationToken token)
{
    await store.SaveAsync(report, token);
    index.MarkArchived(report.Id);
}
```

The caller can now await archiving, and the index changes only after the save succeeds. This still leaves two distinct writes if atomicity matters. An explicit discard (`_ =`) falls outside this syntactic case and provides no observer for failure.

## When the request promises only to queue work

A request that accepts a preview job can finish before rendering, provided a worker owns the job after acceptance. At startup, create a shared queue, for example `Channel.CreateBounded<ReportId>(32)`. The request queues an immutable ID. A hosted worker owns the render task and uses its shutdown token.

```csharp
// In the request handler, return Accepted only after WriteAsync completes.
await jobs.Writer.WriteAsync(report.Id, requestToken);
return Accepted();
```

```csharp
// On a BackgroundService reading the same channel
protected override async Task ExecuteAsync(CancellationToken stoppingToken)
{
    await foreach (var id in jobs.Reader.ReadAllAsync(stoppingToken))
    {
        try { await previews.RenderAsync(id, stoppingToken); }
        catch (IOException error) { log.LogWarning(error, "Preview {Id} failed", id); }
    }
}
```

The channel’s default `Wait` full mode makes a request wait for space. The worker records an I/O failure and continues with the next ID. Other failures fault the task observed by the host. Shutdown can interrupt rendering and an in-memory queue can lose accepted IDs on process exit. A promise of durable delivery requires persistent acceptance. [Microsoft, Channels](https://learn.microsoft.com/en-us/dotnet/core/extensions/channels) · [Microsoft, Worker services](https://learn.microsoft.com/en-us/dotnet/core/extensions/workers)
