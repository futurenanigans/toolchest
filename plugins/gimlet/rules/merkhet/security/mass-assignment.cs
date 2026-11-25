using System.Web.Mvc;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

public class UserDto { public string Name; public string Email; public bool IsAdmin; }

public class LegacyController : Controller
{
    public ActionResult Save(UserDto model)
    {
        // ruleid: merk.security.mass-assignment-mvc5-csharp
        UpdateModel(model);

        // ruleid: merk.security.mass-assignment-mvc5-csharp
        TryUpdateModel(model);

        // ok: merk.security.mass-assignment-mvc5-csharp
        UpdateModel(model, new[] { "Name", "Email" });

        // ok: merk.security.mass-assignment-mvc5-csharp
        TryUpdateModel(model, new[] { "Name", "Email" });

        return View();
    }
}

[ApiController]
public class CoreController : ControllerBase
{
    private readonly AppDbContext _db;
    public CoreController(AppDbContext db) { _db = db; }

    [HttpPost]
    public IActionResult SaveBody([FromBody] UserDto dto)
    {
        // ruleid: merk.security.mass-assignment-core-dbcontext-csharp
        _db.Update(dto);
        return Ok();
    }

    [HttpPost]
    public IActionResult SaveForm([FromForm] UserDto dto)
    {
        // ruleid: merk.security.mass-assignment-core-dbcontext-csharp
        _db.UpdateRange(dto);
        return Ok();
    }

    [HttpPost]
    public IActionResult SaveMapped([FromBody] UserDto dto, IMapper mapper)
    {
        // ok: merk.security.mass-assignment-core-dbcontext-csharp
        _db.Update(mapper.Map<User>(dto));
        return Ok();
    }
}
