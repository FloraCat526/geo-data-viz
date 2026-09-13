# Geographic data contract

Read when ingesting data or wiring the normalized dataset to a renderer. `scripts/profile_geo.py` runs locally without network requests, geocoding, or coordinate conversion.

## Run

```bash
python3 scripts/profile_geo.py /path/to/data.csv --out-dir /path/to/work/profile
python3 scripts/profile_geo.py /path/to/data.csv --out-dir /path/to/work/profile \
  --crs wgs84 --lng-field longitude --lat-field latitude \
  --value-field population --label-field city --category-field region --time-field date
```

`--out-dir` is required. `--crs` accepts `wgs84`, `gcj02`, `bd09`, `unknown` and describes the **source** coordinates. Establish it from source documentation/user knowledge; numeric ranges cannot identify a datum. A CLI `--crs` overrides any source declaration with a warning. It does not transform coordinates.

Inputs:

- CSV/TSV with a header, UTF-8 (including BOM) or GB18030. Whitespace in numeric cells is accepted. Duplicate/empty headers fail explicitly. Row numbers refer to data records, excluding the header; quoted multiline records count once.
- JSON arrays of objects, `{ "records": [...] }`, or `{ "data": [...] }`. Ambiguous roots need explicit extraction.
- GeoJSON FeatureCollection, Feature, or geometry; Point, MultiPoint, LineString, MultiLineString, Polygon, MultiPolygon, and GeometryCollection. Standard GeoJSON defaults to WGS84, with longitude before latitude. Legacy `crs` or `metadata.dataCrs` declarations are retained in the profile and examined; a non-WGS84 declaration is never silently relabeled WGS84. An unrecognized projected CRS requires reprojection upstream.
- `.xlsx`/`.xlsm` only when `openpyxl` is already available. `--sheet NAME` selects a sheet; otherwise the active sheet is used and available sheet names are reported. Cached formula results are read (`data_only=True`); missing caches remain missing. Empty Excel rows are skipped. Export legacy `.xls` to CSV/XLSX first.

Exit code `0` means the analysis ran, including actionable incomplete states. It does not imply all records can be mapped. Exit code `2` means an input/CLI error. Read `profile.status` and counts rather than inferring readiness from the process exit code.

## Analysis and decisions

`profile.json` contains:

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Contract version, currently `1`. |
| `status` | `ready`, `needs_crs`, `needs_coordinates`, or `needs_geocoding`. |
| `dataCrs` | Source coordinate datum; no transformations have occurred. |
| `source` | Input filename, content SHA-256, format/encoding, sheet metadata when relevant, and original CRS declaration when present. |
| `roles` | Resolved `lng`, `lat`, `value`, `label`, `category`, `time` field names, otherwise `null`. |
| `roleCandidates` | Candidate columns, including `address`; hints for interpretation, not an assertion of business semantics. |
| `counts` | Input/valid/invalid counts, geometry types, vertex counts, duplicate records and duplicate point locations. |
| `invalidRows` | Every excluded record's row index and reasons; source feature ID if present. |
| `fields` | Per-column missing/nonmissing, finite numeric count, unique count, identifier hint, quantiles, limited top values, and parsed time ranges. |
| `spatial` | Conventional and antimeridian-aware bounds, center, zero-point/polar counts, optional rough WGS84 polygon area. |
| `warnings` | Actionable qualifications including metric/time gaps and nonstandard CRS. |
| `recommendations` | Data-supported visualization candidates and unmet prerequisites. |

State meanings:

- `ready`: at least one valid geometry and a known source datum. Inspect invalid counts and warnings; readiness does not certify every record or every provider.
- `needs_crs`: valid geometries exist but their datum is unknown. Inspect the source before drawing them over a provider basemap.
- `needs_coordinates`: coordinate roles are missing/ambiguous, all geometries are invalid, or the dataset is empty. User/source clarification or a separate transformation may be required.
- `needs_geocoding`: no usable coordinate columns were found and an address/city/place field exists. Resolve addresses only in an explicit enrichment workflow with the selected service, preserve match confidence/status, and rerun the profiler. Do not manufacture coordinates.

