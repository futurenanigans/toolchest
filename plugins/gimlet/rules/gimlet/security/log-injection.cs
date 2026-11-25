using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Serilog;

public class AccountController : Controller
{
    private readonly ILogger<AccountController> _logger;

    public AccountController(ILogger<AccountController> logger) => _logger = logger;

    public IActionResult Search([FromQuery] string term)
    {
        // ruleid: gimlet.security.log-injection-csharp, gimlet.security.log-template-not-constant-csharp
        _logger.LogInformation("Search for " + term);
        // ok: gimlet.security.log-injection-csharp, gimlet.security.log-template-not-constant-csharp
        _logger.LogInformation("Search for {Term}", term);
        return Ok();
    }

    public IActionResult Login([FromBody] LoginModel model)
    {
        // ruleid: gimlet.security.log-injection-csharp, gimlet.security.log-template-not-constant-csharp
        _logger.LogWarning($"Failed login for {model.UserName}");
        // ok: gimlet.security.log-injection-csharp, gimlet.security.log-template-not-constant-csharp
        _logger.LogWarning("Failed login for {UserName}", model.UserName);
        return Unauthorized();
    }

    public IActionResult Track()
    {
        var agent = Request.Headers["User-Agent"];
        // ruleid: gimlet.security.log-injection-csharp, gimlet.security.log-template-not-constant-csharp
        Log.Information("Agent: " + agent);
        // ok: gimlet.security.log-injection-csharp, gimlet.security.log-template-not-constant-csharp
        Log.Information("Agent: {Agent}", agent);
        return Ok();
    }

    public IActionResult Fail([FromRoute] string id, Exception ex)
    {
        // ruleid: gimlet.security.log-injection-csharp, gimlet.security.log-template-not-constant-csharp
        _logger.LogError(ex, string.Format("Order {0} failed", id));
        // ok: gimlet.security.log-injection-csharp, gimlet.security.log-template-not-constant-csharp
        _logger.LogError(ex, "Order {OrderId} failed", id);
        return Ok();
    }

    public void Startup(int port)
    {
        // ruleid: gimlet.security.log-template-not-constant-csharp
        _logger.LogInformation($"Listening on {port}");
        // ruleid: gimlet.security.log-template-not-constant-csharp
        _logger.LogDebug("Port " + port);
        // ok: gimlet.security.log-injection-csharp, gimlet.security.log-template-not-constant-csharp
        _logger.LogInformation("Listening on {Port}", port);
    }
}
