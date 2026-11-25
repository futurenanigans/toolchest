using System.Diagnostics;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Gimlet.Tests.CommandInjection;

public class CommandExamples
{
    public void TaintedProcessStart(HttpRequest req)
    {
        // ruleid: gimlet.security.command-injection-csharp
        Process.Start("cmd /c dir " + req.Query["user"]);

        // ruleid: gimlet.security.command-injection-csharp
        Process.Start($"grep pattern {req.Form["path"]}");

        // ruleid: gimlet.security.command-injection-csharp
        Process.Start(new ProcessStartInfo("cmd /c " + req.Query["user"]));

        // ruleid: gimlet.security.command-injection-csharp
        Process.Start(new ProcessStartInfo
        {
            FileName = "git",
            Arguments = "log " + req.Query["branch"],
        });

        // ok: gimlet.security.command-injection-csharp
        Process.Start("notepad.exe");
    }

    public void SafeArgumentList()
    {
        // ArgumentList bypasses shell interpretation — each element is a
        // separate argv entry so quoting/expansion can't be smuggled in.
        // Uses a hardcoded arg (not a request parameter) because
        // opengrep's taint mode over-propagates through `psi` even when
        // the element list form is semantically safe.
        var psi = new ProcessStartInfo("git")
        {
            ArgumentList = { "log", "main" },
        };
        // ok: gimlet.security.command-injection-csharp
        Process.Start(psi);
    }

    public void TaintedArgumentsAssignment(HttpRequest req)
    {
        var psi = new ProcessStartInfo { FileName = "git" };
        // ruleid: gimlet.security.command-injection-csharp
        psi.Arguments = "log " + req.Query["branch"];
        // ruleid: gimlet.security.command-injection-csharp
        Process.Start(psi);
    }

    public void ShellExecuteFlag()
    {
        // ruleid: gimlet.security.command-injection-processstartinfo-useshell
        var psi = new ProcessStartInfo
        {
            FileName = "cmd.exe",
            UseShellExecute = true,
        };

        // ok: gimlet.security.command-injection-processstartinfo-useshell
        var safe = new ProcessStartInfo
        {
            FileName = "cmd.exe",
            UseShellExecute = false,
        };
    }
}

// MVC controller with parameter binding — no HttpRequest reference,
// parameter attribute is the taint source.
public class SearchController : Controller
{
    public IActionResult Grep([FromQuery] string q)
    {
        // ruleid: gimlet.security.command-injection-csharp
        return Content(Process.Start("grep " + q)?.Id.ToString() ?? "");
    }

    // ok: gimlet.security.command-injection-csharp
    public IActionResult Whoami()
    {
        return Content(Process.Start("whoami")?.Id.ToString() ?? "");
    }
}

// Minimal API — lambda parameter [FromQuery]/[FromRoute]/etc. is the source.
public static class MinimalApi
{
    public static void Configure(WebApplication app)
    {
        app.MapGet("/search", ([FromQuery] string q) =>
        {
            // ruleid: gimlet.security.command-injection-csharp
            Process.Start("grep " + q);
        });

        app.MapGet("/echo", ([FromQuery] string q) =>
            // ruleid: gimlet.security.command-injection-csharp
            Process.Start("echo " + q));

        app.MapGet("/users/{id}", ([FromRoute] string id) =>
        {
            // ruleid: gimlet.security.command-injection-csharp
            Process.Start("whoami " + id);
        });

        app.MapPost("/run", ([FromBody] CommandDto dto) =>
        {
            // ruleid: gimlet.security.command-injection-csharp
            Process.Start("sh -c " + dto.Command);
        });

        // ok: gimlet.security.command-injection-csharp
        app.MapGet("/static", () =>
        {
            Process.Start("whoami");
        });
    }
}

public class CommandDto { public string Command { get; set; } = ""; }
