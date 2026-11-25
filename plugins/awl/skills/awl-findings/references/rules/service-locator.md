<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `service-locator`

Awl reports a call to a service-provider resolution member, such as `GetRequiredService<T>()` or `IServiceProvider.GetService`, in code that is outside every composition root. Startup code, a function that builds or receives the service collection, and a delegate registered with it are roots. The evidence names the member, the resolution method and the requested service. Awl rule definition (`docs/pattern-pressures.md`)

**Constructor injection** states the dependency where a reader and the container both see it. Take the service as a constructor parameter and let the composition root supply it. A missing registration then fails when the object graph is built, before the first request reaches the line. [Seemann, Service Locator is an Anti-Pattern](https://blog.ploeh.dk/2010/02/03/ServiceLocatorisanAnti-Pattern/) · [Microsoft, Dependency injection guidelines](https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection-guidelines)

**Before**

```csharp
sealed class RenewalJob(IServiceProvider services)
{
    public Task RunAsync(AccountId id)
    {
        IBilling billing = services.GetRequiredService<IBilling>();
        return billing.RenewAsync(id);
    }
}
```

**After**

```csharp
sealed class RenewalJob(IBilling billing)
{
    public Task RunAsync(AccountId id) => billing.RenewAsync(id);
}
```

A test passes a fake `IBilling` directly, and the constructor lists everything the job needs.

## When the service must be created per unit of work

A singleton that processes messages needs a scoped service for each message. Resolving from a scope it creates is the supported way to get one, and the finding still appears because the call is outside the composition root. Narrow it to one small factory that the root registers, so the rest of the class depends on the factory's contract.

```csharp
sealed class MessageScopes(IServiceScopeFactory scopes) : IMessageScopes
{
    public MessageScope Begin()
    {
        IServiceScope scope = scopes.CreateScope();
        return new(scope, scope.ServiceProvider.GetRequiredService<IMessageHandler>());
    }
}
```

The one remaining resolution is the factory's whole job. Leave that finding in the baseline.
