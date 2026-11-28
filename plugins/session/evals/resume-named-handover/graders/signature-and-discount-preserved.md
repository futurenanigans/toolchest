---
type: command
---
python3 -c "import inspect, subprocess; import cart; sig = str(inspect.signature(cart.receipt_cents)); assert 'amount' in sig, sig; subprocess.check_call(['git', 'diff', '--quiet', '--', 'discount.py'])"
