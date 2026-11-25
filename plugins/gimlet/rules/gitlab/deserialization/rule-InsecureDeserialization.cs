// License: MIT
using System;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Web;
using System.Web.UI;
using System.Runtime.Serialization.Formatters.Binary;

public class StateLoader
{
    public HttpRequest Request { get; set; }

    public object FromCookie()
    {
        var raw = Convert.FromBase64String(Request.Cookies["state"].Value);
        var formatter = new BinaryFormatter();
        // ruleid: csharp_deserialization_rule-InsecureDeserialization
        return formatter.Deserialize(new MemoryStream(raw));
    }

    public object FromFile(string path)
    {
        var bytes = System.IO.File.ReadAllBytes(path);
        BinaryFormatter formatter = new BinaryFormatter();
        // ruleid: csharp_deserialization_rule-InsecureDeserialization
        return formatter.Deserialize(new MemoryStream(bytes));
    }

    public object FromViewState()
    {
        var los = new LosFormatter();
        // ruleid: csharp_deserialization_rule-InsecureDeserialization
        return los.Deserialize(Request.Form["__VIEWSTATE"]);
    }

    public object FromConstant()
    {
        var formatter = new BinaryFormatter();
        var trusted = new MemoryStream(Encoding.UTF8.GetBytes("internal"));
        // ok: csharp_deserialization_rule-InsecureDeserialization
        return formatter.Deserialize(trusted);
    }

    public Settings FromQuery()
    {
        // ok: csharp_deserialization_rule-InsecureDeserialization
        return JsonSerializer.Deserialize<Settings>(Request.QueryString["settings"]);
    }
}

public class Settings
{
    public string Theme { get; set; }
}
