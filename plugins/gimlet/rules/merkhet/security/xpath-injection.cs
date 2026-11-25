using System.Xml;
using System.Xml.XPath;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Merkhet.Tests.XpathInjection;

public class XmlLookup
{
    public void Select(HttpRequest req, XmlDocument doc)
    {
        // ruleid: merk.security.xpath-injection-csharp
        var a = doc.SelectNodes("/users/user[name='" + req.Query["user"] + "']");

        // ruleid: merk.security.xpath-injection-csharp
        var b = doc.SelectSingleNode($"/users/user[name='{req.Form["user"]}']");

        // ok: merk.security.xpath-injection-csharp
        var c = doc.SelectNodes("/users/user");

        var nav = doc.CreateNavigator();

        // ok: merk.security.xpath-injection-csharp
        var d = nav!.Select("//role[@name='" + req.Query["role"] + "']");

        // ruleid: merk.security.xpath-injection-csharp
        var e = nav.Evaluate($"count(//user[name='{req.Query["user"]}'])");

        // ruleid: merk.security.xpath-injection-csharp
        var expr = XPathExpression.Compile("/users/user[name='" + req.Form["user"] + "']");

        // ok: merk.security.xpath-injection-csharp
        var safe = XPathExpression.Compile("/users/user[name=$name]");
    }
}

public class XpathController : Controller
{
    private readonly XmlDocument _doc;
    public XpathController(XmlDocument doc) { _doc = doc; }

    public IActionResult Find([FromQuery] string user)
    {
        // ruleid: merk.security.xpath-injection-csharp
        var n = _doc.SelectNodes("/users/user[name='" + user + "']");
        return Ok(n);
    }
}

public static class XpathMinimalApi
{
    public static void Configure(WebApplication app, XmlDocument doc)
    {
        app.MapGet("/users", ([FromQuery] string user) =>
        {
            // ruleid: merk.security.xpath-injection-csharp
            return doc.SelectNodes("/users/user[name='" + user + "']");
        });

        app.MapGet("/role/{name}", ([FromRoute] string name) =>
            // ruleid: merk.security.xpath-injection-csharp
            doc.SelectSingleNode($"//role[@name='{name}']"));
    }
}
