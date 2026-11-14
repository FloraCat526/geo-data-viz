/** Geo Data Viz — MIT. Pure numeric-time helpers; no Date parsing or timezone conversion. */

function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`);
  }
  return value;
}

function timesOf(records, timeOf, allowEmpty) {
  if (!Array.isArray(records) || (!allowEmpty && records.length === 0)) {
    throw new TypeError(`records must be ${allowEmpty ? 'an array' : 'a nonempty array'}`);
  }
  if (typeof timeOf !== 'function') throw new TypeError('An explicit timeOf function is required');
  const times = Array.from(records, (record, index) => {
    if (!Object.hasOwn(records, index)) throw new TypeError(`Missing record at index ${index}`);
    return finite(timeOf(record, index), `timeOf(records[${index}])`);
  });
  for (let index = 1; index < times.length; index++) {
    if (times[index] < times[index - 1]) throw new RangeError('records must be sorted by nondecreasing time');
  }
  return times;
}

function lastThrough(times, time) {
  let low = 0, high = times.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (times[middle] <= time) low = middle + 1;
    else high = middle;
  }
  return low - 1;
}

function fraction(value, start, end) {
  if (value < start) return 0;
  if (value >= end) return 1;
  // Halving avoids overflow when two finite endpoints span more than Number.MAX_VALUE.
  return Number.isFinite(end - start)
    ? (value - start) / (end - start)
    : (value / 2 - start / 2) / (end / 2 - start / 2);
}

/**
 * Sample an explicitly timed track without revealing future observations.
 * point is [longitude, latitude]; observed is the original last record at or before time.
 * progress spans the whole source time range; segmentProgress spans the current pair.
 * coordinates contains reached observations plus the interpolated endpoint, without modifying input.
 * A one-instant track has progress 0 before its time and 1 from that time onward.
 * Longitude jumps >180° are rejected: split antimeridian-crossing tracks before sampling.
 */
export function sampleTimedTrack(records, time, {timeOf, coordinateOf} = {}) {
  finite(time, 'time');
  const times = timesOf(records, timeOf, false);
  if (typeof coordinateOf !== 'function') throw new TypeError('An explicit coordinateOf function is required');
  const positions = records.map((record, index) => {
    const position = coordinateOf(record, index);
    if (!Array.isArray(position) || position.length !== 2) {
      throw new TypeError(`coordinateOf(records[${index}]) must return [longitude, latitude]`);
    }
    const [longitude, latitude] = position;
    finite(longitude, `longitude at index ${index}`);
    finite(latitude, `latitude at index ${index}`);
    if (Math.abs(longitude) > 180 || Math.abs(latitude) > 90) {
      throw new RangeError(`Invalid longitude/latitude at index ${index}`);
    }
    return [longitude, latitude];
  });
  for (let index = 1; index < positions.length; index++) {
    if (Math.abs(positions[index][0] - positions[index - 1][0]) > 180) {
      throw new RangeError('Antimeridian crossing: split the track into separate segments');
    }
  }
  const index = lastThrough(times, time);
  if (index < 0) {
    return {index: -1, observed: null, point: [...positions[0]], coordinates: [], progress: 0, segmentProgress: 0};
  }
  const progress = fraction(time, times[0], times.at(-1));
  const segmentProgress = index === records.length - 1 ? 1 : fraction(time, times[index], times[index + 1]);
  const point = index === records.length - 1
    ? [...positions[index]]
    : positions[index].map((value, axis) => value + (positions[index + 1][axis] - value) * segmentProgress);
  const coordinates = positions.slice(0, index + 1);
  if (index < records.length - 1 && segmentProgress > 0) coordinates.push([...point]);
  return {index, observed: records[index], point, coordinates, progress, segmentProgress};
}

/** Return reached records, including all equal-time events, preserving order and original objects. */
export function eventsThroughTime(records, time, {timeOf} = {}) {
  finite(time, 'time');
  const times = timesOf(records, timeOf, true);
  return records.slice(0, lastThrough(times, time) + 1);
}

/**
 * Map a composition frame to numeric source time, holding start/end for intro/outro frames.
 * fps must match a valid positive composition rate; the mapping uses frame ratios, not Date/UTC.
 * Frames are integers in [0, durationInFrames - 1]; end >= start. The final frame reaches end.
 * At least one data frame must remain. A single data frame jumps to end (including a one-frame video).
 */
export function dataTimeAtFrame(frame, {fps, durationInFrames, start, end, introFrames = 0, outroFrames = 0} = {}) {
  finite(fps, 'fps');
  if (fps <= 0) throw new RangeError('fps must be positive');
  for (const [label, value] of Object.entries({frame, durationInFrames, introFrames, outroFrames})) {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} must be a nonnegative safe integer`);
  }
  if (durationInFrames < 1 || frame >= durationInFrames) {
    throw new RangeError('frame must be within a positive durationInFrames');
  }
  if (introFrames + outroFrames >= durationInFrames) {
    throw new RangeError('introFrames and outroFrames must leave at least one data frame');
  }
  finite(start, 'start');
  finite(end, 'end');
  if (end < start) throw new RangeError('end must not be earlier than start');
  const lastDataFrame = durationInFrames - outroFrames - 1;
  if (frame < introFrames) return start;
  if (frame >= lastDataFrame) return end;
  const progress = (frame - introFrames) / (lastDataFrame - introFrames);
  return start * (1 - progress) + end * progress;
}
