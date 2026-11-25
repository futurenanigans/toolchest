using System.IO;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Gimlet.Tests.PathTraversal;

public class HttpRequestExamples
{
    public string ReadTainted(HttpRequest req)
    {
        // ruleid: gimlet.security.path-traversal-csharp
        return File.ReadAllText("/uploads/" + req.Query["file"]);
    }

    public byte[] ReadBytesTainted(HttpRequest req)
    {
        // ruleid: gimlet.security.path-traversal-csharp
        return File.ReadAllBytes($"/data/{req.Form["name"]}");
    }

    public void WriteTainted(HttpRequest req)
    {
        // ruleid: gimlet.security.path-traversal-csharp
        File.WriteAllText("/tmp/" + req.Query["name"], req.Form["content"]!);
    }

    public FileStream OpenTainted(HttpRequest req)
    {
        // ruleid: gimlet.security.path-traversal-csharp
        return new FileStream("/uploads/" + req.Query["file"], FileMode.Open);
    }

    public StreamReader OpenReaderTainted(HttpRequest req)
    {
        // ruleid: gimlet.security.path-traversal-csharp
        return new StreamReader($"/data/{req.Query["name"]}.txt");
    }

    public string ReadStaticFile()
    {
        // ok: gimlet.security.path-traversal-csharp
        return File.ReadAllText("/etc/config.json");
    }

    public string ReadSanitized(HttpRequest req)
    {
        // ok: gimlet.security.path-traversal-csharp
        return File.ReadAllText(Path.GetFullPath(req.Query["file"]!));
    }
}

public class FilesController : Controller
{
    public IActionResult Download([FromQuery] string name)
    {
        // ruleid: gimlet.security.path-traversal-csharp
        var content = File.ReadAllBytes("/uploads/" + name);
        return File(content, "application/octet-stream");
    }

    // ok: gimlet.security.path-traversal-csharp
    public IActionResult Banner()
    {
        return File(File.ReadAllBytes("/public/banner.png"), "image/png");
    }
}

public static class PathTraversalMinimalApi
{
    public static void Configure(WebApplication app)
    {
        app.MapGet("/files", ([FromQuery] string name) =>
        {
            // ruleid: gimlet.security.path-traversal-csharp
            return File.ReadAllText("/uploads/" + name);
        });

        // ruleid: gimlet.security.path-traversal-csharp
        app.MapGet("/data/{id}", ([FromRoute] string id) => File.ReadAllBytes($"/data/{id}.bin"));

        app.MapPost("/write", ([FromBody] FileDto dto) =>
        {
            // ruleid: gimlet.security.path-traversal-csharp
            File.WriteAllText("/tmp/" + dto.Name, dto.Content);
        });

        // ok: gimlet.security.path-traversal-csharp
        app.MapGet("/banner", () => File.ReadAllBytes("/public/banner.png"));
    }
}

public class FileDto { public string Name { get; set; } = ""; public string Content { get; set; } = ""; }
