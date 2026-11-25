// License: MIT
using System.IO;
using System.Xml;

class ReaderFactory
{
    void Unsafe(Stream input, TextReader text)
    {
        var settings = new XmlReaderSettings();
        settings.DtdProcessing = DtdProcessing.Parse;
        // ruleid: csharp_injection_rule-XmlReaderXXEInjection
        var reader = System.Xml.XmlReader.Create(input, settings);

        var legacy = new XmlReaderSettings();
        legacy.ProhibitDtd = false;
        // ruleid: csharp_injection_rule-XmlReaderXXEInjection
        var reader2 = System.Xml.XmlReader.Create(text, legacy);
    }

    void Safe(Stream input)
    {
        var settings = new XmlReaderSettings();
        settings.DtdProcessing = DtdProcessing.Prohibit;
        // ok: csharp_injection_rule-XmlReaderXXEInjection
        var reader = System.Xml.XmlReader.Create(input, settings);

        var defaults = new XmlReaderSettings();
        // ok: csharp_injection_rule-XmlReaderXXEInjection
        var reader2 = System.Xml.XmlReader.Create(input, defaults);
    }
}
