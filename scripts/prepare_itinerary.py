#!/usr/bin/env python3
"""Turn user-supplied stops and optional routes into a verified itinerary JSON."""
import argparse
import csv
import json
import re
from collections import OrderedDict
from pathlib import Path

from build_itinerary_html import validate

PALETTE = ('#37699c', '#c57c48', '#657f70', '#a66d8c', '#7469a6')


def read_records(path):
    path = Path(path)
    if path.suffix.lower() in ('.csv', '.tsv'):
        with path.open(encoding='utf-8-sig', newline='') as stream:
            reader = csv.DictReader(stream, delimiter='\t' if path.suffix.lower() == '.tsv' else ',')
            if not reader.fieldnames or any(name is None or not name.strip() for name in reader.fieldnames):
                raise ValueError('Stop table needs a nonempty header row')
            if len(set(reader.fieldnames)) != len(reader.fieldnames):
                raise ValueError('Stop table contains duplicate column names')
            rows = list(reader)
        return rows, []
    if path.suffix.lower() not in ('.json', '.geojson'):
        raise ValueError('Input must be CSV, TSV, JSON, or GeoJSON')
    data = json.loads(path.read_text(encoding='utf-8'))
    if isinstance(data, list):
        return data, []
    if not isinstance(data, dict):
        raise ValueError('JSON must be an array, a records object, or a GeoJSON FeatureCollection')
    metadata = data.get('metadata', {})
    if not isinstance(metadata, dict) or metadata.get('dataCrs', 'wgs84') != 'wgs84':
        raise ValueError('Input metadata conflicts with verified WGS84')
    if data.get('type') == 'FeatureCollection':
        declared_crs = data.get('crs')
        if declared_crs is not None:
            name = declared_crs.get('properties', {}).get('name') if isinstance(declared_crs, dict) else None
            if not isinstance(name, str) or name.lower() not in ('epsg:4326', 'crs84', 'urn:ogc:def:crs:ogc:1.3:crs84'):
                raise ValueError('GeoJSON CRS declaration conflicts with verified WGS84')
        if not isinstance(data.get('features'), list):
            raise ValueError('GeoJSON features must be an array')
        points, routes = [], []
        for index, feature in enumerate(data['features'], 1):
            if not isinstance(feature, dict) or not isinstance(feature.get('properties'), dict):
                raise ValueError(f'Feature {index} needs properties')
            geometry = feature.get('geometry')
            if not isinstance(geometry, dict):
                raise ValueError(f'Feature {index} needs geometry')
            row = {**feature['properties'], '__geometry': geometry}
            if geometry.get('type') == 'Point':
                points.append(row)
            elif geometry.get('type') == 'LineString':
                routes.append(row)
            else:
                raise ValueError(f'Feature {index} must be Point or LineString')
        return points, routes
    if isinstance(data.get('records'), list):
        return data['records'], []
    raise ValueError('JSON must contain records or a GeoJSON FeatureCollection')


def value(row, field, label, *, required=False):
    if not isinstance(row, dict):
        raise ValueError(f'{label} must be an object')
    if not field:
        return ''
    if field not in row:
        raise ValueError(f'Missing {label} field: {field}')
    result = row[field]
    if result is None:
        result = ''
    if not isinstance(result, (str, int, float)) or isinstance(result, bool):
        raise ValueError(f'{label} field {field} must be text or a number')
    result = str(result).strip()
    if required and not result:
        raise ValueError(f'{label} field {field} must not be empty')
    return result


def coordinate(row, lng_field, lat_field):
    geometry = row.get('__geometry')
    if geometry is not None:
        if geometry.get('type') != 'Point':
            raise ValueError('Stop geometry must be Point')
        return geometry.get('coordinates')
    try:
        return [float(value(row, lng_field, 'longitude', required=True)),
                float(value(row, lat_field, 'latitude', required=True))]
    except (TypeError, ValueError) as error:
        raise ValueError('Stop coordinates must be numeric WGS84 longitude and latitude') from error


