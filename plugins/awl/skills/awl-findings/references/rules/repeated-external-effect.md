<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `repeated-external-effect`

Awl reports supported file, network or process calls repeated under an iteration. The witnesses identify the external operation and its enclosing iteration. A file existence check and a remote request can have very different costs and consistency requirements. Awl rule definition (`docs/performance-families.md`)

## Is this a false positive?

Identify both the resource and the number of times control can reach it. If the only I/O site in a search immediately returns from the function on every path after the read, it can run at most once. Reading five distinct supplied reports once each, on the other hand, is five real I/O operations. Even two reads of the same path may need to see different contents. Reuse or batch the reads when callers are entitled to the same snapshot and failure behavior. Awl’s report import (`src/Awl.Host/History/ObservationImport.cs`) · Awl’s loop-exit criteria (`docs/performance-costs.md#source-summaries`)

## Batch reads from a common snapshot

**Batch I/O** when the backing service offers a bulk operation. Preserve output order and repeated IDs when reconstructing the response. When only duplicate immutable reads cause the problem, a request-scoped cache keyed by the complete request can be enough. [Microsoft, Chatty I/O antipattern](https://learn.microsoft.com/en-us/azure/architecture/antipatterns/chatty-io/)

**Before**

```csharp
var products = new List<Product>();
foreach (var id in ids)
    products.Add(await catalog.GetAsync(id, token));
return products;
```

**After**

```csharp
if (ids.Count == 0) return new List<Product>();
var distinctIds = ids.Distinct().ToArray();
var byId = await catalog.GetManyAsync(distinctIds, token);
return ids.Select(id => byId[id]).ToList();
```

Here each ID denotes a product in one catalog snapshot, and the bulk gateway must define the same missing-ID behavior as the old API. Honor batch limits and partial failures. For Awl to see the underlying network work, the call path through the catalog must reach a supported operation such as `HttpClient.GetAsync`. A method called `GetManyAsync` that still sends one request per ID leaves the remote I/O unchanged.

## Reuse an immutable template within one rendering job

Suppose each document names a versioned, immutable template file. Reading it for every document repeats disk I/O when several documents use the same path. A job-local cache can reuse the text without changing document order or preloading templates that may never be needed.

```csharp
var textByPath = new Dictionary<string, string>(StringComparer.Ordinal);
foreach (var document in documents)
{
    token.ThrowIfCancellationRequested();
    string path = document.TemplatePath;
    if (!textByPath.TryGetValue(path, out var text))
    {
        text = await File.ReadAllTextAsync(path, token);
        textByPath.Add(path, text);
    }
    Render(document, text);
}
```

Paths are absolute and identify one template version here. A failed read still stops at the document that first needs it. Two documents using that template still render twice. If a later document is entitled to see file edits during the job, keep the per-document read. [Microsoft, Cache-Aside and consistency](https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside)
