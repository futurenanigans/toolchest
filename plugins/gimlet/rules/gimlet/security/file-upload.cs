using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/uploads")]
public class UploadController : ControllerBase
{
    private const string UploadRoot = "/var/app/uploads";
    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase) { ".png", ".jpg", ".pdf" };

    [HttpPost("avatar")]
    public async Task<IActionResult> Avatar(IFormFile file)
    {
        // ruleid: gimlet.security.upload-filename-path-csharp
        using var stream = System.IO.File.Create(Path.Combine(UploadRoot, file.FileName));
        await file.CopyToAsync(stream);
        return Ok();
    }

    [HttpPost("document")]
    public async Task<IActionResult> Document([FromForm] IFormFile upload)
    {
        var target = UploadRoot + "/" + upload.FileName;
        // ruleid: gimlet.security.upload-filename-path-csharp
        using var stream = new FileStream(target, FileMode.Create);
        await upload.CopyToAsync(stream);
        return Ok();
    }

    [HttpPost("batch")]
    public async Task<IActionResult> Batch(List<IFormFile> files)
    {
        foreach (var f in files)
        {
            // ruleid: gimlet.security.upload-filename-path-csharp
            using var stream = System.IO.File.Create("/var/app/uploads/" + f.FileName);
            await f.CopyToAsync(stream);
        }
        return Ok();
    }

    [HttpPost("raw")]
    public async Task<IActionResult> Raw()
    {
        var name = Request.Form.Files[0].FileName;
        // ruleid: gimlet.security.upload-filename-path-csharp
        using var stream = System.IO.File.OpenWrite(Path.Combine(UploadRoot, name));
        await Request.Form.Files[0].CopyToAsync(stream);
        return Ok();
    }

    [HttpPost("random")]
    public async Task<IActionResult> Random(IFormFile file)
    {
        // ok: gimlet.security.upload-filename-path-csharp
        var path = Path.Combine(UploadRoot, Path.GetRandomFileName());
        using var stream = System.IO.File.Create(path);
        await file.CopyToAsync(stream);
        return Ok(file.FileName);
    }

    [HttpPost("checked")]
    public async Task<IActionResult> Checked(IFormFile file)
    {
        var ext = Path.GetExtension(file.FileName);
        if (!AllowedExtensions.Contains(ext))
        {
            return BadRequest();
        }
        // ok: gimlet.security.upload-filename-path-csharp
        var path = Path.Combine(UploadRoot, Path.GetRandomFileName() + ext);
        using var stream = System.IO.File.Create(path);
        await file.CopyToAsync(stream);
        return Ok();
    }

    [HttpPost("checked-name")]
    public async Task<IActionResult> CheckedName(IFormFile file)
    {
        var safeName = Path.GetFileName(file.FileName);
        if (AllowedExtensions.Contains(Path.GetExtension(safeName)))
        {
            // ok: gimlet.security.upload-filename-path-csharp
            var path = Path.Combine(UploadRoot, safeName);
            using var stream = new FileStream(path, FileMode.CreateNew);
            await file.CopyToAsync(stream);
        }
        return Ok();
    }

    [HttpPost("guid")]
    public async Task<IActionResult> Guid(IFormFile file, [FromQuery] string folder)
    {
        // ok: gimlet.security.upload-filename-path-csharp
        var path = Path.Combine(UploadRoot, System.Guid.NewGuid().ToString("N"));
        using var stream = System.IO.File.Create(path);
        await file.CopyToAsync(stream);
        return Ok();
    }
}
