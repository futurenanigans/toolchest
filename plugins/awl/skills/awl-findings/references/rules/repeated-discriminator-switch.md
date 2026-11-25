<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `repeated-discriminator-switch`

Awl counts the members that hold a switch on the same discriminator: a source enum type, a source type tested by type patterns, or a source field or property compared with constants. The evidence lists every switch and its member. Adding a case to the discriminator means editing each of them. Awl rule definition (`docs/pattern-pressures.md`)

**Replace Conditional with Polymorphism** when each case carries its own behavior in every switch. Give each case a type, move the arm of each switch into a method on it, and select the type once. Use a **Strategy** when the discriminator picks an algorithm for a type that otherwise stays the same. [Fowler, Replace Conditional with Polymorphism](https://refactoring.com/catalog/replaceConditionalWithPolymorphism.html) · [Fowler, Repeated Switches](https://martinfowler.com/bliki/CodeSmell.html)

**Before**

```csharp
enum Plan { Free, Team, Enterprise }

decimal Price(Plan plan, int seats) => plan switch
{
    Plan.Free => 0m,
    Plan.Team => 8m * seats,
    _ => 20m * seats
};

int SeatLimit(Plan plan) => plan switch
{
    Plan.Free => 3,
    Plan.Team => 50,
    _ => int.MaxValue
};

bool HasAudit(Plan plan) => plan switch
{
    Plan.Free => false,
    Plan.Team => false,
    _ => true
};
```

**After**

```csharp
abstract record Plan
{
    public abstract decimal Price(int seats);
    public abstract int SeatLimit { get; }
    public virtual bool HasAudit => false;
}

sealed record Free : Plan
{
    public override decimal Price(int seats) => 0m;
    public override int SeatLimit => 3;
}

sealed record Team : Plan
{
    public override decimal Price(int seats) => 8m * seats;
    public override int SeatLimit => 50;
}

sealed record Enterprise : Plan
{
    public override decimal Price(int seats) => 20m * seats;
    public override int SeatLimit => int.MaxValue;
    public override bool HasAudit => true;
}
```

A fourth plan is now one new type, and the compiler requires its price and seat limit. One switch remains where a stored value becomes a `Plan`.

## When the switches sit at different boundaries

A wire enum is often switched once to parse it, once to format it and once to map it to a database column. Those three members belong to three adapters, and moving their arms onto one type would make the domain type know about JSON and SQL. Keep them, and keep each exhaustive so the compiler reports the missing arm when a case is added.

```csharp
static string ToWire(Status status) => status switch
{
    Status.Open => "open",
    Status.Closed => "closed",
    _ => throw new ArgumentOutOfRangeException(nameof(status))
};
```
