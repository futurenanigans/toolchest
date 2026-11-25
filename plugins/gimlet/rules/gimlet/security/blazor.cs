// Fixture for blazor.yml
// Tests: blazor-markupstring-tainted-csharp

using Microsoft.AspNetCore.Components;

public class MarkupStringExamples
{
    private string _userInput = "<b>bold</b>";
    private string _fetchedContent = "<p>from API</p>";

    public MarkupString GetGreeting(string name)
    {
        // ruleid: gimlet.security.blazor-markupstring-tainted-csharp
        return new MarkupString(_userInput);
    }

    public MarkupString GetContent(string html)
    {
        // ruleid: gimlet.security.blazor-markupstring-tainted-csharp
        return new MarkupString(html);
    }

    public MarkupString CastVariable()
    {
        // ruleid: gimlet.security.blazor-markupstring-tainted-csharp
        return (MarkupString)_fetchedContent;
    }

    public MarkupString CastParameter(string raw)
    {
        // ruleid: gimlet.security.blazor-markupstring-tainted-csharp
        return (MarkupString)raw;
    }

    public MarkupString SafeLiteralNew()
    {
        // ok: gimlet.security.blazor-markupstring-tainted-csharp
        return new MarkupString("<strong>static content</strong>");
    }

    public MarkupString SafeLiteralCast()
    {
        // ok: gimlet.security.blazor-markupstring-tainted-csharp
        return (MarkupString)"<em>static markup</em>";
    }
}
