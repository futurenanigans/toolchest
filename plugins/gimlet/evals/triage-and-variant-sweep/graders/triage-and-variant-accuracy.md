---
type: llm
---
PASS if the response: (1) confirms `Controllers/OrdersController.cs` is a real SQL injection because `orderId` is interpolated into SQL, (2) marks `Controllers/HealthController.cs` as a false positive because `PingSql` is a compile-time constant (`"SELECT 1"`), AND (3) discovers the unflagged sibling SQL injection in `Controllers/InvoicesController.cs` (`customerCode` concatenated into SQL).
FAIL if any of those three points is missed or misclassified.
