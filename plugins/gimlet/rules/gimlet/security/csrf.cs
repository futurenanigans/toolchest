using Microsoft.AspNetCore.Mvc;

namespace Gimlet.Tests.Csrf;

public class OrdersController : Controller
{
    // ruleid: gimlet.security.csrf-missing-antiforgery-csharp
    [HttpPost]
    public IActionResult Create(OrderDto dto) => Ok();

    // ruleid: gimlet.security.csrf-missing-antiforgery-csharp
    [HttpPut]
    public IActionResult Update(int id, OrderDto dto) => Ok();

    // ruleid: gimlet.security.csrf-missing-antiforgery-csharp
    [HttpDelete]
    public IActionResult Delete(int id) => Ok();

    // ok: gimlet.security.csrf-missing-antiforgery-csharp
    [HttpPost]
    [ValidateAntiForgeryToken]
    public IActionResult Protected(OrderDto dto) => Ok();

    // ok: gimlet.security.csrf-missing-antiforgery-csharp
    [HttpPost]
    [Consumes("application/json")]
    public IActionResult ApiOnly(OrderDto dto) => Ok();

    // ok: gimlet.security.csrf-missing-antiforgery-csharp
    [HttpGet]
    public IActionResult List() => Ok();
}

public class OrderDto { }
