using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace Gimlet.Tests.OpenRedirect;

public class RedirectController : Controller
{
    public IActionResult FromQueryViaRequest(HttpRequest req)
    {
        // ruleid: gimlet.security.open-redirect-csharp
        return Redirect(req.Query["next"]!);
    }

    public IActionResult FromFormViaRequest(HttpRequest req)
    {
        // ruleid: gimlet.security.open-redirect-csharp
        return Redirect(req.Form["returnUrl"]!);
    }

    public IActionResult FromAttribute([FromQuery] string url)
    {
        // ruleid: gimlet.security.open-redirect-csharp
        return Redirect(url);
    }

    // ok: gimlet.security.open-redirect-csharp
    public IActionResult SafeWithLocalCheck([FromQuery] string url)
    {
        if (Url.IsLocalUrl(url))
        {
            return Redirect(url);
        }
        return RedirectToAction("Index", "Home");
    }

    // ok: gimlet.security.open-redirect-csharp
    public IActionResult Home() => Redirect("/dashboard");
}

public static class OpenRedirectMinimalApi
{
    public static void Configure(WebApplication app)
    {
        // ruleid: gimlet.security.open-redirect-csharp
        app.MapGet("/login", ([FromQuery] string next) => Results.Redirect(next));

        app.MapPost("/complete", ([FromBody] ReturnDto dto) =>
        {
            // ruleid: gimlet.security.open-redirect-csharp
            return Results.Redirect(dto.Url);
        });

        app.MapGet("/redirect/{target}", ([FromRoute] string target) =>
            // ruleid: gimlet.security.open-redirect-csharp
            TypedResults.Redirect(target));

        // ok: gimlet.security.open-redirect-csharp
        app.MapGet("/home", () => Results.Redirect("/dashboard"));
    }
}

public class ReturnDto { public string Url { get; set; } = ""; }

// Legacy Web Forms: Server.Transfer / Server.Execute variants
public class LegacyWebForm
{
    public void ForwardFromQuery(HttpRequest req)
    {
        // ruleid: gimlet.security.open-redirect-csharp
        Server.Transfer(req.QueryString["page"]);

        // ruleid: gimlet.security.open-redirect-csharp
        Server.Execute(req.Form["target"]);

        // ok: gimlet.security.open-redirect-csharp
        Server.Transfer("~/Default.aspx");
    }

    public void ForwardFromAttribute([FromQuery] string page)
    {
        // ruleid: gimlet.security.open-redirect-csharp
        Server.Transfer(page);
    }
}
