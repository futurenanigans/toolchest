// License: MIT
using System.Diagnostics;

class CommandRunner
{
    void RunUserTool(string tool, string args)
    {
        System.Diagnostics.Process proc = new System.Diagnostics.Process();
        // ruleid: csharp_injection_rule-CommandInjection
        proc.StartInfo.FileName = tool;
        // ruleid: csharp_injection_rule-CommandInjection
        proc.StartInfo.Arguments = "-v " + args;
        proc.Start();
    }

    void RunFixedTool()
    {
        System.Diagnostics.Process proc = new System.Diagnostics.Process();
        // ok: csharp_injection_rule-CommandInjection
        proc.StartInfo.FileName = "git";
        // ok: csharp_injection_rule-CommandInjection
        proc.StartInfo.Arguments = "status --short";
        proc.Start();
    }

    void StartDirect(string path)
    {
        // ruleid: csharp_injection_rule-CommandInjection
        System.Diagnostics.Process.Start(path);
        // ok: csharp_injection_rule-CommandInjection
        System.Diagnostics.Process.Start("notepad.exe");
    }

    void StartInfoObjects(string exe, string args)
    {
        // ruleid: csharp_injection_rule-CommandInjection
        var a = new System.Diagnostics.ProcessStartInfo(exe);
        // ok: csharp_injection_rule-CommandInjection
        var b = new System.Diagnostics.ProcessStartInfo("ping");
        // ok: csharp_injection_rule-CommandInjection
        var c = new System.Diagnostics.ProcessStartInfo();
        // ruleid: csharp_injection_rule-CommandInjection
        c.Arguments = args;
        // ok: csharp_injection_rule-CommandInjection
        b.Arguments = "-c 4 localhost";

        var d = new System.Diagnostics.ProcessStartInfo
        {
            // ruleid: csharp_injection_rule-CommandInjection
            FileName = exe,
            // ok: csharp_injection_rule-CommandInjection
            Arguments = "--help"
        };
    }
}
