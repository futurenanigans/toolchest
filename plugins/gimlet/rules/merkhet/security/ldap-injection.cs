using System.DirectoryServices;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Merkhet.Tests.LdapInjection;

public class LdapLookup
{
    public User Find(HttpRequest req, DirectoryEntry root)
    {
        using var searcher = new DirectorySearcher(root);

        // ruleid: merk.security.ldap-injection-csharp
        searcher.Filter = "(sAMAccountName=" + req.Query["user"] + ")";

        // ruleid: merk.security.ldap-injection-csharp
        searcher.Filter = $"(cn={req.Query["user"]})";

        // ruleid: merk.security.ldap-injection-csharp
        searcher.Filter = string.Format("(uid={0})", req.Query["user"]);

        return new User { DisplayName = searcher.FindOne()?.Path };
    }

    public User FindStatic(DirectoryEntry root)
    {
        using var searcher = new DirectorySearcher(root);

        // ok: merk.security.ldap-injection-csharp
        searcher.Filter = "(objectClass=user)";

        return new User { DisplayName = searcher.FindOne()?.Path };
    }

    public User Construct(HttpRequest req, string baseDn)
    {
        // ruleid: merk.security.ldap-injection-csharp
        using var s = new DirectorySearcher(baseDn, "(uid=" + req.Query["filter"] + ")");

        // ok: merk.security.ldap-injection-csharp
        using var safe = new DirectorySearcher(baseDn, "(objectClass=person)");

        return new User();
    }
}

public static class Encoder
{
    public static string LdapFilterEncode(string s) => s.Replace("*", @"\2a");
}

public class User { public string? DisplayName { get; set; } }

public class LdapController : Controller
{
    private readonly DirectoryEntry _root;
    public LdapController(DirectoryEntry root) { _root = root; }

    public IActionResult Search([FromQuery] string user)
    {
        using var s = new DirectorySearcher(_root);
        // ruleid: merk.security.ldap-injection-csharp
        s.Filter = "(sAMAccountName=" + user + ")";
        return Ok(s.FindOne()?.Path);
    }
}

public static class LdapMinimalApi
{
    public static void Configure(WebApplication app, DirectoryEntry root)
    {
        app.MapGet("/users", ([FromQuery] string user) =>
        {
            using var s = new DirectorySearcher(root);
            // ruleid: merk.security.ldap-injection-csharp
            s.Filter = $"(uid={user})";
            return s.FindOne()?.Path;
        });

        // ok: merk.security.ldap-injection-csharp
        app.MapGet("/safe-users", ([FromQuery] string user) =>
        {
            using var s = new System.DirectoryServices.DirectorySearcher(root);
            s.Filter = $"(uid={Encoder.LdapFilterEncode(user)})";
            return s.FindOne()?.Path;
        });
    }
}
