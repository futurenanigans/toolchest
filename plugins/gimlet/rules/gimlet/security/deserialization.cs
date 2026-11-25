using System.IO;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Formatters.Binary;
using System.Runtime.Serialization.Formatters.Soap;
using System.Web.Script.Serialization;
using System.Web.UI;
using Newtonsoft.Json;

namespace Gimlet.Tests.Deserialization;

public class BinaryFormatterExamples
{
    public object Deserialize(Stream input)
    {
        // ruleid: gimlet.security.insecure-deserialization-binaryformatter-csharp
        var bf = new BinaryFormatter();
        return bf.Deserialize(input);
    }
}

public class LegacyFormatterExamples
{
    public void BuildFormatters()
    {
        // ruleid: gimlet.security.insecure-deserialization-losformatter-csharp
        var los = new LosFormatter();

        // ruleid: gimlet.security.insecure-deserialization-losformatter-csharp
        var ost = new ObjectStateFormatter();

        // ruleid: gimlet.security.insecure-deserialization-losformatter-csharp
        var soap = new SoapFormatter();

        // ruleid: gimlet.security.insecure-deserialization-losformatter-csharp
        var ndc = new NetDataContractSerializer();
    }
}

public class NewtonsoftExamples
{
    public object UnsafeSettings(string json)
    {
        // ruleid: gimlet.security.insecure-deserialization-newtonsoft-no-binder-csharp
        var settings = new JsonSerializerSettings
        {
            // ruleid: gimlet.security.insecure-deserialization-newtonsoft-typenamehandling-csharp
            TypeNameHandling = TypeNameHandling.All,
        };
        return JsonConvert.DeserializeObject(json, settings);
    }

    public object UnsafeAuto(string json)
    {
        // ruleid: gimlet.security.insecure-deserialization-newtonsoft-no-binder-csharp
        var settings = new JsonSerializerSettings
        {
            // ruleid: gimlet.security.insecure-deserialization-newtonsoft-typenamehandling-csharp
            TypeNameHandling = TypeNameHandling.Auto,
        };
        return JsonConvert.DeserializeObject<object>(json, settings);
    }

    public object SafeDefault(string json)
    {
        // ok: gimlet.security.insecure-deserialization-newtonsoft-typenamehandling-csharp
        var settings = new JsonSerializerSettings
        {
            TypeNameHandling = TypeNameHandling.None,
        };
        return JsonConvert.DeserializeObject(json, settings);
    }
}

public class JavaScriptSerializerExamples
{
    public object WithResolver(string json)
    {
        // ruleid: gimlet.security.insecure-deserialization-javascript-serializer-csharp
        var jss = new JavaScriptSerializer(new SimpleTypeResolver());
        return jss.Deserialize<object>(json);
    }

    public object SafeDefault(string json)
    {
        // ok: gimlet.security.insecure-deserialization-javascript-serializer-csharp
        var jss = new JavaScriptSerializer();
        return jss.Deserialize<object>(json);
    }
}

public class NewtonsoftNoBinder
{
    public object UnsafeNoBinder_All(string json)
    {
        // ruleid: gimlet.security.insecure-deserialization-newtonsoft-no-binder-csharp
        var settings = new JsonSerializerSettings
        {
            // ruleid: gimlet.security.insecure-deserialization-newtonsoft-typenamehandling-csharp
            TypeNameHandling = TypeNameHandling.All,
        };
        return JsonConvert.DeserializeObject(json, settings);
    }

    public object UnsafeNoBinder_Auto(string json)
    {
        // ruleid: gimlet.security.insecure-deserialization-newtonsoft-no-binder-csharp
        var settings = new JsonSerializerSettings
        {
            // ruleid: gimlet.security.insecure-deserialization-newtonsoft-typenamehandling-csharp
            TypeNameHandling = TypeNameHandling.Auto,
            NullValueHandling = NullValueHandling.Ignore,
        };
        return JsonConvert.DeserializeObject(json, settings);
    }

    public object UnsafeNoBinder_Objects(string json)
    {
        // ruleid: gimlet.security.insecure-deserialization-newtonsoft-no-binder-csharp
        var settings = new JsonSerializerSettings
        {
            // ruleid: gimlet.security.insecure-deserialization-newtonsoft-typenamehandling-csharp
            TypeNameHandling = TypeNameHandling.Objects,
        };
        return JsonConvert.DeserializeObject(json, settings);
    }

    public object SafeWithBinder_All(string json)
    {
        // ok: gimlet.security.insecure-deserialization-newtonsoft-no-binder-csharp
        var settings = new JsonSerializerSettings
        {
            // ruleid: gimlet.security.insecure-deserialization-newtonsoft-typenamehandling-csharp
            TypeNameHandling = TypeNameHandling.All,
            SerializationBinder = new MyAllowlistBinder(),
        };
        return JsonConvert.DeserializeObject(json, settings);
    }

    public object SafeWithBinder_Auto(string json)
    {
        // ok: gimlet.security.insecure-deserialization-newtonsoft-no-binder-csharp
        var settings = new JsonSerializerSettings
        {
            SerializationBinder = new MyAllowlistBinder(),
            // ruleid: gimlet.security.insecure-deserialization-newtonsoft-typenamehandling-csharp
            TypeNameHandling = TypeNameHandling.Auto,
        };
        return JsonConvert.DeserializeObject(json, settings);
    }
}

public class MyAllowlistBinder : Newtonsoft.Json.Serialization.ISerializationBinder
{
    public Type BindToType(string assemblyName, string typeName) => typeof(object);
    public void BindToName(Type serializedType, out string assemblyName, out string typeName)
    { assemblyName = null; typeName = serializedType.FullName; }
}

// ruleid: gimlet.security.datacontract-knowntype-attribute-csharp
[KnownType(typeof(AdminDto))]
public class UserDto
{
    public string Name;
}

public class AdminDto : UserDto
{
    public bool IsAdmin;
}

public class DataContractExamples
{
    public object DeserializeWithKnownTypes(Stream input)
    {
        // ruleid: gimlet.security.datacontract-knowntypes-csharp
        var s = new DataContractSerializer(typeof(UserDto), new[] { typeof(AdminDto) });
        return s.ReadObject(input);
    }

    public object DeserializeSealed(Stream input)
    {
        // ok: gimlet.security.datacontract-knowntypes-csharp
        var s = new DataContractSerializer(typeof(UserDto));
        return s.ReadObject(input);
    }
}
