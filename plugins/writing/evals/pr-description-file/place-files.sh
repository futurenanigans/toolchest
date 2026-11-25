#!/usr/bin/env bash
# Builds a main branch and a feature branch one commit ahead of it.
set -eu
here="$(dirname "$0")"
cp -R "$here/files/." .
git init -q -b main
git config user.name "Eval Fixture"
git config user.email "fixture@example.invalid"
git add -A
git commit -q -m "Initial tally CLI"
git checkout -q -b min-length
cp "$here/staged/cli.py" src/tally/cli.py
git commit -q -am "Add --min-length to drop short words from the ranking

Stop words such as a, an and of fill the top of every ranking on prose.
A length floor removes most of them without shipping a language-specific
stop list."
