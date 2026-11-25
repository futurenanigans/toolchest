using System;
using System.Text.RegularExpressions;

namespace Gimlet.Tests.Redos;

public class RegexExamples
{
    public bool MatchUntrusted(string input)
    {
        // ruleid: gimlet.security.regex-no-timeout-csharp
        return Regex.IsMatch(input, @"^(a+)+$");
    }

    public bool NamedOptions(string input)
    {
        // ruleid: gimlet.security.regex-no-timeout-csharp
        return Regex.IsMatch(input, @"^(a+)+$", RegexOptions.IgnoreCase);
    }

    public Match Cached(string input)
    {
        // ruleid: gimlet.security.regex-no-timeout-csharp
        var rx = new Regex(@"^(.*)+$");
        return rx.Match(input);
    }

    public bool Safe(string input)
    {
        // ok: gimlet.security.regex-no-timeout-csharp
        return Regex.IsMatch(input, @"^(a+)+$", RegexOptions.None, TimeSpan.FromMilliseconds(100));
    }

    public bool SafeCompiled(string input)
    {
        // ok: gimlet.security.regex-no-timeout-csharp
        var rx = new Regex(@"^(a+)+$", RegexOptions.Compiled, TimeSpan.FromSeconds(1));
        return rx.IsMatch(input);
    }
}
