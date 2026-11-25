// License: MIT
using System.Text;
using System.Web;
using System.Web.UI;

public class AlertPage : Page
{
    void ShowAlert(string message)
    {
        // ruleid: csharp_xss_rule-ScriptXss
        ClientScript.RegisterStartupScript(GetType(), "alert", "alert('" + message + "');", true);
    }

    void FromQuery()
    {
        var sb = new StringBuilder();
        sb.Append(Request.QueryString["user"]);
        // ruleid: csharp_xss_rule-ScriptXss
        ClientScript.RegisterClientScriptBlock(GetType(), "u", sb.ToString(), true);
    }

    void SafeAlert(string message)
    {
        // ok: csharp_xss_rule-ScriptXss
        ClientScript.RegisterStartupScript(GetType(), "alert", HttpUtility.HtmlEncode(message), true);
    }

    void JsEncodedAlert(string message)
    {
        // ok: csharp_xss_rule-ScriptXss
        ClientScript.RegisterStartupScript(GetType(), "alert", "alert('" + HttpUtility.JavaScriptStringEncode(message) + "');", true);
    }

    void Constant()
    {
        // ok: csharp_xss_rule-ScriptXss
        ClientScript.RegisterStartupScript(GetType(), "init", "init();", true);
    }
}
