using System;
using System.Web.Security;

public class AuthService
{
    public void IssueTickets(string userName)
    {
        // ruleid: merk.security.forms-auth-persistent-ticket-csharp
        var persistent = new FormsAuthenticationTicket(
            1, userName, DateTime.UtcNow, DateTime.UtcNow.AddDays(30), true, "data");

        // ok: merk.security.forms-auth-persistent-ticket-csharp
        var ephemeral = new FormsAuthenticationTicket(
            1, userName, DateTime.UtcNow, DateTime.UtcNow.AddMinutes(30), false, "data");
    }
}
