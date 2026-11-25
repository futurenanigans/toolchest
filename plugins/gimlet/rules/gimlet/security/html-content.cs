using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Html;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Rendering;

public class ProfileController : Controller
{
    private readonly HtmlEncoder _encoder;

    public ProfileController(HtmlEncoder encoder)
    {
        _encoder = encoder;
    }

    [HttpGet]
    public IActionResult Bio([FromQuery] string bio)
    {
        // ruleid: gimlet.security.htmlstring-tainted-csharp
        ViewData["Bio"] = new HtmlString(bio);
        return View();
    }

    [HttpGet]
    public IActionResult Greeting()
    {
        string name = Request.Query["name"];
        var builder = new HtmlContentBuilder();
        // ruleid: gimlet.security.htmlstring-tainted-csharp
        builder.AppendHtml("<b>" + name + "</b>");
        return View(builder);
    }

    [HttpPost]
    public IActionResult Banner([FromForm] string message)
    {
        var div = new TagBuilder("div");
        // ruleid: gimlet.security.htmlstring-tainted-csharp
        div.InnerHtml.SetHtmlContent(message);
        return View(div);
    }

    [HttpGet]
    public IActionResult Encoded([FromQuery] string bio)
    {
        // ok: gimlet.security.htmlstring-tainted-csharp
        ViewData["Bio"] = new HtmlString(HtmlEncoder.Default.Encode(bio));
        return View();
    }

    [HttpGet]
    public IActionResult EncodedInjected()
    {
        string name = Request.Query["name"];
        var builder = new HtmlContentBuilder();
        // ok: gimlet.security.htmlstring-tainted-csharp
        builder.AppendHtml("<b>" + _encoder.Encode(name) + "</b>");
        return View(builder);
    }

    [HttpPost]
    public IActionResult PlainAppend([FromForm] string message)
    {
        var div = new TagBuilder("div");
        // ok: gimlet.security.htmlstring-tainted-csharp
        div.InnerHtml.Append(message);
        return View(div);
    }

    [HttpGet]
    public IActionResult Static([FromQuery] int id)
    {
        // ok: gimlet.security.htmlstring-tainted-csharp
        ViewData["Footer"] = new HtmlString("<hr/>");
        return View(id);
    }
}
