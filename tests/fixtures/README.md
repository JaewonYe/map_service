# Vector tile fixture

`tile.pbf` is an uncompressed z14/8529/5974 vector tile generated with this repository's
minimal config from `test/monaco.pbf` in the official systemed/tilemaker repository.
Source: https://github.com/systemed/tilemaker/blob/master/test/monaco.pbf
OSM data: © OpenStreetMap contributors, ODbL — https://www.openstreetmap.org/copyright

The fixture has real road/building geometry. The HTTP test double returns it for
multiple coordinates to test the frontend independently of a running MBTiles server.

`satellite.png` is a solid-color synthetic test image, not satellite imagery.
It is never copied into the real `data/imagery/` folder.
