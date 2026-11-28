---
type: command
command: d=$(mktemp -d) && cp -r src "$d/" && cd "$d" && bun test src/account.test.ts >/dev/null 2>&1 && sed -i "/insufficient funds/d" src/account.ts && if bun test src/account.test.ts >/dev/null 2>&1; then exit 1; fi
arm: both
---
