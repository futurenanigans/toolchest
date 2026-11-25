<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `swallowed-exception`

Awl distinguishes an empty handler from a handler that can finish normally without observing its caught value. Read the next operation or return value to find out what the caller believes happened. Awl rule definition (`docs/reliability-exception-flow.md`)

**Translate an expected failure into an explicit outcome** when recovery is part of the contract. A loader can expose missing optional input as a named result while preserving its identity. Let unrelated I/O errors reach the caller. [Microsoft, Best practices for exceptions](https://learn.microsoft.com/en-us/dotnet/standard/exceptions/best-practices-for-exceptions)

**Before**

```csharp
try { return LoadResult.Found(File.ReadAllText(path)); }
catch (IOException) { }
return LoadResult.Found("");
```

**After**

```csharp
try
{
    return LoadResult.Found(File.ReadAllText(path));
}
catch (FileNotFoundException error)
{
    return LoadResult.Missing(error.FileName ?? path);
}
```

An existing empty file now remains distinguishable from a missing file. Other read failures propagate. A boundary that deliberately ignores a known race should own a precise recovery contract. Reading `error.Message` and discarding it gives no such contract.

## Let a required write fail the operation

If a draft becomes “saved” only after its storage write succeeds, an empty I/O handler followed by a saved notification lies to the caller. Let the task that owns the write also own its failure.

```csharp
async Task SaveDraftAsync(Draft draft, CancellationToken token)
{
    await storage.WriteAsync(draft, token);
    notifications.MarkSaved(draft.Id);
}
```

A failed or canceled write leaves the notification untouched. The caller awaiting `SaveDraftAsync` can display the error or decide whether to retry under the storage contract.

## Use an operation that already accepts absence

Removing an optional cache file has a different contract. A missing file in an existing directory already meets the postcondition. `File.Delete` explicitly allows this, so a handler that catches every `IOException` around deletion can disappear. [Microsoft, File.Delete](https://learn.microsoft.com/en-us/dotnet/api/system.io.file.delete?view=net-10.0)

```csharp
void RemoveCachedFile(string path) => File.Delete(path);
```

Other failures, such as insufficient permission, still surface. Checking `File.Exists` first would introduce a race between the check and the delete.
