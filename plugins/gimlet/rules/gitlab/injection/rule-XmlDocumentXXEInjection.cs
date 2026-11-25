// License: MIT
using System.Xml;

class XmlDocLoader
{
    void Unsafe(string path, string xml)
    {
        var doc = new System.Xml.XmlDocument();
        // ruleid: csharp_injection_rule-XmlDocumentXXEInjection
        doc.Load(path);
        var doc2 = new System.Xml.XmlDocument { PreserveWhitespace = true };
        // ruleid: csharp_injection_rule-XmlDocumentXXEInjection
        doc2.LoadXml(xml);
    }

    void Safe(string path, string xml)
    {
        var doc = new System.Xml.XmlDocument();
        doc.XmlResolver = null;
        // ok: csharp_injection_rule-XmlDocumentXXEInjection
        doc.Load(path);
        var doc2 = new System.Xml.XmlDocument { XmlResolver = null };
        // ok: csharp_injection_rule-XmlDocumentXXEInjection
        doc2.LoadXml(xml);
    }
}
