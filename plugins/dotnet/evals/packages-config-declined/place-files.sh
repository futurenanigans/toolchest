#!/usr/bin/env bash
# Copies the fixture into the run directory and commits it on a feature branch.
set -eu
cp -R "$(dirname "$0")/files/." .
git init -q -b deps-update
git config user.name "Eval Fixture"
git config user.email "fixture@example.invalid"
git add -A
git commit -q -m "Initial fixture"
