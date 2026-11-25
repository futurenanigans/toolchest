using System;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Merkhet.Tests.Logging;

public class SensitiveLoggingExamples
{
    private readonly ILogger _log;
    public SensitiveLoggingExamples(ILogger<SensitiveLoggingExamples> log) { _log = log; }

    public void LoggingUserFields(User user)
    {
        // ruleid: merk.security.logging-sensitive-field-csharp
        _log.LogInformation("user login {Password}", user.Password);

        // ruleid: merk.security.logging-sensitive-field-csharp
        _log.LogDebug("token {Token}", user.Token);

        // ruleid: merk.security.logging-sensitive-field-csharp
        _log.LogWarning("api {ApiKey}", user.ApiKey);

        // ruleid: merk.security.logging-sensitive-field-csharp
        _log.LogError("creds {Credential}", user.Credential);

        // ok: merk.security.logging-sensitive-field-csharp
        _log.LogInformation("user login {UserId}", user.Id);

        // ok: merk.security.logging-sensitive-field-csharp
        _log.LogInformation("login event {UserId} {Email}", user.Id, user.Email);
    }
}

public class ErrorResponseExamples : Controller
{
    public IActionResult StackToString(Exception ex)
    {
        // ruleid: merk.security.stacktrace-in-response-csharp
        return Content(ex.ToString());
    }

    public IActionResult StackStatusCode(Exception ex)
    {
        // ruleid: merk.security.stacktrace-in-response-csharp
        return StatusCode(500, ex.ToString());
    }

    public IActionResult StackTraceProperty(Exception ex)
    {
        // ruleid: merk.security.stacktrace-in-response-csharp
        return StatusCode(500, ex.StackTrace);
    }

    public IActionResult BadRequestWithStack(Exception ex)
    {
        // ruleid: merk.security.stacktrace-in-response-csharp
        return BadRequest(ex.ToString());
    }

    public IResult ProblemWithStack(Exception ex)
    {
        // ruleid: merk.security.stacktrace-in-response-csharp
        return Results.Problem(detail: ex.ToString());
    }

    public IActionResult SafeFallback(Exception ex, string requestId)
    {
        // ok: merk.security.stacktrace-in-response-csharp
        return StatusCode(500, new { error = "internal server error", requestId });
    }
}

public class User
{
    public int Id { get; set; }
    public string Email { get; set; } = "";
    public string Password { get; set; } = "";
    public string Token { get; set; } = "";
    public string ApiKey { get; set; } = "";
    public string Credential { get; set; } = "";
}

public class ExceptionMiddlewareExamples
{
    public void ConfigureLeaky(Microsoft.AspNetCore.Builder.IApplicationBuilder app)
    {
        // ruleid: merk.security.stacktrace-middleware-csharp
        app.UseExceptionHandler(opts =>
        {
            opts.Run(async ctx =>
            {
                var feat = ctx.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>();
                var ex = feat.Error;
                // ruleid: merk.security.stacktrace-in-response-csharp
                await ctx.Response.WriteAsync(ex.ToString());
            });
        });
    }

    public void ConfigureSafe(Microsoft.AspNetCore.Builder.IApplicationBuilder app)
    {
        // ok: merk.security.stacktrace-middleware-csharp
        app.UseExceptionHandler("/Error");
    }
}
