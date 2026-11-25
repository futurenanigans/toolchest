#!/usr/bin/env bash
# Copies the fixture into the run directory and commits it, because the skill's
# mutation pre-flight requires a clean working tree.
set -eu
cp -R "$(dirname "$0")/files/." .
git init -q -b main
git config user.name "Eval Fixture"
git config user.email "fixture@example.invalid"
git add -A
git commit -q -m "Initial fixture"
