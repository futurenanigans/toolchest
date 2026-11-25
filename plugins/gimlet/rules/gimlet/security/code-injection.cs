using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Threading.Tasks;
using System.Xml.Serialization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.CodeAnalysis.CSharp.Scripting;

[ApiController]
[Route("api/[controller]")]
public class ScriptController : ControllerBase
{
    private static readonly Dictionary<string, Type> AllowedTypes = new()
    {
        ["invoice"] = typeof(Invoice),
        ["order"] = typeof(Order),
    };

    [HttpPost("eval")]
    public async Task<IActionResult> Eval([FromBody] string expression)
    {
        // ruleid: gimlet.security.script-code-injection-csharp
        var result = await CSharpScript.EvaluateAsync<int>(expression);
        return Ok(result);
    }

    [HttpGet("run")]
    public async Task<IActionResult> Run()
    {
        string code = Request.Query["code"];
        // ruleid: gimlet.security.script-code-injection-csharp
        var state = await CSharpScript.RunAsync(code);
        return Ok(state.ReturnValue);
    }

    [HttpPost("compile")]
    public IActionResult Compile([FromForm] string source)
    {
        var body = "return " + source + ";";
        // ruleid: gimlet.security.script-code-injection-csharp
        var script = CSharpScript.Create<object>(body);
        return Ok(script.Code);
    }

    [HttpGet("constant")]
    public async Task<IActionResult> Constant([FromQuery] int x)
    {
        // ok: gimlet.security.script-code-injection-csharp
        var result = await CSharpScript.EvaluateAsync<int>("1 + 2");
        return Ok(result + x);
    }

    [HttpGet("constant-run")]
    public async Task<IActionResult> ConstantRun()
    {
        const string Code = "System.DateTime.UtcNow.Year";
        // ok: gimlet.security.script-code-injection-csharp
        var state = await CSharpScript.RunAsync(Code);
        return Ok(state.ReturnValue);
    }

    [HttpGet("constant-create")]
    public IActionResult ConstantCreate([FromQuery] string name)
    {
        // ok: gimlet.security.script-code-injection-csharp
        var script = CSharpScript.Create<int>("40 + 2");
        return Ok(name);
    }

    [HttpGet("type")]
    public IActionResult Resolve([FromQuery] string typeName)
    {
        // ruleid: gimlet.security.unsafe-reflection-csharp
        var type = Type.GetType(typeName);
        return Ok(type?.FullName);
    }

    [HttpPost("plugin")]
    public IActionResult LoadPlugin([FromForm] string assemblyName)
    {
        // ruleid: gimlet.security.unsafe-reflection-csharp
        var asm = Assembly.Load(assemblyName);
        return Ok(asm.FullName);
    }

    [HttpGet("plugin-file")]
    public IActionResult LoadPluginFile()
    {
        string path = Request.Query["path"];
        // ruleid: gimlet.security.unsafe-reflection-csharp
        var asm = Assembly.LoadFrom(path);
        return Ok(asm.FullName);
    }

    [HttpGet("create")]
    public IActionResult Create([FromQuery] string asmName, [FromQuery] string typeName)
    {
        // ruleid: gimlet.security.unsafe-reflection-csharp
        var handle = Activator.CreateInstance(asmName, typeName);
        return Ok(handle?.Unwrap());
    }

    [HttpGet("type-const")]
    public IActionResult ResolveConstant([FromQuery] string id)
    {
        // ok: gimlet.security.unsafe-reflection-csharp
        var type = Type.GetType("MyApp.Models.Invoice");
        return Ok(id + type?.Name);
    }

    [HttpGet("type-allow")]
    public IActionResult ResolveAllowed([FromQuery] string kind)
    {
        if (!AllowedTypes.TryGetValue(kind, out var type))
        {
            return BadRequest();
        }
        // ok: gimlet.security.unsafe-reflection-csharp
        var instance = Activator.CreateInstance(type);
        return Ok(instance);
    }

    [HttpGet("type-index")]
    public IActionResult ResolveIndexed([FromQuery] string kind)
    {
        var type = AllowedTypes[kind];
        // ok: gimlet.security.unsafe-reflection-csharp
        var resolved = Type.GetType(type.AssemblyQualifiedName!);
        return Ok(resolved);
    }

    [HttpPost("xml")]
    public IActionResult ImportXml([FromQuery] string type)
    {
        // ruleid: gimlet.security.xmlserializer-type-injection-csharp
        var serializer = new XmlSerializer(Type.GetType(type));
        return Ok(serializer.Deserialize(Request.Body));
    }

    [HttpPost("xml-header")]
    public IActionResult ImportXmlHeader()
    {
        string typeName = Request.Headers["X-Type"];
        // ruleid: gimlet.security.xmlserializer-type-injection-csharp
        var serializer = new XmlSerializer(Type.GetType(typeName, true));
        return Ok(serializer.Deserialize(Request.Body));
    }

    [HttpPost("xml-route/{kind}")]
    public IActionResult ImportXmlRoute([FromRoute] string kind)
    {
        var qualified = "MyApp.Models." + kind;
        // ruleid: gimlet.security.xmlserializer-type-injection-csharp
        var serializer = new XmlSerializer(Type.GetType(qualified), new XmlRootAttribute("root"));
        return Ok(serializer.Deserialize(Request.Body));
    }

    [HttpPost("xml-typed")]
    public IActionResult ImportInvoice([FromQuery] string tag)
    {
        // ok: gimlet.security.xmlserializer-type-injection-csharp
        var serializer = new XmlSerializer(typeof(Invoice));
        return Ok(serializer.Deserialize(Request.Body));
    }

    [HttpPost("xml-typed-root")]
    public IActionResult ImportOrder([FromQuery] string root)
    {
        // ok: gimlet.security.xmlserializer-type-injection-csharp
        var serializer = new XmlSerializer(typeof(Order), new XmlRootAttribute(root));
        return Ok(serializer.Deserialize(Request.Body));
    }

    [HttpPost("xml-const")]
    public IActionResult ImportConst([FromQuery] string tag)
    {
        // ok: gimlet.security.xmlserializer-type-injection-csharp
        var serializer = new XmlSerializer(Type.GetType("MyApp.Models.Invoice"));
        return Ok(serializer.Deserialize(Request.Body));
    }
}

public class Invoice { }
public class Order { }
