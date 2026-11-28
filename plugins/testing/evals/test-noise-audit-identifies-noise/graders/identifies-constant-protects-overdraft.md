---
type: llm
---
PASS if the response recommends removing the constant-literal test (`daily withdrawal limit constant is 50000`) as low-value noise AND recommends keeping the overdraft regression test (`withdraw rejects overdraft beyond balance`).
FAIL if it recommends keeping both, removing both, or removing the overdraft test.
