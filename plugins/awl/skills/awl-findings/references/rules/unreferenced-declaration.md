<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `unreferenced-declaration`

Awl groups source methods and counts unreached members after considering production, test and unknown roots. Two private methods can call each other and still have no path from a root. Look at the group boundary before acting on one member. Awl rule definition (`docs/unreferenced-declarations.md`)

**Remove Dead Code** when the capability has been retired and callers enter through an established replacement. If the capability is still promised, restore the missing call at the entry point that owns it. Check supported extension, callback and external-consumer contracts when judging evidence gaps. [Fowler, Remove Dead Code](https://refactoring.com/catalog/removeDeadCode.html)

**Before**

```csharp
public Receipt Issue(Order order) => current.Issue(order);

private Receipt IssueLegacy(Order order) =>
    BuildLegacyReceipt(order);
private Receipt BuildLegacyReceipt(Order order) =>
    legacy.Issue(order);
```

**After**

```csharp
public Receipt Issue(Order order) => current.Issue(order);
```

The deletion assumes the private legacy route has been retired and the published result is unchanged. Delete dependencies used only by that route together. A test that calls an obsolete method solely to make it reachable increases maintenance without restoring a production purpose.

## Connect a promised command to its handler

Suppose `Cancel(request)` is a closed private method with no route. The protocol still promises cancellation but the dispatcher handles only `Start` and returns `Unsupported` for everything else. Restore the missing case where a real client can select it.

```csharp
public Reply Dispatch(Request request) => request.Kind switch
{
    RequestKind.Start => Start(request),
    RequestKind.Cancel => Cancel(request),
    _ => Reply.Unsupported(request.Kind)
};
```

The decision comes from the supported protocol. Following a cancel request from `Dispatch` now reaches the reported handler. Unknown request kinds keep their original response.