def build(source, target, *, crs, day_field='day', order_field='order', name_field='name',
          lng_field='longitude', lat_field='latitude', id_field=None, time_field=None,
          tag_field=None, summary_field=None, day_label_field=None, date_field=None,
          detail_fields=(), routes=None, route_day_field=None, single_day=False,
          row_order=False, title='旅行规划', overwrite=False):
    source, target = Path(source), Path(target)
    if crs.lower() != 'wgs84':
        raise ValueError('Itinerary input must be verified WGS84; reproject before conversion')
    if source.resolve() == target.resolve() or routes and Path(routes).resolve() == target.resolve():
        raise ValueError('Output must not replace input data')
    if target.exists() and not overwrite:
        raise ValueError('Output exists; choose another path or pass --overwrite')
    if not title or not isinstance(title, str):
        raise ValueError('Title must be nonempty text')
    rows, embedded_routes = read_records(source)
    if not rows:
        raise ValueError('No stop rows found')
    if routes:
        route_points, extra_routes = read_records(routes)
        if route_points:
            raise ValueError('Route file must contain only LineString features')
        embedded_routes += extra_routes
    if detail_fields and any(not isinstance(item, tuple) or len(item) != 2 for item in detail_fields):
        raise ValueError('detail_fields must contain (label, field) pairs')

    days = OrderedDict()
    used_ids = set()
    for index, row in enumerate(rows, 1):
        if not isinstance(row, dict):
            raise ValueError(f'Stop row {index} must be an object')
        day_key = '1' if single_day else value(row, day_field, f'row {index} day', required=True)
        if day_key not in days:
            number = len(days) + 1
            days[day_key] = {'id': f'day-{number}', 'label': f'第 {number} 天',
                             'color': PALETTE[(number - 1) % len(PALETTE)],
                             'stops': [], '__orders': set()}
        day = days[day_key]
        if day_label_field:
            label = value(row, day_label_field, f'row {index} day label', required=True)
            if '__source_label' in day and day['__source_label'] != label:
                raise ValueError(f'Conflicting labels for day {day_key}')
            day['__source_label'] = label
            day['label'] = label
        date = value(row, date_field, f'row {index} date') if date_field else day_key if re.fullmatch(r'\d{4}-\d{2}-\d{2}', day_key) else ''
        if date:
            if day.get('date') and day['date'] != date:
                raise ValueError(f'Conflicting dates for day {day_key}')
            day['date'] = date
        order_text = str(index) if row_order else value(row, order_field, f'row {index} order', required=True)
        if not re.fullmatch(r'[1-9]\d*', order_text):
            raise ValueError(f'Row {index} order must be a positive integer')
        order = int(order_text)
        if order in day['__orders']:
            raise ValueError(f'Duplicate order {order} for day {day_key}')
        day['__orders'].add(order)
        stop_id = value(row, id_field, f'row {index} ID', required=True) if id_field else f'stop-{index}'
        if stop_id in used_ids:
            raise ValueError(f'Duplicate stop ID: {stop_id}')
        used_ids.add(stop_id)
        stop = {'id': stop_id, 'name': value(row, name_field, f'row {index} name', required=True),
                'coordinates': coordinate(row, lng_field, lat_field), '__order': order}
        for output_field, source_field in [('time', time_field), ('tag', tag_field), ('summary', summary_field)]:
            if source_field:
                text = value(row, source_field, f'row {index} {output_field}')
                if text:
                    stop[output_field] = text
        details = []
        for label, field in detail_fields:
            text = value(row, field, f'row {index} detail')
            if text:
                details.append({'label': label, 'text': text})
        if details:
            stop['details'] = details
        day['stops'].append(stop)

    for day in days.values():
        day['stops'].sort(key=lambda stop: stop.pop('__order'))
        del day['__orders']
        day.pop('__source_label', None)
    for index, row in enumerate(embedded_routes, 1):
        field = route_day_field or day_field
        day_key = '1' if single_day else value(row, field, f'route {index} day', required=True)
        if day_key not in days:
            raise ValueError(f'Route {index} refers to an unknown day: {day_key}')
        if 'route' in days[day_key]:
            raise ValueError(f'More than one route is assigned to day {day_key}')
        days[day_key]['route'] = row['__geometry']

    result = {'metadata': {'dataCrs': 'wgs84'}, 'title': title, 'days': list(days.values())}
    validate(result)
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open('w' if overwrite else 'x', encoding='utf-8') as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2, allow_nan=False)
        stream.write('\n')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', help='CSV/TSV/JSON stop rows or Point GeoJSON')
    parser.add_argument('--out', required=True)
    parser.add_argument('--crs', required=True, help='Verified source coordinate system; this tool accepts only wgs84')
    parser.add_argument('--day-field', default='day')
    parser.add_argument('--order-field', default='order')
    parser.add_argument('--name-field', default='name')
    parser.add_argument('--lng-field', default='longitude')
    parser.add_argument('--lat-field', default='latitude')
    parser.add_argument('--id-field')
    parser.add_argument('--time-field')
    parser.add_argument('--tag-field')
    parser.add_argument('--summary-field')
    parser.add_argument('--day-label-field')
    parser.add_argument('--date-field')
    parser.add_argument('--detail-field', action='append', default=[], metavar='LABEL=FIELD')
    parser.add_argument('--routes', help='Optional LineString GeoJSON with day identifier in properties')
    parser.add_argument('--route-day-field')
    parser.add_argument('--single-day', action='store_true', help='Treat every stop as one day')
    parser.add_argument('--row-order', action='store_true', help='Use input row order instead of an order column')
    parser.add_argument('--title', default='旅行规划')
    parser.add_argument('--overwrite', action='store_true')
    args = parser.parse_args()
    try:
        fields = []
        for item in args.detail_field:
            if '=' not in item or not all(part.strip() for part in item.split('=', 1)):
                raise ValueError('--detail-field must be LABEL=FIELD')
            fields.append(tuple(part.strip() for part in item.split('=', 1)))
        result = build(args.source, args.out, crs=args.crs, day_field=args.day_field,
                       order_field=args.order_field, name_field=args.name_field,
                       lng_field=args.lng_field, lat_field=args.lat_field,
                       id_field=args.id_field, time_field=args.time_field,
                       tag_field=args.tag_field, summary_field=args.summary_field,
                       day_label_field=args.day_label_field, date_field=args.date_field,
                       detail_fields=fields, routes=args.routes, route_day_field=args.route_day_field,
                       single_day=args.single_day, row_order=args.row_order,
                       title=args.title, overwrite=args.overwrite)
    except (ValueError, OSError, json.JSONDecodeError, csv.Error) as error:
        parser.exit(2, f'{error}\n')
    schematic = sum(len(day['stops']) > 1 and 'route' not in day for day in result['days'])
    print(f"Prepared {len(result['days'])} days and {sum(len(day['stops']) for day in result['days'])} stops; "
          f"{schematic} day(s) have schematic connections. Wrote {args.out}.")
