---
type: command
command: if awk '/^#\[cfg\(test\)\]/ { getline following; if (following ~ /^(pub )?mod /) exit; print; print following; next } { sub(/\/\/.*/, ""); print }' src/lib.rs | grep -Eq '\.(unwrap|expect)[[:space:]]*\('; then exit 1; fi
---
