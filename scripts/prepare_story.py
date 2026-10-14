#!/usr/bin/env python3
"""Convert user-supplied ordered points into a story timeline, without routing or geocoding."""
import argparse
import csv
import json
import math
import re
from pathlib import Path

from build_story_html import validate


def load_records(path):
    path = Path(path)
    if path.suffix.lower() in ('.csv', '.tsv'):
        with path.open(encoding='utf-8-sig', newline='') as handle:
            return list(csv.DictReader(handle, delimiter='\t' if path.suffix.lower() == '.tsv' else ','))
    data = json.loads(path.read_text(encoding='utf-8'))
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and data.get('type') == 'FeatureCollection':
        records = []
        for feature in data.get('features', []):
            if feature.get('geometry', {}).get('type') != 'Point':
                raise ValueError('Only Point features are accepted; bind supplied routes in normalized JSON')
            records.append({**feature.get('properties', {}), '__coordinates': feature['geometry']['coordinates']})
        return records
    raise ValueError('Input must be CSV, TSV, JSON record array, or Point GeoJSON')


def build(source, out, *, crs, order_field='order', id_field='id', title_field='title',
          lng_field='longitude', lat_field='latitude', date_field='date', chapter_field='chapter',
          summary_field='summary', title='故事地图', subtitle='', overwrite=False):
    source, out = Path(source), Path(out)
    if source.resolve() == out.resolve():
        raise ValueError('Output must not replace input data')
    if out.exists() and not overwrite:
        raise ValueError('Output exists; pass --overwrite')
    if crs != 'wgs84':
        raise ValueError('Confirm source CRS as WGS84; this tool does not transform coordinates')
    rows = load_records(source)
    if not rows:
        raise ValueError('No story events found')
    events = []
    orders = set()
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError('Every record must be an object')
        try:
            raw_order = row[order_field]
            if isinstance(raw_order, bool) or not re.fullmatch(r'-?\d+', str(raw_order).strip()):
                raise ValueError()
            order = int(raw_order)
        except (KeyError, TypeError, ValueError):
            raise ValueError(f'Every event needs integer {order_field}') from None
        if order in orders:
            raise ValueError('Event order values must be unique')
        orders.add(order)
        coordinates = row.get('__coordinates')
        if coordinates is None:
            try:
                coordinates = [float(row[lng_field]), float(row[lat_field])]
            except (KeyError, TypeError, ValueError):
                raise ValueError('Every event needs numeric WGS84 longitude and latitude') from None
        if len(coordinates) != 2 or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in coordinates):
            raise ValueError('Invalid event coordinates')
        event = {'id': str(row.get(id_field) or f'event-{order}'), 'title': str(row.get(title_field) or '').strip(),
                 'coordinates': list(coordinates)}
        for source_field, destination in ((date_field, 'date'), (chapter_field, 'chapter'), (summary_field, 'summary')):
            value = row.get(source_field)
            if value not in (None, ''):
                event[destination] = str(value)
        events.append((order, event))
    events.sort(key=lambda pair: pair[0])
    result = {'title': title, 'subtitle': subtitle, 'metadata': {'dataCrs': 'wgs84'}, 'events': [event for _, event in events]}
    validate(result)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open('w' if overwrite else 'x', encoding='utf-8') as handle:
        json.dump(result, handle, ensure_ascii=False, indent=2)
        handle.write('\n')
    return out


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source')
    parser.add_argument('--out', required=True)
    parser.add_argument('--crs', required=True, choices=['wgs84'])
    for field in ('order', 'id', 'title', 'longitude', 'latitude', 'date', 'chapter', 'summary'):
        parser.add_argument(f'--{field}-field', default=field)
    parser.add_argument('--title', default='故事地图')
    parser.add_argument('--subtitle', default='')
    parser.add_argument('--overwrite', action='store_true')
    args = parser.parse_args()
    try:
        print(f'Prepared {build(args.source, args.out, crs=args.crs, order_field=args.order_field, id_field=args.id_field, title_field=args.title_field, lng_field=args.longitude_field, lat_field=args.latitude_field, date_field=args.date_field, chapter_field=args.chapter_field, summary_field=args.summary_field, title=args.title, subtitle=args.subtitle, overwrite=args.overwrite)}')
    except (ValueError, TypeError, OSError, KeyError, json.JSONDecodeError) as error:
        parser.exit(2, f'{error}\n')
