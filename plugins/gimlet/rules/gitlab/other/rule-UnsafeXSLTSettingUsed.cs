// License: MIT
using System.Xml.Xsl;

class XsltSetup
{
    void Initializer()
    {
        // ruleid: csharp_other_rule-UnsafeXSLTSettingUsed
        var a = new XsltSettings() { EnableScript = true };
        // ruleid: csharp_other_rule-UnsafeXSLTSettingUsed
        var b = new XsltSettings() { EnableDocumentFunction = true };
        // ok: csharp_other_rule-UnsafeXSLTSettingUsed
        var c = new XsltSettings() { EnableScript = false };
    }

    void Assignment()
    {
        var settings = new XsltSettings();
        // ruleid: csharp_other_rule-UnsafeXSLTSettingUsed
        settings.EnableScript = true;
        // ok: csharp_other_rule-UnsafeXSLTSettingUsed
        settings.EnableDocumentFunction = false;
    }
}
