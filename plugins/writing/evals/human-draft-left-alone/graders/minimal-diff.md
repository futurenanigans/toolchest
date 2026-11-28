---
type: command
---
python3 -c "import subprocess; out = subprocess.check_output(['git', 'diff', '-U0', 'README.md'], text=True); changed = [l for l in out.splitlines() if (l.startswith('+') or l.startswith('-')) and not l.startswith('+++') and not l.startswith('---')]; assert len(changed) <= 2, f'Too many changed lines: {len(changed)}'"
