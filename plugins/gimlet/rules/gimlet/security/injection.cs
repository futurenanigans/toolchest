using System.Data;
using System.Data.SqlClient;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Gimlet.Tests.Injection;

public class SqlExamples
{
    public void BuildQueries(HttpRequest req, SqlConnection conn)
    {
        // ruleid: gimlet.security.sql-injection-csharp
        var cmd1 = new SqlCommand("SELECT * FROM users WHERE id = " + req.Query["id"], conn);

        // ruleid: gimlet.security.sql-injection-csharp
        var cmd2 = new SqlCommand($"SELECT * FROM users WHERE name = '{req.Form["name"]}'", conn);

        var cmd3 = new SqlCommand("", conn);
        // ruleid: gimlet.security.sql-injection-csharp
        cmd3.CommandText = "SELECT * FROM users WHERE id = " + req.Query["id"];

        // ruleid: gimlet.security.sql-injection-csharp
        cmd3.CommandText = $"DELETE FROM users WHERE id = {req.Form["id"]}";

        // ok: gimlet.security.sql-injection-csharp
        var cmd4 = new SqlCommand("SELECT * FROM users WHERE id = @id", conn);
        cmd4.Parameters.AddWithValue("@id", req.Query["id"]);

        // ok: gimlet.security.sql-injection-csharp
        var cmd5 = new SqlCommand("SELECT COUNT(*) FROM users", conn);
    }

    public void UseEfCore(HttpRequest req, AppDbContext db)
    {
        // ruleid: gimlet.security.sql-injection-csharp
        var a = db.Users.FromSqlRaw("SELECT * FROM users WHERE name = '" + req.Query["name"] + "'");

        // ruleid: gimlet.security.sql-injection-csharp
        db.Database.ExecuteSqlRaw($"DELETE FROM users WHERE name = '{req.Form["name"]}'");

        // ok: gimlet.security.sql-injection-csharp
        var safe = db.Users.FromSqlInterpolated($"SELECT * FROM users WHERE name = {req.Query["name"]}");
    }
}

public class AppDbContext : DbContext
{
    public DbSet<User> Users { get; set; } = null!;
}

public class User { public int Id { get; set; } public string Name { get; set; } = ""; }

public class SqlUsersController : Controller
{
    private readonly AppDbContext _db;
    public SqlUsersController(AppDbContext db) { _db = db; }

    public IActionResult Search([FromQuery] string name)
    {
        // ruleid: gimlet.security.sql-injection-csharp
        var rows = _db.Users.FromSqlRaw("SELECT * FROM users WHERE name = '" + name + "'");
        return Ok(rows);
    }

    public IActionResult SafeSearch([FromQuery] string name)
    {
        // ok: gimlet.security.sql-injection-csharp
        var rows = _db.Users.FromSqlInterpolated($"SELECT * FROM users WHERE name = {name}");
        return Ok(rows);
    }

    private IActionResult Ok(object o) => base.Ok(o);
}

public static class SqlMinimalApi
{
    public static void Configure(WebApplication app, AppDbContext db, SqlConnection conn)
    {
        app.MapGet("/users", ([FromQuery] string name) =>
        {
            // ruleid: gimlet.security.sql-injection-csharp
            return new SqlCommand("SELECT * FROM users WHERE name = '" + name + "'", conn);
        });

        app.MapGet("/user/{id}", ([FromRoute] string id) =>
            // ruleid: gimlet.security.sql-injection-csharp
            new SqlCommand($"SELECT * FROM users WHERE id = {id}", conn));

        app.MapGet("/safe-users", ([FromQuery] string name) =>
            // ok: gimlet.security.sql-injection-csharp
            db.Users.FromSqlInterpolated($"SELECT * FROM users WHERE name = {name}"));
    }
}

public class DapperExamples
{
    public void RunQueries(IDbConnection conn, HttpRequest req)
    {
        // ruleid: gimlet.security.dapper-sql-injection-csharp
        conn.Query($"SELECT * FROM users WHERE name = '{req.Query["name"]}'");

        // ruleid: gimlet.security.dapper-sql-injection-csharp
        conn.Execute("DELETE FROM sessions WHERE user = '" + req.Query["user"] + "'");

        // ruleid: gimlet.security.dapper-sql-injection-csharp
        conn.QueryAsync($"SELECT * FROM orders WHERE id = {req.Query["id"]}");

        // ruleid: gimlet.security.dapper-sql-injection-csharp
        conn.QueryFirst($"SELECT TOP 1 * FROM logs WHERE msg LIKE '%{req.Form["q"]}%'");

        // ok: gimlet.security.dapper-sql-injection-csharp
        conn.Query("SELECT * FROM users WHERE name = @name", new { name = req.Query["name"].ToString() });
    }

    public void RunStaticQueries(IDbConnection conn)
    {
        // Static-only fixture — opengrep's C# taint analysis over-
        // propagates when a request param sits in scope; running this in
        // its own function keeps the literal case separable.
        // ok: gimlet.security.dapper-sql-injection-csharp
        conn.Query("SELECT COUNT(*) FROM users");
    }

    public void MvcAction([FromQuery] string term, IDbConnection conn)
    {
        // ruleid: gimlet.security.dapper-sql-injection-csharp
        conn.Query("SELECT * FROM products WHERE name LIKE '%" + term + "%'");

        // ruleid: gimlet.security.dapper-sql-injection-csharp
        conn.ExecuteAsync($"UPDATE products SET flag = 1 WHERE id = {term}");

        // ok: gimlet.security.dapper-sql-injection-csharp
        conn.Query("SELECT * FROM products WHERE name LIKE @term", new { term = "%" + term + "%" });
    }

    public void IdentifierPosition([FromQuery] string col, IDbConnection conn)
    {
        // ruleid: gimlet.security.dapper-identifier-injection-csharp, gimlet.security.dapper-sql-injection-csharp
        conn.Query($"SELECT * FROM products ORDER BY {col}");

        // ruleid: gimlet.security.dapper-identifier-injection-csharp, gimlet.security.dapper-sql-injection-csharp
        conn.QueryAsync($"SELECT * FROM {col} WHERE id = 1");
    }

    public void IdentifierPositionStatic(IDbConnection conn)
    {
        // ok: gimlet.security.dapper-identifier-injection-csharp, gimlet.security.dapper-sql-injection-csharp
        conn.Query("SELECT * FROM products ORDER BY name");
    }
}
