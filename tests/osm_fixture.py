"""Self-generated CC0 OSM PBF. No real-world map content is copied."""
import struct
import zlib
from pathlib import Path


def varint(value):
    out = bytearray()
    while value > 127:
        out.append((value & 127) | 128); value >>= 7
    out.append(value)
    return bytes(out)


def scalar(field,value):
    return varint(field << 3)+varint(value)


def signed(field,value):
    return scalar(field, (value << 1) ^ (value >> 63))


def data(field,value):
    return varint((field << 3) | 2)+varint(len(value))+value


def blob(kind,payload):
    body=scalar(2,len(payload))+data(3,zlib.compress(payload))
    header=data(1,kind.encode())+scalar(3,len(body))
    return struct.pack('>I',len(header))+header+body


def write_fixture(filename):
    nodes=[]; ways=[]
    def node(lon,lat,tags=None):
        identity=len(nodes)+1; nodes.append((identity,lon,lat,tags or {})); return identity
    def way(points,tags):
        refs=[node(lon,lat) for lon,lat in points]
        if points[-1]==points[0]:
            refs[-1]=refs[0]
        ways.append((len(ways)+100,refs,tags))
    # Counterclockwise island: OSM land is on the coastline's left.
    way([(126.22,36.58),(126.26,36.58),(126.26,36.62),(126.22,36.62),(126.22,36.58)],{'natural':'coastline'})
    way([(126.23,36.595),(126.24,36.598),(126.25,36.602)],{'highway':'primary','name':'Test road','name:ko':'태안 시험도로'})
    way([(126.235,36.592),(126.245,36.592),(126.245,36.602),(126.235,36.602),(126.235,36.592)],{'landuse':'forest'})
    way([(126.240,36.598),(126.2405,36.598),(126.2405,36.5984),(126.240,36.5984),(126.240,36.598)],{'building':'yes','name':'Test building'})
    way([(126.23,36.61),(126.232,36.61),(126.232,36.612),(126.23,36.612),(126.23,36.61)],{'natural':'water'})
    node(126.240136,36.597889,{'place':'town','name':'Synthetic Taean','name:ko':'태안 시험지명'})
    strings=['']; indices={'':0}
    for tags in [n[3] for n in nodes]+[w[2] for w in ways]:
        for key,value in tags.items():
            for text in (key,value):
                if text not in indices: indices[text]=len(strings); strings.append(text)
    def tags_message(tags):
        return data(2,b''.join(varint(indices[k]) for k in tags))+data(3,b''.join(varint(indices[v]) for v in tags.values()))
    def deltas(values):
        previous=0; packed=b''
        for value in values:
            delta=value-previous; packed += varint((delta<<1)^(delta>>63));previous=value
        return packed
    keys_values=b''
    for identity,lon,lat,tags in nodes:
        keys_values += b''.join(varint(indices[k])+varint(indices[v]) for k,v in tags.items())+b'\x00'
    dense=data(1,deltas([n[0] for n in nodes]))+data(8,deltas([round(n[2]*1e7) for n in nodes]))+data(9,deltas([round(n[1]*1e7) for n in nodes]))+data(10,keys_values)
    group=data(2,dense)
    for identity,refs,tags in ways:
        previous=0; packed=b''
        for ref in refs:
            delta=ref-previous; packed += varint((delta<<1)^(delta>>63)); previous=ref
        group += data(3,scalar(1,identity)+tags_message(tags)+data(8,packed))
    primitive=data(1,b''.join(data(1,s.encode()) for s in strings))+data(2,group)
    bbox=b''.join(signed(field,round(value*1e9)) for field,value in [(1,126.22),(2,126.26),(3,36.62),(4,36.58)])
    header=data(1,bbox)+data(4,b'OsmSchema-V0.6')+data(4,b'DenseNodes')+data(16,b'map_service CC0 synthetic test')
    Path(filename).parent.mkdir(parents=True,exist_ok=True)
    Path(filename).write_bytes(blob('OSMHeader',header)+blob('OSMData',primitive))

if __name__=='__main__':
    import sys
    write_fixture(sys.argv[1])
