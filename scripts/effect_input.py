"""Validate and project component inputs before embedding them in a public HTML."""
import math
import re
from profile_geo import validate_geometry, spatial_summary, normalize_crs


def finite(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def prepare(data, effect, aggregation='count', value_field=None, detail_fields=(), radar_radius_meters=18000):
    if not isinstance(detail_fields, (list, tuple)) or any(not isinstance(k, str) or k.startswith('__') for k in detail_fields):
        raise ValueError('detail_fields must be a list of explicit scalar field names')
    if isinstance(data, dict):
        metadata = data.get('metadata', {})
        if not isinstance(metadata, dict):
            raise ValueError('Invalid metadata')
        if metadata.get('status') == 'needs_crs': raise ValueError('Resolve source CRS first')
        if metadata.get('dataCrs', 'wgs84') != 'wgs84' or ('crs' in data and normalize_crs(data['crs']) != 'wgs84'):
            raise ValueError('Transform source coordinates to WGS84 first')
    rows = data if effect == 'flight' else data.get('features') if isinstance(data, dict) and data.get('type') == 'FeatureCollection' else None
    if not isinstance(rows, list):
        raise ValueError('Expected OD array or effect-compatible FeatureCollection')
    allowed = {'name', 'label', 'category', 'region', 'color'} | set(detail_fields)
    if effect == 'hexagon' and aggregation != 'count':
        allowed.add(value_field)
    points, clean, ids = [], [], set()
    def position(p):
        validate_geometry({'type':'Point', 'coordinates':p})
        if abs(p[1]) > 85:
            raise ValueError('Effect requires Mercator latitude within 85 degrees')
        return p[:2]
    for i, row in enumerate(rows):
        if not isinstance(row, dict):
            raise ValueError('Each record must be an object')
        identity = row.get('id', i if effect != 'flight' else None)
        if identity is None or isinstance(identity, (bool, list, dict)) or str(identity) in ids:
            raise ValueError('Records require unique scalar IDs')
        ids.add(str(identity))
        props = row if effect == 'flight' else row.get('properties', {})
        if not isinstance(props, dict):
            raise ValueError('Properties must be an object')
        selected = {}
        for key in allowed:
            if key not in props:
                continue
            value = props[key]
            if value is not None and (not isinstance(value, (str, int, float, bool)) or isinstance(value, (int, float)) and not finite(value) and not isinstance(value, bool)):
                raise ValueError('Selected fields must contain finite scalar values or null')
            selected[key] = value
        if selected.get('color') is not None and not re.fullmatch(r'#[0-9a-fA-F]{6}', str(selected['color'])):
            raise ValueError('Color must be #RRGGBB')
        if effect == 'flight':
            source, target = position(row.get('source')), position(row.get('target'))
            a, b = [[math.cos(math.radians(p[1]))*math.cos(math.radians(p[0])), math.cos(math.radians(p[1]))*math.sin(math.radians(p[0])), math.sin(math.radians(p[1]))] for p in (source,target)]
            omega=math.acos(max(-1,min(1,sum(x*y for x,y in zip(a,b)))))
            if math.pi-omega<1e-5:
                raise ValueError('Antipodal route requires an explicit waypoint')
            for step in range(97):
                t=step/96
                s,u=(1-t,t) if omega<1e-8 else (math.sin((1-t)*omega)/math.sin(omega),math.sin(t*omega)/math.sin(omega))
                v=[x*s+y*u for x,y in zip(a,b)]
                if abs(math.degrees(math.atan2(v[2],math.hypot(v[0],v[1]))))>85:
                    raise ValueError('Polar flight requires another renderer')
            points.extend([source,target]);clean.append({**selected,'id':str(identity),'source':source,'target':target})
        else:
            geometry=row.get('geometry');coords,_=validate_geometry(geometry)
            if geometry['type'] != 'Point':
                raise ValueError('Geometry does not match effect')
            for p in coords: position(p)
            if effect=='hexagon' and aggregation!='count':
                value=selected.get(value_field)
                if value is not None and (not finite(value) or value<0): raise ValueError('Hexagon metrics require nonnegative finite numbers or null')
            points.extend(coords);clean.append({'type':'Feature','id':str(identity),'geometry':geometry,'properties':selected})
    if effect=='hexagon' and aggregation!='count' and rows and not any(value_field in row.get('properties',{}) for row in rows):
        raise ValueError('Selected metric field does not exist')
    if effect=='hexagon' and points:
        origin=[sum(p[k] for p in points)/len(points) for k in (0,1)]
        if abs(origin[1])>75: raise ValueError('Hexagons require regional data below 75 degrees latitude')
        for p in points:
            x=(p[0]-origin[0])*111195.08*math.cos(math.radians(origin[1]));y=(p[1]-origin[1])*111195.08
            if abs(p[0]-origin[0])>180 or math.hypot(x,y)>500000: raise ValueError('Hexagons require regional data within 500 km of origin')
    if effect=='radar':
        angular=radar_radius_meters/6371008.8
        for lng,lat in points:
            latitude=math.radians(lat)
            for step in range(64):
                bearing=step*math.pi/32
                next_lat=math.asin(math.sin(latitude)*math.cos(angular)+math.cos(latitude)*math.sin(angular)*math.cos(bearing))
                next_lng=lng+math.degrees(math.atan2(math.sin(bearing)*math.sin(angular)*math.cos(latitude),math.cos(angular)-math.sin(latitude)*math.sin(next_lat)))
                if abs(next_lng)>180 or abs(math.degrees(next_lat))>85:
                    raise ValueError('Radar range crosses supported map bounds; reduce radius or split the data')
    bounds=spatial_summary(points)['wrappedBounds'] if points else None
    if bounds and bounds[2]<bounds[0]: bounds[2]+=360
    return (clean if effect=='flight' else {'type':'FeatureCollection','features':clean}),bounds
