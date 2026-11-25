<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `blocking-coordination`

Awl can report an await, critical section or blocking call under a loop, and blocking work reached from an async caller through a synchronous callee. Read the work kind in the finding. A serialized file read, a thread waiting on a task, and a lock acquisition call for different decisions. Awl rule definition (`docs/performance-families.md`)

## Is this a false positive?

Trace the exact task at the await. Awl’s pipe server collects connections filtered by `task.IsCompleted`, then awaits those same tasks to observe their outcomes. Those awaits complete synchronously and can propagate failure. A reported wait on that path would overstate the work. A different task, or one chosen without the completion check, can still be pending. For a sequence of genuine file reads, the finding establishes sequential scheduling. The value of overlapping the reads depends on the workload. Pipe server (`src/Awl.Host/Transport/Pipes/PipeServer.cs`) · Awl’s settled-wait rules (`docs/performance-costs.md#source-summaries`) · [Microsoft, Task.IsCompleted](https://learn.microsoft.com/en-us/dotnet/api/system.threading.tasks.task.iscompleted?view=net-10.0)

## Keep sequential awaits for a handful of supplied files

Awl imports the benchmark, coverage and configuration files named in a request. A caller may pass just one current benchmark and one baseline. A sequential reader is a sensible default for that workload. Here is the current-report loop in abbreviated form.

```csharp
foreach (string path in reportPaths.Distinct(StringComparer.Ordinal))
    reports.Add(await BenchmarkReader.ReadAsync(path, BenchmarkRole.Current, token));
```

With one file there is no other read to overlap. With a few files, this bounds in-flight reads at one, visits the distinct paths sequentially, and leaves later reads unstarted if one fails. The count can grow with the caller’s input even when typical requests name only a handful of files. Keep the loop while it meets the latency requirement. Reconsider concurrency if representative requests spend significant time waiting on independent reads. Awl’s observation import (`src/Awl.Host/History/ObservationImport.cs`)

## Bound concurrency when independent reads dominate latency

Use **bounded concurrency** for independent I/O. A parallel async loop can cap in-flight reads. Give each result its own slot so the caller still receives input order. A single writer or an ordered consumer is the appropriate owner where writes must be serialized. [Microsoft, Parallel.ForEachAsync](https://learn.microsoft.com/en-us/dotnet/api/system.threading.tasks.parallel.foreachasync?view=net-10.0) · [Microsoft, Channels](https://learn.microsoft.com/en-us/dotnet/core/extensions/channels)

**Before**

```csharp
var results = new string[paths.Count];
for (int i = 0; i < paths.Count; i++)
    results[i] = await source.ReadAsync(paths[i], token);
return results;
```

**After**

```csharp
var results = new string[paths.Count];
var options = new ParallelOptions
{
    MaxDegreeOfParallelism = maxConcurrentReads,
    CancellationToken = token
};
await Parallel.ForEachAsync(Enumerable.Range(0, paths.Count), options,
    async (index, ct) => { results[index] = await source.ReadAsync(paths[index], ct); });
return results;
```

Choose a positive limit that the source can serve. Reads can overlap up to that limit, including reads that started before another failed. Awl’s `HookSources.ReadAsync` also writes to a single dictionary and emits diagnostics per path. A concurrent version would need one owner for those writes and a decision about diagnostic order. Awl’s hook source reader (`src/Awl.Cli/Hooks/HookSources.cs`)

## Publish a batch total under one lock

If the witness is `lock (gate) totalBytes += size;` inside a loop, check when readers may see the total. A service that publishes completed batches can compute a private subtotal and acquire the shared lock once.

```csharp
void RecordBatch(ReadOnlySpan<int> sizes)
{
    long batchBytes = 0;
    foreach (int size in sizes)
        batchBytes += size;

    lock (gate)
        totalBytes += batchBytes;
}
```

Readers using the same lock now see one update per batch. If they need live progress after every item, that change removes an observable behavior. [Microsoft, The lock statement](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/statements/lock)

## Keep the await when the next write needs its result

```csharp
var revision = expectedRevision;
foreach (var change in changes)
    revision = await store.ApplyAsync(change, revision, token);
return revision;
```

Each write uses the revision acknowledged by its predecessor. A conflict stops the sequence before the next write is sent. Starting the writes together would break both promises, even if their responses were sorted back into input order. The serialized await expresses the protocol.
