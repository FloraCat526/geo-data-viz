import test from 'node:test';
import assert from 'node:assert/strict';
import { CRS, validateCoordinate, outOfChina, transformCoordinate, conversionMetadata } from '../assets/adapters/coords.mjs';

test('reject invalid and unknown input instead of coercing null into zero', () => {
  for (const value of [null, [], [null, 1], ['', 1], [NaN, 2], [Infinity, 2], [181, 0], [0, 91], ['116', '39']]) assert.throws(() => validateCoordinate(value));
  assert.deepEqual(validateCoordinate([0, 0]), [0, 0]);
  assert.throws(() => transformCoordinate([116, 39], 'unknown', 'wgs84'));
});

test('Beijing transformations approximate expected offsets and round-trip', () => {
  const beijing = [116.404, 39.915];
  const gcj = transformCoordinate(beijing, 'wgs84', 'gcj02');
  assert.ok(Math.abs(gcj[0] - 116.4102445) < 1e-6);
  assert.ok(Math.abs(gcj[1] - 39.9164043) < 1e-6);
  for (const target of CRS) {
    const result = transformCoordinate(transformCoordinate(beijing, 'wgs84', target), target, 'wgs84');
    assert.ok(Math.abs(result[0] - beijing[0]) < 2e-6);
    assert.ok(Math.abs(result[1] - beijing[1]) < 2e-6);
  }
});

test('same CRS returns a copy; transitions always start from raw data', () => {
  const raw = [116.404, 39.915];
  const source = [...raw];
  const gcj = transformCoordinate(raw, 'wgs84', 'gcj02');
  assert.deepEqual(transformCoordinate(gcj, 'gcj02', 'gcj02'), gcj);
  assert.notEqual(transformCoordinate(raw, 'wgs84', 'wgs84'), raw);
  for (let i = 0; i < 10; i++) {
    assert.deepEqual(transformCoordinate(raw, 'wgs84', 'gcj02'), gcj);
    transformCoordinate(raw, 'wgs84', 'bd09');
  }
  assert.deepEqual(raw, source);
});

test('Singapore is preserved across all systems, no blind BD09 shift', () => {
  const singapore = [103.8198, 1.3521];
  // Singapore lies inside the conventional longitude/latitude bounding rectangle!
  // A latitude-only box is insufficient; this test is the geographic regression guard.
  assert.equal(outOfChina(...singapore), true);
  for (const from of CRS) for (const to of CRS) assert.deepEqual(transformCoordinate(singapore, from, to), singapore);
  assert.equal(conversionMetadata('wgs84', 'gcj02').approximate, true);
  assert.equal(conversionMetadata('bd09', 'bd09').approximate, false);
});