Longitude/latitude aliases are selected only when unique. Override ambiguous/custom names with `--lng-field` and `--lat-field`. A numeric measure is **never auto-bound**: choose a meaningful candidate after considering units and record grain, then rerun with `--value-field`. ID/code/postcode-like columns and coordinate/time roles are excluded from numeric suggestions. This is heuristic; review the candidate's business meaning. If no quantitative measure exists, equal-size points can display locations or an explicitly aggregated count can display density.

Missing, blank, `null`, `NaN`, nonfinite, and invalid numeric values do not become zero. `(0,0)` is retained with a warning because it can be real or a source sentinel. Duplicate records/locations are counted and retained; aggregation/deduplication requires an explicit semantic rule. Potentially reversed longitude/latitude is reported and never silently swapped. Valid ranges are longitude `[-180,180]`, latitude `[-90,90]`; valid polar points may exceed Web Mercator's display range.

GeoJSON coordinates must already be finite JSON numbers, including altitude when present. Lines need two positions; polygon rings need at least four positions, closure, and at least three distinct XY positions. These checks do not certify self-intersection, topology, or ring winding. Polygon area is a rough spherical WGS84 estimate with holes subtracted; skip it for non-WGS84/unknown data and never use it as a legal or survey measurement.

Time parsing accepts ISO dates/timestamps and unambiguous `YYYY/MM/DD`. Zoned timestamps normalize to UTC, while unzoned timestamps retain unspecified timezone. Their ranges are kept separate. Epoch units, ambiguous regional dates, and inferred timezones need an explicit parser. The normalization does not invent observations between timestamps.

## Normalized output

`normalized.geojson` is a JSON FeatureCollection. Its `metadata` repeats `schemaVersion`, `status`, `dataCrs`, `roles`, `warnings`, and `source`. For `gcj02`, `bd09`, or `unknown`, this file is **GeoJSON-shaped source geometry**, not an assertion of RFC 7946 compliance. The explicit `metadata.dataCrs` is mandatory downstream.

```json
{
  "type": "FeatureCollection",
  "metadata": {
    "schemaVersion": 1,
    "status": "ready",
    "dataCrs": "wgs84",
    "roles": {"lng":"lng","lat":"lat","value":"visitors","label":"name","category":null,"time":null},
    "warnings": [],
    "source": {"fileName":"places.csv"}
  },
  "features": [{
    "type": "Feature",
    "id": "f_contenthash",
    "geometry": {"type":"Point","coordinates":[103.85,1.29]},
    "properties": {
      "lng":"103.85", "lat":"1.29", "name":"Example", "visitors":"125",
      "__viz":{"value":125,"label":"Example","category":null,"time":null}
    }
  }]
}
```

Source properties remain available; invalid JSON nonfinite property values become `null` with warnings. Existing `__viz` values are copied to `__source_viz` (prefixed with more `_` if needed). Original GeoJSON feature IDs are copied to `__source_feature_id`, also collision-safe. Generated feature IDs derive from canonical source-record content with a duplicate suffix. Unique source records keep their ID across row reordering and across role/CRS selections; modifying a source record changes its ID.

`properties.__viz` always supplies:

- `value`: finite number or `null`; `null` means missing or no metric selected.
- `label`: source label, otherwise `Record N`.
- `category`: source value as a string or `null`.
- `time`: normalized parsable timestamp/date string or `null`.

Bind one canonical dataset to all providers. If a provider requires another datum, derive a temporary provider-specific geometry copy using a verified transformation and retain the source dataset unchanged. Preserve feature IDs and `__viz` through transformations. Provider switching must not redo aggregation, mutate source coordinates, or change metric scales without an explicit user change.

`spatial.bounds` is `[minLng,minLat,maxLng,maxLat]`. `wrappedBounds` is `[west,south,east,north]` over the smallest longitude arc; `west > east` means it crosses the antimeridian. Use wrapping-aware bounds/center in the viewport controller. A naive fit of `[-179,...,179,...]` otherwise shows most of the world.
