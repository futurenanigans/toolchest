// License: MIT
using System.Web;
using System.Web.UI;

public class ProfilePage : Page
{
    void Greet(string name)
    {
        // ruleid: csharp_xss_rule-HtmlElementXss
        Response.Write("<h1>Hello " + name + "</h1>");
    }

    void Echo()
    {
        var q = Request.QueryString["q"];
        // ruleid: csharp_xss_rule-HtmlElementXss
        Response.Write(q);
    }

    void Render(HtmlTextWriter writer, string title)
    {
        // ruleid: csharp_xss_rule-HtmlElementXss
        writer.Write(title);
    }

    void SafeGreet(string name)
    {
        // ok: csharp_xss_rule-HtmlElementXss
        Response.Write(HttpUtility.HtmlEncode(name));
    }

    void Static()
    {
        // ok: csharp_xss_rule-HtmlElementXss
        Response.Write("<p>Welcome</p>");
    }
}
