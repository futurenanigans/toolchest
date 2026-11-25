using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Authorize]
[Route("api/orders")]
public class OrdersController : ControllerBase
{
    [AllowAnonymous]
    [HttpPost]
    // ruleid: gimlet.security.allow-anonymous-state-change-csharp
    public async Task<IActionResult> CreateOrder([FromBody] OrderDto dto)
    {
        await Task.CompletedTask;
        return Ok(dto);
    }

    [HttpPut("{id}")]
    [AllowAnonymous]
    // ruleid: gimlet.security.allow-anonymous-state-change-csharp
    public IActionResult UpdateOrder(int id, [FromBody] OrderDto dto)
    {
        return NoContent();
    }

    [AllowAnonymous]
    [HttpDelete("{id}")]
    // ruleid: gimlet.security.allow-anonymous-state-change-csharp
    public IActionResult DeleteOrder(int id)
    {
        return NoContent();
    }

    [HttpPatch("{id}/status")]
    [AllowAnonymous]
    [ProducesResponseType(204)]
    // ruleid: gimlet.security.allow-anonymous-state-change-csharp
    public IActionResult PatchStatus(int id, [FromBody] string status)
    {
        return NoContent();
    }

    [AllowAnonymous]
    [HttpGet("{id}")]
    // ok: gimlet.security.allow-anonymous-state-change-csharp
    public IActionResult GetOrder(int id)
    {
        return Ok(id);
    }

    [HttpPost("{id}/cancel")]
    // ok: gimlet.security.allow-anonymous-state-change-csharp
    public IActionResult CancelOrder(int id)
    {
        return NoContent();
    }
}

[ApiController]
[Route("api/account")]
public class AccountController : ControllerBase
{
    [AllowAnonymous]
    [HttpPost("login")]
    // ok: gimlet.security.allow-anonymous-state-change-csharp
    public async Task<IActionResult> Login([FromBody] LoginDto dto)
    {
        await Task.CompletedTask;
        return Ok();
    }

    [HttpPost("register")]
    [AllowAnonymous]
    // ok: gimlet.security.allow-anonymous-state-change-csharp
    public IActionResult Register([FromBody] LoginDto dto)
    {
        return Ok();
    }

    [AllowAnonymous]
    [HttpPost("forgot-password")]
    // ok: gimlet.security.allow-anonymous-state-change-csharp
    public IActionResult ForgotPassword([FromBody] string email)
    {
        return Ok();
    }
}

public record OrderDto(string Sku, int Quantity);
public record LoginDto(string User, string Password);
