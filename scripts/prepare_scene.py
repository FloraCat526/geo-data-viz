#!/usr/bin/env python3
"""Turn a normalized story or itinerary into editable narrative camera chapters."""
import argparse
import json
import math
from pathlib import Path

from build_errors import BuildError, diagnostic, read_object
from scene_plan import PROVIDERS, validate_scene


def prepare(data, *, provider='maplibre', chapter_seconds=4, schematic_links=False):
    if data.get('metadata', {}).get('dataCrs') != 'wgs84':
        raise BuildError('CRS_UNRESOLVED', 'The narrative input needs verified WGS84 coordinates.',
                         'Use prepare_story.py or prepare_itinerary.py on the uploaded source first.')
    if isinstance(chapter_seconds, bool) or not isinstance(chapter_seconds, (int,float)) or not math.isfinite(chapter_seconds) or not 1 <= chapter_seconds <= 60:
        raise BuildError('CHAPTER_DURATION', 'Chapter duration must be between 1 and 60 seconds.',
                         'Choose an editorial duration; it does not represent travel or historical speed.')
    rows = []
    if isinstance(data.get('events'), list):
        for event in data['events']:
            rows.append({'name':event.get('title', event.get('id', '')),
                         'description':event.get('summary', ''), 'coordinates':event.get('coordinates'),
                         'route':event.get('routeFromPrevious'), 'image':event.get('image')})
    elif isinstance(data.get('days'), list):
        for day in data['days']:
            day_route = day.get('route')
            if day_route:
                if not isinstance(day_route, dict) or day_route.get('type') != 'LineString':
                    raise BuildError('ROUTE_GEOMETRY', 'A supplied day route must be a LineString.',
                                     'Keep the uploaded path as one route overview, or normalize its geometry first.')
                coordinates = day_route.get('coordinates')
                if not coordinates:
                    raise BuildError('ROUTE_GEOMETRY', 'The day route has no coordinates.', 'Check the supplied LineString.')
                rows.append({'name':f"{day.get('label', day.get('date', ''))} · 路线概览",
                             'description':day.get('summary', ''), 'coordinates':coordinates[-1],
                             'route':coordinates, 'routeKind':day.get('routeKind', 'provided')})
            for stop in day.get('stops', []):
                rows.append({'name':stop.get('name', stop.get('id', '')),
                             'description':stop.get('summary', ''), 'coordinates':stop.get('coordinates'),
                             'route':stop.get('routeFromPrevious'), 'image':stop.get('image'),
                             'chapterTitle':f"{day.get('label', day.get('date', ''))} · {stop.get('name', '')}"})
    else:
        raise BuildError('NARRATIVE_INPUT', 'Expected normalized story events or itinerary days.',
                         'Prepare narrative data first, or author a scene plan for other datasets.')
    if not rows:
        raise BuildError('EMPTY_DATA', 'There are no narrative locations.', 'Check the input records.')
    # Stable generated identifiers do not replace or modify the source data.
    locations, routes, chapters = [], [], []
    previous = None
    for index, row in enumerate(rows):
        key = f'location-{index+1}'
        location = {'id':key, 'name':row['name'], 'description':row['description'], 'coordinates':row['coordinates']}
        if row.get('image'):
            location['image'] = row['image']
        locations.append(location)
        route_id = None
        geometry = row.get('route')
        if isinstance(geometry, dict):
            if geometry.get('type') != 'LineString':
                raise BuildError('ROUTE_GEOMETRY', 'A supplied chapter route must be a LineString.',
                                 'Split or normalize the provided route geometry before preparing the scene.')
            geometry = geometry.get('coordinates')
        kind = row.get('routeKind', 'provided')
        if not geometry and schematic_links and previous is not None:
            geometry = [previous, row['coordinates']]
            kind = 'schematic'
        if geometry:
            route_id = f'route-{index+1}'
            routes.append({'id':route_id, 'coordinates':geometry, 'kind':kind})
        from_center = geometry[0] if geometry else previous if previous is not None else row['coordinates']
        zoom = 12 if 'days' in data else 6
        def pose(center, zoom_value):
            item = {'center':center, 'zoom':zoom_value, 'pitch':0 if provider=='static' else 40, 'bearing':0}
            if provider == 'cesium':
                item['height'] = 15000 if 'days' in data else 200000
            return item
        chapter = {'id':f'chapter-{index+1}', 'start':index*chapter_seconds, 'end':(index+1)*chapter_seconds,
                   'title':row.get('chapterTitle') or row['name'], 'text':row['description'], 'locationId':key,
                   'camera':{'from':pose(from_center, zoom-1 if index else zoom),
                             'to':pose(row['coordinates'], zoom)}}
        if route_id:
            chapter['routeId'] = route_id
            chapter['routeProgress'] = {'from':0, 'to':1}
            chapter['camera']['followRoute'] = True
        chapters.append(chapter)
        previous = row['coordinates']
    return validate_scene({'schemaVersion':1, 'title':data.get('title', '地图故事'), 'provider':provider,
                           'metadata':{**data['metadata'], 'routeSemantics':'schematic' if schematic_links else 'provided-only',
                                       'timing':'Editorial chapter durations, not travel or historical speed'},
                           'duration':len(rows)*chapter_seconds, 'fps':30, 'width':1920, 'height':1080,
                           'locations':locations, 'routes':routes, 'chapters':chapters, 'audio':[]}, provider=provider)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('data', type=Path)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--provider', choices=PROVIDERS, default='maplibre')
    parser.add_argument('--chapter-seconds', type=float, default=4)
    parser.add_argument('--schematic-links', action='store_true', help='Explicitly add straight schematic chapter links when route geometry is absent')
    args = parser.parse_args()
    try:
        if args.out.exists():
            raise BuildError('OUTPUT_EXISTS', 'Scene output exists.', 'Choose a new filename.')
        result = prepare(read_object(args.data, 'Narrative data'), provider=args.provider,
                         chapter_seconds=args.chapter_seconds, schematic_links=args.schematic_links)
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8')
    except (ValueError, TypeError, OSError) as exc:
        parser.exit(2, diagnostic(exc))
    print(json.dumps({'scene':str(args.out.resolve()), 'chapters':len(result['chapters']),
                      'routes':len(result['routes']), 'duration':result['duration']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
