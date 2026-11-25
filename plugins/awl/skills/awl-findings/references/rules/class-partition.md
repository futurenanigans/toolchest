<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `class-partition`

Awl groups instance members by shared state and direct calls on the same instance. Multiple substantive connected components suggest that a class may have several owners. Read the member names and storage witnesses in each component. Awl rule definition (`docs/class-partitions.md`)

**Extract Class with its state.** A budget owns the remaining credit and the operations that change it. A delivery queue owns the pending messages. Move each state transition with its data, then give callers only the owner they need. [Fowler, Extract Class](https://refactoring.com/catalog/extractClass.html)

**Before**

```csharp
sealed class Account(int credit)
{
    private readonly Queue<Message> pending = new();
    public void Spend(int amount) => credit -= amount;
    public int Available() => credit;
    public void Enqueue(Message message) => pending.Enqueue(message);
    public Message Next() => pending.Dequeue();
}
```

**After**

```csharp
sealed class Budget(int credit)
{
    public void Spend(int amount) => credit -= amount;
    public int Available() => credit;
}

sealed class DeliveryQueue
{
    private readonly Queue<Message> pending = new();
    public void Enqueue(Message message) => pending.Enqueue(message);
    public Message Next() => pending.Dequeue();
}
```

Check for an invariant or lock spanning both groups. If recording a message and spending credit must succeed atomically, retain an owner for that operation and its transaction. A shared logger or an artificial call between the groups would connect the graph without protecting that invariant.

## When separate fields describe one value

A grid cell is identified by its column and row. The following methods form two components because each reads a different auto-property with its own backing field. Both coordinates belong to the same location that the caller passes around.

```csharp
sealed record GridCell(int Column, int Row)
{
    public bool IsInColumn(int candidate) => Column == candidate;
    public bool IsInRow(int candidate) => Row == candidate;
}
```

Keep one immutable cell. The constructor establishes the coordinate pair and the caller can pass it intact. Splitting the axes into separate services would force each caller to rebuild the meaning of a location. [Fowler, Value Object](https://martinfowler.com/bliki/ValueObject.html)
