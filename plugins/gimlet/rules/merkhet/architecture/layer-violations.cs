using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Merkhet.Tests.Architecture.Controllers;

// ruleid: merk.architecture.controller-uses-dbcontext-csharp
public class UsersController : ControllerBase
{
    private readonly AppDbContext _db;

    public UsersController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public IActionResult List() => Ok(_db.Users);
}

// ruleid: merk.architecture.controller-uses-dbcontext-csharp
public class OrdersController : Controller
{
    private readonly AppDbContext _context;

    public OrdersController(AppDbContext context)
    {
        _context = context;
    }
}

// ok: merk.architecture.controller-uses-dbcontext-csharp
public class ProductsController : ControllerBase
{
    private readonly IProductService _products;

    public ProductsController(IProductService products)
    {
        _products = products;
    }

    [HttpGet]
    public IActionResult List() => Ok(_products.GetAll());
}

public class AppDbContext : DbContext
{
    public DbSet<User> Users { get; set; } = null!;
}

public interface IProductService { object[] GetAll(); }
public class User { public int Id { get; set; } }
