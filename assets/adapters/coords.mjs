/** Local, approximate display conversions. Never infer a CRS from coordinate ranges. */
export const CRS = Object.freeze(['wgs84', 'gcj02', 'bd09']);
const PI = Math.PI;
const A = 6378245.0;
const EE = 0.006693421622965943;
const X_PI = PI * 3000 / 180;

export function validateCoordinate(pair) {
  if (!Array.isArray(pair) || pair.length < 2 ||
      typeof pair[0] !== 'number' || typeof pair[1] !== 'number' ||
      !Number.isFinite(pair[0]) || !Number.isFinite(pair[1]) ||
      pair[0] < -180 || pair[0] > 180 || pair[1] < -90 || pair[1] > 90) {
    throw new Error('坐标必须是有效的 [经度, 纬度] 数字，范围为 ±180 / ±90。');
  }
  return [pair[0], pair[1]];
}

/** Conservative display guard, not a political or precise mainland boundary. */
export function outOfChina(lng, lat) {
  validateCoordinate([lng, lat]);
  // The commonly copied 0.8293° lower bound wrongly shifts Singapore and much of SE Asia.
  // 18° keeps those datasets unchanged while covering the mainland/Hainan display area.
  return lng < 72.004 || lng > 137.8347 || lat < 18 || lat > 55.8271;
}

function checkCrs(crs) {
  if (!CRS.includes(crs)) throw new Error('必须明确指定坐标系：wgs84、gcj02 或 bd09；unknown 不能转换。');
}

function latitudeDelta(x, y) {
  let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  r += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3;
  r += (20 * Math.sin(y * PI) + 40 * Math.sin(y / 3 * PI)) * 2 / 3;
  return r + (160 * Math.sin(y / 12 * PI) + 320 * Math.sin(y * PI / 30)) * 2 / 3;
}

function longitudeDelta(x, y) {
  let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  r += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3;
  r += (20 * Math.sin(x * PI) + 40 * Math.sin(x / 3 * PI)) * 2 / 3;
  return r + (150 * Math.sin(x / 12 * PI) + 300 * Math.sin(x / 30 * PI)) * 2 / 3;
}

function wgsToGcj([lng, lat]) {
  const rad = lat / 180 * PI;
  const magic = 1 - EE * Math.sin(rad) ** 2;
  const sqrt = Math.sqrt(magic);
  const dlat = latitudeDelta(lng - 105, lat - 35) * 180 / ((A * (1 - EE)) / (magic * sqrt) * PI);
  const dlng = longitudeDelta(lng - 105, lat - 35) * 180 / (A / sqrt * Math.cos(rad) * PI);
  return [lng + dlng, lat + dlat];
}

function gcjToWgs(pair) {
  // Iterative inversion improves numerical round-tripping; the model itself remains approximate.
  let estimate = [...pair];
  for (let i = 0; i < 8; i++) {
    const shifted = wgsToGcj(estimate);
    const dx = shifted[0] - pair[0], dy = shifted[1] - pair[1];
    estimate = [estimate[0] - dx, estimate[1] - dy];
    if (Math.abs(dx) + Math.abs(dy) < 1e-10) break;
  }
  return estimate;
}

function gcjToBd([x, y]) {
  const z = Math.sqrt(x * x + y * y) + 0.00002 * Math.sin(y * X_PI);
  const theta = Math.atan2(y, x) + 0.000003 * Math.cos(x * X_PI);
  return [z * Math.cos(theta) + 0.0065, z * Math.sin(theta) + 0.006];
}

function bdToGcj([lng, lat]) {
  const x = lng - 0.0065, y = lat - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * X_PI);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * X_PI);
  return [z * Math.cos(theta), z * Math.sin(theta)];
}

export function transformCoordinate(pair, from, to) {
  checkCrs(from); checkCrs(to);
  const value = validateCoordinate(pair);
  if (from === to || outOfChina(...value)) return value;
  const gcj = from === 'wgs84' ? wgsToGcj(value) : from === 'bd09' ? bdToGcj(value) : value;
  return to === 'gcj02' ? gcj : to === 'wgs84' ? gcjToWgs(gcj) : gcjToBd(gcj);
}

export function conversionMetadata(from, to) {
  checkCrs(from); checkCrs(to);
  return {
    from, to, approximate: from !== to,
    method: from === to ? 'identity' : 'local-approximate-display-conversion',
    outsideGuard: 'preserve-input',
    note: from === to ? '同一坐标系，保留原始坐标。' :
      '仅用于地图展示的本地近似转换，不具测绘精度。境外采用保留原坐标策略，不盲套 GCJ/BD 偏移；范围判断仅为粗略矩形，边界附近及邻国数据需核对供应商坐标契约。始终从原始数据转换，不重复转换。',
  };
}
