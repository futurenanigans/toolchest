using System.Web;
using System.Web.Mvc;
using Microsoft.AspNetCore.Mvc;

namespace Gimlet.Tests.Xss;

public class ResponseExamples
{
    public void WriteUserContent(string userInput)
    {
        // ruleid: gimlet.security.xss-response-write
        Response.Write(userInput);

        // ruleid: gimlet.security.xss-response-write
        HttpContext.Response.Write(userInput);

        // ok: gimlet.security.xss-response-write
        Response.Write("<p>static content</p>");

        // ok: gimlet.security.xss-response-write
        Response.Write(HttpUtility.HtmlEncode(userInput));
    }
}

public class HomeController : Controller
{
    public ActionResult Show()
    {
        var name = Request.QueryString["name"];

        // ruleid: gimlet.security.xss-viewbag-tainted-csharp
        ViewBag.Name = name;

        // ruleid: gimlet.security.xss-viewbag-tainted-csharp
        ViewData["Bio"] = Request.Form["bio"];

        // ok: gimlet.security.xss-viewbag-tainted-csharp
        ViewBag.StaticTitle = "Welcome";

        return View();
    }

    public ActionResult Profile([FromQuery] string handle)
    {
        // ruleid: gimlet.security.xss-viewbag-tainted-csharp
        ViewBag.Handle = handle;

        return View();
    }
}
