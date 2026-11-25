<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `unordered-selection`

Awl matches configured positional selectors against configured source types whose contract gives no useful ordering. Both lists are empty by default. Identify which item the caller actually promises to choose, including ties and empty inputs. Awl rule definition (`docs/reliability-unordered-selection.md`)

**Make the selection policy explicit.** If the caller means the next due job, define an ordering and a stable tie-breaker. If it means the job for one ID, use keyed lookup. For existence, use a membership test. [Microsoft, Enumerable.ThenBy](https://learn.microsoft.com/en-us/dotnet/api/system.linq.enumerable.thenby?view=net-10.0) · [Microsoft, HashSet.Contains](https://learn.microsoft.com/en-us/dotnet/api/system.collections.generic.hashset-1.contains?view=net-10.0)

**Before**

```csharp
// The configured selector picks the first member of an unordered collection.
Job Next(HashSet<Job> jobs) => jobs.First();
```

**After**

```csharp
Job Next(IEnumerable<Job> jobs) =>
    jobs.OrderBy(job => job.DueAt)
        .ThenBy(job => job.Id)
        .First();
```

The example assumes a unique numeric job ID and keeps the existing failure on empty input. If selection is frequent, the owner can maintain a priority queue with the same tie rule. Sorting is extra work when any element really is acceptable.

## When the caller knows the job ID

If a dispatcher asks for job 42, returning the first job in a set can dispatch another customer’s work. Use the existing ID index and express what should happen when the job is missing.

```csharp
static Job? FindAssigned(IReadOnlyDictionary<int, Job> jobsById, int assignedId) =>
    jobsById.TryGetValue(assignedId, out var job) ? job : null;
```

Here IDs are unique, jobs are reference types and the caller handles a missing assignment. An index built from a source with duplicate IDs needs a defined duplicate policy. [Microsoft, IReadOnlyDictionary.TryGetValue](https://learn.microsoft.com/en-us/dotnet/api/system.collections.generic.ireadonlydictionary-2.trygetvalue?view=net-10.0)

## When exactly one item must match

A configuration that promises exactly one default should reject two defaults even if one has the smaller ID. Express the cardinality contract directly.

```csharp
static QueueConfig DefaultQueue(IEnumerable<QueueConfig> queues) =>
    queues.Single(queue => queue.IsDefault);
```

The outcome is independent of enumeration order. Zero matches and multiple matches each raise an error. Choose this only when both states are invalid. [Microsoft, Enumerable.Single](https://learn.microsoft.com/en-us/dotnet/api/system.linq.enumerable.single?view=net-10.0)
