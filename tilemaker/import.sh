#!/bin/sh
set -eu
# Publish a complete file only after conversion succeeds; keep any previous output.
output=/output/region.next.mbtiles
trap 'rm -f "$output"' EXIT
rm -f "$output"
/usr/src/app/tilemaker --input /input/region.osm.pbf --output "$output" \
  --config /config/config.json --process /config/process.lua --threads 2
mv "$output" /output/region.mbtiles
