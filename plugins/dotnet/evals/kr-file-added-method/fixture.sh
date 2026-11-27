#!/usr/bin/env bash
set -euo pipefail
mkdir -p src
cat > src/Cart.cs <<'CS'
namespace Shop;

public class Cart {
    private readonly List<decimal> _prices = new();

    public void Add(decimal price) {
        _prices.Add(price);
    }
}
CS
