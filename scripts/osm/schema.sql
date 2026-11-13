PRAGMA user_version=1;
CREATE TABLE features (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  class TEXT NOT NULL,
  name TEXT NOT NULL,
  minzoom INTEGER NOT NULL,
  g0 TEXT NOT NULL,
  g1 TEXT NOT NULL,
  g2 TEXT NOT NULL,
  g3 TEXT NOT NULL
);
CREATE INDEX features_zoom ON features(minzoom);
CREATE VIRTUAL TABLE feature_index USING rtree(id,minx,maxx,miny,maxy,minz,maxz);
