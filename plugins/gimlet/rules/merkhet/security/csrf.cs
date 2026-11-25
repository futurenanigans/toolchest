using Microsoft.AspNetCore.Mvc;

namespace Merkhet.Tests.Csrf;

public class OrdersController : Controller
{
    // ruleid: merk.security.csrf-missing-antiforgery-csharp
    [HttpPost]
    public IActionResult Create(OrderDto dto) => Ok();

    // ruleid: merk.security.csrf-missing-antiforgery-csharp
    [HttpPut]
    public IActionResult Update(int id, OrderDto dto) => Ok();

    // ruleid: merk.security.csrf-missing-antiforgery-csharp
    [HttpDelete]
    public IActionResult Delete(int id) => Ok();

    // ok: merk.security.csrf-missing-antiforgery-csharp
    [HttpPost]
    [ValidateAntiForgeryToken]
    public IActionResult Protected(OrderDto dto) => Ok();

    // ok: merk.security.csrf-missing-antiforgery-csharp
    [HttpPost]
    [Consumes("application/json")]
    public IActionResult ApiOnly(OrderDto dto) => Ok();

    // ok: merk.security.csrf-missing-antiforgery-csharp
    [HttpGet]
    public IActionResult List() => Ok();
}

public class OrderDto { }
