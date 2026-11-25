// License: MIT
using Microsoft.AspNetCore.Mvc;

public class AccountController : Controller
{
    public IActionResult Login(string returnUrl)
    {
        // ruleid: csharp_endpoint_rule-UnvalidatedRedirect
        return Redirect(returnUrl);
    }

    public IActionResult Logout(string next)
    {
        // ruleid: csharp_endpoint_rule-UnvalidatedRedirect
        return new RedirectResult(next);
    }

    public IActionResult SafeLogin(string returnUrl)
    {
        if (Url.IsLocalUrl(returnUrl))
        {
            // ok: csharp_endpoint_rule-UnvalidatedRedirect
            return Redirect(returnUrl);
        }
        return RedirectToAction("Index", "Home");
    }

    public IActionResult SafeGuard(string returnUrl)
    {
        if (!Url.IsLocalUrl(returnUrl))
        {
            return BadRequest();
        }
        // ok: csharp_endpoint_rule-UnvalidatedRedirect
        return Redirect(returnUrl);
    }

    public IActionResult Home(string section)
    {
        // ok: csharp_endpoint_rule-UnvalidatedRedirect
        return Redirect(Url.Action("Index", "Home", new { section }));
    }
}
