// License: MIT
using Microsoft.AspNetCore.Mvc;

public class AccountController : Controller
{
    // ruleid: csharp_csrf_rule-Csrf
    [HttpPost]
    public IActionResult ChangePassword(string password)
    {
        return Ok();
    }

    // ruleid: csharp_csrf_rule-Csrf
    [HttpDelete]
    public IActionResult DeleteAccount(int id)
    {
        return NoContent();
    }

    [HttpPost]
    // ok: csharp_csrf_rule-Csrf
    [ValidateAntiForgeryToken]
    public IActionResult ChangeEmail(string email)
    {
        return Ok();
    }

    // ok: csharp_csrf_rule-Csrf
    [HttpGet]
    public IActionResult Profile()
    {
        return View();
    }
}

[AutoValidateAntiforgeryToken]
public class SettingsController : Controller
{
    // ok: csharp_csrf_rule-Csrf
    [HttpPut]
    public IActionResult Update(string value)
    {
        return Ok();
    }
}
