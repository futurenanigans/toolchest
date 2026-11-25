using System.Net;
using System.Net.Http;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Gimlet.Tests.Ssrf;

public class HttpClientExamples
{
    public async Task<string> FetchTainted(HttpRequest req, HttpClient client)
    {
        // ruleid: gimlet.security.ssrf-csharp
        var r1 = await client.GetAsync(req.Query["url"]);

        // ruleid: gimlet.security.ssrf-csharp
        var r2 = await client.GetStringAsync(req.Query["target"]);

        // ruleid: gimlet.security.ssrf-csharp
        var r3 = await client.GetStringAsync(req.Form["endpoint"]);

        // ruleid: gimlet.security.ssrf-csharp
        var r4 = await client.PostAsync(req.Query["callback"], null);

        // ruleid: gimlet.security.ssrf-csharp
        var r5 = await client.SendAsync(new HttpRequestMessage(HttpMethod.Get, req.Query["uri"]));

        // ok: gimlet.security.ssrf-csharp
        var safe = await client.GetAsync("https://api.example.com/status");

        return await r1.Content.ReadAsStringAsync();
    }
}

public class LegacyWebRequestExamples
{
    public string Download(HttpRequest req)
    {
        // ruleid: gimlet.security.ssrf-csharp
        var wr = WebRequest.Create(req.Query["url"]);

        // ruleid: gimlet.security.ssrf-csharp
        var data = new WebClient().DownloadString(req.Query["url"]);

        // ruleid: gimlet.security.ssrf-csharp
        var bytes = new WebClient().DownloadData(req.Form["target"]);

        // ok: gimlet.security.ssrf-csharp
        var safe = WebRequest.Create("https://api.example.com");

        return data;
    }
}

public class ProxyController : Controller
{
    private readonly HttpClient _client;
    public ProxyController(HttpClient client) { _client = client; }

    public async Task<IActionResult> Proxy([FromQuery] string url)
    {
        // ruleid: gimlet.security.ssrf-csharp
        var r = await _client.GetAsync(url);
        return Content(await r.Content.ReadAsStringAsync());
    }

    // ok: gimlet.security.ssrf-csharp
    public async Task<IActionResult> Health()
    {
        var r = await _client.GetAsync("https://status.example.com");
        return Ok();
    }
}

public static class SsrfMinimalApi
{
    public static void Configure(WebApplication app)
    {
        app.MapGet("/fetch", async ([FromQuery] string url, HttpClient client) =>
        {
            // ruleid: gimlet.security.ssrf-csharp
            return await client.GetAsync(url);
        });

        // ruleid: gimlet.security.ssrf-csharp
        app.MapGet("/load", ([FromQuery] string target, HttpClient client) => client.GetStringAsync(target));

        app.MapPost("/webhook", async ([FromBody] WebhookDto dto, HttpClient client) =>
        {
            // ruleid: gimlet.security.ssrf-csharp
            await client.PostAsync(dto.Callback, null);
        });

        // ok: gimlet.security.ssrf-csharp
        app.MapGet("/status", (HttpClient client) => client.GetStringAsync("https://api.example.com/status"));
    }
}

public class WebhookDto { public string Callback { get; set; } = ""; }
