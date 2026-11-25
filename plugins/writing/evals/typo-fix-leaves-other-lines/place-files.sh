#!/usr/bin/env bash
# Writes a README whose untouched lines carry dashes the house style bans. The dash
# characters come from printf escapes so this script itself stays ASCII.
set -eu
cp -R "$(dirname "$0")/files/." .
em=$(printf '\xe2\x80\x94')
en=$(printf '\xe2\x80\x93')
cat > README.md <<EOF
# tally

Counts word frequencies in text files ${em} one or more paths, read as UTF-8.

    tally --top 20 notes.txt

Pass --ignore-case to recieve one count for "Apple" and "apple". Ranks 1${en}10 print by default.
EOF
