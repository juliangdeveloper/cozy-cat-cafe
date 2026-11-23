#!/bin/sh
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
web="$root/ios/Sources/CozyCatCafe/web"
rm -rf "$web"
mkdir -p "$web"
cp -R "$root/index.html" "$root/assets" "$root/js" "$root/vendor" "$web/"
rm -f "$web/assets/screenshot.png" "$web/assets/gen_sprites.py"
want="v$(sh "$root/ios/version.sh")"
got=$(sed -n "s/^const GAME_VERSION = '\([^']*\)'.*/\1/p" "$root/index.html")
if [ "$want" != "$got" ]; then
  echo "GAME_VERSION $got does not match package.json $want" >&2
  exit 1
fi
echo "web $got"
