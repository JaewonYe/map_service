#!/usr/bin/env python3
"""Index a local OpenStreetMap PBF for the Next.js raster renderer. No downloads."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import sqlite3
import time
import uuid

from osgeo import gdal, osr
from shapely.geometry import shape, mapping, box, LineString, MultiLineString
from shapely.geometry.polygon import orient
from shapely.ops import unary_union, linemerge, polygonize
from shapely.strtree import STRtree
from shapely.errors import ShapelyError
from numbers import Integral

gdal.UseExceptions()
WORLD = 20037508.342789244
PLACE_ZOOM = {'country':3,'state':6,'city':8,'town':10,'suburb':12,'village':12,'hamlet':14,'neighbourhood':15,'island':10}
ROAD_ZOOM = {'motorway':5,'trunk':6,'primary':7,'secondary':9,'tertiary':10,'unclassified':12,'residential':13,'living_street':14,'service':15,'pedestrian':15,'footway':16,'path':16,'cycleway':16,'steps':17,'track':15}


def properties(feature):
    tags = {k:str(v) for k,v in feature.items().items() if v is not None and k != 'other_tags'}
    other = feature.GetField('other_tags') if feature.GetFieldIndex('other_tags') >= 0 else ''
    for key,value in re.findall(r'"((?:[^"\\]|\\.)*)"=>"((?:[^"\\]|\\.)*)"',other or ''):
        try:
            tags[json.loads('"'+key+'"')] = json.loads('"'+value+'"')
        except ValueError:
            continue
    return tags


def classify(tags, geometry):
    if geometry.geom_type in ('Point','MultiPoint'):
        place = tags.get('place','')
        if place in PLACE_ZOOM:
            return 'place',place,PLACE_ZOOM[place]
        if tags.get('amenity') or tags.get('tourism') or tags.get('shop'):
            return 'poi',tags.get('amenity',tags.get('tourism',tags.get('shop',''))),16
    elif geometry.geom_type in ('LineString','MultiLineString'):
        road = tags.get('highway','')
        if road.endswith('_link'):
            road = road[:-5]
        if road in ROAD_ZOOM:
            return 'road',road,ROAD_ZOOM[road]
        if tags.get('natural') == 'coastline':
            return 'coastline','coastline',9
        if tags.get('waterway') in ('river','stream','canal','drain'):
            return 'river',tags['waterway'],10 if tags['waterway']=='river' else 14
        if tags.get('railway') in ('rail','light_rail','tram'):
            return 'rail',tags['railway'],10
    elif geometry.geom_type in ('Polygon','MultiPolygon'):
        if tags.get('natural') == 'coastline':
            return 'coastline','coastline',9
        if tags.get('building') and tags['building'] != 'no':
            return 'building',tags['building'],15
        if tags.get('natural') in ('water','bay') or tags.get('waterway') == 'riverbank' or tags.get('landuse') in ('reservoir','basin'):
            return 'water','water',6
        if tags.get('natural') in ('wood','scrub','grassland','wetland') or tags.get('landuse') in ('forest','grass','meadow','farmland','orchard') or tags.get('leisure') in ('park','garden','golf_course','nature_reserve'):
            return 'green',tags.get('landuse',tags.get('natural',tags.get('leisure',''))),8
    return None


class Index:
    def __init__(self,path):
        self.db = sqlite3.connect(path)
        self.db.execute('PRAGMA journal_mode=OFF')
        self.db.execute('PRAGMA synchronous=OFF')
        self.db.executescript(Path(__file__).with_name('schema.sql').read_text())
        self.count = 0
        self.extent = None
        self.coast = []
        self.kinds = {}

    def add(self,geometry,kind,category,name,minzoom):
        if geometry.is_empty:
            return
        if geometry.geom_type in ('Polygon','MultiPolygon') and not geometry.is_valid:
            geometry = geometry.buffer(0)
        if geometry.is_empty:
            return
        minx,miny,maxx,maxy = geometry.bounds
        if not all(math.isfinite(n) and abs(n) <= WORLD+1 for n in geometry.bounds):
            return
        self.extent = [minx,miny,maxx,maxy] if self.extent is None else [min(self.extent[0],minx),min(self.extent[1],miny),max(self.extent[2],maxx),max(self.extent[3],maxy)]
        # Chunk large polygons so a high-zoom tile does not load a country's full coast.
        if geometry.geom_type in ('Polygon','MultiPolygon') and (maxx-minx>40000 or maxy-miny>40000):
            for x in range(math.floor(minx/40000),math.floor(maxx/40000)+1):
                for y in range(math.floor(miny/40000),math.floor(maxy/40000)+1):
                    part = geometry.intersection(box(x*40000,y*40000,(x+1)*40000,(y+1)*40000))
                    if part.geom_type=='GeometryCollection':
                        part = unary_union([g for g in part.geoms if g.geom_type in ('Polygon','MultiPolygon')])
                    if not part.is_empty and part.area>0:
                        self.insert(part,kind,category,name,minzoom)
        else:
            self.insert(geometry,kind,category,name,minzoom)

    def insert(self,geometry,kind,category,name,minzoom):
        self.count += 1
        values = []
        for tolerance,maximum_zoom in zip((1500,150,12,0),(7,10,13,19)):
            if minzoom>maximum_zoom:
                values.append('')
                continue
            simplified = geometry.simplify(tolerance,preserve_topology=True) if tolerance else geometry
            values.append(json.dumps(mapping(simplified),separators=(',',':'),ensure_ascii=False))
        self.db.execute('INSERT INTO features VALUES(?,?,?,?,?,?,?,?,?)',(self.count,kind,category,name[:160],minzoom,*values))
        a,b,c,d = geometry.bounds
        self.db.execute('INSERT INTO feature_index VALUES(?,?,?,?,?,?,?)',(self.count,a,c,b,d,minzoom,19))
        self.kinds[kind] = self.kinds.get(kind,0)+1
        if self.count % 50000 == 0:
            self.db.commit()
            print(f'{self.count:,} indexed features',flush=True)

    def land(self):
        if not self.coast or self.extent is None:
            return False,0
        x0,y0,x1,y1 = self.extent
        # Enclose complete coastline ways; open country-extract ends reach the edge.
        margin = 5000
        outer = box(x0-margin,y0-margin,x1+margin,y1+margin)
        merged = unary_union(self.coast)
        if merged.geom_type != 'LineString':
            merged = linemerge(merged)
        chains = list(merged.geoms) if merged.geom_type=='MultiLineString' else [merged]
        connectors = []
        for line in chains:
            if line.is_ring:
                continue
            for x,y in (line.coords[0],line.coords[-1]):
                choices = [(outer.bounds[0],y),(outer.bounds[2],y),(x,outer.bounds[1]),(x,outer.bounds[3])]
                end = min(choices,key=lambda p:(p[0]-x)**2+(p[1]-y)**2)
                connectors.append(LineString([(x,y),end]))
        tree = STRtree(self.coast)
        count = 0
        # OSM coastline direction has land on its left. Preserve original ways for classification.
        for polygon in polygonize(unary_union([outer.boundary,*self.coast,*connectors])):
            p = polygon.representative_point()
            nearest = tree.nearest(p)
            line = self.coast[int(nearest)] if isinstance(nearest,Integral) else nearest
            distance = line.project(p)
            a = line.interpolate(max(0,distance-1)); b = line.interpolate(min(line.length,distance+1))
            if (b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x)>0:
                self.add(polygon,'land','land','',0)
                count += 1
        return count>0,len(connectors)


def prepare(args):
    root = Path(args.directory).resolve()
    name = args.file
    if Path(name).name != name or '/' in name or '\\' in name or not name.endswith('.osm.pbf'):
        raise ValueError('OSM_PBF_FILE must be a filename ending in .osm.pbf, without directories')
    source = root/name
    if not source.is_file() and name=='south-korea.osm.pbf':
        source = root/'south-korea-latest.osm.pbf'
    if not source.is_file() or source.stat().st_size==0:
        raise ValueError(f'OSM PBF not found: {root/name}. Copy the downloaded .osm.pbf into this folder.')
    details = source.stat()
    stamp = dict(sourceFile=source.name,sourceSize=details.st_size,sourceMtimeMs=details.st_mtime_ns//1000000)
    metadata_file = root/'metadata.json'
    if not args.force and metadata_file.is_file():
        try:
            old = json.loads(metadata_file.read_text(encoding='utf-8'))
            database = (root/old.get('database','')).resolve()
            if old.get('version')==1 and old.get('type')=='osm-sqlite' and all(old.get(k)==v for k,v in stamp.items()) and database.is_file() and database.is_relative_to(root):
                print('PBF unchanged; reusing prepared OSM index.',flush=True)
                return
        except (ValueError,OSError):
            pass
    dataset = root/'sets'/uuid.uuid4().hex
    dataset.mkdir(parents=True)
    index = None
    started = time.monotonic()
    try:
        gdal.SetConfigOption('OGR_INTERLEAVED_READING','YES')
        gdal.SetConfigOption('OSM_MAX_TMPFILE_SIZE','128')
        gdal.SetConfigOption('CPL_TMPDIR',str(dataset))
        gdal.SetConfigOption('GDAL_PAM_ENABLED','NO')
        original = osr.SpatialReference(); original.ImportFromEPSG(4326)
        projected = osr.SpatialReference(); projected.ImportFromEPSG(3857)
        for srs in (original,projected):
            srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
        transform = osr.CoordinateTransformation(original,projected)
        data = gdal.OpenEx(str(source),gdal.OF_VECTOR,allowed_drivers=['OSM'])
        if not data:
            raise ValueError('The file is not a readable OSM PBF')
        index = Index(dataset/'map.sqlite')
        print(f'Indexing {source.name}. This can take several minutes for a country extract.',flush=True)
        scanned = 0
        while True:
            feature,layer = data.GetNextFeature()
            if feature is None:
                break
            geometry = feature.GetGeometryRef()
            if geometry is None:
                continue
            tags = properties(feature)
            # Avoid transforming the many untagged nodes/unsupported features.
            if not any(tags.get(k) for k in ('highway','building','natural','landuse','leisure','waterway','railway','place','amenity','tourism','shop')):
                continue
            geometry = geometry.Clone(); geometry.Transform(transform)
            geometry = shape(json.loads(geometry.ExportToJson()))
            category = classify(tags,geometry)
            if category:
                kind,subcategory,minzoom = category
                name = tags.get('name:ko') or tags.get('name_ko') or tags.get('name') or tags.get('ref','')
                if kind in ('place','poi') and not name:
                    continue
                if kind=='coastline' and geometry.geom_type in ('Polygon','MultiPolygon'):
                    polygons = [geometry] if geometry.geom_type=='Polygon' else list(geometry.geoms)
                    # GDAL exposes closed coastline ways as polygons and may normalize ring order.
                    rings = [LineString(orient(p,sign=1).exterior.coords) for p in polygons]
                    geometry = rings[0] if len(rings)==1 else MultiLineString(rings)
                index.add(geometry,kind,subcategory,name,minzoom)
                if kind=='coastline':
                    index.coast.extend([geometry] if geometry.geom_type=='LineString' else list(geometry.geoms))
            scanned += 1
        data = None
        if not index.count:
            raise ValueError('No supported roads, buildings or place features found in the PBF')
        coast,connections = index.land()
        index.db.commit()
        index.db.execute('ANALYZE')
        index.db.close()
        x0,y0,x1,y1 = index.extent
        latitude = lambda y: math.degrees(math.atan(math.sinh(y/WORLD*math.pi)))
        bounds = dict(west=x0/WORLD*180,east=x1/WORLD*180,south=latitude(y0),north=latitude(y1))
        if bounds['west']==bounds['east'] or bounds['south']==bounds['north']:
            raise ValueError('OSM data has an empty geographic extent')
        with source.open('rb') as file:
            digest = hashlib.file_digest(file,'sha256').hexdigest()
        after = source.stat()
        if (after.st_size,after.st_mtime_ns)!=(details.st_size,details.st_mtime_ns):
            raise ValueError('PBF changed while preparing. Keep the file unchanged and retry.')
        metadata = dict(version=1,type='osm-sqlite',database=f'sets/{dataset.name}/map.sqlite',bounds=bounds,
                        minZoom=0,maxZoom=19,usageConfirmed=True,source='OpenStreetMap',license='ODbL-1.0',
                        attribution='© OpenStreetMap contributors',sourceSha256=digest,featureCount=index.count,
                        kinds=index.kinds,coastlineFill=coast,coastlineEdgeConnections=connections,**stamp)
        temporary = root/f'.metadata-{uuid.uuid4().hex}.json'
        temporary.write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        os.replace(temporary,metadata_file)
        print(f'OSM ready: {index.count:,} features, {time.monotonic()-started:.1f}s. Restart/reload the map.',flush=True)
    except BaseException:
        if index:
            index.db.close()
        shutil.rmtree(dataset,ignore_errors=True)
        raise


if __name__=='__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory',default='/data/osm')
    parser.add_argument('--file',default=os.getenv('OSM_PBF_FILE','south-korea.osm.pbf'))
    parser.add_argument('--force',action='store_true')
    try:
        prepare(parser.parse_args())
    except (ValueError,RuntimeError,OSError,sqlite3.Error,ShapelyError) as error:
        parser.exit(1,f'OSM preparation failed: {error}\n')
