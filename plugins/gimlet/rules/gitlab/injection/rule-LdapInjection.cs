// License: MIT
using System.DirectoryServices;
using System.DirectoryServices.AccountManagement;
using System.DirectoryServices.Protocols;

class Directory
{
    void Search(string userName, PrincipalContext ctx)
    {
        // ruleid: csharp_injection_rule-LdapInjection
        var entry = new System.DirectoryServices.DirectoryEntry("LDAP://dc/" + userName);
        // ruleid: csharp_injection_rule-LdapInjection
        var searcher = new System.DirectoryServices.DirectorySearcher("(cn=" + userName + ")");
        // ruleid: csharp_injection_rule-LdapInjection
        var user = System.DirectoryServices.AccountManagement.UserPrincipal.FindByIdentity(ctx, userName);
    }

    void Assign(string filter)
    {
        System.DirectoryServices.DirectorySearcher searcher = GetSearcher();
        // ruleid: csharp_injection_rule-LdapInjection
        searcher.Filter = filter;
    }

    void Fixed()
    {
        System.DirectoryServices.DirectorySearcher searcher = GetSearcher();
        // ok: csharp_injection_rule-LdapInjection
        searcher.Filter = "(objectClass=user)";
        // ok: csharp_injection_rule-LdapInjection
        var entry = new System.DirectoryServices.DirectoryEntry("LDAP://dc/ou=staff");
    }

    System.DirectoryServices.DirectorySearcher GetSearcher() { return null; }
}
