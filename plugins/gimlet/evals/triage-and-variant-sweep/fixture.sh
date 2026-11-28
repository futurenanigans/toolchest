#!/usr/bin/env bash
set -euo pipefail
mkdir -p Controllers results
cat > Controllers/OrdersController.cs <<'CS'
using Microsoft.Data.SqlClient;
public class OrdersController
{
    public SqlCommand GetOrder(SqlConnection conn, string orderId)
    {
        return new SqlCommand($"SELECT * FROM Orders WHERE Id = '{orderId}'", conn);
    }
}
CS
cat > Controllers/HealthController.cs <<'CS'
using Microsoft.Data.SqlClient;
public class HealthController
{
    private const string PingSql = "SELECT 1";
    public SqlCommand Ping(SqlConnection conn)
    {
        return new SqlCommand(PingSql, conn);
    }
}
CS
cat > Controllers/InvoicesController.cs <<'CS'
using Microsoft.Data.SqlClient;
public class InvoicesController
{
    public SqlCommand GetInvoice(SqlConnection conn, string customerCode)
    {
        return new SqlCommand("SELECT * FROM Invoices WHERE Customer = '" + customerCode + "'", conn);
    }
}
CS
cat > results/report.json <<'JSON'
{
  "scanners": [{"tool": "opengrep", "status": "ok", "detail": "2 findings"}],
  "findings": [
    {"tool": "opengrep", "rule": "sql-injection", "severity": "error", "file": "Controllers/OrdersController.cs", "line": 6, "message": "Non-parameterized SQL query"},
    {"tool": "analyzers", "rule": "CA2100", "severity": "warning", "file": "Controllers/HealthController.cs", "line": 7, "message": "Review SQL queries for security vulnerabilities"}
  ]
}
JSON
