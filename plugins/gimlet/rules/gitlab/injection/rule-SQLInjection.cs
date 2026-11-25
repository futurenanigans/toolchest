// License: MIT
using System.Data.Linq;
using System.Data.SqlClient;
using MySql.Data.MySqlClient;
using Cassandra;

class Repo
{
    void Ef(MyDbContext db, string name)
    {
        // ruleid: csharp_injection_rule-SQLInjection
        db.Database.ExecuteSqlRaw("DELETE FROM users WHERE name = '" + name + "'");
        // ruleid: csharp_injection_rule-SQLInjection
        var rows = db.Users.FromSqlRaw<User>("SELECT * FROM users WHERE name = '" + name + "'");
        // ok: csharp_injection_rule-SQLInjection
        db.Database.ExecuteSqlRaw("DELETE FROM users WHERE name = {0}", name);
    }

    void Ado(SqlConnection conn, string id)
    {
        // ruleid: csharp_injection_rule-SQLInjection
        var cmd = new SqlCommand("SELECT * FROM t WHERE id = " + id, conn);
        // ok: csharp_injection_rule-SQLInjection
        var safe = new SqlCommand("SELECT * FROM t WHERE id = @id", conn);
        SqlCommand other = new SqlCommand();
        // ruleid: csharp_injection_rule-SQLInjection
        other.CommandText = "SELECT * FROM t WHERE id = " + id;
        // ok: csharp_injection_rule-SQLInjection
        other.CommandText = "SELECT * FROM t WHERE id = @id";
    }

    void Linq(DataContext ctx, string id)
    {
        // ruleid: csharp_injection_rule-SQLInjection
        ctx.ExecuteCommand("DELETE FROM t WHERE id = " + id);
        // ok: csharp_injection_rule-SQLInjection
        ctx.ExecuteCommand("DELETE FROM t WHERE id = {0}", id);
    }

    void MySql(string conn, string id)
    {
        // ruleid: csharp_injection_rule-SQLInjection
        MySqlHelper.ExecuteDataRow(conn, "SELECT * FROM t WHERE id = " + id);
        // ok: csharp_injection_rule-SQLInjection
        MySqlHelper.ExecuteDataRow(conn, "SELECT * FROM t WHERE id = 1");
    }

    void Cql(Cluster cluster, string id)
    {
        var session = cluster.Connect("ks");
        // ruleid: csharp_injection_rule-SQLInjection
        session.Execute("SELECT * FROM t WHERE id = " + id);
        // ok: csharp_injection_rule-SQLInjection
        session.Execute("SELECT * FROM t");
    }
}
