// License: MIT
using Microsoft.AspNetCore.Mvc;

public class FilesController : Controller
{
    public IActionResult Read(string name)
    {
        // ruleid: csharp_path_rule-PathTraversal
        var text = System.IO.File.ReadAllText(name);
        return Content(text);
    }

    public IActionResult Remove(string fileName)
    {
        var full = "/var/data/" + fileName;
        // ruleid: csharp_path_rule-PathTraversal
        System.IO.File.Delete(full);
        return Ok();
    }

    [HttpGet]
    public string Peek(string path)
    {
        // ruleid: csharp_path_rule-PathTraversal
        return System.IO.File.ReadAllText(path);
    }

    public IActionResult Fixed(string name)
    {
        // ok: csharp_path_rule-PathTraversal
        var text = System.IO.File.ReadAllText("/var/data/readme.txt");
        return Content(text + name);
    }
}

public class FileService
{
    public string Load(string name)
    {
        // ok: csharp_path_rule-PathTraversal
        return System.IO.File.ReadAllText(name);
    }
}
