using System;
using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Hosting;

public class TokenService
{
    public bool ValidateToken(string token)
    {
        try
        {
            return Parse(token) != null;
        }
        catch (Exception)
        {
            // ruleid: gimlet.security.fail-open-catch-csharp
            return true;
        }
    }

    public bool VerifySignature(byte[] data)
    {
        try
        {
            return Check(data);
        }
        catch
        {
            // ok: gimlet.security.fail-open-catch-csharp
            return false;
        }
    }

    public AuthorizationResult AuthorizeRequest(string user)
    {
        try
        {
            return Lookup(user);
        }
        catch (TimeoutException)
        {
            // ruleid: gimlet.security.fail-open-catch-csharp
            return AuthorizationResult.Success();
        }
    }

    public ValidationResult ValidateAddress(string address)
    {
        try
        {
            Resolve(address);
            // ok: gimlet.security.fail-open-catch-csharp
            return ValidationResult.Success;
        }
        catch (Exception ex)
        {
            // ruleid: gimlet.security.fail-open-catch-csharp
            return ValidationResult.Success;
        }
    }

    public bool IsValidLicense(string key)
    {
        try
        {
            return Lookup(key) != null;
        }
        catch (Exception)
        {
            // ok: gimlet.security.fail-open-catch-csharp
            throw;
        }
    }

    public bool TryLoad(string path)
    {
        try
        {
            Load(path);
            return true;
        }
        catch
        {
            // ok: gimlet.security.fail-open-catch-csharp
            return true;
        }
    }
}

public class OrdersController : ControllerBase
{
    private readonly IHostEnvironment _env;

    public IActionResult Get(int id)
    {
        try
        {
            return Ok(Load(id));
        }
        catch (Exception ex)
        {
            var problem = new ProblemDetails { Title = "Failed" };
            // ruleid: gimlet.security.exception-detail-in-problem-csharp
            problem.Detail = ex.Message;
            if (_env.IsDevelopment())
            {
                // ok: gimlet.security.exception-detail-in-problem-csharp
                problem.Detail = ex.ToString();
            }
            // ok: gimlet.security.exception-detail-in-problem-csharp
            problem.Detail = "An unexpected error occurred.";
            return StatusCode(500, problem);
        }
    }

    public IActionResult Post(Order order)
    {
        try
        {
            Save(order);
            return Ok();
        }
        catch (Exception ex)
        {
            // ruleid: gimlet.security.exception-detail-in-problem-csharp
            return Problem(detail: ex.Message, statusCode: 500);
        }
    }

    public IResult Delete(int id)
    {
        try
        {
            Remove(id);
            return Results.NoContent();
        }
        catch (Exception ex)
        {
            // ruleid: gimlet.security.exception-detail-in-problem-csharp
            return Results.Json(new ProblemDetails { Title = "Delete failed", Detail = ex.StackTrace });
        }
    }

    public IResult Put(int id)
    {
        try
        {
            return Results.Ok(Update(id));
        }
        catch (Exception ex)
        {
            // ok: gimlet.security.exception-detail-in-problem-csharp
            return Results.Problem(title: "Update failed", detail: "See server logs.");
        }
    }
}
