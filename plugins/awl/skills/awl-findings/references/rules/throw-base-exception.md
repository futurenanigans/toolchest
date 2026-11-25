<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `throw-base-exception`

Awl reports a throw that directly constructs the framework Exception, SystemException or ApplicationException. Read the failing condition and identify what a caller can usefully do about it. Awl rule definition (`docs/reliability-exceptions.md`)

**Use the most specific existing exception contract.** Invalid arguments, invalid object state and corrupt input have different owners. A domain-specific exception is useful when a caller can handle a domain outcome that available standard types cannot express. [Microsoft, Using standard exception types](https://learn.microsoft.com/en-us/dotnet/standard/design-guidelines/using-standard-exception-types)

**Before**

```csharp
void Reserve(int seats)
{
    if (seats < 1) throw new Exception("Invalid seat count.");
    inventory.Reserve(seats);
}
```

**After**

```csharp
void Reserve(int seats)
{
    ArgumentOutOfRangeException.ThrowIfLessThan(seats, 1);
    inventory.Reserve(seats);
}
```

Callers can now identify invalid input and inspect the parameter name. Check existing consumers that match a type or message when changing a public failure contract.

## Return a normal outcome for a valid request

A valid request for the last seat can lose to another buyer. If callers should offer a different booking, `throw new Exception("Sold out.")` forces them to interpret free text. Make that outcome part of the reservation API. [Microsoft, Exceptions and Performance](https://learn.microsoft.com/en-us/dotnet/standard/design-guidelines/exceptions-and-performance)

```csharp
enum ReservationOutcome { Reserved, SoldOut }

ReservationOutcome Reserve(int seats)
{
    ArgumentOutOfRangeException.ThrowIfLessThan(seats, 1);
    return inventory.TryReserve(seats)
        ? ReservationOutcome.Reserved
        : ReservationOutcome.SoldOut;
}
```

This assumes `TryReserve` checks and allocates seats atomically and returns false only for insufficient stock. A database failure still propagates. Change callers to handle the two declared outcomes.
