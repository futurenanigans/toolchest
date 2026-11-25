// License: MIT
using System.Xml;
using System.Xml.Linq;
using System.Xml.Schema;
using System.Xml.XPath;

class Lookup
{
    void Doc(XmlDocument doc, XPathNavigator nav, string user)
    {
        // ruleid: csharp_injection_rule-XPathInjection
        doc.SelectNodes("//user[@name='" + user + "']");
        // ruleid: csharp_injection_rule-XPathInjection
        nav.Evaluate("count(//user[@name='" + user + "'])");
        // ok: csharp_injection_rule-XPathInjection
        doc.SelectSingleNode("//config/version");
        // ok: csharp_injection_rule-XPathInjection
        nav.Select("//user");
    }

    void Linq(XElement root, string user)
    {
        // ruleid: csharp_injection_rule-XPathInjection
        root.XPathSelectElement("//user[@name='" + user + "']");
        // ok: csharp_injection_rule-XPathInjection
        root.XPathSelectElements("//user");
    }

    void Schema(XmlSchemaXPath xp, string user)
    {
        // ruleid: csharp_injection_rule-XPathInjection
        xp.XPath = user;
        // ok: csharp_injection_rule-XPathInjection
        xp.XPath = "./name";
    }
}
