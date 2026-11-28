#!/usr/bin/env bash
set -euo pipefail
mkdir -p src
cat > src/orderManager.ts <<'TS'
export class OrderManager {
  async handleHttpRequest(req: { body: string }): Promise<{ status: number; body: string }> {
    const parsed = JSON.parse(req.body) as { id: string; email: string; items: number[] }
    const total = parsed.items.reduce((a, b) => a + b, 0)
    const sql = `INSERT INTO orders (id, total) VALUES ('${parsed.id}', ${total})`
    await this.execSql(sql)
    await this.sendSmtp(parsed.email, `Order ${parsed.id}`, `Total: ${total}`)
    const csv = `id,total\n${parsed.id},${total}\n`
    return { status: 200, body: csv }
  }
  private async execSql(_q: string) {}
  private async sendSmtp(_to: string, _subj: string, _body: string) {}
}
TS
