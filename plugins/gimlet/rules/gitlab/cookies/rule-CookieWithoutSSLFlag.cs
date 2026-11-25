// License: MIT
using System.Web;

public class SessionCookies
{
    private readonly HttpResponse _response;

    public SessionCookies(HttpResponse response)
    {
        _response = response;
    }

    public void IssueTracking(string value)
    {
        // ruleid: csharp_cookies_rule-CookieWithoutSSLFlag
        var tracking = new HttpCookie("tracking", value);
        _response.Cookies.Add(tracking);
    }

    public void IssuePreference(string theme)
    {
        // ruleid: csharp_cookies_rule-CookieWithoutSSLFlag
        var pref = new HttpCookie("theme");
        pref.Value = theme;
        _response.SetCookie(pref);
    }

    public void IssueSession(string sessionId)
    {
        // ok: csharp_cookies_rule-CookieWithoutSSLFlag
        var session = new HttpCookie("session", sessionId);
        session.Secure = true;
        // ok: csharp_cookies_rule-CookieWithoutSSLFlag
        _response.Cookies.Add(session);
    }

    public void IssueAuth(string token)
    {
        // ok: csharp_cookies_rule-CookieWithoutSSLFlag
        var auth = new HttpCookie("auth", token);
        // ok: csharp_cookies_rule-CookieWithoutSSLFlag
        auth.HttpOnly = true;
        auth.Secure = true;
        // ok: csharp_cookies_rule-CookieWithoutSSLFlag
        _response.SetCookie(auth);
    }

    public void IssueNothing()
    {
        var name = "theme";
        // ok: csharp_cookies_rule-CookieWithoutSSLFlag
        _response.AppendHeader("X-Theme", name);
    }
}
