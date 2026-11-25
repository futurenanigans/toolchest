#!/usr/bin/env bash
# Commits the fixture, then stages one change for the agent to commit.
set -eu
here="$(dirname "$0")"
cp -R "$here/files/." .
git init -q -b main
git config user.name "Eval Fixture"
git config user.email "fixture@example.invalid"
git add -A
git commit -q -m "Initial tally CLI"
cp "$here/staged/cli.py" src/tally/cli.py
git add src/tally/cli.py
