#!/bin/sh
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' "$root/package.json" | head -n 1
