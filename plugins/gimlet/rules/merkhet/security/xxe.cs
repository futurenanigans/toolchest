using System.IO;
using System.Xml;

namespace Merkhet.Tests.Xxe;

public class XmlDocumentExamples
{
    public XmlDocument LoadWithResolver(string xml)
    {
        var doc = new XmlDocument();
        // ruleid: merk.security.xxe-xmldocument-resolver-csharp
        doc.XmlResolver = new XmlUrlResolver();
        doc.LoadXml(xml);
        return doc;
    }

    public XmlDocument LoadSafely(string xml)
    {
        var doc = new XmlDocument();
        // ok: merk.security.xxe-xmldocument-resolver-csharp
        doc.XmlResolver = null;
        doc.LoadXml(xml);
        return doc;
    }
}

public class XmlReaderExamples
{
    public void UnsafeSettings(Stream input)
    {
        // ruleid: merk.security.xxe-dtd-parsing-csharp
        var settings = new XmlReaderSettings
        {
            DtdProcessing = DtdProcessing.Parse,
        };
        using var reader = XmlReader.Create(input, settings);
    }

    public void SafeSettings(Stream input)
    {
        // ok: merk.security.xxe-dtd-parsing-csharp
        var settings = new XmlReaderSettings
        {
            DtdProcessing = DtdProcessing.Prohibit,
        };
        using var reader = XmlReader.Create(input, settings);
    }
}

public class XmlTextReaderExamples
{
    public void LegacyReader(Stream input)
    {
        // ruleid: merk.security.xxe-xmltextreader-prohibit-missing-csharp
        var reader = new XmlTextReader(input);
        reader.DtdProcessing = DtdProcessing.Prohibit;
    }
}
