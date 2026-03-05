const DEFAULT_STAGE = {
  goalY: 210,
  zoomY: 200,
  spawn: {
    x: 10.25,
    y: 0,
    columns: 10,
    spacingX: 0.6,
    visibleRows: 5,
  },
};

const DEFAULT_OBJECT_COLORS = {
  wall: '#ff7cc8',
  box: '#ff4fa8',
  circle: '#ff62bf',
  portal: '#b68cff',
  blackHole: '#7b55b8',
  whiteHole: '#f8f8f8',
  stopwatch: '#ff5c6f',
  burst: '#5dff7a',
  hammer: '#ffa557',
  bottomBumper: '#58b8ff',
  diamond: '#6affea',
  fan: '#7fd9ff',
  sticky: '#ff8fc9',
  domino: '#ff67be',
  physicsBall: '#ff79cb',
  goalMarker: '#ffc4e7',
  magicWizard: '#ffa66c',
};

const runtimeImageCache = new Map();

function getRuntimeImage(src) {
  const key = toId(src, '');
  if (!key) {
    return null;
  }
  if (runtimeImageCache.has(key)) {
    return runtimeImageCache.get(key);
  }
  let image = null;
  try {
    image = new Image();
    image.decoding = 'async';
    image.src = key;
  } catch (_) {
    image = null;
  }
  runtimeImageCache.set(key, image);
  return image;
}

function toFiniteNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }
  return fallback;
}

function toTruthyBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value !== 0 : fallback;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return fallback;
    }
    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') {
      return false;
    }
  }
  return fallback;
}

function toId(value, fallback) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return fallback;
}

function normalizeGoalMarkerImageSrc(value) {
  const raw = toId(value, '../../background/finish.png');
  const normalized = raw.includes('goal_line_tab1.svg')
    ? '../../background/finish.png'
    : raw;
  let override = '';
  try {
    const candidate = typeof window !== 'undefined'
      ? String(window.__v2GoalMarkerImageDataUrl || '').trim()
      : '';
    const isDataImage = candidate.startsWith('data:image/');
    const isHttpUrl = candidate.startsWith('http://') || candidate.startsWith('https://');
    const isAppAssetPath = candidate.startsWith('/__app_asset/') || candidate.startsWith('__app_asset/');
    if (isDataImage || isHttpUrl || isAppAssetPath) {
      override = candidate;
    }
  } catch (_) {
    override = '';
  }
  if (override) {
    const lower = normalized.toLowerCase();
    const useOverride = lower.includes('goal_line_tab1')
      || lower.includes('finish.png')
      || lower.includes('/background/');
    if (useOverride) {
      return override;
    }
  }
  return normalized;
}

function normalizeMagicWizardImageSrc(value) {
  const raw = toId(value, '../../background/magic.svg');
  let override = '';
  try {
    const candidate = typeof window !== 'undefined'
      ? String(window.__v2MagicWizardImageDataUrl || '').trim()
      : '';
    const isDataImage = candidate.startsWith('data:image/');
    const isHttpUrl = candidate.startsWith('http://') || candidate.startsWith('https://');
    const isAppAssetPath = candidate.startsWith('/__app_asset/') || candidate.startsWith('__app_asset/');
    if (isDataImage || isHttpUrl || isAppAssetPath) {
      override = candidate;
    }
  } catch (_) {
    override = '';
  }
  if (override) {
    const lower = raw.toLowerCase();
    const useOverride = lower.includes('magic.svg') || lower.includes('/background/');
    if (useOverride) {
      return override;
    }
  }
  return raw || '../../background/magic.svg';
}

function isTransparentColorString(value) {
  if (typeof value !== 'string') {
    return true;
  }
  const raw = value.trim();
  if (!raw) {
    return true;
  }
  const rgba = raw.match(/^rgba\(\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*([0-9]*\.?[0-9]+)\s*\)$/i);
  if (rgba) {
    return toFiniteNumber(rgba[1], 1) <= 0.05;
  }
  const hex8 = raw.match(/^#([0-9a-fA-F]{8})$/);
  if (hex8) {
    const alpha = parseInt(hex8[1].slice(6, 8), 16) / 255;
    return alpha <= 0.05;
  }
  const hex4 = raw.match(/^#([0-9a-fA-F]{4})$/);
  if (hex4) {
    const alpha = parseInt(hex4[1].slice(3, 4), 16) / 15;
    return alpha <= 0.05;
  }
  return false;
}

function clamp(value, minValue, maxValue) {
  return Math.min(maxValue, Math.max(minValue, value));
}

function fillPathEvenOdd(ctx) {
  if (!ctx) {
    return;
  }
  try {
    ctx.fill('evenodd');
  } catch (_) {
    ctx.fill();
  }
}

function degToRad(value) {
  return (value * Math.PI) / 180;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeRotationRad(value, fallback = 0) {
  const raw = toFiniteNumber(value, fallback);
  if (!Number.isFinite(raw)) {
    return fallback;
  }
  if (Math.abs(raw) > Math.PI * 2.5) {
    return degToRad(raw);
  }
  return raw;
}

function drawBottomBumperPath(ctx, halfLen, halfHeight) {
  const safeHalfLen = Math.max(0.08, toFiniteNumber(halfLen, 0.98));
  const safeHalfHeight = Math.max(0.05, toFiniteNumber(halfHeight, 0.34));
  const tailX = -safeHalfLen;
  const tipX = safeHalfLen;
  const midX = safeHalfLen * 0.4;
  ctx.beginPath();
  ctx.moveTo(tailX, -safeHalfHeight * 0.7);
  ctx.quadraticCurveTo(tailX - safeHalfLen * 0.3, 0, tailX, safeHalfHeight * 0.7);
  ctx.lineTo(midX, safeHalfHeight * 0.84);
  ctx.quadraticCurveTo(tipX * 0.94, safeHalfHeight * 0.42, tipX, 0);
  ctx.quadraticCurveTo(tipX * 0.94, -safeHalfHeight * 0.42, midX, -safeHalfHeight * 0.84);
  ctx.closePath();
}

function drawBottomBumperBrokenOverlay(ctx, halfLen, halfHeight, pulseRatio = 0) {
  if (!ctx) {
    return;
  }
  const safeHalfLen = Math.max(0.08, toFiniteNumber(halfLen, 0.98));
  const safeHalfHeight = Math.max(0.05, toFiniteNumber(halfHeight, 0.34));
  const pulse = clamp(toFiniteNumber(pulseRatio, 0), 0, 1);
  const crackWidth = Math.max(0.018, safeHalfHeight * 0.16);
  const tipX = safeHalfLen;

  ctx.save();
  drawBottomBumperPath(ctx, safeHalfLen, safeHalfHeight);
  ctx.clip();

  ctx.strokeStyle = `rgba(15, 26, 45, ${0.82 + pulse * 0.12})`;
  ctx.lineWidth = crackWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-safeHalfLen * 0.44, -safeHalfHeight * 0.34);
  ctx.lineTo(-safeHalfLen * 0.1, -safeHalfHeight * 0.08);
  ctx.lineTo(safeHalfLen * 0.24, -safeHalfHeight * 0.28);
  ctx.lineTo(safeHalfLen * 0.58, -safeHalfHeight * 0.03);
  ctx.moveTo(-safeHalfLen * 0.34, safeHalfHeight * 0.2);
  ctx.lineTo(safeHalfLen * 0.02, safeHalfHeight * 0.02);
  ctx.lineTo(safeHalfLen * 0.34, safeHalfHeight * 0.26);
  ctx.lineTo(safeHalfLen * 0.64, safeHalfHeight * 0.06);
  ctx.moveTo(-safeHalfLen * 0.08, -safeHalfHeight * 0.02);
  ctx.lineTo(safeHalfLen * 0.08, safeHalfHeight * 0.05);
  ctx.lineTo(safeHalfLen * 0.18, -safeHalfHeight * 0.02);
  ctx.stroke();

  ctx.strokeStyle = `rgba(235, 248, 255, ${0.26 + pulse * 0.34})`;
  ctx.lineWidth = Math.max(0.008, crackWidth * 0.42);
  ctx.beginPath();
  ctx.moveTo(-safeHalfLen * 0.42, -safeHalfHeight * 0.3);
  ctx.lineTo(-safeHalfLen * 0.12, -safeHalfHeight * 0.09);
  ctx.lineTo(safeHalfLen * 0.2, -safeHalfHeight * 0.24);
  ctx.moveTo(-safeHalfLen * 0.31, safeHalfHeight * 0.18);
  ctx.lineTo(safeHalfLen * 0.03, safeHalfHeight * 0.03);
  ctx.lineTo(safeHalfLen * 0.28, safeHalfHeight * 0.2);
  ctx.stroke();

  ctx.fillStyle = `rgba(12, 21, 36, ${0.66 + pulse * 0.22})`;
  ctx.beginPath();
  ctx.moveTo(tipX * 0.66, -safeHalfHeight * 0.34);
  ctx.lineTo(tipX * 0.95, -safeHalfHeight * 0.08);
  ctx.lineTo(tipX * 0.86, safeHalfHeight * 0.2);
  ctx.lineTo(tipX * 0.6, safeHalfHeight * 0.06);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = `rgba(255, 232, 155, ${0.44 + pulse * 0.34})`;
  ctx.lineWidth = Math.max(0.01, crackWidth * 0.5);
  ctx.beginPath();
  for (let stripe = 0; stripe < 4; stripe += 1) {
    const x = safeHalfLen * (0.22 + stripe * 0.12);
    ctx.moveTo(x, -safeHalfHeight * 0.56);
    ctx.lineTo(x - safeHalfHeight * 0.36, -safeHalfHeight * 0.12);
  }
  ctx.stroke();

  ctx.restore();
}

function drawStickyPadTopHoneyBand(ctx, halfWidth, halfHeight, options = {}) {
  if (!ctx) {
    return;
  }
  const safeHalfWidth = Math.max(0.08, toFiniteNumber(halfWidth, 1.1));
  const safeHalfHeight = Math.max(0.04, toFiniteNumber(halfHeight, 0.24));
  const alpha = clamp(toFiniteNumber(options.alpha, 1), 0.1, 1);
  const bandHeight = safeHalfHeight * 0.2; // top 10% of full height
  const topY = -safeHalfHeight;
  const gradient = ctx.createLinearGradient(0, topY, 0, topY + bandHeight);
  gradient.addColorStop(0, `rgba(255, 224, 141, ${0.94 * alpha})`);
  gradient.addColorStop(0.55, `rgba(255, 194, 84, ${0.9 * alpha})`);
  gradient.addColorStop(1, `rgba(232, 152, 35, ${0.86 * alpha})`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.rect(-safeHalfWidth, topY, safeHalfWidth * 2, bandHeight);
  ctx.fill();
  ctx.strokeStyle = `rgba(255, 239, 180, ${0.9 * alpha})`;
  ctx.lineWidth = Math.max(0.02, safeHalfHeight * 0.16);
  ctx.beginPath();
  ctx.moveTo(-safeHalfWidth, topY + bandHeight * 0.98);
  ctx.lineTo(safeHalfWidth, topY + bandHeight * 0.98);
  ctx.stroke();
}

function buildBottomBumperColliderPoints(halfLen, halfHeight) {
  const safeHalfLen = Math.max(0.08, toFiniteNumber(halfLen, 0.98));
  const safeHalfHeight = Math.max(0.05, toFiniteNumber(halfHeight, 0.34));
  const tailX = -safeHalfLen;
  const midX = safeHalfLen * 0.4;
  const tipX = safeHalfLen;
  const top = safeHalfHeight * 0.7;
  const shoulder = safeHalfHeight * 0.42;
  const wing = safeHalfHeight * 0.84;
  const points = [
    [tailX, -top],
    [tailX - safeHalfLen * 0.12, -safeHalfHeight * 0.52],
    [tailX - safeHalfLen * 0.26, 0],
    [tailX - safeHalfLen * 0.12, safeHalfHeight * 0.52],
    [tailX, top],
    [midX, wing],
    [tipX * 0.94, shoulder],
    [tipX, 0],
    [tipX * 0.94, -shoulder],
    [midX, -wing],
    [tailX, -top],
  ];
  return points;
}

function normalizeClosedPolylinePoints(rawPoints) {
  if (!Array.isArray(rawPoints)) {
    return [];
  }
  const points = rawPoints
    .map((point) => {
      if (!Array.isArray(point) || point.length < 2) {
        return null;
      }
      const x = toFiniteNumber(point[0], NaN);
      const y = toFiniteNumber(point[1], NaN);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
      }
      return [x, y];
    })
    .filter((point) => !!point);
  if (points.length >= 2) {
    const first = points[0];
    const last = points[points.length - 1];
    if (Math.abs(first[0] - last[0]) < 0.000001 && Math.abs(first[1] - last[1]) < 0.000001) {
      points.pop();
    }
  }
  return points;
}

function isPointInsidePolygon(points, pointX, pointY) {
  if (!Array.isArray(points) || points.length < 3) {
    return false;
  }
  let inside = false;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + points.length - 1) % points.length];
    if (!Array.isArray(a) || !Array.isArray(b)) {
      continue;
    }
    const ax = toFiniteNumber(a[0], NaN);
    const ay = toFiniteNumber(a[1], NaN);
    const bx = toFiniteNumber(b[0], NaN);
    const by = toFiniteNumber(b[1], NaN);
    if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(bx) || !Number.isFinite(by)) {
      continue;
    }
    const intersects = ((ay > pointY) !== (by > pointY))
      && (pointX < ((bx - ax) * (pointY - ay)) / Math.max(0.0000001, (by - ay)) + ax);
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function closestPointOnSegment(pointX, pointY, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 0.0000001) {
    const dx = pointX - ax;
    const dy = pointY - ay;
    return {
      x: ax,
      y: ay,
      distSq: dx * dx + dy * dy,
    };
  }
  const t = clamp(((pointX - ax) * abx + (pointY - ay) * aby) / lenSq, 0, 1);
  const x = ax + abx * t;
  const y = ay + aby * t;
  const dx = pointX - x;
  const dy = pointY - y;
  return {
    x,
    y,
    distSq: dx * dx + dy * dy,
  };
}

function closestPointOnClosedPolyline(points, pointX, pointY) {
  if (!Array.isArray(points) || points.length < 2) {
    return null;
  }
  let best = null;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    if (!Array.isArray(a) || !Array.isArray(b)) {
      continue;
    }
    const candidate = closestPointOnSegment(
      pointX,
      pointY,
      toFiniteNumber(a[0], 0),
      toFiniteNumber(a[1], 0),
      toFiniteNumber(b[0], 0),
      toFiniteNumber(b[1], 0),
    );
    if (!best || candidate.distSq < best.distSq) {
      best = candidate;
    }
  }
  return best;
}

function getPolylineCentroid(points) {
  if (!Array.isArray(points) || points.length === 0) {
    return { x: 0, y: 0 };
  }
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (!Array.isArray(point) || point.length < 2) {
      continue;
    }
    const x = toFiniteNumber(point[0], NaN);
    const y = toFiniteNumber(point[1], NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }
    sumX += x;
    sumY += y;
    count += 1;
  }
  if (count <= 0) {
    return { x: 0, y: 0 };
  }
  return { x: sumX / count, y: sumY / count };
}

function compileBottomBumperCollider(raw, entityId) {
  const width = Math.max(0.08, toFiniteNumber(raw && raw.width, 0.98));
  const height = Math.max(0.05, toFiniteNumber(raw && raw.height, 0.34));
  const restitutionInput = toFiniteNumber(raw && raw.restitution, 0.62);
  const frictionInput = toFiniteNumber(raw && raw.friction, 0.03);
  const restitution = clamp(Math.max(0.74, restitutionInput), 0, 8);
  const friction = clamp(Math.min(0.03, frictionInput), 0, 8);
  const density = Math.max(0.01, toFiniteNumber(raw && raw.density, 1));
  const sensor = toBoolean(raw && raw.sensor, false) || toBoolean(raw && raw.noCollision, false);
  const life = Number.isFinite(Number(raw && raw.life))
    ? Math.max(-1, Math.floor(Number(raw.life)))
    : null;
  const points = buildBottomBumperColliderPoints(width, height);
  const props = {
    density,
    angularVelocity: 0,
    restitution,
    friction,
  };
  if (sensor) {
    props.sensor = true;
  }
  if (life !== null) {
    props.life = life;
  }
  return withEntityId(
    {
      position: {
        x: toFiniteNumber(raw && raw.x, 11.75),
        y: toFiniteNumber(raw && raw.y, 72),
      },
      type: 'kinematic',
      props,
      shape: {
        type: 'polyline',
        rotation: 0,
        points,
        color: 'rgba(0,0,0,0)',
      },
    },
    entityId,
  );
}

function withEntityId(entity, entityId) {
  const shape = entity.shape && typeof entity.shape === 'object'
    ? { ...entity.shape }
    : {};
  shape.__v2eid = entityId;
  return {
    ...entity,
    __v2eid: entityId,
    shape,
  };
}

function extractPolylinePoints(raw) {
  const pointsFromArray = Array.isArray(raw && raw.points)
    ? raw.points
        .map((point) => {
          if (!Array.isArray(point) || point.length < 2) {
            return null;
          }
          const x = toFiniteNumber(point[0], NaN);
          const y = toFiniteNumber(point[1], NaN);
          if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return null;
          }
          return [x, y];
        })
        .filter((point) => !!point)
    : [];
  return pointsFromArray.length >= 2
    ? pointsFromArray
    : [
        [toFiniteNumber(raw && raw.x1, toFiniteNumber(raw && raw.x, NaN)), toFiniteNumber(raw && raw.y1, toFiniteNumber(raw && raw.y, NaN))],
        [toFiniteNumber(raw && raw.x2, toFiniteNumber(raw && raw.x + 1, NaN)), toFiniteNumber(raw && raw.y2, toFiniteNumber(raw && raw.y + 1, NaN))],
      ].filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
}

function ensureClosedPolylinePoints(pointsInput, threshold = 0.0001, forceClose = false) {
  const points = Array.isArray(pointsInput)
    ? pointsInput
        .map((point) => {
          if (!Array.isArray(point) || point.length < 2) {
            return null;
          }
          const x = toFiniteNumber(point[0], NaN);
          const y = toFiniteNumber(point[1], NaN);
          if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return null;
          }
          return [x, y];
        })
        .filter((point) => !!point)
    : [];
  if (points.length < 3) {
    return points;
  }
  const first = points[0];
  const last = points[points.length - 1];
  const dx = toFiniteNumber(last && last[0], NaN) - toFiniteNumber(first && first[0], NaN);
  const dy = toFiniteNumber(last && last[1], NaN) - toFiniteNumber(first && first[1], NaN);
  const closeDistance = Math.hypot(dx, dy);
  if (Number.isFinite(closeDistance) && closeDistance <= Math.max(0, toFiniteNumber(threshold, 0.0001))) {
    points[points.length - 1] = [first[0], first[1]];
    return points;
  }
  if (forceClose === true) {
    points.push([first[0], first[1]]);
  }
  return points;
}

function compileWallPolyline(raw, entityId) {
  const points = extractPolylinePoints(raw);
  if (points.length < 2) {
    return null;
  }
  const color = typeof raw.color === 'string' ? raw.color : DEFAULT_OBJECT_COLORS.wall;
  const isFilled = toBoolean(raw && raw.filled, false) || toId(raw && raw.type, '') === 'wall_filled_polyline';
  const fillOpacity = clamp(toFiniteNumber(raw && raw.fillOpacity, isFilled ? 1 : 0), 0, 1);
  const restitution = clamp(toFiniteNumber(raw && raw.restitution, 0), 0, 8);
  const friction = clamp(toFiniteNumber(raw && raw.friction, 0.35), 0, 8);
  let colliderThicknessValue = toFiniteNumber(raw && raw.colliderThickness, NaN);
  if (!Number.isFinite(colliderThicknessValue)) {
    colliderThicknessValue = toFiniteNumber(raw && raw.collisionThickness, NaN);
  }
  if (!Number.isFinite(colliderThicknessValue)) {
    colliderThicknessValue = toFiniteNumber(raw && raw.thickness, isFilled ? 0.18 : 0);
  }
  const colliderThickness = Number.isFinite(colliderThicknessValue)
    ? clamp(colliderThicknessValue, 0, 6)
    : 0;
  const sensor = toBoolean(raw && raw.sensor, false) || toBoolean(raw && raw.noCollision, false);
  const props = {
    density: 1,
    angularVelocity: 0,
    restitution,
    friction,
  };
  if (sensor) {
    props.sensor = true;
  }
  if (colliderThickness > 0.0001) {
    props.colliderThickness = colliderThickness;
  }
  return withEntityId(
    {
      position: { x: 0, y: 0 },
      type: 'static',
      props,
      shape: {
        type: 'polyline',
        rotation: 0,
        points,
        color,
        filled: isFilled,
        fillOpacity: isFilled ? fillOpacity : 0,
      },
    },
    entityId,
  );
}

function buildCorridorSides(pointsInput, gap) {
  const points = Array.isArray(pointsInput) ? pointsInput : [];
  if (points.length < 2) {
    return { left: [], right: [] };
  }
  const halfGap = Math.max(0.1, toFiniteNumber(gap, 1.2) / 2);
  const normals = [];
  for (let index = 1; index < points.length; index += 1) {
    const p0 = points[index - 1];
    const p1 = points[index];
    const dx = toFiniteNumber(p1 && p1[0], 0) - toFiniteNumber(p0 && p0[0], 0);
    const dy = toFiniteNumber(p1 && p1[1], 0) - toFiniteNumber(p0 && p0[1], 0);
    const length = Math.hypot(dx, dy);
    if (length <= 0.0001) {
      normals.push([0, 0]);
      continue;
    }
    normals.push([-dy / length, dx / length]);
  }
  const left = [];
  const right = [];
  for (let index = 0; index < points.length; index += 1) {
    const prev = index > 0 ? normals[index - 1] : normals[index];
    const next = index < normals.length ? normals[index] : normals[index - 1];
    const nx = toFiniteNumber((toFiniteNumber(prev && prev[0], 0) + toFiniteNumber(next && next[0], 0)) / 2, 0);
    const ny = toFiniteNumber((toFiniteNumber(prev && prev[1], 0) + toFiniteNumber(next && next[1], 0)) / 2, 0);
    const nLength = Math.hypot(nx, ny);
    const ux = nLength > 0.0001 ? nx / nLength : 0;
    const uy = nLength > 0.0001 ? ny / nLength : 0;
    const px = toFiniteNumber(points[index] && points[index][0], 0);
    const py = toFiniteNumber(points[index] && points[index][1], 0);
    left.push([px + ux * halfGap, py + uy * halfGap]);
    right.push([px - ux * halfGap, py - uy * halfGap]);
  }
  return { left, right };
}

function compileCorridorPolyline(raw, entityId) {
  const points = extractPolylinePoints(raw);
  if (points.length < 2) {
    return [];
  }
  const gap = Math.max(0.2, toFiniteNumber(raw && raw.gap, 1.2));
  const sides = buildCorridorSides(points, gap);
  const color = typeof (raw && raw.color) === 'string' ? raw.color : DEFAULT_OBJECT_COLORS.wall;
  const entities = [];
  const leftEntity = compileWallPolyline({
    points: sides.left,
    color,
    restitution: raw && raw.restitution,
    friction: raw && raw.friction,
    sensor: raw && raw.sensor,
    noCollision: raw && raw.noCollision,
  }, entityId);
  if (leftEntity) {
    entities.push(leftEntity);
  }
  const rightEntity = compileWallPolyline({
    points: sides.right,
    color,
    restitution: raw && raw.restitution,
    friction: raw && raw.friction,
    sensor: raw && raw.sensor,
    noCollision: raw && raw.noCollision,
  }, entityId + (leftEntity ? 1 : 0));
  if (rightEntity) {
    entities.push(rightEntity);
  }
  return entities;
}

function compileBox(raw, entityId, forceKinematic = false) {
  const width = Math.max(0.02, toFiniteNumber(raw.width, 0.35));
  const height = Math.max(0.02, toFiniteNumber(raw.height, 0.18));
  const rotationInput = Number.isFinite(Number(raw.rotationRad))
    ? toFiniteNumber(raw.rotationRad, 0)
    : toFiniteNumber(raw.rotation, 0);
  const rotation = normalizeRotationRad(rotationInput, 0);
  const restitution = clamp(toFiniteNumber(raw.restitution, 0), 0, 8);
  const friction = clamp(toFiniteNumber(raw.friction, 0.2), 0, 8);
  const density = Math.max(0.01, toFiniteNumber(raw.density, 1));
  const angularVelocity = toFiniteNumber(
    raw.angularVelocity,
    forceKinematic ? toFiniteNumber(raw.angularVelocity, 0) : 0,
  );
  const linearDamping = Math.max(0, toFiniteNumber(raw.linearDamping, 0));
  const angularDamping = Math.max(0, toFiniteNumber(raw.angularDamping, 0));
  const fixedRotation = toBoolean(raw.fixedRotation, false);
  const gravityScale = Math.max(0, toFiniteNumber(raw.gravityScale, 1));
  const sensor = toBoolean(raw.sensor, false) || toBoolean(raw.noCollision, false);
  const life = Number.isFinite(Number(raw.life)) ? Math.max(-1, Math.floor(Number(raw.life))) : null;
  const color = typeof raw.color === 'string' ? raw.color : DEFAULT_OBJECT_COLORS.box;
  const rawBodyType = typeof raw === 'object' && raw
    ? (typeof raw.bodyType === 'string' ? raw.bodyType : (typeof raw.physicsType === 'string' ? raw.physicsType : ''))
    : '';
  let bodyType = 'static';
  if (forceKinematic) {
    bodyType = 'kinematic';
  } else if (rawBodyType === 'dynamic') {
    bodyType = 'dynamic';
  } else if (rawBodyType === 'kinematic' || raw.type === 'kinematic') {
    bodyType = 'kinematic';
  } else if (raw.type === 'dynamic') {
    bodyType = 'dynamic';
  }
  const props = {
    density,
    angularVelocity,
    restitution,
    friction,
  };
  if (linearDamping > 0) {
    props.linearDamping = linearDamping;
  }
  if (angularDamping > 0) {
    props.angularDamping = angularDamping;
  }
  if (fixedRotation) {
    props.fixedRotation = true;
  }
  if (gravityScale !== 1) {
    props.gravityScale = gravityScale;
  }
  if (sensor) {
    props.sensor = true;
  }
  if (life !== null) {
    props.life = life;
  }
  return withEntityId(
    {
      position: {
        x: toFiniteNumber(raw.x, 11.75),
        y: toFiniteNumber(raw.y, 40),
      },
      type: bodyType,
      props,
      shape: {
        type: 'box',
        width,
        height,
        rotation,
        color,
      },
    },
    entityId,
  );
}

function compileCircle(raw, entityId, defaults) {
  const radius = Math.max(0.05, toFiniteNumber(raw.radius, defaults.radius));
  const restitution = clamp(toFiniteNumber(raw.restitution, defaults.restitution), 0, 8);
  const friction = clamp(toFiniteNumber(raw.friction, 0.2), 0, 8);
  const density = Math.max(0.01, toFiniteNumber(raw.density, defaults.density));
  const linearDamping = Math.max(0, toFiniteNumber(raw.linearDamping, 0));
  const angularDamping = Math.max(0, toFiniteNumber(raw.angularDamping, 0));
  const fixedRotation = toBoolean(raw.fixedRotation, toBoolean(defaults && defaults.fixedRotation, false));
  const gravityScale = Math.max(0, toFiniteNumber(raw.gravityScale, toFiniteNumber(defaults && defaults.gravityScale, 1)));
  const sensor = toBoolean(raw.sensor, toBoolean(defaults && defaults.sensor, false))
    || toBoolean(raw.noCollision, false);
  const life = Number.isFinite(Number(raw.life)) ? Math.max(-1, Math.floor(Number(raw.life))) : defaults.life;
  const color = typeof raw.color === 'string' ? raw.color : defaults.color;
  const rawBodyType = typeof raw === 'object' && raw
    ? (typeof raw.bodyType === 'string' ? raw.bodyType : (typeof raw.physicsType === 'string' ? raw.physicsType : ''))
    : '';
  const defaultBodyType = defaults && typeof defaults.bodyType === 'string' ? defaults.bodyType : 'static';
  const bodyType = rawBodyType === 'dynamic' || raw.type === 'dynamic'
    ? 'dynamic'
    : (rawBodyType === 'kinematic' || raw.type === 'kinematic'
      ? 'kinematic'
      : defaultBodyType);
  const props = {
    density,
    angularVelocity: 0,
    restitution,
    friction,
    life,
  };
  if (linearDamping > 0) {
    props.linearDamping = linearDamping;
  }
  if (angularDamping > 0) {
    props.angularDamping = angularDamping;
  }
  if (fixedRotation) {
    props.fixedRotation = true;
  }
  if (gravityScale !== 1) {
    props.gravityScale = gravityScale;
  }
  if (sensor) {
    props.sensor = true;
  }
  return withEntityId(
    {
      position: {
        x: toFiniteNumber(raw.x, defaults.x),
        y: toFiniteNumber(raw.y, defaults.y),
      },
      type: bodyType,
      props,
      shape: {
        type: 'circle',
        radius,
        color,
      },
    },
    entityId,
  );
}

function compileDiamond(raw, entityId) {
  const size = Math.max(0.05, toFiniteNumber(raw.size, toFiniteNumber(raw.width, 0.26)));
  const rotationDeg = Number.isFinite(Number(raw.rotation))
    ? toFiniteNumber(raw.rotation, 45)
    : 45;
  const rotateEnabled = toTruthyBoolean(raw.rotateEnabled, false);
  const hasRotateSpeedDeg = Number.isFinite(Number(raw.rotateSpeedDeg));
  const hasRotateSpeedRad = Number.isFinite(Number(raw.rotateSpeedRad));
  const desiredAngularVelocity = hasRotateSpeedDeg
    ? degToRad(toFiniteNumber(raw.rotateSpeedDeg, 120))
    : (hasRotateSpeedRad
      ? toFiniteNumber(raw.rotateSpeedRad, degToRad(120))
      : toFiniteNumber(raw.angularVelocity, degToRad(120)));
  const angularVelocity = rotateEnabled
    ? (Math.abs(desiredAngularVelocity) < 0.01
      ? degToRad(120)
      : desiredAngularVelocity)
    : 0;
  return compileBox(
    {
      ...raw,
      width: Math.max(0.05, toFiniteNumber(raw.width, size)),
      height: Math.max(0.05, toFiniteNumber(raw.height, size)),
      rotation: rotationDeg,
      bodyType: rotateEnabled ? 'kinematic' : 'static',
      angularVelocity,
      restitution: toFiniteNumber(raw.restitution, 1.4),
      density: toFiniteNumber(raw.density, 1),
      color: typeof raw.color === 'string' ? raw.color : DEFAULT_OBJECT_COLORS.diamond,
    },
    entityId,
    rotateEnabled,
  );
}

function compileObject(rawObject, entityId) {
  if (!rawObject || typeof rawObject !== 'object') {
    return { entity: null, behavior: null };
  }

  const type = toId(rawObject.type, '');
  switch (type) {
    case 'wall_segment':
    case 'wall_polyline':
      return {
        entity: compileWallPolyline(rawObject, entityId),
        behavior: null,
      };
    case 'wall_filled_polyline': {
      const closedPoints = ensureClosedPolylinePoints(extractPolylinePoints(rawObject), 0.2, true);
      const color = DEFAULT_OBJECT_COLORS.box;
      return {
        entity: compileWallPolyline(
          {
            ...rawObject,
            points: closedPoints,
            color,
            filled: true,
            fillOpacity: 1,
          },
          entityId,
        ),
        behavior: {
          kind: 'wall_filled_polyline_visual',
          oid: toId(rawObject.oid, `wall_filled_${entityId}`),
          entityId,
          points: closedPoints,
          color,
          fillOpacity: 1,
          repelEnabled: toTruthyBoolean(
            rawObject.repelEnabled,
            toTruthyBoolean(rawObject.ejectOnPenetration, false),
          ),
          repelSpeed: Math.max(0.8, toFiniteNumber(rawObject.repelSpeed, 5.4)),
          repelClearance: clamp(toFiniteNumber(rawObject.repelClearance, 0.12), 0.04, 0.45),
          repelCooldownMs: Math.max(0, toFiniteNumber(rawObject.repelCooldownMs, 90)),
          repelVelocityScale: clamp(toFiniteNumber(rawObject.repelVelocityScale, 1.08), 0.5, 2.2),
        },
      };
    }
    case 'wall_corridor_segment':
    case 'wall_corridor_polyline': {
      const entities = compileCorridorPolyline(rawObject, entityId);
      return {
        entity: entities[0] || null,
        entities,
        behavior: null,
      };
    }
    case 'box_block':
      return {
        entity: compileBox(rawObject, entityId, false),
        behavior: null,
      };
    case 'domino_block':
      return {
        entity: compileBox(
          {
            ...rawObject,
            width: Math.max(0.04, toFiniteNumber(rawObject.width, 0.16)),
            height: Math.max(0.08, toFiniteNumber(rawObject.height, 0.7)),
            restitution: toFiniteNumber(rawObject.restitution, 0.08),
            density: Math.max(0.01, toFiniteNumber(rawObject.density, 1.35)),
            life: -1,
            bodyType: 'dynamic',
            fixedRotation: false,
            gravityScale: Math.max(0, toFiniteNumber(rawObject.gravityScale, 1)),
            color: typeof rawObject.color === 'string' ? rawObject.color : DEFAULT_OBJECT_COLORS.domino,
          },
          entityId,
          false,
        ),
        behavior: null,
      };
    case 'diamond_block':
      return {
        entity: compileDiamond(rawObject, entityId),
        behavior: toTruthyBoolean(rawObject.rotateEnabled, false) && toTruthyBoolean(rawObject.rotateSpeedAuto, false)
          ? {
            kind: 'diamond_auto_rotate',
            oid: toId(rawObject.oid, `diamond_${entityId}`),
            entityId,
            maxAbsSpeedDeg: Math.max(
              30,
              Math.abs(
                toFiniteNumber(
                  rawObject.maxAbsRotateSpeedDeg,
                  toFiniteNumber(rawObject.rotateAutoMaxSpeedDeg, 0),
                ),
              ),
              Math.abs(toFiniteNumber(rawObject.rotateSpeedDeg, 120)),
            ),
          }
          : null,
      };
    case 'peg_circle':
      return {
        entity: compileCircle(rawObject, entityId, {
          radius: 0.4,
          restitution: 2,
          density: 1,
          life: -1,
          x: 11.75,
          y: 40,
          color: DEFAULT_OBJECT_COLORS.circle,
          bodyType: 'static',
        }),
        behavior: null,
      };
    case 'physics_ball':
      return {
        entity: compileCircle(rawObject, entityId, {
          radius: 0.62,
          restitution: 0.22,
          density: 1.8,
          life: -1,
          x: 11.75,
          y: 40,
          color: DEFAULT_OBJECT_COLORS.physicsBall,
          bodyType: 'dynamic',
          fixedRotation: false,
          gravityScale: 1,
        }),
        behavior: null,
      };
    case 'burst_bumper': {
      const totalLayers = Math.max(1, Math.floor(toFiniteNumber(rawObject.layers, 3)));
      const hpPerLayer = Math.max(1, Math.floor(toFiniteNumber(rawObject.hpPerLayer, toFiniteNumber(rawObject.hp, 1))));
      const damagePerHit = Math.max(1, Math.floor(toFiniteNumber(rawObject.damagePerHit, 1)));
      const baseRadius = Math.max(0.08, toFiniteNumber(rawObject.radius, 0.68));
      const baseTriggerRadius = Math.max(0.14, toFiniteNumber(rawObject.triggerRadius, baseRadius + 0.45));
      const customColor = typeof rawObject.color === 'string' ? rawObject.color.trim() : '';
      const useCustomColor = customColor && !isTransparentColorString(customColor);
      const entities = [];
      const layerEntityIds = [];
      const layerRadii = [];

      for (let layerIndex = 0; layerIndex < totalLayers; layerIndex += 1) {
        const ratio = (totalLayers - layerIndex) / totalLayers;
        const layerRadius = Math.max(0.06, baseRadius * ratio);
        const layerPalette = ['#b9ffca', '#8dffad', '#5dff7a', '#43d95f', '#2eb34a', '#25863b'];
        const defaultLayerColor = layerPalette[Math.min(layerIndex, layerPalette.length - 1)];
        const layerColor = useCustomColor
          ? customColor
          : defaultLayerColor;
        const compiledLayer = compileCircle(
          {
            ...rawObject,
            radius: layerRadius,
            life: -1,
            restitution: toFiniteNumber(rawObject.restitution, 3.2),
            color: layerColor,
          },
          entityId + layerIndex,
          {
            radius: layerRadius,
            restitution: 3.2,
            density: 1,
            life: -1,
            x: toFiniteNumber(rawObject.x, 11.75),
            y: toFiniteNumber(rawObject.y, 72),
            color: layerColor,
          },
        );
        if (!compiledLayer) {
          continue;
        }
        compiledLayer.shape.__v2burstLayer = totalLayers - layerIndex;
        compiledLayer.shape.__v2burstLayerIndex = layerIndex;
        entities.push(compiledLayer);
        layerEntityIds.push(entityId + layerIndex);
        layerRadii.push(layerRadius);
      }

      return {
        entity: entities[0] || null,
        entities,
        behavior: {
          kind: 'burst_bumper',
          oid: toId(rawObject.oid, `burst_${entityId}`),
          entityId,
          entityIds: layerEntityIds,
          layerRadii,
          x: toFiniteNumber(rawObject.x, 11.75),
          y: toFiniteNumber(rawObject.y, 72),
          radius: baseRadius,
          triggerRadius: baseTriggerRadius,
          force: Math.max(0.1, toFiniteNumber(rawObject.force, toFiniteNumber(rawObject.burstForce, 6.2))),
          cooldownMs: Math.max(20, toFiniteNumber(rawObject.cooldownMs, toFiniteNumber(rawObject.intervalMs, 420))),
          upwardBoost: Math.max(0, toFiniteNumber(rawObject.upwardBoost, 0)),
          layers: totalLayers,
          hpPerLayer,
          damagePerHit,
          maxHp: Math.max(
            1,
            Math.floor(
              toFiniteNumber(
                rawObject.maxHp,
                totalLayers * hpPerLayer,
              ),
            ),
          ),
        },
      };
    }
    case 'rotor':
      return {
        entity: compileBox(
          {
            ...rawObject,
            height: toFiniteNumber(rawObject.height, 0.1),
            restitution: toFiniteNumber(rawObject.restitution, 0),
            angularVelocity: toFiniteNumber(rawObject.angularVelocity, 2.2),
          },
          entityId,
          true,
        ),
        behavior: null,
      };
    case 'portal':
      return {
        entity: compileCircle(rawObject, entityId, {
          radius: 0.45,
          restitution: 0.2,
          density: 1,
          life: -1,
          x: 11.75,
          y: 50,
          color: DEFAULT_OBJECT_COLORS.portal,
          bodyType: 'static',
        }),
        behavior: {
          kind: 'portal',
          oid: toId(rawObject.oid, `portal_${entityId}`),
          pair: toId(rawObject.pair, ''),
          x: toFiniteNumber(rawObject.x, 0),
          y: toFiniteNumber(rawObject.y, 0),
          radius: Math.max(0.12, toFiniteNumber(rawObject.radius, 0.45)),
          triggerRadius: Math.max(
            0.2,
            toFiniteNumber(rawObject.triggerRadius, toFiniteNumber(rawObject.radius, 0.45) + 0.45),
          ),
          cooldownMs: Math.max(0, toFiniteNumber(rawObject.cooldownMs, 900)),
          preserveVelocity: toBoolean(rawObject.preserveVelocity, false),
          exitImpulse: Math.max(0, toFiniteNumber(rawObject.exitImpulse, 0)),
          exitDirDeg: toFiniteNumber(rawObject.exitDirDeg, 0),
        },
      };
    case 'black_hole':
      return {
        entity: compileCircle(rawObject, entityId, {
          radius: 0.72,
          restitution: 0.08,
          density: 1,
          life: -1,
          x: 11.75,
          y: 52,
          color: DEFAULT_OBJECT_COLORS.blackHole,
          bodyType: 'static',
          sensor: true,
        }),
        behavior: {
          kind: 'black_hole',
          oid: toId(rawObject.oid, `black_hole_${entityId}`),
          entityId,
          x: toFiniteNumber(rawObject.x, 11.75),
          y: toFiniteNumber(rawObject.y, 52),
          radius: Math.max(0.18, toFiniteNumber(rawObject.radius, 0.72)),
          triggerRadius: Math.max(
            0.2,
            toFiniteNumber(rawObject.triggerRadius, Math.max(0.18, toFiniteNumber(rawObject.radius, 0.72)) + 1.4),
          ),
          suctionForce: Math.max(
            0.35,
            toFiniteNumber(rawObject.suctionForce, toFiniteNumber(rawObject.force, 0.8)),
          ),
          cooldownMs: Math.max(80, toFiniteNumber(rawObject.cooldownMs, 900)),
          launchImpulse: Math.max(0.1, toFiniteNumber(rawObject.launchImpulse, 3.6)),
        },
      };
    case 'white_hole':
      return {
        entity: compileCircle(rawObject, entityId, {
          radius: 0.62,
          restitution: 0.12,
          density: 1,
          life: -1,
          x: 11.75,
          y: 62,
          color: DEFAULT_OBJECT_COLORS.whiteHole,
          bodyType: 'static',
          sensor: true,
        }),
        behavior: {
          kind: 'white_hole',
          oid: toId(rawObject.oid, `white_hole_${entityId}`),
          entityId,
          x: toFiniteNumber(rawObject.x, 11.75),
          y: toFiniteNumber(rawObject.y, 62),
          radius: Math.max(0.16, toFiniteNumber(rawObject.radius, 0.62)),
          cooldownMs: Math.max(80, toFiniteNumber(rawObject.cooldownMs, 900)),
          launchImpulse: Math.max(0.1, toFiniteNumber(rawObject.launchImpulse, 4.6)),
        },
      };
    case 'stopwatch_bomb':
      return {
        entity: compileCircle(rawObject, entityId, {
          radius: 0.62,
          restitution: 0.08,
          density: 1,
          life: -1,
          x: 11.75,
          y: 64,
          color: DEFAULT_OBJECT_COLORS.stopwatch,
          bodyType: 'static',
        }),
        behavior: {
          kind: 'stopwatch_bomb',
          oid: toId(rawObject.oid, `stopwatch_${entityId}`),
          entityId,
          x: toFiniteNumber(rawObject.x, 11.75),
          y: toFiniteNumber(rawObject.y, 64),
          radius: Math.max(0.12, toFiniteNumber(rawObject.radius, 0.62)),
          triggerRadius: Math.max(
            0.2,
            toFiniteNumber(rawObject.triggerRadius, Math.max(0.12, toFiniteNumber(rawObject.radius, 0.62)) + 1.2),
          ),
          force: Math.max(0.1, toFiniteNumber(rawObject.force, 4.8)),
          intervalMs: Math.max(120, toFiniteNumber(rawObject.intervalMs, 4000)),
        },
      };
    case 'hammer':
      return {
        entity: compileBox(
          {
            ...rawObject,
            width: Math.max(0.08, toFiniteNumber(rawObject.width, 0.48)),
            height: Math.max(0.03, toFiniteNumber(rawObject.height, 0.12)),
            restitution: toFiniteNumber(rawObject.restitution, 0.08),
            rotation: 0,
            color: typeof rawObject.color === 'string' ? rawObject.color : DEFAULT_OBJECT_COLORS.hammer,
          },
          entityId,
          true,
        ),
        behavior: {
          kind: 'hammer',
          oid: toId(rawObject.oid, `hammer_${entityId}`),
          entityId,
          x: toFiniteNumber(rawObject.x, 11.75),
          y: toFiniteNumber(rawObject.y, 70),
          rotation: toFiniteNumber(rawObject.rotation, toFiniteNumber(rawObject.dirDeg, 90)),
          dirDeg: toFiniteNumber(rawObject.dirDeg, 90),
          force: Math.max(0.01, toFiniteNumber(rawObject.force, 4.2)),
          intervalMs: Math.max(60, toFiniteNumber(rawObject.intervalMs, 1200)),
          doubleHit: toBoolean(rawObject.doubleHit, false),
          triggerRadius: Math.max(0.2, toFiniteNumber(rawObject.triggerRadius, 1.2)),
          cooldownMs: Math.max(0, toFiniteNumber(rawObject.cooldownMs, 300)),
          swingDeg: Math.max(0, toFiniteNumber(rawObject.swingDeg, 26)),
          swingDurationMs: Math.max(40, toFiniteNumber(rawObject.swingDurationMs, 220)),
          hitDistance: Math.max(0, toFiniteNumber(rawObject.hitDistance, toFiniteNumber(rawObject.moveDistance, 0.95))),
        },
      };
    case 'bottom_bumper':
      {
        const bumperColor = typeof rawObject.color === 'string'
          ? rawObject.color
          : DEFAULT_OBJECT_COLORS.bottomBumper;
        const safeWidth = Math.max(0.08, toFiniteNumber(rawObject.width, 0.98));
        const safeHeight = Math.max(0.05, toFiniteNumber(rawObject.height, 0.34));
        const safeRestitution = Math.max(0.38, toFiniteNumber(rawObject.restitution, 0.62));
        const safeFriction = Math.min(0.08, toFiniteNumber(rawObject.friction, 0.03));
        const colliderBase = {
          ...rawObject,
          width: safeWidth,
          height: safeHeight,
          restitution: safeRestitution,
          friction: safeFriction,
        };
        const mainEntity = compileBottomBumperCollider(colliderBase, entityId);
        const brokenEntity = compileBottomBumperCollider(
          {
            ...colliderBase,
            width: Math.max(0.08, safeWidth / 3),
          },
          entityId + 1,
        );
      return {
        entity: mainEntity,
        entities: [mainEntity, brokenEntity],
        behavior: {
          kind: 'bottom_bumper',
          oid: toId(rawObject.oid, `bottom_bumper_${entityId}`),
          entityId,
          entityIds: [entityId, entityId + 1],
          x: toFiniteNumber(rawObject.x, 11.75),
          y: toFiniteNumber(rawObject.y, 72),
          width: safeWidth,
          height: safeHeight,
          rotation: toFiniteNumber(rawObject.rotation, toFiniteNumber(rawObject.dirDeg, 270)),
          dirDeg: toFiniteNumber(rawObject.dirDeg, toFiniteNumber(rawObject.rotation, 270)),
          mirror: toBoolean(rawObject.mirror, false),
          color: bumperColor,
          force: Math.max(0.1, toFiniteNumber(rawObject.force, 3.8)),
          intervalMs: Math.max(80, toFiniteNumber(rawObject.intervalMs, 780)),
          breakHitCount: Math.max(0, Math.floor(toFiniteNumber(rawObject.breakHitCount, 0))),
          triggerRadius: Math.max(0.2, toFiniteNumber(rawObject.triggerRadius, 1.25)),
          hitDistance: Math.max(0.2, toFiniteNumber(rawObject.hitDistance, 1.15)),
          swingDeg: Math.max(2, toFiniteNumber(rawObject.swingDeg, 34)),
          swingDurationMs: Math.max(60, toFiniteNumber(rawObject.swingDurationMs, 210)),
          cooldownMs: Math.max(0, toFiniteNumber(rawObject.cooldownMs, 160)),
        },
      };
      }
    case 'fan':
      return {
        entity: compileBox(
          {
            ...rawObject,
            width: Math.max(0.08, toFiniteNumber(rawObject.width, 0.48)),
            height: Math.max(0.03, toFiniteNumber(rawObject.height, 0.14)),
            restitution: toFiniteNumber(rawObject.restitution, 0.02),
            rotation: toFiniteNumber(rawObject.rotation, toFiniteNumber(rawObject.dirDeg, 0)),
            color: typeof rawObject.color === 'string' ? rawObject.color : DEFAULT_OBJECT_COLORS.fan,
          },
          entityId,
          true,
        ),
        behavior: {
          kind: 'fan',
          oid: toId(rawObject.oid, `fan_${entityId}`),
          entityId,
          x: toFiniteNumber(rawObject.x, 11.75),
          y: toFiniteNumber(rawObject.y, 70),
          dirDeg: toFiniteNumber(rawObject.dirDeg, toFiniteNumber(rawObject.rotation, 0)),
          force: Math.max(0.01, toFiniteNumber(rawObject.force, 0.32)),
          hitDistance: Math.max(
            0.2,
            toFiniteNumber(
              rawObject.hitDistance,
              Math.max(toFiniteNumber(rawObject.width, 0.48), toFiniteNumber(rawObject.height, 0.14)) * 2.8,
            ),
            Math.max(toFiniteNumber(rawObject.width, 0.48), toFiniteNumber(rawObject.height, 0.14)) * 2.8,
          ),
          triggerRadius: Math.max(
            0.2,
            toFiniteNumber(
              rawObject.triggerRadius,
              Math.max(
                toFiniteNumber(rawObject.width, 0.48) * 1.2,
                toFiniteNumber(rawObject.height, 0.14) * 2.2,
              ),
            ),
          ),
        },
      };
    case 'magic_wizard':
      return {
        entity: compileBox(
          {
            ...rawObject,
            width: Math.max(0.08, toFiniteNumber(rawObject.width, 0.72)),
            height: Math.max(0.08, toFiniteNumber(rawObject.height, 0.9)),
            restitution: toFiniteNumber(rawObject.restitution, 0.05),
            rotation: toFiniteNumber(rawObject.rotation, toFiniteNumber(rawObject.dirDeg, 0)),
            color: 'rgba(0,0,0,0)',
            noCollision: true,
            sensor: true,
          },
          entityId,
          false,
        ),
        behavior: {
          kind: 'magic_wizard',
          oid: toId(rawObject.oid, `magic_${entityId}`),
          entityId,
          x: toFiniteNumber(rawObject.x, 11.75),
          y: toFiniteNumber(rawObject.y, 70),
          width: Math.max(0.08, toFiniteNumber(rawObject.width, 0.72)),
          height: Math.max(0.08, toFiniteNumber(rawObject.height, 0.9)),
          dirDeg: toFiniteNumber(rawObject.dirDeg, toFiniteNumber(rawObject.rotation, 0)),
          mirror: false,
          force: Math.max(0.1, toFiniteNumber(rawObject.force, 2.8)),
          fireIntervalMs: Math.max(
            120,
            toFiniteNumber(rawObject.fireIntervalMs, toFiniteNumber(rawObject.intervalMs, 900)),
          ),
          fireballSpeed: Math.max(
            0.2,
            toFiniteNumber(rawObject.fireballSpeed, toFiniteNumber(rawObject.hitDistance, 7.4)),
          ),
          fireballDistance: (() => {
            const direct = toFiniteNumber(rawObject.fireballDistance, NaN);
            if (Number.isFinite(direct) && direct > 0) {
              return Math.max(0.2, direct);
            }
            const legacyDistance = toFiniteNumber(rawObject.hitDistance, NaN);
            if (Number.isFinite(legacyDistance) && legacyDistance > 0) {
              return Math.max(0.2, legacyDistance);
            }
            return NaN;
          })(),
          fireballRadius: Math.max(0.05, toFiniteNumber(rawObject.fireballRadius, toFiniteNumber(rawObject.radius, 0.2))),
          fireballLifeMs: Math.max(260, toFiniteNumber(rawObject.fireballLifeMs, 900)),
          imageSrc: normalizeMagicWizardImageSrc(rawObject.imageSrc),
        },
      };
    case 'sticky_pad':
      return {
        entity: compileBox(
          {
            ...rawObject,
            width: Math.max(0.08, toFiniteNumber(rawObject.width, 1.1)),
            height: Math.max(0.04, toFiniteNumber(rawObject.height, 0.24)),
            restitution: toFiniteNumber(rawObject.restitution, 0.02),
            rotation: toFiniteNumber(rawObject.rotation, 0),
            bodyType: 'kinematic',
            color: typeof rawObject.color === 'string' ? rawObject.color : DEFAULT_OBJECT_COLORS.sticky,
          },
          entityId,
          true,
        ),
        behavior: {
          kind: 'sticky_pad',
          oid: toId(rawObject.oid, `sticky_${entityId}`),
          entityId,
          x: toFiniteNumber(rawObject.x, 11.75),
          y: toFiniteNumber(rawObject.y, 70),
          rotation: toFiniteNumber(rawObject.rotation, 0),
          width: Math.max(0.08, toFiniteNumber(rawObject.width, 1.1)),
          height: Math.max(0.04, toFiniteNumber(rawObject.height, 0.24)),
          speed: Math.max(0.05, toFiniteNumber(rawObject.speed, 1.1)),
          pauseMs: Math.max(0, toFiniteNumber(rawObject.pauseMs, 220)),
          stickyTopOnly: toBoolean(rawObject.stickyTopOnly, true),
          pathA: Array.isArray(rawObject.pathA) && rawObject.pathA.length >= 2
            ? [toFiniteNumber(rawObject.pathA[0], toFiniteNumber(rawObject.x, 11.75)), toFiniteNumber(rawObject.pathA[1], toFiniteNumber(rawObject.y, 70))]
            : [toFiniteNumber(rawObject.x, 11.75), toFiniteNumber(rawObject.y, 70)],
          pathB: Array.isArray(rawObject.pathB) && rawObject.pathB.length >= 2
            ? [toFiniteNumber(rawObject.pathB[0], toFiniteNumber(rawObject.x, 11.75) + 2.4), toFiniteNumber(rawObject.pathB[1], toFiniteNumber(rawObject.y, 70))]
            : [
                toFiniteNumber(rawObject.pathTargetX, toFiniteNumber(rawObject.x, 11.75) + 2.4),
                toFiniteNumber(rawObject.pathTargetY, toFiniteNumber(rawObject.y, 70)),
              ],
        },
      };
    case 'goal_marker_image':
      return {
        entity: null,
        behavior: {
          kind: 'goal_marker_image',
          oid: toId(rawObject.oid, `goal_marker_${entityId}`),
          x: toFiniteNumber(rawObject.x, 11.75),
          y: toFiniteNumber(rawObject.y, 206),
          width: Math.max(0.2, toFiniteNumber(rawObject.width, 6)),
          height: Math.max(0.2, toFiniteNumber(rawObject.height, 1.8)),
          rotation: toFiniteNumber(rawObject.rotation, 0),
          opacity: clamp(toFiniteNumber(rawObject.opacity, 0.86), 0.05, 1),
          imageSrc: normalizeGoalMarkerImageSrc(rawObject.imageSrc),
        },
      };
    default:
      return { entity: null, behavior: null };
  }
}

export function compileMap(mapJson) {
  const safeMap = mapJson && typeof mapJson === 'object' ? deepClone(mapJson) : {};
  const stageRaw = safeMap.stage && typeof safeMap.stage === 'object' ? safeMap.stage : {};
  const spawnRaw = stageRaw.spawn && typeof stageRaw.spawn === 'object' ? stageRaw.spawn : {};
  const objects = Array.isArray(safeMap.objects) ? safeMap.objects : [];

  const entities = [];
  const behaviorDefs = [];
  const objectIndex = [];

  let entityIdCursor = 1;
  for (let index = 0; index < objects.length; index += 1) {
    const rawObject = objects[index];
    const oid = toId(rawObject && rawObject.oid, `obj_${index + 1}`);
    const compiled = compileObject(rawObject, entityIdCursor);
    const createdEntityIds = [];
    const compiledEntities = Array.isArray(compiled && compiled.entities)
      ? compiled.entities.filter((entity) => !!entity)
      : [];
    if (compiledEntities.length > 0) {
      for (let entityIndex = 0; entityIndex < compiledEntities.length; entityIndex += 1) {
        const entity = compiledEntities[entityIndex];
        entities.push(entity);
        objectIndex.push({
          oid,
          type: toId(rawObject.type, ''),
          entityId: entityIdCursor,
        });
        createdEntityIds.push(entityIdCursor);
        entityIdCursor += 1;
      }
    } else if (compiled.entity) {
      entities.push(compiled.entity);
      objectIndex.push({
        oid,
        type: toId(rawObject.type, ''),
        entityId: entityIdCursor,
      });
      createdEntityIds.push(entityIdCursor);
      entityIdCursor += 1;
    }
    if (compiled.behavior) {
      const behavior = { ...compiled.behavior };
      if (createdEntityIds.length > 0 && !Number.isFinite(toFiniteNumber(behavior.entityId, NaN))) {
        behavior.entityId = createdEntityIds[0];
      }
      if (behavior.kind === 'burst_bumper') {
        if (!Array.isArray(behavior.entityIds) || behavior.entityIds.length === 0) {
          behavior.entityIds = createdEntityIds.slice();
        }
        if (!Array.isArray(behavior.layerRadii) || behavior.layerRadii.length === 0) {
          const layerRadii = [];
          for (let entityIndex = 0; entityIndex < compiledEntities.length; entityIndex += 1) {
            const entity = compiledEntities[entityIndex];
            layerRadii.push(Math.max(0.06, toFiniteNumber(entity && entity.shape && entity.shape.radius, behavior.radius)));
          }
          behavior.layerRadii = layerRadii;
        }
      }
      behaviorDefs.push(behavior);
    }
  }

  const stage = {
    title: toId(safeMap.title, toId(safeMap.id, 'V2 Map')),
    goalY: Math.max(20, toFiniteNumber(stageRaw.goalY, DEFAULT_STAGE.goalY)),
    zoomY: Math.max(0, toFiniteNumber(stageRaw.zoomY, DEFAULT_STAGE.zoomY)),
    disableSkills: stageRaw.disableSkills === true,
    disableSkillsInSlowMotion: stageRaw.disableSkillsInSlowMotion !== false,
    skillWarmupMs: Math.max(
      0,
      toFiniteNumber(
        stageRaw.skillWarmupMs,
        toFiniteNumber(stageRaw.skillWarmupSec, 5) * 1000,
      ),
    ),
    spawn: {
      x: toFiniteNumber(spawnRaw.x, DEFAULT_STAGE.spawn.x),
      y: toFiniteNumber(spawnRaw.y, DEFAULT_STAGE.spawn.y),
      columns: Math.max(1, Math.floor(toFiniteNumber(spawnRaw.columns, DEFAULT_STAGE.spawn.columns))),
      spacingX: Math.max(0.08, toFiniteNumber(spawnRaw.spacingX, DEFAULT_STAGE.spawn.spacingX)),
      visibleRows: Math.max(1, Math.floor(toFiniteNumber(spawnRaw.visibleRows, DEFAULT_STAGE.spawn.visibleRows))),
    },
    entities,
  };

  return {
    mapId: toId(safeMap.id, 'v2_map'),
    stage,
    behaviorDefs,
    objectIndex,
    sourceMap: safeMap,
  };
}

function createPortalBehavior(def, portalByOid, env) {
  const cooldownByMarble = {};

  const getPortal = () => portalByOid.get(def.oid) || def;
  const getPairPortal = () => {
    const explicitPair = portalByOid.get(def.pair);
    if (explicitPair && explicitPair.oid && explicitPair.oid !== def.oid) {
      return explicitPair;
    }
    for (const portal of portalByOid.values()) {
      if (!portal || !portal.oid || portal.oid === def.oid) {
        continue;
      }
      if (toId(portal.pair, '') === def.oid) {
        return portal;
      }
    }
    return null;
  };

  function getKey(marbleId) {
    return `${def.oid}:${marbleId}`;
  }

  function setCooldown(marbleId, expiresAt) {
    const safeExpiresAt = Math.max(0, toFiniteNumber(expiresAt, 0));
    for (const portal of portalByOid.values()) {
      if (!portal || !portal.oid) {
        continue;
      }
      cooldownByMarble[`${portal.oid}:${marbleId}`] = safeExpiresAt;
    }
  }

  function getCooldown(marbleId) {
    return toFiniteNumber(cooldownByMarble[getKey(marbleId)], 0);
  }

  function teleportMarble(marble, body, source, target, now) {
    const roulette = env.getRoulette();
    const physics = roulette && roulette.physics ? roulette.physics : null;
    if (!physics || !physics.marbleMap) {
      return;
    }
    const box2d = env.getBox2D();
    if (!body || !box2d || typeof box2d.b2Vec2 !== 'function') {
      return;
    }

    const previousLinearVelocity =
      typeof body.GetLinearVelocity === 'function'
        ? body.GetLinearVelocity()
        : null;
    const previousVx = previousLinearVelocity ? toFiniteNumber(previousLinearVelocity.x, 0) : 0;
    const previousVy = previousLinearVelocity ? toFiniteNumber(previousLinearVelocity.y, 0) : 0;
    const angle = typeof body.GetAngle === 'function' ? body.GetAngle() : 0;
    const targetX = toFiniteNumber(target.x, source.x);
    const targetY = toFiniteNumber(target.y, source.y);
    const hasExitDir = Number.isFinite(toFiniteNumber(target.exitDirDeg, NaN));
    const sourceToTargetDx = targetX - toFiniteNumber(source.x, targetX);
    const sourceToTargetDy = targetY - toFiniteNumber(source.y, targetY);
    const sourceToTargetDist = Math.hypot(sourceToTargetDx, sourceToTargetDy);
    const fallbackDirRad = sourceToTargetDist > 0.0001
      ? Math.atan2(sourceToTargetDy, sourceToTargetDx)
      : degToRad(90);
    const exitDirRad = hasExitDir
      ? degToRad(toFiniteNumber(target.exitDirDeg, 0))
      : fallbackDirRad;
    const spawnX = targetX;
    const spawnY = targetY;

    try {
      if (typeof body.SetEnabled === 'function') {
        body.SetEnabled(true);
      }
      if (typeof body.SetAwake === 'function') {
        body.SetAwake(true);
      }
      if (typeof body.SetTransform === 'function') {
        body.SetTransform(new box2d.b2Vec2(spawnX, spawnY), angle);
      }
      if (typeof body.SetLinearVelocity === 'function') {
        if (target.preserveVelocity) {
          body.SetLinearVelocity(new box2d.b2Vec2(previousVx, previousVy));
        } else {
          body.SetLinearVelocity(new box2d.b2Vec2(0, 0));
        }
      }
      if (typeof body.SetAngularVelocity === 'function') {
        body.SetAngularVelocity(0);
      }
      const impulse = Math.max(0, toFiniteNumber(target.exitImpulse, 0));
      if (impulse > 0 && typeof body.ApplyLinearImpulseToCenter === 'function') {
        const ix = Math.cos(exitDirRad) * impulse;
        const iy = Math.sin(exitDirRad) * impulse;
        body.ApplyLinearImpulseToCenter(new box2d.b2Vec2(ix, iy), true);
      }
      marble.x = spawnX;
      marble.y = spawnY;
      if (marble.lastPosition && typeof marble.lastPosition === 'object') {
        marble.lastPosition.x = spawnX;
        marble.lastPosition.y = spawnY;
      }
    } catch (_) {
      return;
    }

    const cooldownMs = Math.max(
      80,
      Math.max(toFiniteNumber(source.cooldownMs, 900), toFiniteNumber(target.cooldownMs, 900)),
    );
    setCooldown(marble.id, now + cooldownMs);
  }

  return {
    kind: 'portal',
    oid: def.oid,
    tick(now) {
      const roulette = env.getRoulette();
      if (!roulette || env.isPaused()) {
        return;
      }
      const marbles = Array.isArray(roulette._marbles) ? roulette._marbles : [];
      if (marbles.length === 0) {
        return;
      }
      const source = getPortal();
      const target = getPairPortal();
      if (!source || !target || target.oid === source.oid) {
        return;
      }
      const triggerRadius = Math.max(0.12, toFiniteNumber(source.triggerRadius, source.radius + 0.45));
      const radiusSq = triggerRadius * triggerRadius;
      const localTeleported = new Set();
      const physics = roulette && roulette.physics ? roulette.physics : null;
      const marbleMap = physics && physics.marbleMap ? physics.marbleMap : null;
      for (let index = 0; index < marbles.length; index += 1) {
        const marble = marbles[index];
        if (!marble || typeof marble.id !== 'number') {
          continue;
        }
        const body = marbleMap ? marbleMap[marble.id] : null;
        if (!body || typeof body.GetPosition !== 'function') {
          continue;
        }
        if (localTeleported.has(marble.id)) {
          continue;
        }
        const cooldown = getCooldown(marble.id);
        if (cooldown > now) {
          continue;
        }
        const bodyPos = body.GetPosition();
        const px = bodyPos ? toFiniteNumber(bodyPos.x, NaN) : NaN;
        const py = bodyPos ? toFiniteNumber(bodyPos.y, NaN) : NaN;
        const dx = px - source.x;
        const dy = py - source.y;
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
          continue;
        }
        if (dx * dx + dy * dy > radiusSq) {
          continue;
        }
        teleportMarble(marble, body, source, target, now);
        localTeleported.add(marble.id);
      }
    },
    serializeState() {
      return {
        cooldownByMarble: { ...cooldownByMarble },
      };
    },
    restoreState(rawState) {
      const nextState = rawState && typeof rawState === 'object' ? rawState : {};
      const nextCooldown = nextState.cooldownByMarble && typeof nextState.cooldownByMarble === 'object'
        ? nextState.cooldownByMarble
        : {};
      for (const key of Object.keys(cooldownByMarble)) {
        delete cooldownByMarble[key];
      }
      for (const key of Object.keys(nextCooldown)) {
        cooldownByMarble[key] = toFiniteNumber(nextCooldown[key], 0);
      }
    },
  };
}

function createBlackHoleNetworkBehavior(blackHoleDefs, whiteHoleDefs, env) {
  const cooldownByMarble = {};
  let lastTickAt = 0;
  const nextBlackVisualAtByOid = {};
  const nextWhiteVisualAtByOid = {};
  let whitePulseToggle = false;

  const blackDefs = Array.isArray(blackHoleDefs) ? blackHoleDefs : [];
  const whiteDefs = Array.isArray(whiteHoleDefs) ? whiteHoleDefs : [];

  function getCooldown(marbleId) {
    return toFiniteNumber(cooldownByMarble[String(marbleId)], 0);
  }

  function setCooldown(marbleId, expiresAt) {
    cooldownByMarble[String(marbleId)] = Math.max(0, toFiniteNumber(expiresAt, 0));
  }

  function pickWhiteHole() {
    if (whiteDefs.length <= 0) {
      return null;
    }
    const rng = typeof env.getRng === 'function' ? env.getRng() : null;
    const randomValue = rng && typeof rng.next === 'function' ? rng.next() : Math.random();
    const safeRandom = clamp(toFiniteNumber(randomValue, 0), 0, 0.999999);
    const index = Math.floor(safeRandom * whiteDefs.length);
    return whiteDefs[Math.max(0, Math.min(index, whiteDefs.length - 1))] || whiteDefs[0];
  }

  function emitBlackHoleVisual(def, now, intensity = 1) {
    const roulette = env.getRoulette();
    if (!roulette || !Array.isArray(roulette._effects)) {
      return;
    }
    const cx = toFiniteNumber(def && def.x, 0);
    const cy = toFiniteNumber(def && def.y, 0);
    const radius = Math.max(0.12, toFiniteNumber(def && def.radius, 0.72));
    const safeIntensity = clamp(toFiniteNumber(intensity, 1), 0.45, 2.8);
    const duration = Math.round(clamp(220 + safeIntensity * 160, 180, 560));
    roulette._effects.push({
      elapsed: 0,
      duration,
      isDestroy: false,
      update(deltaMs) {
        this.elapsed += toFiniteNumber(deltaMs, 0);
        if (this.elapsed >= this.duration) {
          this.isDestroy = true;
        }
      },
      render(ctx, zoomScale) {
        if (!ctx) {
          return;
        }
        const ratio = clamp(this.elapsed / Math.max(1, this.duration), 0, 1);
        const zoom = Math.max(1, toFiniteNumber(zoomScale, 1));
        const fade = Math.max(0, 1 - ratio);
        const coreRadius = radius * (0.26 + (1 - ratio) * 0.2);
        const fieldRadius = radius * (1.58 + safeIntensity * 0.34);
        const lineWidth = Math.max(0.54 / zoom, 0.34);
        const streakCount = 11;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.globalAlpha = 0.9 * fade;
        ctx.fillStyle = `rgba(46, 20, 80, ${0.16 + fade * 0.22})`;
        ctx.beginPath();
        ctx.arc(0, 0, fieldRadius * (0.84 + ratio * 0.24), 0, Math.PI * 2);
        ctx.fill();

        for (let i = 0; i < streakCount; i += 1) {
          const phase = ratio * 1.92 + (i / streakCount);
          const baseAngle = phase * Math.PI * 2.3;
          const outerRadius = fieldRadius * (0.86 + 0.12 * Math.sin(phase * Math.PI * 2));
          const innerRadius = Math.max(coreRadius * 1.15, radius * (0.42 + 0.18 * Math.sin((phase + 0.2) * Math.PI * 2)));
          const sx = Math.cos(baseAngle) * outerRadius;
          const sy = Math.sin(baseAngle) * outerRadius;
          const endAngle = baseAngle + 0.52 + ratio * 1.6;
          const ex = Math.cos(endAngle) * innerRadius;
          const ey = Math.sin(endAngle) * innerRadius;
          const bendRadius = (outerRadius + innerRadius) * 0.52;
          const bendAngle = baseAngle + 0.28 + ratio * 1.25;
          const bx = Math.cos(bendAngle) * bendRadius;
          const by = Math.sin(bendAngle) * bendRadius;
          ctx.strokeStyle = `rgba(193, 144, 255, ${0.48 * fade})`;
          ctx.lineWidth = lineWidth * (1 + (i % 3) * 0.12);
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.quadraticCurveTo(bx, by, ex, ey);
          ctx.stroke();
        }

        for (let i = 0; i < 7; i += 1) {
          const particleT = ((ratio * 1.35) + i * 0.17) % 1;
          const particleAngle = particleT * Math.PI * 4 + i * 0.72;
          const particleRadius = coreRadius + (fieldRadius - coreRadius) * (1 - particleT);
          const px = Math.cos(particleAngle) * particleRadius;
          const py = Math.sin(particleAngle) * particleRadius;
          const dotRadius = Math.max(0.012, radius * 0.04 * (1 - particleT * 0.75));
          ctx.fillStyle = `rgba(216, 182, 255, ${0.34 * fade * (1 - particleT * 0.55)})`;
          ctx.beginPath();
          ctx.arc(px, py, dotRadius, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.globalAlpha = Math.max(0, 0.96 * fade);
        ctx.fillStyle = 'rgba(8, 6, 20, 0.82)';
        ctx.beginPath();
        ctx.arc(0, 0, coreRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(199, 150, 255, ${0.56 * fade})`;
        ctx.lineWidth = lineWidth * 1.12;
        ctx.beginPath();
        ctx.arc(0, 0, radius * (0.78 + ratio * 0.2), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      },
    });
    nextBlackVisualAtByOid[String(def && def.oid ? def.oid : '__black')] = now + 110;
  }

  function emitWhiteHoleVisual(def, now, boosted = false) {
    const roulette = env.getRoulette();
    if (!roulette || !Array.isArray(roulette._effects)) {
      return;
    }
    const cx = toFiniteNumber(def && def.x, 0);
    const cy = toFiniteNumber(def && def.y, 0);
    const radius = Math.max(0.12, toFiniteNumber(def && def.radius, 0.62));
    const shortPulse = boosted || whitePulseToggle;
    whitePulseToggle = !whitePulseToggle;
    const duration = shortPulse ? 150 : 280;
    roulette._effects.push({
      elapsed: 0,
      duration,
      isDestroy: false,
      update(deltaMs) {
        this.elapsed += toFiniteNumber(deltaMs, 0);
        if (this.elapsed >= this.duration) {
          this.isDestroy = true;
        }
      },
      render(ctx, zoomScale) {
        if (!ctx) {
          return;
        }
        const ratio = clamp(this.elapsed / Math.max(1, this.duration), 0, 1);
        const lineWidth = Math.max(0.58 / Math.max(1, toFiniteNumber(zoomScale, 1)), 0.36);
        const pulseRadius = radius * (0.88 + ratio * (shortPulse ? 1.02 : 1.46));
        const coreAlpha = shortPulse ? 0.28 : 0.22;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.globalAlpha = Math.max(0, 1 - ratio * 0.94);
        ctx.fillStyle = `rgba(246, 246, 246, ${coreAlpha})`;
        ctx.beginPath();
        ctx.arc(0, 0, radius * (0.82 + (1 - ratio) * 0.22), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.34 * (1 - ratio)})`;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.arc(0, 0, pulseRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = `rgba(225, 225, 225, ${0.18 * (1 - ratio)})`;
        ctx.lineWidth = lineWidth * 0.82;
        ctx.beginPath();
        ctx.arc(0, 0, pulseRadius * 1.25, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      },
    });
    nextWhiteVisualAtByOid[String(def && def.oid ? def.oid : '__white')] = now + (shortPulse ? 280 : 480);
  }

  function teleportToWhiteHole(marble, body, sourceDef, targetDef, now) {
    const box2d = env.getBox2D();
    if (!box2d || typeof box2d.b2Vec2 !== 'function') {
      return false;
    }
    const targetX = toFiniteNumber(targetDef && targetDef.x, toFiniteNumber(sourceDef && sourceDef.x, 0));
    const targetY = toFiniteNumber(targetDef && targetDef.y, toFiniteNumber(sourceDef && sourceDef.y, 0));
    const launchImpulse = Math.max(
      0.1,
      Math.max(
        toFiniteNumber(targetDef && targetDef.launchImpulse, 4.6),
        toFiniteNumber(sourceDef && sourceDef.launchImpulse, 3.6),
      ),
    );
    const rng = typeof env.getRng === 'function' ? env.getRng() : null;
    const angleRad = (rng && typeof rng.next === 'function' ? rng.next() : Math.random()) * Math.PI * 2;
    const ix = Math.cos(angleRad) * launchImpulse;
    const iy = Math.sin(angleRad) * launchImpulse;
    try {
      if (typeof body.SetEnabled === 'function') {
        body.SetEnabled(true);
      }
      if (typeof body.SetAwake === 'function') {
        body.SetAwake(true);
      }
      if (typeof body.SetTransform === 'function') {
        const angle = typeof body.GetAngle === 'function' ? body.GetAngle() : 0;
        body.SetTransform(new box2d.b2Vec2(targetX, targetY), angle);
      }
      if (typeof body.SetLinearVelocity === 'function') {
        body.SetLinearVelocity(new box2d.b2Vec2(0, 0));
      }
      if (typeof body.SetAngularVelocity === 'function') {
        body.SetAngularVelocity(0);
      }
      if (typeof body.ApplyLinearImpulseToCenter === 'function') {
        body.ApplyLinearImpulseToCenter(new box2d.b2Vec2(ix, iy), true);
      }
      marble.x = targetX;
      marble.y = targetY;
      marble.isActive = true;
      if (marble.lastPosition && typeof marble.lastPosition === 'object') {
        marble.lastPosition.x = targetX;
        marble.lastPosition.y = targetY;
      }
    } catch (_) {
      return false;
    }
    const cooldownMs = Math.max(
      80,
      Math.max(
        toFiniteNumber(sourceDef && sourceDef.cooldownMs, 900),
        toFiniteNumber(targetDef && targetDef.cooldownMs, 900),
      ),
    );
    setCooldown(marble.id, now + cooldownMs);
    emitWhiteHoleVisual(targetDef, now, true);
    return true;
  }

  return {
    kind: 'black_hole_network',
    oid: '__black_hole_network__',
    tick(now) {
      if (env.isPaused() || blackDefs.length <= 0) {
        return;
      }
      const roulette = env.getRoulette();
      const physics = roulette && roulette.physics ? roulette.physics : null;
      const box2d = env.getBox2D();
      if (!roulette || !physics || !physics.marbleMap || !box2d || typeof box2d.b2Vec2 !== 'function') {
        return;
      }
      const marbles = Array.isArray(roulette._marbles) ? roulette._marbles : [];
      if (marbles.length <= 0) {
        return;
      }
      const dtMs = Math.max(8, Math.min(80, toFiniteNumber(now - lastTickAt, 16)));
      lastTickAt = now;
      const deltaScale = dtMs / 16.666;
      for (let index = 0; index < blackDefs.length; index += 1) {
        const black = blackDefs[index];
        if (!black || !black.oid) {
          continue;
        }
        const key = String(black.oid);
        const dueAt = toFiniteNumber(nextBlackVisualAtByOid[key], 0);
        if (now >= dueAt) {
          emitBlackHoleVisual(black, now, 1);
        }
      }
      for (let index = 0; index < whiteDefs.length; index += 1) {
        const white = whiteDefs[index];
        if (!white || !white.oid) {
          continue;
        }
        const key = String(white.oid);
        const dueAt = toFiniteNumber(nextWhiteVisualAtByOid[key], 0);
        if (now >= dueAt) {
          emitWhiteHoleVisual(white, now, false);
        }
      }

      for (let marbleIndex = 0; marbleIndex < marbles.length; marbleIndex += 1) {
        const marble = marbles[marbleIndex];
        if (!marble || typeof marble.id !== 'number') {
          continue;
        }
        if (getCooldown(marble.id) > now) {
          continue;
        }
        const body = physics.marbleMap[marble.id];
        if (!body || typeof body.GetPosition !== 'function') {
          continue;
        }
        const bodyPos = body.GetPosition();
        const px = toFiniteNumber(bodyPos && bodyPos.x, NaN);
        const py = toFiniteNumber(bodyPos && bodyPos.y, NaN);
        if (!Number.isFinite(px) || !Number.isFinite(py)) {
          continue;
        }

        let teleported = false;
        for (let blackIndex = 0; blackIndex < blackDefs.length; blackIndex += 1) {
          const black = blackDefs[blackIndex];
          if (!black) {
            continue;
          }
          const centerX = toFiniteNumber(black.x, 0);
          const centerY = toFiniteNumber(black.y, 0);
          const dx = centerX - px;
          const dy = centerY - py;
          const distSq = dx * dx + dy * dy;
          if (!Number.isFinite(distSq)) {
            continue;
          }

          const coreRadius = Math.max(0.06, toFiniteNumber(black.radius, 0.72));
          const suctionRadius = Math.max(coreRadius + 0.2, toFiniteNumber(black.triggerRadius, coreRadius + 1.4));
          if (distSq > suctionRadius * suctionRadius) {
            continue;
          }
          const dist = Math.sqrt(Math.max(0.0000001, distSq));
          const nx = dx / dist;
          const ny = dy / dist;
          const falloff = Math.max(0, 1 - dist / suctionRadius);
          const suctionForce = Math.max(0.35, toFiniteNumber(black.suctionForce, toFiniteNumber(black.force, 0.8)));
          const pullImpulse = suctionForce * deltaScale * (0.75 + falloff * 2.4);
          try {
            if (typeof body.SetEnabled === 'function') {
              body.SetEnabled(true);
            }
            if (typeof body.SetAwake === 'function') {
              body.SetAwake(true);
            }
            body.ApplyLinearImpulseToCenter(new box2d.b2Vec2(nx * pullImpulse, ny * pullImpulse), true);
          } catch (_) {
          }

          const captureRadius = Math.max(
            coreRadius + 0.78,
            Math.min(
              suctionRadius * 0.95,
              coreRadius * 2.35,
            ),
          );
          if (dist > captureRadius) {
            continue;
          }
          emitBlackHoleVisual(black, now, 1.7);
          const target = pickWhiteHole();
          if (!target) {
            continue;
          }
          teleported = teleportToWhiteHole(marble, body, black, target, now);
          if (teleported) {
            break;
          }
        }
        if (teleported) {
          continue;
        }
      }
    },
    serializeState() {
      return {
        cooldownByMarble: { ...cooldownByMarble },
        lastTickAt: toFiniteNumber(lastTickAt, 0),
        nextBlackVisualAtByOid: { ...nextBlackVisualAtByOid },
        nextWhiteVisualAtByOid: { ...nextWhiteVisualAtByOid },
        whitePulseToggle,
      };
    },
    restoreState(rawState) {
      const nextState = rawState && typeof rawState === 'object' ? rawState : {};
      const cooldownState = nextState.cooldownByMarble && typeof nextState.cooldownByMarble === 'object'
        ? nextState.cooldownByMarble
        : {};
      for (const key of Object.keys(cooldownByMarble)) {
        delete cooldownByMarble[key];
      }
      for (const key of Object.keys(cooldownState)) {
        cooldownByMarble[key] = toFiniteNumber(cooldownState[key], 0);
      }
      lastTickAt = toFiniteNumber(nextState.lastTickAt, 0);
      const blackVisualState = nextState.nextBlackVisualAtByOid && typeof nextState.nextBlackVisualAtByOid === 'object'
        ? nextState.nextBlackVisualAtByOid
        : {};
      const whiteVisualState = nextState.nextWhiteVisualAtByOid && typeof nextState.nextWhiteVisualAtByOid === 'object'
        ? nextState.nextWhiteVisualAtByOid
        : {};
      for (const key of Object.keys(nextBlackVisualAtByOid)) {
        delete nextBlackVisualAtByOid[key];
      }
      for (const key of Object.keys(nextWhiteVisualAtByOid)) {
        delete nextWhiteVisualAtByOid[key];
      }
      for (const key of Object.keys(blackVisualState)) {
        nextBlackVisualAtByOid[key] = toFiniteNumber(blackVisualState[key], 0);
      }
      for (const key of Object.keys(whiteVisualState)) {
        nextWhiteVisualAtByOid[key] = toFiniteNumber(whiteVisualState[key], 0);
      }
      whitePulseToggle = nextState.whitePulseToggle === true;
    },
  };
}

function createBurstBumperBehavior(def, env) {
  const cooldownByMarble = {};
  const layerEntityIds = Array.isArray(def.entityIds) && def.entityIds.length > 0
    ? def.entityIds
        .map((value) => Math.floor(toFiniteNumber(value, NaN)))
        .filter((value) => Number.isFinite(value))
    : [Math.floor(toFiniteNumber(def.entityId, NaN))].filter((value) => Number.isFinite(value));
  const totalLayers = Math.max(
    1,
    Math.max(
      Math.floor(toFiniteNumber(def.layers, 3)),
      layerEntityIds.length,
    ),
  );
  const hpPerLayer = Math.max(1, Math.floor(toFiniteNumber(def.hpPerLayer, 1)));
  const damagePerHit = Math.max(1, Math.floor(toFiniteNumber(def.damagePerHit, 1)));
  const baseRadius = Math.max(0.06, toFiniteNumber(def.radius, 0.68));
  const configuredLayerRadii = Array.isArray(def.layerRadii)
    ? def.layerRadii.map((value) => Math.max(0.06, toFiniteNumber(value, baseRadius)))
    : [];
  const layerRadii = Array.from({ length: totalLayers }, (_, index) => {
    if (Number.isFinite(toFiniteNumber(configuredLayerRadii[index], NaN))) {
      return Math.max(0.06, toFiniteNumber(configuredLayerRadii[index], baseRadius));
    }
    return Math.max(0.06, baseRadius * ((totalLayers - index) / totalLayers));
  });
  function durabilityScaleByMarbleCount() {
    const roulette = env.getRoulette();
    const marbles = roulette && Array.isArray(roulette._marbles) ? roulette._marbles : [];
    const count = Math.max(0, marbles.length);
    if (count <= 10) {
      return 1;
    }
    if (count <= 20) {
      return 1.6;
    }
    if (count <= 32) {
      return 2.3;
    }
    if (count <= 64) {
      return 3.1;
    }
    return 4.0;
  }
  const durabilityScale = durabilityScaleByMarbleCount();
  const effectiveHpPerLayer = Math.max(1, hpPerLayer * durabilityScale);
  const layerHp = Array.from({ length: totalLayers }, () => effectiveHpPerLayer);
  const offscreenX = -9999;
  const offscreenY = -9999;
  let destroyed = false;
  let activeLayerIndex = 0;
  let nextTriggerAt = 0;

  function getEntryByLayerIndex(layerIndex) {
    const entityId = layerEntityIds[layerIndex];
    if (!Number.isFinite(toFiniteNumber(entityId, NaN))) {
      return null;
    }
    const roulette = env.getRoulette();
    const physics = roulette && roulette.physics ? roulette.physics : null;
    const entities = physics && Array.isArray(physics.entities) ? physics.entities : [];
    for (let index = 0; index < entities.length; index += 1) {
      const entry = entities[index];
      const entryEid = toFiniteNumber(entry && entry.shape && entry.shape.__v2eid, NaN);
      if (Number.isFinite(entryEid) && entryEid === entityId) {
        return entry;
      }
    }
    return null;
  }

  function setEntryEnabled(layerIndex, enabled) {
    const entry = getEntryByLayerIndex(layerIndex);
    if (!entry || !entry.shape || entry.shape.type !== 'circle') {
      return;
    }
    const box2d = env.getBox2D();
    const body = entry.body;
    const radius = Math.max(0.06, toFiniteNumber(layerRadii[layerIndex], baseRadius));
    if (!body || !box2d || typeof box2d.b2Vec2 !== 'function') {
      if (enabled) {
        entry.x = toFiniteNumber(def.x, 0);
        entry.y = toFiniteNumber(def.y, 0);
        entry.shape.radius = radius;
      } else {
        entry.x = offscreenX;
        entry.y = offscreenY;
      }
      return;
    }
    try {
      if (typeof body.SetEnabled === 'function') {
        body.SetEnabled(enabled);
      }
      if (typeof body.SetAwake === 'function') {
        body.SetAwake(enabled);
      }
      if (typeof body.SetLinearVelocity === 'function') {
        body.SetLinearVelocity(new box2d.b2Vec2(0, 0));
      }
      if (typeof body.SetAngularVelocity === 'function') {
        body.SetAngularVelocity(0);
      }
      if (typeof body.SetTransform === 'function') {
        const angle = typeof body.GetAngle === 'function' ? body.GetAngle() : 0;
        if (enabled) {
          body.SetTransform(new box2d.b2Vec2(toFiniteNumber(def.x, 0), toFiniteNumber(def.y, 0)), angle);
        } else {
          body.SetTransform(new box2d.b2Vec2(offscreenX, offscreenY), angle);
        }
      }
    } catch (_) {
    }
    if (enabled) {
      entry.x = toFiniteNumber(def.x, 0);
      entry.y = toFiniteNumber(def.y, 0);
      entry.shape.radius = radius;
    } else {
      entry.x = offscreenX;
      entry.y = offscreenY;
    }
  }

  function recomputeActiveLayer() {
    activeLayerIndex = -1;
    for (let index = 0; index < totalLayers; index += 1) {
      if (toFiniteNumber(layerHp[index], 0) > 0) {
        activeLayerIndex = index;
        break;
      }
    }
    destroyed = activeLayerIndex < 0;
  }

  function syncLayerVisuals() {
    for (let index = 0; index < totalLayers; index += 1) {
      const enabled = toFiniteNumber(layerHp[index], 0) > 0;
      setEntryEnabled(index, enabled);
    }
  }

  function canTrigger(marbleId, now) {
    const key = String(marbleId);
    return toFiniteNumber(cooldownByMarble[key], 0) <= now;
  }

  function setCooldown(marbleId, now) {
    cooldownByMarble[String(marbleId)] = now + def.cooldownMs;
  }

  function emitWeakBurstEffect(now, nx, ny) {
    const roulette = env.getRoulette();
    const physics = roulette && roulette.physics ? roulette.physics : null;
    const box2d = env.getBox2D();
    if (!roulette || !physics || !physics.marbleMap || !box2d || typeof box2d.b2Vec2 !== 'function') {
      return;
    }
    const pushRange = Math.max(1.2, Math.min(4.6, Math.max(0.5, toFiniteNumber(def.triggerRadius, baseRadius + 0.45)) * 2.1));
    const pushRangeSq = pushRange * pushRange;
    const pushPower = Math.max(0.08, toFiniteNumber(def.force, 6.2) * 0.22);
    const marbles = Array.isArray(roulette._marbles) ? roulette._marbles : [];
    for (let index = 0; index < marbles.length; index += 1) {
      const other = marbles[index];
      if (!other || typeof other.id !== 'number') {
        continue;
      }
      const otherBody = physics.marbleMap[other.id];
      if (!otherBody || typeof otherBody.GetPosition !== 'function' || typeof otherBody.ApplyLinearImpulseToCenter !== 'function') {
        continue;
      }
      const p = otherBody.GetPosition();
      const dx = toFiniteNumber(p && p.x, NaN) - def.x;
      const dy = toFiniteNumber(p && p.y, NaN) - def.y;
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
        continue;
      }
      const distSq = dx * dx + dy * dy;
      if (distSq <= 0.00001 || distSq > pushRangeSq) {
        continue;
      }
      const dist = Math.sqrt(distSq);
      const falloff = Math.max(0, 1 - dist / pushRange);
      const impulse = pushPower * (0.35 + falloff * 0.65);
      const ux = dx / dist;
      const uy = dy / dist;
      try {
        otherBody.ApplyLinearImpulseToCenter(new box2d.b2Vec2(ux * impulse, uy * impulse), true);
      } catch (_) {
      }
    }
    if (Array.isArray(roulette._effects)) {
      roulette._effects.push({
        elapsed: 0,
        duration: 220,
        isDestroy: false,
        update(deltaMs) {
          this.elapsed += toFiniteNumber(deltaMs, 0);
          if (this.elapsed >= this.duration) {
            this.isDestroy = true;
          }
        },
        render(ctx, zoomScale) {
          if (!ctx) {
            return;
          }
          const ratio = Math.max(0, Math.min(1, this.elapsed / this.duration));
          const radius = Math.max(0.05, (baseRadius + 0.06) + ratio * 0.72);
          const alpha = Math.max(0, 0.4 * (1 - ratio));
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = 'rgba(93,255,122,0.95)';
          ctx.lineWidth = Math.max(1 / Math.max(1, toFiniteNumber(zoomScale, 1)), 1.4 / Math.max(1, toFiniteNumber(zoomScale, 1)));
          ctx.beginPath();
          ctx.arc(def.x, def.y, radius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        },
      });
    }
    const safeNow = toFiniteNumber(now, Date.now());
    nextTriggerAt = safeNow + Math.max(30, toFiniteNumber(def.cooldownMs, 420));
  }

  function triggerBurst(marble, now) {
    if (destroyed) {
      return;
    }
    const roulette = env.getRoulette();
    const physics = roulette && roulette.physics ? roulette.physics : null;
    const box2d = env.getBox2D();
    if (!physics || !physics.marbleMap || !box2d || typeof box2d.b2Vec2 !== 'function') {
      return;
    }
    const body = physics.marbleMap[marble.id];
    if (!body || typeof body.ApplyLinearImpulseToCenter !== 'function') {
      return;
    }
    const bodyPosition = typeof body.GetPosition === 'function' ? body.GetPosition() : null;
    let dx = (bodyPosition ? toFiniteNumber(bodyPosition.x, marble.x) : toFiniteNumber(marble.x, def.x)) - def.x;
    let dy = (bodyPosition ? toFiniteNumber(bodyPosition.y, marble.y) : toFiniteNumber(marble.y, def.y)) - def.y;
    let distance = Math.hypot(dx, dy);
    if (distance <= 0.0001) {
      const rng = typeof env.getRng === 'function' ? env.getRng() : null;
      const randomDeg = rng && typeof rng.next === 'function' ? rng.next() * 360 : 0;
      const randomAngle = degToRad(toFiniteNumber(randomDeg, 0));
      dx = Math.cos(randomAngle);
      dy = Math.sin(randomAngle);
      distance = 1;
    }
    const nx = dx / distance;
    const ny = dy / distance;
    const impulse = Math.max(0.1, toFiniteNumber(def.force, 6.2));
    const boostY = Math.max(0, toFiniteNumber(def.upwardBoost, 0));
    const iy = ny * impulse - boostY;
    try {
      if (typeof body.SetEnabled === 'function') {
        body.SetEnabled(true);
      }
      if (typeof body.SetAwake === 'function') {
        body.SetAwake(true);
      }
      body.ApplyLinearImpulseToCenter(new box2d.b2Vec2(nx * impulse, iy), true);
    } catch (_) {
      return;
    }
    setCooldown(marble.id, now);
    emitWeakBurstEffect(now, nx, ny);
    if (!Number.isFinite(toFiniteNumber(activeLayerIndex, NaN)) || activeLayerIndex < 0 || activeLayerIndex >= totalLayers) {
      return;
    }
    layerHp[activeLayerIndex] = Math.max(0, Math.floor(toFiniteNumber(layerHp[activeLayerIndex], hpPerLayer) - damagePerHit));
    recomputeActiveLayer();
    syncLayerVisuals();
  }

  recomputeActiveLayer();
  syncLayerVisuals();

  return {
    kind: 'burst_bumper',
    oid: def.oid,
    tick(now) {
      if (env.isPaused()) {
        return;
      }
      const roulette = env.getRoulette();
      if (!roulette) {
        return;
      }
      if (toFiniteNumber(nextTriggerAt, 0) > now) {
        return;
      }
      const marbles = Array.isArray(roulette._marbles) ? roulette._marbles : [];
      if (marbles.length === 0 || destroyed) {
        return;
      }
      const physics = roulette && roulette.physics ? roulette.physics : null;
      const marbleMap = physics && physics.marbleMap ? physics.marbleMap : null;
      const currentLayerRadius = Math.max(0.06, toFiniteNumber(layerRadii[activeLayerIndex], baseRadius));
      const configuredTriggerRadius = Math.max(
        currentLayerRadius + 0.2,
        toFiniteNumber(def.triggerRadius, currentLayerRadius + 0.45),
      );
      const triggerRadius = Math.min(configuredTriggerRadius, currentLayerRadius + 0.55);
      const radiusSq = triggerRadius * triggerRadius;
      for (let index = 0; index < marbles.length; index += 1) {
        const marble = marbles[index];
        if (!marble || typeof marble.id !== 'number') {
          continue;
        }
        if (!canTrigger(marble.id, now)) {
          continue;
        }
        const body = marbleMap ? marbleMap[marble.id] : null;
        const bodyPosition = body && typeof body.GetPosition === 'function'
          ? body.GetPosition()
          : null;
        const px = bodyPosition ? toFiniteNumber(bodyPosition.x, toFiniteNumber(marble.x, NaN)) : toFiniteNumber(marble.x, NaN);
        const py = bodyPosition ? toFiniteNumber(bodyPosition.y, toFiniteNumber(marble.y, NaN)) : toFiniteNumber(marble.y, NaN);
        const dx = px - def.x;
        const dy = py - def.y;
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
          continue;
        }
        if (dx * dx + dy * dy > radiusSq) {
          continue;
        }
        triggerBurst(marble, now);
        break;
      }
    },
    serializeState() {
      return {
        layerHp: layerHp.slice(),
        hpPerLayer,
        totalLayers,
        activeLayerIndex,
        destroyed,
        layerRadii: layerRadii.slice(),
        nextTriggerAt: toFiniteNumber(nextTriggerAt, 0),
        cooldownByMarble: { ...cooldownByMarble },
      };
    },
    restoreState(rawState) {
      for (const key of Object.keys(cooldownByMarble)) {
        delete cooldownByMarble[key];
      }
      const safeState = rawState && typeof rawState === 'object' ? rawState : {};
      const restoredLayerHp = Array.isArray(safeState.layerHp)
        ? safeState.layerHp
        : [];
      for (let index = 0; index < totalLayers; index += 1) {
        const nextHp = toFiniteNumber(restoredLayerHp[index], effectiveHpPerLayer);
        layerHp[index] = Math.max(0, nextHp);
      }
      const nextCooldown = safeState.cooldownByMarble && typeof safeState.cooldownByMarble === 'object'
        ? safeState.cooldownByMarble
        : {};
      for (const key of Object.keys(nextCooldown)) {
        cooldownByMarble[key] = toFiniteNumber(nextCooldown[key], 0);
      }
      nextTriggerAt = Math.max(0, toFiniteNumber(safeState.nextTriggerAt, 0));
      recomputeActiveLayer();
      if (safeState.destroyed === true) {
        for (let index = 0; index < totalLayers; index += 1) {
          layerHp[index] = 0;
        }
        recomputeActiveLayer();
      }
      syncLayerVisuals();
    },
  };
}

function createStopwatchBombBehavior(def, env) {
  let nextBlastAt = 0;

  function emitBlastEffect(radius) {
    const roulette = env.getRoulette();
    if (!roulette || !Array.isArray(roulette._effects)) {
      return;
    }
    const centerX = toFiniteNumber(def.x, 0);
    const centerY = toFiniteNumber(def.y, 0);
    const baseRadius = Math.max(0.2, toFiniteNumber(radius, toFiniteNumber(def.triggerRadius, 2.2)));
    roulette._effects.push({
      elapsed: 0,
      duration: 320,
      isDestroy: false,
      update(deltaMs) {
        this.elapsed += toFiniteNumber(deltaMs, 0);
        if (this.elapsed >= this.duration) {
          this.isDestroy = true;
        }
      },
      render(ctx, zoomScale) {
        if (!ctx) {
          return;
        }
        const ratio = clamp(this.elapsed / Math.max(1, this.duration), 0, 1);
        const radiusNow = Math.max(0.05, baseRadius * (0.28 + ratio * 1.45));
        const alpha = Math.max(0, 0.85 - ratio * 0.8);
        const lineWidth = Math.max(0.06, 1.2 / Math.max(1, toFiniteNumber(zoomScale, 1)));
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = 'rgba(255, 74, 98, 0.98)';
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radiusNow, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 149, 160, 0.92)';
        ctx.lineWidth = lineWidth * 0.85;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radiusNow * 0.64, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      },
    });
  }

  return {
    kind: 'stopwatch_bomb',
    oid: def.oid,
    tick(now) {
      if (env.isPaused()) {
        return;
      }
      const intervalMs = Math.max(120, toFiniteNumber(def.intervalMs, 4000));
      if (!Number.isFinite(toFiniteNumber(nextBlastAt, NaN)) || nextBlastAt <= 0) {
        nextBlastAt = now + intervalMs;
        return;
      }
      if (now < nextBlastAt) {
        return;
      }
      nextBlastAt = now + intervalMs;
      const roulette = env.getRoulette();
      const physics = roulette && roulette.physics ? roulette.physics : null;
      const box2d = env.getBox2D();
      const centerX = toFiniteNumber(def.x, 0);
      const centerY = toFiniteNumber(def.y, 0);
      const triggerRadius = Math.max(0.2, toFiniteNumber(def.triggerRadius, 2.2));
      const triggerRadiusSq = triggerRadius * triggerRadius;
      const force = Math.max(0.1, toFiniteNumber(def.force, 4.8));
      const rng = typeof env.getRng === 'function' ? env.getRng() : null;

      if (roulette && physics && physics.marbleMap && box2d && typeof box2d.b2Vec2 === 'function') {
        const marbles = Array.isArray(roulette._marbles) ? roulette._marbles : [];
        for (let index = 0; index < marbles.length; index += 1) {
          const marble = marbles[index];
          if (!marble || typeof marble.id !== 'number') {
            continue;
          }
          const body = physics.marbleMap[marble.id];
          if (!body || typeof body.GetPosition !== 'function' || typeof body.ApplyLinearImpulseToCenter !== 'function') {
            continue;
          }
          const pos = body.GetPosition();
          let dx = toFiniteNumber(pos && pos.x, NaN) - centerX;
          let dy = toFiniteNumber(pos && pos.y, NaN) - centerY;
          if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
            continue;
          }
          const distSq = dx * dx + dy * dy;
          if (distSq > triggerRadiusSq) {
            continue;
          }
          let distance = Math.sqrt(Math.max(distSq, 0.0000001));
          if (distance <= 0.0001) {
            const randomRad = (rng && typeof rng.next === 'function' ? rng.next() : Math.random()) * Math.PI * 2;
            dx = Math.cos(randomRad);
            dy = Math.sin(randomRad);
            distance = 1;
          }
          const nx = dx / distance;
          const ny = dy / distance;
          const falloff = Math.max(0, 1 - distance / Math.max(0.0001, triggerRadius));
          const impulse = force * (0.35 + falloff * 0.65);
          try {
            if (typeof body.SetEnabled === 'function') {
              body.SetEnabled(true);
            }
            if (typeof body.SetAwake === 'function') {
              body.SetAwake(true);
            }
            body.ApplyLinearImpulseToCenter(new box2d.b2Vec2(nx * impulse, ny * impulse), true);
          } catch (_) {
          }
        }
      }
      emitBlastEffect(triggerRadius);
    },
    serializeState() {
      return {
        nextBlastAt: toFiniteNumber(nextBlastAt, 0),
      };
    },
    restoreState(rawState) {
      const safeState = rawState && typeof rawState === 'object' ? rawState : {};
      nextBlastAt = Math.max(0, toFiniteNumber(safeState.nextBlastAt, 0));
    },
  };
}

function createHammerBehavior(def, env) {
  let lastScheduledAt = 0;
  let queue = [];
  let swingUntil = 0;
  let swingStartAt = 0;
  let baseAngleRad = null;
  let basePosX = NaN;
  let basePosY = NaN;
  let lastOffset = 0;
  let lastTickAt = 0;

  function getHammerEntry() {
    const roulette = env.getRoulette();
    const physics = roulette && roulette.physics ? roulette.physics : null;
    const entities = physics && Array.isArray(physics.entities) ? physics.entities : [];
    for (let index = 0; index < entities.length; index += 1) {
      const entry = entities[index];
      const entityId = toFiniteNumber(entry && entry.shape && entry.shape.__v2eid, NaN);
      if (Number.isFinite(entityId) && entityId === toFiniteNumber(def.entityId, -1)) {
        return entry;
      }
    }
    return null;
  }

  function updateSwingVisual(now) {
    const entry = getHammerEntry();
    const box2d = env.getBox2D();
    if (!entry || !entry.body || !box2d || typeof box2d.b2Vec2 !== 'function') {
      return;
    }
    const body = entry.body;
    const currentAngle = typeof body.GetAngle === 'function' ? body.GetAngle() : 0;
    if (!Number.isFinite(baseAngleRad)) {
      const initialRotation = degToRad(toFiniteNumber(def.dirDeg, toFiniteNumber(def.rotation, 0)));
      baseAngleRad = Number.isFinite(initialRotation) ? initialRotation : currentAngle;
    }
    if (!Number.isFinite(basePosX) || !Number.isFinite(basePosY)) {
      const currentPos = typeof body.GetPosition === 'function' ? body.GetPosition() : null;
      basePosX = currentPos ? toFiniteNumber(currentPos.x, toFiniteNumber(def.x, 0)) : toFiniteNumber(def.x, 0);
      basePosY = currentPos ? toFiniteNumber(currentPos.y, toFiniteNumber(def.y, 0)) : toFiniteNumber(def.y, 0);
    }
    const swingDuration = Math.max(80, toFiniteNumber(def.swingDurationMs, 220));
    const forceScale = clamp(toFiniteNumber(def.force, 4.2) / 4.2, 0.35, 2.8);
    const hitDistance = Math.max(0, toFiniteNumber(def.hitDistance, 0.95)) * forceScale;
    const backDistance = Math.max(0, toFiniteNumber(def.backDistance, hitDistance * 0.45)) * Math.max(0.6, Math.min(1.4, forceScale));
    const dirRad = degToRad(toFiniteNumber(def.dirDeg, 90));
    const targetAngle = toFiniteNumber(baseAngleRad, 0);
    let linearOffset = 0;
    if (swingUntil > now) {
      const elapsed = clamp(now - swingStartAt, 0, swingDuration);
      const progress = clamp(elapsed / swingDuration, 0, 1);
      if (progress < 0.28) {
        const windupT = progress / 0.28;
        linearOffset = -backDistance * windupT;
      } else if (progress < 0.58) {
        const strikeT = (progress - 0.28) / 0.30;
        linearOffset = -backDistance + (hitDistance + backDistance) * strikeT;
      } else {
        const recoverT = (progress - 0.58) / 0.42;
        linearOffset = hitDistance * (1 - recoverT);
      }
    } else {
      linearOffset = 0;
    }
    const targetX = toFiniteNumber(basePosX, toFiniteNumber(def.x, 0)) + Math.cos(dirRad) * linearOffset;
    const targetY = toFiniteNumber(basePosY, toFiniteNumber(def.y, 0)) + Math.sin(dirRad) * linearOffset;
    const dt = Math.max(1, toFiniteNumber(now - lastTickAt, 16)) / 1000;
    const offsetVelocity = (linearOffset - toFiniteNumber(lastOffset, 0)) / dt;
    let velocityX = Math.cos(dirRad) * offsetVelocity;
    let velocityY = Math.sin(dirRad) * offsetVelocity;
    if (Math.abs(linearOffset) < 0.0001 && swingUntil <= now) {
      velocityX = 0;
      velocityY = 0;
    }
    try {
      if (typeof body.SetTransform === 'function') {
        body.SetTransform(new box2d.b2Vec2(targetX, targetY), targetAngle);
      }
      if (typeof body.SetLinearVelocity === 'function') {
        body.SetLinearVelocity(new box2d.b2Vec2(velocityX, velocityY));
      }
      if (typeof body.SetAngularVelocity === 'function') {
        body.SetAngularVelocity(0);
      }
      if (typeof body.SetEnabled === 'function') {
        body.SetEnabled(true);
      }
      if (typeof body.SetAwake === 'function') {
        body.SetAwake(true);
      }
    } catch (_) {
    }
    entry.x = targetX;
    entry.y = targetY;
    if (entry.position && typeof entry.position === 'object') {
      entry.position.x = targetX;
      entry.position.y = targetY;
    }
    lastOffset = linearOffset;
    lastTickAt = now;
  }

  return {
    kind: 'hammer',
    oid: def.oid,
    tick(now) {
      if (env.isPaused()) {
        return;
      }
      if (lastScheduledAt <= 0) {
        lastScheduledAt = now - Math.max(60, toFiniteNumber(def.intervalMs, 1200));
      }
      if (now - lastScheduledAt >= def.intervalMs) {
        lastScheduledAt = now;
        queue.push({ at: now });
        if (def.doubleHit) {
          queue.push({ at: now + Math.max(90, toFiniteNumber(def.swingDurationMs, 220) * 0.52) });
        }
      }
      const pending = [];
      for (let index = 0; index < queue.length; index += 1) {
        const item = queue[index];
        if (toFiniteNumber(item.at, 0) > now) {
          pending.push(item);
          continue;
        }
        if (swingUntil > now + 2) {
          pending.push({ at: swingUntil + 1 });
          continue;
        }
        swingStartAt = now;
        swingUntil = now + Math.max(80, toFiniteNumber(def.swingDurationMs, 220));
      }
      queue = pending;
      updateSwingVisual(now);
    },
    serializeState() {
      return {
        lastScheduledAt,
        swingStartAt,
        swingUntil,
        baseAngleRad: toFiniteNumber(baseAngleRad, 0),
        basePosX: toFiniteNumber(basePosX, toFiniteNumber(def.x, 0)),
        basePosY: toFiniteNumber(basePosY, toFiniteNumber(def.y, 0)),
        lastOffset: toFiniteNumber(lastOffset, 0),
        lastTickAt: toFiniteNumber(lastTickAt, 0),
        queue: queue.map((item) => ({ at: item.at })),
      };
    },
    restoreState(rawState) {
      const nextState = rawState && typeof rawState === 'object' ? rawState : {};
      lastScheduledAt = toFiniteNumber(nextState.lastScheduledAt, 0);
      swingStartAt = toFiniteNumber(nextState.swingStartAt, 0);
      swingUntil = toFiniteNumber(nextState.swingUntil, 0);
      baseAngleRad = toFiniteNumber(nextState.baseAngleRad, 0);
      basePosX = toFiniteNumber(nextState.basePosX, toFiniteNumber(def.x, 0));
      basePosY = toFiniteNumber(nextState.basePosY, toFiniteNumber(def.y, 0));
      lastOffset = toFiniteNumber(nextState.lastOffset, 0);
      lastTickAt = toFiniteNumber(nextState.lastTickAt, 0);
      queue = Array.isArray(nextState.queue)
        ? nextState.queue
            .map((item) => ({
              at: toFiniteNumber(item && item.at, 0),
            }))
            .filter((item) => item.at > 0)
        : [];
      updateSwingVisual(Date.now());
    },
  };
}

function createBottomBumperBehavior(def, env) {
  const cooldownByMarble = {};
  const ejectCooldownByMarble = {};
  const configuredBreakHitCount = Math.max(0, Math.floor(toFiniteNumber(def.breakHitCount, 0)));
  const entityIds = Array.isArray(def.entityIds)
    ? def.entityIds.map((id) => toFiniteNumber(id, NaN)).filter((id) => Number.isFinite(id))
    : [];
  const mainEntityId = Number.isFinite(toFiniteNumber(def.entityId, NaN))
    ? toFiniteNumber(def.entityId, NaN)
    : (entityIds.length > 0 ? entityIds[0] : NaN);
  const brokenEntityId = entityIds.length > 1 ? entityIds[1] : NaN;
  const offscreenX = -9999;
  const offscreenY = -9999;
  let nextSwingAt = 0;
  let swingStartAt = 0;
  let swingUntil = 0;
  let lastTickAt = 0;
  let lastCenterX = NaN;
  let lastCenterY = NaN;
  let broken = false;
  let remainingBreakHits = configuredBreakHitCount;
  let brokenAt = 0;
  let visualEffect = null;

  function getEntryByEntityId(targetEntityId) {
    if (!Number.isFinite(toFiniteNumber(targetEntityId, NaN))) {
      return null;
    }
    const roulette = env.getRoulette();
    const physics = roulette && roulette.physics ? roulette.physics : null;
    const entities = physics && Array.isArray(physics.entities) ? physics.entities : [];
    for (let index = 0; index < entities.length; index += 1) {
      const entry = entities[index];
      const entityId = toFiniteNumber(entry && entry.shape && entry.shape.__v2eid, NaN);
      if (Number.isFinite(entityId) && entityId === targetEntityId) {
        return entry;
      }
    }
    return null;
  }

  function getMainEntry() {
    return getEntryByEntityId(mainEntityId);
  }

  function getBrokenEntry() {
    return getEntryByEntityId(brokenEntityId);
  }

  function getActiveEntry() {
    if (broken) {
      return getBrokenEntry() || getMainEntry();
    }
    return getMainEntry() || getBrokenEntry();
  }

  function randomUnit() {
    const rng = typeof env.getRng === 'function' ? env.getRng() : null;
    const next = rng && typeof rng.next === 'function' ? rng.next() : Math.random();
    return clamp(toFiniteNumber(next, 0.5), 0, 1);
  }

  function scheduleNextSwing(now) {
    const baseInterval = Math.max(80, toFiniteNumber(def.intervalMs, 780));
    const factor = 0.62 + randomUnit() * 0.86;
    nextSwingAt = now + Math.round(baseInterval * factor);
  }

  function setEntryEnabled(entry, enabled) {
    if (!entry) {
      return;
    }
    const box2d = env.getBox2D();
    const body = entry.body;
    if (!body || !box2d || typeof box2d.b2Vec2 !== 'function') {
      if (enabled) {
        return;
      }
      entry.x = offscreenX;
      entry.y = offscreenY;
      if (entry.position && typeof entry.position === 'object') {
        entry.position.x = offscreenX;
        entry.position.y = offscreenY;
      }
      return;
    }
    try {
      if (typeof body.SetEnabled === 'function') {
        body.SetEnabled(enabled === true);
      }
      if (typeof body.SetAwake === 'function') {
        body.SetAwake(enabled === true);
      }
      if (typeof body.SetLinearVelocity === 'function') {
        body.SetLinearVelocity(new box2d.b2Vec2(0, 0));
      }
      if (typeof body.SetAngularVelocity === 'function') {
        body.SetAngularVelocity(0);
      }
      if (!enabled && typeof body.SetTransform === 'function') {
        const currentAngle = typeof body.GetAngle === 'function' ? body.GetAngle() : 0;
        body.SetTransform(new box2d.b2Vec2(offscreenX, offscreenY), currentAngle);
      }
    } catch (_) {
    }
    if (!enabled) {
      entry.x = offscreenX;
      entry.y = offscreenY;
      if (entry.position && typeof entry.position === 'object') {
        entry.position.x = offscreenX;
        entry.position.y = offscreenY;
      }
    }
  }

  function applyBodyTransform(entry, centerX, centerY, angleRad, velocityX, velocityY) {
    const box2d = env.getBox2D();
    if (!entry || !entry.body || !box2d || typeof box2d.b2Vec2 !== 'function') {
      if (entry) {
        entry.x = centerX;
        entry.y = centerY;
      }
      return;
    }
    const body = entry.body;
    try {
      setEntryEnabled(entry, true);
      if (typeof body.SetTransform === 'function') {
        body.SetTransform(new box2d.b2Vec2(centerX, centerY), angleRad);
      }
      if (typeof body.SetLinearVelocity === 'function') {
        body.SetLinearVelocity(new box2d.b2Vec2(velocityX, velocityY));
      }
      if (typeof body.SetAngularVelocity === 'function') {
        body.SetAngularVelocity(0);
      }
    } catch (_) {
    }
    entry.x = centerX;
    entry.y = centerY;
    if (entry.position && typeof entry.position === 'object') {
      entry.position.x = centerX;
      entry.position.y = centerY;
    }
    if (entry.shape && typeof entry.shape === 'object') {
      entry.shape.rotation = angleRad;
    }
    entry.angle = angleRad;
  }

  function worldToLocalPoint(worldX, worldY, centerX, centerY, angleRad) {
    const dx = worldX - centerX;
    const dy = worldY - centerY;
    const cosAngle = Math.cos(angleRad);
    const sinAngle = Math.sin(angleRad);
    return {
      x: dx * cosAngle + dy * sinAngle,
      y: -dx * sinAngle + dy * cosAngle,
    };
  }

  function resolveMarblesInsideBody(now, transformState) {
    if (!transformState) {
      return;
    }
    const roulette = env.getRoulette();
    const physics = roulette && roulette.physics ? roulette.physics : null;
    const box2d = env.getBox2D();
    if (!roulette || !physics || !physics.marbleMap || !box2d || typeof box2d.b2Vec2 !== 'function') {
      return;
    }
    const entry = getActiveEntry();
    if (!entry || !entry.shape || !Array.isArray(entry.shape.points)) {
      return;
    }
    const polygon = normalizeClosedPolylinePoints(entry.shape.points);
    if (polygon.length < 3) {
      return;
    }
    const centroid = getPolylineCentroid(polygon);
    const clearance = Math.max(0.05, Math.min(0.16, transformState.halfHeight * 0.42));
    const marbles = Array.isArray(roulette._marbles) ? roulette._marbles : [];
    for (let index = 0; index < marbles.length; index += 1) {
      const marble = marbles[index];
      if (!marble || typeof marble.id !== 'number') {
        continue;
      }
      const marbleKey = String(marble.id);
      if (now < toFiniteNumber(ejectCooldownByMarble[marbleKey], 0)) {
        continue;
      }
      const body = physics.marbleMap[marble.id];
      if (!body || typeof body.GetPosition !== 'function') {
        continue;
      }
      const position = body.GetPosition();
      const worldX = toFiniteNumber(position && position.x, NaN);
      const worldY = toFiniteNumber(position && position.y, NaN);
      if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) {
        continue;
      }
      const local = worldToLocalPoint(
        worldX,
        worldY,
        toFiniteNumber(transformState.centerX, toFiniteNumber(def.x, 0)),
        toFiniteNumber(transformState.centerY, toFiniteNumber(def.y, 0)),
        toFiniteNumber(transformState.angleRad, 0),
      );
      if (!isPointInsidePolygon(polygon, local.x, local.y)) {
        continue;
      }
      const nearest = closestPointOnClosedPolyline(polygon, local.x, local.y);
      if (!nearest) {
        continue;
      }
      const nearestDist = Math.sqrt(Math.max(0, toFiniteNumber(nearest.distSq, 0)));
      const minPenetration = Math.max(0.045, Math.min(0.12, clearance * 0.65));
      if (nearestDist < minPenetration) {
        continue;
      }
      let outwardX = nearest.x - centroid.x;
      let outwardY = nearest.y - centroid.y;
      let outwardLen = Math.hypot(outwardX, outwardY);
      if (outwardLen < 0.0001) {
        outwardX = local.x - centroid.x;
        outwardY = local.y - centroid.y;
        outwardLen = Math.hypot(outwardX, outwardY);
      }
      if (outwardLen < 0.0001) {
        outwardX = toFiniteNumber(transformState.tipDirX, 1);
        outwardY = toFiniteNumber(transformState.tipDirY, 0);
        outwardLen = Math.hypot(outwardX, outwardY);
      }
      if (outwardLen < 0.0001) {
        continue;
      }
      const unitOutX = outwardX / outwardLen;
      const unitOutY = outwardY / outwardLen;
      const speed = Math.max(4.2, toFiniteNumber(def.force, 3.8) * 1.16);
      const impulseScale = Math.max(0.12, Math.min(0.32, minPenetration * 1.8));
      const velocity = typeof body.GetLinearVelocity === 'function' ? body.GetLinearVelocity() : null;
      const baseVx = toFiniteNumber(velocity && velocity.x, 0);
      const baseVy = toFiniteNumber(velocity && velocity.y, 0);
      const outwardSpeed = baseVx * unitOutX + baseVy * unitOutY;
      if (outwardSpeed > Math.max(0.9, speed * 0.24)) {
        continue;
      }
      const outwardBoostX = unitOutX * speed;
      const outwardBoostY = unitOutY * speed;
      const nextVx = baseVx * 0.82 + outwardBoostX;
      const nextVy = baseVy * 0.82 + outwardBoostY;
      try {
        if (typeof body.SetEnabled === 'function') {
          body.SetEnabled(true);
        }
        if (typeof body.SetAwake === 'function') {
          body.SetAwake(true);
        }
        if (typeof body.ApplyLinearImpulseToCenter === 'function') {
          body.ApplyLinearImpulseToCenter(
            new box2d.b2Vec2(outwardBoostX * impulseScale, outwardBoostY * impulseScale),
            true,
          );
        }
        if (typeof body.SetLinearVelocity === 'function') {
          body.SetLinearVelocity(new box2d.b2Vec2(nextVx, nextVy));
        }
        ejectCooldownByMarble[marbleKey] = now + 120;
      } catch (_) {
      }
    }
  }

  function ensureVisualEffect() {
    const roulette = env.getRoulette();
    if (!roulette || !Array.isArray(roulette._effects)) {
      return;
    }
    if (visualEffect && visualEffect.isDestroy !== true) {
      return;
    }
    visualEffect = {
      elapsed: 0,
      duration: Number.MAX_SAFE_INTEGER,
      isDestroy: false,
      update(deltaMs) {
        this.elapsed += toFiniteNumber(deltaMs, 0);
        if (!getActiveEntry()) {
          this.isDestroy = true;
        }
      },
      render(ctx, zoomScale) {
        if (!ctx) {
          return;
        }
        const entry = getActiveEntry();
        if (!entry) {
          this.isDestroy = true;
          return;
        }
        const centerX = toFiniteNumber(entry.x, toFiniteNumber(def.x, 0));
        const centerY = toFiniteNumber(entry.y, toFiniteNumber(def.y, 0));
        const angleRad = toFiniteNumber(entry.angle, toFiniteNumber(entry && entry.shape && entry.shape.rotation, 0));
        const baseHalfLen = Math.max(0.08, toFiniteNumber(def.width, 0.98));
        const halfLen = broken ? Math.max(0.08, baseHalfLen / 3) : baseHalfLen;
        const halfHeight = Math.max(0.05, toFiniteNumber(def.height, 0.34));
        const mirror = def.mirror === true;
        const lineWidth = Math.max(0.08, 0.42 / Math.max(1, toFiniteNumber(zoomScale, 1)));
        const normalBodyColor = typeof def.color === 'string' && !isTransparentColorString(def.color)
          ? def.color
          : DEFAULT_OBJECT_COLORS.bottomBumper;
        const nowMs = Date.now();
        const brokenElapsedMs = brokenAt > 0 ? Math.max(0, nowMs - brokenAt) : Number.MAX_SAFE_INTEGER;
        const brokenFlashRatio = broken ? clamp(1 - brokenElapsedMs / 380, 0, 1) : 0;
        const brokenPulseRatio = broken
          ? 0.5 + 0.5 * Math.sin(this.elapsed * 0.012)
          : 0;
        const bodyColor = broken
          ? `rgba(96, 128, 160, ${0.9 + brokenFlashRatio * 0.08})`
          : normalBodyColor;
        const pivotX = -halfLen;
        const pivotRadius = Math.max(halfHeight * 0.36, 0.065);
        const pivotInner = Math.max(0.03, pivotRadius * 0.46);

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(angleRad);
        if (mirror) {
          ctx.scale(-1, 1);
        }

        ctx.fillStyle = bodyColor;
        ctx.strokeStyle = broken
          ? `rgba(255, 226, 164, ${0.78 + brokenFlashRatio * 0.2})`
          : 'rgba(198, 236, 255, 0.96)';
        ctx.lineWidth = lineWidth;
        ctx.shadowColor = broken
          ? `rgba(255, 178, 110, ${0.22 + brokenFlashRatio * 0.26})`
          : 'rgba(98, 182, 255, 0.28)';
        ctx.shadowBlur = broken ? 0.28 : 0.22;
        drawBottomBumperPath(ctx, halfLen, halfHeight);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.stroke();

        if (broken) {
          const burstRatio = clamp(1 - brokenElapsedMs / 260, 0, 1);
          ctx.fillStyle = `rgba(255, 146, 86, ${0.16 + brokenFlashRatio * 0.24})`;
          drawBottomBumperPath(ctx, halfLen, halfHeight);
          ctx.fill();
          drawBottomBumperBrokenOverlay(
            ctx,
            halfLen,
            halfHeight,
            Math.max(brokenFlashRatio, brokenPulseRatio * 0.8),
          );
          if (burstRatio > 0.01) {
            const spread = 0.06 + (1 - burstRatio) * 0.16;
            const shardLength = Math.max(halfHeight * 0.48, 0.05);
            ctx.strokeStyle = `rgba(238, 248, 255, ${0.2 + burstRatio * 0.72})`;
            ctx.lineWidth = Math.max(0.04, lineWidth * 0.54);
            ctx.beginPath();
            for (let shard = 0; shard < 6; shard += 1) {
              const t = (shard / 5) * 2 - 1;
              const angle = t * 0.82;
              const sx = halfLen * 0.95 + Math.cos(angle) * spread;
              const sy = Math.sin(angle) * (halfHeight * 0.82 + spread * 0.6);
              const ex = sx + Math.cos(angle) * shardLength;
              const ey = sy + Math.sin(angle) * shardLength * 0.88;
              ctx.moveTo(sx, sy);
              ctx.lineTo(ex, ey);
            }
            ctx.stroke();
          }
        }

        ctx.fillStyle = broken ? 'rgba(19, 24, 34, 0.97)' : 'rgba(12, 22, 44, 0.96)';
        ctx.strokeStyle = broken
          ? `rgba(255, 217, 152, ${0.74 + brokenFlashRatio * 0.18})`
          : 'rgba(201, 235, 255, 0.96)';
        ctx.lineWidth = Math.max(0.07, lineWidth * 0.82);
        ctx.beginPath();
        ctx.arc(pivotX, 0, pivotRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = broken
          ? `rgba(255, 150, 112, ${0.86 + brokenFlashRatio * 0.1})`
          : 'rgba(135, 207, 255, 0.96)';
        ctx.beginPath();
        ctx.arc(pivotX, 0, pivotInner, 0, Math.PI * 2);
        ctx.fill();
        if (broken) {
          ctx.strokeStyle = `rgba(255, 242, 208, ${0.34 + brokenPulseRatio * 0.3})`;
          ctx.lineWidth = Math.max(0.03, lineWidth * 0.42);
          ctx.beginPath();
          ctx.moveTo(pivotX - pivotRadius * 0.44, -pivotRadius * 0.44);
          ctx.lineTo(pivotX + pivotRadius * 0.44, pivotRadius * 0.44);
          ctx.stroke();
        }
        ctx.restore();
      },
    };
    roulette._effects.push(visualEffect);
  }

  function updateTransform(now) {
    const mainEntry = getMainEntry();
    const shortEntry = getBrokenEntry();
    const baseCenterX = toFiniteNumber(def.x, 0);
    const baseCenterY = toFiniteNumber(def.y, 0);
    const fullHalfLen = Math.max(0.08, toFiniteNumber(def.width, 0.98));
    const shortHalfLen = Math.max(0.08, fullHalfLen / 3);
    const activeHalfLen = broken ? shortHalfLen : fullHalfLen;
    const baseDirRad = degToRad(toFiniteNumber(def.dirDeg, toFiniteNumber(def.rotation, 270)));
    const swingMagnitude = degToRad(Math.max(2, toFiniteNumber(def.swingDeg, 34)));
    const swingDuration = Math.max(60, toFiniteNumber(def.swingDurationMs, 210));
    const mirror = def.mirror === true;
    const pivotSign = mirror ? 1 : -1;
    const swingSign = mirror ? -1 : 1;

    let swingRatio = 0;
    let isSwinging = false;
    if (swingUntil > now) {
      isSwinging = true;
      const progress = clamp((now - swingStartAt) / Math.max(1, swingDuration), 0, 1);
      if (progress <= 0.45) {
        swingRatio = Math.sin((progress / 0.45) * (Math.PI / 2));
      } else {
        swingRatio = Math.cos(((progress - 0.45) / 0.55) * (Math.PI / 2));
      }
    }
    const angleRad = baseDirRad + swingMagnitude * swingRatio * swingSign;
    const axisX = Math.cos(angleRad);
    const axisY = Math.sin(angleRad);
    const pivotX = baseCenterX + Math.cos(baseDirRad) * fullHalfLen * pivotSign;
    const pivotY = baseCenterY + Math.sin(baseDirRad) * fullHalfLen * pivotSign;
    const centerFullX = pivotX - axisX * fullHalfLen * pivotSign;
    const centerFullY = pivotY - axisY * fullHalfLen * pivotSign;
    const centerX = pivotX - axisX * activeHalfLen * pivotSign;
    const centerY = pivotY - axisY * activeHalfLen * pivotSign;
    const tipSign = -pivotSign;
    const tipX = centerX + axisX * activeHalfLen * tipSign;
    const tipY = centerY + axisY * activeHalfLen * tipSign;
    const tipDirX = axisX * tipSign;
    const tipDirY = axisY * tipSign;

    const dtSec = Math.max(0.004, Math.min(0.08, toFiniteNumber(now - lastTickAt, 16) / 1000));
    const velocityX = Number.isFinite(lastCenterX) ? (centerX - lastCenterX) / Math.max(0.0001, dtSec) : 0;
    const velocityY = Number.isFinite(lastCenterY) ? (centerY - lastCenterY) / Math.max(0.0001, dtSec) : 0;
    if (broken) {
      setEntryEnabled(mainEntry, false);
      applyBodyTransform(shortEntry || mainEntry, centerX, centerY, angleRad, velocityX, velocityY);
    } else {
      applyBodyTransform(mainEntry || shortEntry, centerFullX, centerFullY, angleRad, velocityX, velocityY);
      setEntryEnabled(shortEntry, false);
    }
    lastCenterX = centerX;
    lastCenterY = centerY;
    lastTickAt = now;

    return {
      centerX,
      centerY,
      tipX,
      tipY,
      angleRad,
      halfLen: activeHalfLen,
      halfHeight: Math.max(0.05, toFiniteNumber(def.height, 0.34)),
      tipDirX,
      tipDirY,
      isSwinging,
      dtScale: dtSec / (1 / 60),
    };
  }

  function canHitMarble(marbleId, now) {
    if (!Number.isFinite(toFiniteNumber(marbleId, NaN))) {
      return false;
    }
    const expires = toFiniteNumber(cooldownByMarble[String(marbleId)], 0);
    return now >= expires;
  }

  function setHitCooldown(marbleId, now) {
    const cooldownMs = Math.max(0, toFiniteNumber(def.cooldownMs, 160));
    cooldownByMarble[String(marbleId)] = now + cooldownMs;
  }

  function consumeBreakHit(now) {
    if (configuredBreakHitCount <= 0 || broken) {
      return;
    }
    remainingBreakHits = Math.max(0, remainingBreakHits - 1);
    if (remainingBreakHits > 0) {
      return;
    }
    broken = true;
    brokenAt = now;
    swingStartAt = now;
    swingUntil = now;
    const mainEntry = getMainEntry();
    setEntryEnabled(mainEntry, false);
    const brokenEntry = getBrokenEntry();
    if (brokenEntry) {
      setEntryEnabled(brokenEntry, true);
    }
  }

  function applySwingImpulse(now, transformState) {
    if (!transformState) {
      return;
    }
    const roulette = env.getRoulette();
    const physics = roulette && roulette.physics ? roulette.physics : null;
    const box2d = env.getBox2D();
    if (!roulette || !physics || !physics.marbleMap || !box2d || typeof box2d.b2Vec2 !== 'function') {
      return;
    }
    const marbles = Array.isArray(roulette._marbles) ? roulette._marbles : [];
    if (marbles.length <= 0) {
      return;
    }
    const triggerRadius = Math.max(0.2, toFiniteNumber(def.triggerRadius, 1.25));
    const triggerRadiusSq = triggerRadius * triggerRadius;
    const dirX = toFiniteNumber(transformState.tipDirX, Math.cos(transformState.angleRad));
    const dirY = toFiniteNumber(transformState.tipDirY, Math.sin(transformState.angleRad));
    const force = Math.max(0.1, toFiniteNumber(def.force, 3.8));
    const stateScale = transformState.isSwinging ? 1 : 0.2;
    const baseImpulse = force * Math.max(0.1, toFiniteNumber(transformState.dtScale, 1)) * stateScale;
    if (baseImpulse <= 0.001) {
      return;
    }
    for (let index = 0; index < marbles.length; index += 1) {
      const marble = marbles[index];
      if (!marble || typeof marble.id !== 'number' || !canHitMarble(marble.id, now)) {
        continue;
      }
      const body = physics.marbleMap[marble.id];
      if (!body || typeof body.GetPosition !== 'function' || typeof body.ApplyLinearImpulseToCenter !== 'function') {
        continue;
      }
      const pos = body.GetPosition();
      const dx = toFiniteNumber(pos && pos.x, NaN) - transformState.tipX;
      const dy = toFiniteNumber(pos && pos.y, NaN) - transformState.tipY;
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
        continue;
      }
      const distSq = dx * dx + dy * dy;
      if (distSq > triggerRadiusSq) {
        continue;
      }
      const dist = Math.sqrt(Math.max(distSq, 0.000001));
      const forward = dx * dirX + dy * dirY;
      if (forward < -Math.max(0.18, transformState.halfLen * 0.35)) {
        continue;
      }
      const falloff = Math.max(0, 1 - dist / triggerRadius);
      const impulse = baseImpulse * (0.35 + falloff * 0.65);
      const impulseX = dirX * impulse;
      const impulseY = dirY * impulse - Math.max(0.03, impulse * 0.18);
      try {
        if (typeof body.SetEnabled === 'function') {
          body.SetEnabled(true);
        }
        if (typeof body.SetAwake === 'function') {
          body.SetAwake(true);
        }
        body.ApplyLinearImpulseToCenter(new box2d.b2Vec2(impulseX, impulseY), true);
      } catch (_) {
        continue;
      }
      setHitCooldown(marble.id, now);
      consumeBreakHit(now);
    }
  }

  setEntryEnabled(getBrokenEntry(), false);

  return {
    kind: 'bottom_bumper',
    oid: def.oid,
    tick(now) {
      ensureVisualEffect();
      if (env.isPaused()) {
        return;
      }
      if (!broken) {
        if (!Number.isFinite(toFiniteNumber(nextSwingAt, NaN)) || nextSwingAt <= 0) {
          scheduleNextSwing(now - Math.max(80, toFiniteNumber(def.intervalMs, 780)));
        }
        if (now >= nextSwingAt && swingUntil <= now) {
          swingStartAt = now;
          swingUntil = now + Math.max(60, toFiniteNumber(def.swingDurationMs, 210));
          scheduleNextSwing(now);
        }
      }
      const transformState = updateTransform(now);
      resolveMarblesInsideBody(now, transformState);
      applySwingImpulse(now, transformState);
    },
    serializeState() {
      return {
        nextSwingAt: toFiniteNumber(nextSwingAt, 0),
        swingStartAt: toFiniteNumber(swingStartAt, 0),
        swingUntil: toFiniteNumber(swingUntil, 0),
        lastTickAt: toFiniteNumber(lastTickAt, 0),
        lastCenterX: toFiniteNumber(lastCenterX, toFiniteNumber(def.x, 0)),
        lastCenterY: toFiniteNumber(lastCenterY, toFiniteNumber(def.y, 0)),
        broken,
        brokenAt: toFiniteNumber(brokenAt, 0),
        remainingBreakHits: Math.max(0, toFiniteNumber(remainingBreakHits, configuredBreakHitCount)),
        cooldownByMarble: { ...cooldownByMarble },
        ejectCooldownByMarble: { ...ejectCooldownByMarble },
      };
    },
    restoreState(rawState) {
      const safeState = rawState && typeof rawState === 'object' ? rawState : {};
      nextSwingAt = Math.max(0, toFiniteNumber(safeState.nextSwingAt, 0));
      swingStartAt = Math.max(0, toFiniteNumber(safeState.swingStartAt, 0));
      swingUntil = Math.max(0, toFiniteNumber(safeState.swingUntil, 0));
      lastTickAt = Math.max(0, toFiniteNumber(safeState.lastTickAt, 0));
      lastCenterX = toFiniteNumber(safeState.lastCenterX, toFiniteNumber(def.x, 0));
      lastCenterY = toFiniteNumber(safeState.lastCenterY, toFiniteNumber(def.y, 0));
      for (const key of Object.keys(cooldownByMarble)) {
        delete cooldownByMarble[key];
      }
      for (const key of Object.keys(ejectCooldownByMarble)) {
        delete ejectCooldownByMarble[key];
      }
      const nextCooldown = safeState.cooldownByMarble && typeof safeState.cooldownByMarble === 'object'
        ? safeState.cooldownByMarble
        : {};
      for (const key of Object.keys(nextCooldown)) {
        cooldownByMarble[key] = toFiniteNumber(nextCooldown[key], 0);
      }
      const nextEjectCooldown = safeState.ejectCooldownByMarble && typeof safeState.ejectCooldownByMarble === 'object'
        ? safeState.ejectCooldownByMarble
        : {};
      for (const key of Object.keys(nextEjectCooldown)) {
        ejectCooldownByMarble[key] = toFiniteNumber(nextEjectCooldown[key], 0);
      }
      const hasBrokenFlag = Object.prototype.hasOwnProperty.call(safeState, 'broken');
      broken = hasBrokenFlag ? safeState.broken === true : configuredBreakHitCount > 0 && toFiniteNumber(safeState.remainingBreakHits, configuredBreakHitCount) <= 0;
      brokenAt = Math.max(
        0,
        toFiniteNumber(
          safeState.brokenAt,
          broken ? Date.now() - 9999 : 0,
        ),
      );
      remainingBreakHits = Math.max(
        0,
        Math.floor(
          toFiniteNumber(
            safeState.remainingBreakHits,
            broken ? 0 : configuredBreakHitCount,
          ),
        ),
      );
      ensureVisualEffect();
      updateTransform(Date.now());
    },
  };
}

function createFanBehavior(def, env) {
  let lastTickAt = 0;
  let nextVisualAt = 0;

  function getFanEntry() {
    const roulette = env.getRoulette();
    const physics = roulette && roulette.physics ? roulette.physics : null;
    const entities = physics && Array.isArray(physics.entities) ? physics.entities : [];
    for (let index = 0; index < entities.length; index += 1) {
      const entry = entities[index];
      const entityId = toFiniteNumber(entry && entry.shape && entry.shape.__v2eid, NaN);
      if (Number.isFinite(entityId) && entityId === toFiniteNumber(def.entityId, -1)) {
        return entry;
      }
    }
    return null;
  }

  function syncFanVisual() {
    const entry = getFanEntry();
    const box2d = env.getBox2D();
    if (!entry || !entry.body || !box2d || typeof box2d.b2Vec2 !== 'function') {
      return;
    }
    const body = entry.body;
    const x = toFiniteNumber(def.x, 0);
    const y = toFiniteNumber(def.y, 0);
    try {
      if (typeof body.SetEnabled === 'function') {
        body.SetEnabled(true);
      }
      if (typeof body.SetAwake === 'function') {
        body.SetAwake(true);
      }
      if (typeof body.SetTransform === 'function') {
        body.SetTransform(new box2d.b2Vec2(x, y), 0);
      }
      if (typeof body.SetLinearVelocity === 'function') {
        body.SetLinearVelocity(new box2d.b2Vec2(0, 0));
      }
      if (typeof body.SetAngularVelocity === 'function') {
        body.SetAngularVelocity(0);
      }
    } catch (_) {
    }
    entry.x = x;
    entry.y = y;
    if (entry.position && typeof entry.position === 'object') {
      entry.position.x = x;
      entry.position.y = y;
    }
  }

  function emitFanVisualEffect(now, dirRad, zoneLength, zoneHalfWidth) {
    const roulette = env.getRoulette();
    if (!roulette || !Array.isArray(roulette._effects)) {
      return;
    }
    const originX = toFiniteNumber(def.x, 0);
    const originY = toFiniteNumber(def.y, 0);
    const duration = 200;
    roulette._effects.push({
      elapsed: 0,
      duration,
      isDestroy: false,
      update(deltaMs) {
        this.elapsed += toFiniteNumber(deltaMs, 0);
        if (this.elapsed >= this.duration) {
          this.isDestroy = true;
        }
      },
      render(ctx, zoomScale) {
        if (!ctx) {
          return;
        }
        const ratio = Math.max(0, Math.min(1, this.elapsed / this.duration));
        const alpha = Math.max(0, 0.28 * (1 - ratio));
        const length = Math.max(0.25, zoneLength * (0.78 + ratio * 0.42));
        const halfWidth = Math.max(0.2, zoneHalfWidth);
        const waveCount = Math.max(3, Math.floor(length * 2.4));
        const lineWidth = Math.max(0.8 / Math.max(1, toFiniteNumber(zoomScale, 1)), 0.55);
        ctx.save();
        ctx.translate(originX, originY);
        ctx.rotate(dirRad);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = 'rgba(127,217,255,0.2)';
        ctx.strokeStyle = 'rgba(143,230,255,0.95)';
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.rect(0, -halfWidth, length, halfWidth * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        for (let lane = -1; lane <= 1; lane += 1) {
          const laneY = lane * (halfWidth * 0.52);
          const step = length / waveCount;
          const amp = Math.max(0.06, halfWidth * 0.18);
          ctx.moveTo(0, laneY);
          for (let i = 0; i <= waveCount; i += 1) {
            const x = i * step;
            const waveY = laneY + Math.sin((i / waveCount) * Math.PI * 2.4 + ratio * Math.PI) * amp;
            ctx.lineTo(x, waveY);
          }
        }
        ctx.strokeStyle = 'rgba(194,245,255,0.95)';
        ctx.lineWidth = lineWidth * 0.88;
        ctx.stroke();
        ctx.restore();
      },
    });
  }

  return {
    kind: 'fan',
    oid: def.oid,
    tick(now) {
      if (env.isPaused()) {
        return;
      }
      const roulette = env.getRoulette();
      const physics = roulette && roulette.physics ? roulette.physics : null;
      const box2d = env.getBox2D();
      if (!roulette || !physics || !physics.marbleMap || !box2d || typeof box2d.b2Vec2 !== 'function') {
        return;
      }
      const marbles = Array.isArray(roulette._marbles) ? roulette._marbles : [];
      if (marbles.length === 0) {
        return;
      }

      syncFanVisual();

      const deltaMs = Math.max(8, Math.min(80, toFiniteNumber(now - lastTickAt, 16)));
      lastTickAt = now;
      const deltaScale = deltaMs / 16.666;
      const dirRad = degToRad(toFiniteNumber(def.dirDeg, 0));
      const dirX = Math.cos(dirRad);
      const dirY = Math.sin(dirRad);
      const sideX = -dirY;
      const sideY = dirX;
      const zoneLength = Math.max(0.2, toFiniteNumber(def.hitDistance, 2.8));
      const zoneHalfWidth = Math.max(0.2, toFiniteNumber(def.triggerRadius, 0.9));
      const baseForce = Math.max(0.01, toFiniteNumber(def.force, 0.32));
      const originX = toFiniteNumber(def.x, 0);
      const originY = toFiniteNumber(def.y, 0);

      if (now >= nextVisualAt) {
        emitFanVisualEffect(now, dirRad, zoneLength, zoneHalfWidth);
        nextVisualAt = now + 110;
      }

      for (let index = 0; index < marbles.length; index += 1) {
        const marble = marbles[index];
        if (!marble || typeof marble.id !== 'number') {
          continue;
        }
        const body = physics.marbleMap[marble.id];
        if (!body || typeof body.GetPosition !== 'function' || typeof body.ApplyLinearImpulseToCenter !== 'function') {
          continue;
        }
        const pos = body.GetPosition();
        const px = toFiniteNumber(pos && pos.x, NaN);
        const py = toFiniteNumber(pos && pos.y, NaN);
        if (!Number.isFinite(px) || !Number.isFinite(py)) {
          continue;
        }
        const relX = px - originX;
        const relY = py - originY;
        const forward = relX * dirX + relY * dirY;
        if (forward < 0 || forward > zoneLength) {
          continue;
        }
        const lateral = Math.abs(relX * sideX + relY * sideY);
        if (lateral > zoneHalfWidth) {
          continue;
        }
        const forwardFalloff = Math.max(0, 1 - forward / zoneLength);
        const lateralFalloff = Math.max(0, 1 - lateral / zoneHalfWidth);
        const strengthScale = 0.18 + forwardFalloff * 0.56 + lateralFalloff * 0.26;
        const impulse = baseForce * deltaScale * strengthScale;
        if (impulse <= 0) {
          continue;
        }
        try {
          if (typeof body.SetEnabled === 'function') {
            body.SetEnabled(true);
          }
          if (typeof body.SetAwake === 'function') {
            body.SetAwake(true);
          }
          body.ApplyLinearImpulseToCenter(
            new box2d.b2Vec2(dirX * impulse, dirY * impulse),
            true,
          );
        } catch (_) {
        }
      }
    },
    serializeState() {
      return {
        lastTickAt: toFiniteNumber(lastTickAt, 0),
        nextVisualAt: toFiniteNumber(nextVisualAt, 0),
      };
    },
    restoreState(rawState) {
      const safeState = rawState && typeof rawState === 'object' ? rawState : {};
      lastTickAt = toFiniteNumber(safeState.lastTickAt, 0);
      nextVisualAt = toFiniteNumber(safeState.nextVisualAt, 0);
      syncFanVisual();
    },
  };
}

function createMagicWizardBehavior(def, env) {
  let nextShotAt = 0;
  let lastTickAt = 0;
  let missingEntityFrames = 0;
  let wizardVisualEffect = null;
  let fireballVisualEffect = null;
  const fireballs = [];
  const image = getRuntimeImage(normalizeMagicWizardImageSrc(def.imageSrc || '../../background/magic.svg'));

  function hasEntity() {
    const roulette = env.getRoulette();
    const physics = roulette && roulette.physics ? roulette.physics : null;
    const entities = physics && Array.isArray(physics.entities) ? physics.entities : [];
    if (entities.length <= 0) {
      return true;
    }
    const targetId = Math.floor(toFiniteNumber(def.entityId, NaN));
    const targetX = toFiniteNumber(def.x, 0);
    const targetY = toFiniteNumber(def.y, 0);
    const targetW = Math.max(0.08, toFiniteNumber(def.width, 0.72));
    const targetH = Math.max(0.08, toFiniteNumber(def.height, 0.9));
    const fallbackDistance = Math.max(0.35, Math.max(targetW, targetH) * 0.8);
    for (let index = 0; index < entities.length; index += 1) {
      const entry = entities[index];
      const entityId = toFiniteNumber(
        entry && entry.shape && Number.isFinite(Number(entry.shape.__v2eid))
          ? entry.shape.__v2eid
          : (entry && Number.isFinite(Number(entry.__v2eid)) ? entry.__v2eid : NaN),
        NaN,
      );
      if (Number.isFinite(targetId) && Number.isFinite(entityId) && entityId === targetId) {
        return true;
      }
      const shape = entry && entry.shape ? entry.shape : null;
      if (!shape || String(shape.type || '') !== 'box') {
        continue;
      }
      const body = entry && entry.body ? entry.body : null;
      const pos = body && typeof body.GetPosition === 'function' ? body.GetPosition() : null;
      const ex = toFiniteNumber(pos && pos.x, NaN);
      const ey = toFiniteNumber(pos && pos.y, NaN);
      if (!Number.isFinite(ex) || !Number.isFinite(ey)) {
        continue;
      }
      const ew = Math.max(0.02, toFiniteNumber(shape.width, NaN));
      const eh = Math.max(0.02, toFiniteNumber(shape.height, NaN));
      if (!Number.isFinite(ew) || !Number.isFinite(eh)) {
        continue;
      }
      const closeEnough = Math.hypot(ex - targetX, ey - targetY) <= fallbackDistance;
      const similarSize = Math.abs(ew - targetW) <= 0.55 && Math.abs(eh - targetH) <= 0.55;
      if (closeEnough && similarSize) {
        return true;
      }
    }
    return false;
  }

  function normalizeDegLocal(value) {
    let deg = toFiniteNumber(value, 0) % 360;
    if (deg < 0) {
      deg += 360;
    }
    return deg;
  }

  function getShootDirRad() {
    return degToRad(normalizeDegLocal(def.dirDeg));
  }

  function getVisualMirrorByDirection() {
    const dirDeg = normalizeDegLocal(def.dirDeg);
    // Wizard source image faces left; flip only for rightward directions.
    return !(dirDeg > 90 && dirDeg < 270);
  }

  function ensureWizardVisualEffect() {
    const roulette = env.getRoulette();
    if (!roulette || !Array.isArray(roulette._effects)) {
      return;
    }
    if (wizardVisualEffect && wizardVisualEffect.isDestroy !== true) {
      return;
    }
    wizardVisualEffect = {
      elapsed: 0,
      duration: Number.MAX_SAFE_INTEGER,
      isDestroy: false,
      update(deltaMs) {
        this.elapsed += toFiniteNumber(deltaMs, 0);
        if (hasEntity()) {
          missingEntityFrames = 0;
        } else {
          missingEntityFrames += 1;
        }
        if (missingEntityFrames > 720) {
          this.isDestroy = true;
        }
      },
      render(ctx) {
        if (!ctx) {
          return;
        }
        const width = Math.max(0.08, toFiniteNumber(def.width, 0.72));
        const height = Math.max(0.08, toFiniteNumber(def.height, 0.9));
        const x = toFiniteNumber(def.x, 0);
        const y = toFiniteNumber(def.y, 0);
        const mirror = getVisualMirrorByDirection();
        ctx.save();
        ctx.translate(x, y);
        if (mirror) {
          ctx.scale(-1, 1);
        }
        if (image && image.complete && image.naturalWidth > 0) {
          ctx.drawImage(image, -width, -height, width * 2, height * 2);
        } else {
          ctx.fillStyle = 'rgba(255,166,108,0.3)';
          ctx.strokeStyle = 'rgba(255,196,154,0.9)';
          ctx.lineWidth = 0.08;
          ctx.beginPath();
          ctx.rect(-width * 0.72, -height * 0.82, width * 1.44, height * 1.64);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,132,76,0.92)';
          ctx.beginPath();
          ctx.arc(width * 0.62, -height * 0.12, Math.max(0.06, height * 0.24), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      },
    };
    roulette._effects.push(wizardVisualEffect);
  }

  function ensureFireballVisualEffect() {
    const roulette = env.getRoulette();
    if (!roulette || !Array.isArray(roulette._effects)) {
      return;
    }
    if (fireballVisualEffect && fireballVisualEffect.isDestroy !== true) {
      return;
    }
    fireballVisualEffect = {
      elapsed: 0,
      duration: Number.MAX_SAFE_INTEGER,
      isDestroy: false,
      update(deltaMs) {
        this.elapsed += toFiniteNumber(deltaMs, 0);
        if (hasEntity()) {
          missingEntityFrames = 0;
        } else {
          missingEntityFrames += 1;
        }
        if (missingEntityFrames > 720 && fireballs.length <= 0) {
          this.isDestroy = true;
        }
      },
      render(ctx, zoomScale) {
        if (!ctx || fireballs.length <= 0) {
          return;
        }
        const safeZoom = Math.max(1, toFiniteNumber(zoomScale, 1));
        for (let index = 0; index < fireballs.length; index += 1) {
          const projectile = fireballs[index];
          if (!projectile) {
            continue;
          }
          const lifeRatio = clamp(
            (projectile.expireAt - projectile.now) / Math.max(1, projectile.expireAt - projectile.spawnAt),
            0,
            1,
          );
          const alpha = 0.3 + lifeRatio * 0.7;
          const radius = Math.max(0.04, toFiniteNumber(projectile.radius, 0.2));
          const tailWidth = Math.max(0.04, (radius * 0.84) / safeZoom);
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = `rgba(255,128,62,${0.55 * alpha})`;
          ctx.lineWidth = tailWidth;
          ctx.beginPath();
          ctx.moveTo(toFiniteNumber(projectile.prevX, projectile.x), toFiniteNumber(projectile.prevY, projectile.y));
          ctx.lineTo(toFiniteNumber(projectile.x, 0), toFiniteNumber(projectile.y, 0));
          ctx.stroke();
          ctx.fillStyle = `rgba(255,86,36,${0.62 * alpha})`;
          ctx.beginPath();
          ctx.arc(projectile.x, projectile.y, radius * 1.42, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `rgba(255,176,72,${0.95 * alpha})`;
          ctx.beginPath();
          ctx.arc(projectile.x, projectile.y, radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `rgba(255,236,162,${0.88 * alpha})`;
          ctx.beginPath();
          ctx.arc(projectile.x + radius * 0.18, projectile.y - radius * 0.2, radius * 0.44, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      },
    };
    roulette._effects.push(fireballVisualEffect);
  }

  function emitImpactEffect(x, y, baseRadius) {
    const roulette = env.getRoulette();
    if (!roulette || !Array.isArray(roulette._effects)) {
      return;
    }
    const radius = Math.max(0.08, toFiniteNumber(baseRadius, 0.22));
    roulette._effects.push({
      elapsed: 0,
      duration: 190,
      isDestroy: false,
      update(deltaMs) {
        this.elapsed += toFiniteNumber(deltaMs, 0);
        if (this.elapsed >= this.duration) {
          this.isDestroy = true;
        }
      },
      render(ctx, zoomScale) {
        if (!ctx) {
          return;
        }
        const ratio = clamp(this.elapsed / Math.max(1, this.duration), 0, 1);
        const alpha = Math.max(0, 1 - ratio);
        const ringRadius = radius * (0.9 + ratio * 2.2);
        const safeZoom = Math.max(1, toFiniteNumber(zoomScale, 1));
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(255,156,92,${0.78 * alpha})`;
        ctx.lineWidth = Math.max(0.03, (radius * 0.46) / safeZoom);
        ctx.beginPath();
        ctx.arc(x, y, ringRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(255,102,42,${0.28 * alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, ringRadius * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      },
    });
  }

  function spawnFireball(now) {
    const dirRad = getShootDirRad();
    const width = Math.max(0.08, toFiniteNumber(def.width, 0.72));
    const height = Math.max(0.08, toFiniteNumber(def.height, 0.9));
    const originX = toFiniteNumber(def.x, 0);
    const originY = toFiniteNumber(def.y, 0);
    const muzzleDistance = Math.max(0.12, Math.max(width, height) * 0.62);
    const legacySpeed = Math.max(0.2, toFiniteNumber(def.fireballSpeed, 7.4));
    const radius = Math.max(0.05, toFiniteNumber(def.fireballRadius, 0.2));
    const lifeMs = Math.max(260, toFiniteNumber(def.fireballLifeMs, 900));
    const travelDistance = toFiniteNumber(def.fireballDistance, NaN);
    const speed = Number.isFinite(travelDistance) && travelDistance > 0
      ? Math.max(0.2, travelDistance / Math.max(0.05, lifeMs / 1000))
      : legacySpeed;
    const startX = originX + Math.cos(dirRad) * muzzleDistance;
    const startY = originY + Math.sin(dirRad) * muzzleDistance;
    fireballs.push({
      x: startX,
      y: startY,
      prevX: startX,
      prevY: startY,
      vx: Math.cos(dirRad) * speed,
      vy: Math.sin(dirRad) * speed,
      radius,
      spawnAt: now,
      now,
      expireAt: now + lifeMs,
    });
    if (fireballs.length > 18) {
      fireballs.splice(0, fireballs.length - 18);
    }
  }

  function updateFireballs(now, deltaMs) {
    const roulette = env.getRoulette();
    const physics = roulette && roulette.physics ? roulette.physics : null;
    const box2d = env.getBox2D();
    const marbles = roulette && Array.isArray(roulette._marbles) ? roulette._marbles : [];
    const canImpact = !!(
      roulette
      && physics
      && physics.marbleMap
      && box2d
      && typeof box2d.b2Vec2 === 'function'
    );
    const dtSec = Math.max(0.004, Math.min(0.09, toFiniteNumber(deltaMs, 16.666) / 1000));
    const impulsePower = Math.max(0.1, toFiniteNumber(def.force, 2.8));
    const impactPadding = 0.36;
    for (let index = fireballs.length - 1; index >= 0; index -= 1) {
      const projectile = fireballs[index];
      if (!projectile) {
        fireballs.splice(index, 1);
        continue;
      }
      projectile.prevX = toFiniteNumber(projectile.x, 0);
      projectile.prevY = toFiniteNumber(projectile.y, 0);
      projectile.x += toFiniteNumber(projectile.vx, 0) * dtSec;
      projectile.y += toFiniteNumber(projectile.vy, 0) * dtSec;
      projectile.now = now;
      const expired = now >= toFiniteNumber(projectile.expireAt, 0);
      const outOfBounds = projectile.x < -8 || projectile.x > 96 || projectile.y < -12 || projectile.y > 260;
      let consumed = false;
      if (!expired && !outOfBounds && canImpact && marbles.length > 0) {
        const radius = Math.max(0.05, toFiniteNumber(projectile.radius, 0.2));
        const hitRadius = radius + impactPadding;
        const hitRadiusSq = hitRadius * hitRadius;
        for (let marbleIndex = 0; marbleIndex < marbles.length; marbleIndex += 1) {
          const marble = marbles[marbleIndex];
          if (!marble || typeof marble.id !== 'number') {
            continue;
          }
          const body = physics.marbleMap[marble.id];
          if (!body || typeof body.GetPosition !== 'function' || typeof body.ApplyLinearImpulseToCenter !== 'function') {
            continue;
          }
          const pos = body.GetPosition();
          const mx = toFiniteNumber(pos && pos.x, NaN);
          const my = toFiniteNumber(pos && pos.y, NaN);
          if (!Number.isFinite(mx) || !Number.isFinite(my)) {
            continue;
          }
          const dx = mx - projectile.x;
          const dy = my - projectile.y;
          if ((dx * dx) + (dy * dy) > hitRadiusSq) {
            continue;
          }
          try {
            if (typeof body.SetEnabled === 'function') {
              body.SetEnabled(true);
            }
            if (typeof body.SetAwake === 'function') {
              body.SetAwake(true);
            }
            body.ApplyLinearImpulseToCenter(
              new box2d.b2Vec2(
                toFiniteNumber(projectile.vx, 0) * impulsePower * 0.18,
                toFiniteNumber(projectile.vy, 0) * impulsePower * 0.18,
              ),
              true,
            );
          } catch (_) {
          }
          emitImpactEffect(projectile.x, projectile.y, radius);
          consumed = true;
          break;
        }
      }
      if (expired || outOfBounds || consumed) {
        fireballs.splice(index, 1);
      }
    }
  }

  return {
    kind: 'magic_wizard',
    oid: def.oid,
    tick(now) {
      ensureWizardVisualEffect();
      ensureFireballVisualEffect();
      if (env.isPaused()) {
        return;
      }
      const deltaMs = Math.max(8, Math.min(90, toFiniteNumber(now - lastTickAt, 16)));
      lastTickAt = now;
      updateFireballs(now, deltaMs);
      const interval = Math.max(120, toFiniteNumber(def.fireIntervalMs, 900));
      if (now >= nextShotAt) {
        spawnFireball(now);
        nextShotAt = now + interval;
      }
    },
    serializeState() {
      return {
        nextShotAt: toFiniteNumber(nextShotAt, 0),
        lastTickAt: toFiniteNumber(lastTickAt, 0),
        fireballs: fireballs.slice(0, 24).map((projectile) => ({
          x: toFiniteNumber(projectile && projectile.x, 0),
          y: toFiniteNumber(projectile && projectile.y, 0),
          prevX: toFiniteNumber(projectile && projectile.prevX, 0),
          prevY: toFiniteNumber(projectile && projectile.prevY, 0),
          vx: toFiniteNumber(projectile && projectile.vx, 0),
          vy: toFiniteNumber(projectile && projectile.vy, 0),
          radius: Math.max(0.05, toFiniteNumber(projectile && projectile.radius, 0.2)),
          spawnAt: toFiniteNumber(projectile && projectile.spawnAt, 0),
          expireAt: toFiniteNumber(projectile && projectile.expireAt, 0),
          now: toFiniteNumber(projectile && projectile.now, 0),
        })),
      };
    },
    restoreState(rawState) {
      const safeState = rawState && typeof rawState === 'object' ? rawState : {};
      nextShotAt = toFiniteNumber(safeState.nextShotAt, 0);
      lastTickAt = toFiniteNumber(safeState.lastTickAt, 0);
      fireballs.length = 0;
      const nextFireballs = Array.isArray(safeState.fireballs) ? safeState.fireballs : [];
      for (let index = 0; index < nextFireballs.length; index += 1) {
        const projectile = nextFireballs[index];
        if (!projectile || typeof projectile !== 'object') {
          continue;
        }
        fireballs.push({
          x: toFiniteNumber(projectile.x, 0),
          y: toFiniteNumber(projectile.y, 0),
          prevX: toFiniteNumber(projectile.prevX, toFiniteNumber(projectile.x, 0)),
          prevY: toFiniteNumber(projectile.prevY, toFiniteNumber(projectile.y, 0)),
          vx: toFiniteNumber(projectile.vx, 0),
          vy: toFiniteNumber(projectile.vy, 0),
          radius: Math.max(0.05, toFiniteNumber(projectile.radius, 0.2)),
          spawnAt: toFiniteNumber(projectile.spawnAt, 0),
          expireAt: toFiniteNumber(projectile.expireAt, 0),
          now: toFiniteNumber(projectile.now, 0),
        });
      }
      ensureWizardVisualEffect();
      ensureFireballVisualEffect();
    },
  };
}

function createStickyPadBehavior(def, env) {
  let progress = 0;
  let direction = 1;
  let holdUntil = 0;
  let lastTickAt = 0;
  let currentX = toFiniteNumber(def.x, 0);
  let currentY = toFiniteNumber(def.y, 0);
  let lastX = currentX;
  let lastY = currentY;
  let topBandVisualEffect = null;
  let missingPadFrames = 0;

  function readPathPoint(raw, fallbackX, fallbackY) {
    if (!Array.isArray(raw) || raw.length < 2) {
      return { x: fallbackX, y: fallbackY };
    }
    return {
      x: toFiniteNumber(raw[0], fallbackX),
      y: toFiniteNumber(raw[1], fallbackY),
    };
  }

  function getPadEntry() {
    const roulette = env.getRoulette();
    const physics = roulette && roulette.physics ? roulette.physics : null;
    const entities = physics && Array.isArray(physics.entities) ? physics.entities : [];
    for (let index = 0; index < entities.length; index += 1) {
      const entry = entities[index];
      const entityId = toFiniteNumber(entry && entry.shape && entry.shape.__v2eid, NaN);
      if (Number.isFinite(entityId) && entityId === toFiniteNumber(def.entityId, -1)) {
        return entry;
      }
    }
    return null;
  }

  function updatePadTransform(x, y, vx, vy) {
    const entry = getPadEntry();
    const box2d = env.getBox2D();
    if (!entry || !entry.body || !box2d || typeof box2d.b2Vec2 !== 'function') {
      return;
    }
    const body = entry.body;
    const angle = degToRad(toFiniteNumber(def.rotation, 0));
    try {
      if (typeof body.SetEnabled === 'function') {
        body.SetEnabled(true);
      }
      if (typeof body.SetAwake === 'function') {
        body.SetAwake(true);
      }
      if (typeof body.SetTransform === 'function') {
        body.SetTransform(new box2d.b2Vec2(x, y), angle);
      }
      if (typeof body.SetLinearVelocity === 'function') {
        body.SetLinearVelocity(new box2d.b2Vec2(vx, vy));
      }
      if (typeof body.SetAngularVelocity === 'function') {
        body.SetAngularVelocity(0);
      }
    } catch (_) {
    }
    entry.x = x;
    entry.y = y;
    if (entry.position && typeof entry.position === 'object') {
      entry.position.x = x;
      entry.position.y = y;
    }
  }

  function stickMarblesToTop(vx, vy) {
    const roulette = env.getRoulette();
    const physics = roulette && roulette.physics ? roulette.physics : null;
    const box2d = env.getBox2D();
    if (!roulette || !physics || !physics.marbleMap || !box2d || typeof box2d.b2Vec2 !== 'function') {
      return;
    }
    const marbles = Array.isArray(roulette._marbles) ? roulette._marbles : [];
    if (marbles.length === 0) {
      return;
    }
    const stickyTopOnly = def.stickyTopOnly !== false;
    const halfWidth = Math.max(0.08, toFiniteNumber(def.width, 1.1));
    const halfHeight = Math.max(0.04, toFiniteNumber(def.height, 0.24));
    const rotationRad = degToRad(toFiniteNumber(def.rotation, 0));
    const cos = Math.cos(rotationRad);
    const sin = Math.sin(rotationRad);
    const captureHalfWidth = halfWidth + 0.26;
    const captureMinY = stickyTopOnly ? (-halfHeight - 0.48) : (-halfHeight - 0.55);
    const captureMaxY = stickyTopOnly ? (-halfHeight + 0.34) : (halfHeight + 0.4);
    const targetLocalY = -halfHeight - 0.08;

    for (let index = 0; index < marbles.length; index += 1) {
      const marble = marbles[index];
      if (!marble || typeof marble.id !== 'number') {
        continue;
      }
      const body = physics.marbleMap[marble.id];
      if (!body || typeof body.GetPosition !== 'function') {
        continue;
      }
      const bodyPos = body.GetPosition();
      const px = toFiniteNumber(bodyPos && bodyPos.x, NaN);
      const py = toFiniteNumber(bodyPos && bodyPos.y, NaN);
      if (!Number.isFinite(px) || !Number.isFinite(py)) {
        continue;
      }
      const relX = px - currentX;
      const relY = py - currentY;
      const localX = relX * cos + relY * sin;
      const localY = -relX * sin + relY * cos;
      if (Math.abs(localX) > captureHalfWidth || localY < captureMinY || localY > captureMaxY) {
        continue;
      }
      const targetX = currentX + (localX * cos - targetLocalY * sin);
      const targetY = currentY + (localX * sin + targetLocalY * cos);
      const angle = typeof body.GetAngle === 'function' ? body.GetAngle() : 0;
      try {
        if (typeof body.SetEnabled === 'function') {
          body.SetEnabled(true);
        }
        if (typeof body.SetAwake === 'function') {
          body.SetAwake(true);
        }
        if (typeof body.SetTransform === 'function') {
          body.SetTransform(new box2d.b2Vec2(targetX, targetY), angle);
        }
        if (typeof body.SetLinearVelocity === 'function') {
          body.SetLinearVelocity(new box2d.b2Vec2(vx, vy));
        }
        if (typeof body.SetAngularVelocity === 'function') {
          body.SetAngularVelocity(0);
        }
      } catch (_) {
        continue;
      }
      marble.x = targetX;
      marble.y = targetY;
      if (marble.lastPosition && typeof marble.lastPosition === 'object') {
        marble.lastPosition.x = targetX;
        marble.lastPosition.y = targetY;
      }
    }
  }

  function ensureTopBandVisualEffect() {
    const roulette = env.getRoulette();
    if (!roulette || !Array.isArray(roulette._effects)) {
      return;
    }
    if (topBandVisualEffect && topBandVisualEffect.isDestroy !== true) {
      return;
    }
    topBandVisualEffect = {
      elapsed: 0,
      duration: Number.MAX_SAFE_INTEGER,
      isDestroy: false,
      update(deltaMs) {
        this.elapsed += toFiniteNumber(deltaMs, 0);
        if (getPadEntry()) {
          missingPadFrames = 0;
        } else {
          missingPadFrames += 1;
        }
        if (missingPadFrames > 720) {
          this.isDestroy = true;
        }
      },
      render(ctx) {
        if (!ctx) {
          return;
        }
        const halfWidth = Math.max(0.08, toFiniteNumber(def.width, 1.1));
        const halfHeight = Math.max(0.04, toFiniteNumber(def.height, 0.24));
        const entry = getPadEntry();
        const centerX = toFiniteNumber(entry && entry.x, currentX);
        const centerY = toFiniteNumber(entry && entry.y, currentY);
        const angleRad = normalizeRotationRad(
          entry && typeof entry.angle === 'number' ? entry.angle : NaN,
          degToRad(toFiniteNumber(def.rotation, 0)),
        );
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(angleRad);
        drawStickyPadTopHoneyBand(ctx, halfWidth, halfHeight, { alpha: 0.96 });
        ctx.restore();
      },
    };
    roulette._effects.push(topBandVisualEffect);
  }

  return {
    kind: 'sticky_pad',
    oid: def.oid,
    tick(now) {
      ensureTopBandVisualEffect();
      if (env.isPaused()) {
        return;
      }
      const pointA = readPathPoint(def.pathA, toFiniteNumber(def.x, 0), toFiniteNumber(def.y, 0));
      const pointB = readPathPoint(def.pathB, pointA.x + 2.4, pointA.y);
      const dx = pointB.x - pointA.x;
      const dy = pointB.y - pointA.y;
      const pathLength = Math.hypot(dx, dy);
      const dtSec = Math.max(0.004, Math.min(0.08, toFiniteNumber(now - lastTickAt, 16) / 1000));
      lastTickAt = now;

      if (pathLength <= 0.0001) {
        progress = 0;
        currentX = pointA.x;
        currentY = pointA.y;
      } else {
        if (now >= holdUntil) {
          const speed = Math.max(0.05, toFiniteNumber(def.speed, 1.1));
          const deltaProgress = (speed * dtSec) / pathLength;
          progress += direction * deltaProgress;
          if (progress >= 1) {
            progress = 1;
            direction = -1;
            holdUntil = now + Math.max(0, toFiniteNumber(def.pauseMs, 220));
          } else if (progress <= 0) {
            progress = 0;
            direction = 1;
            holdUntil = now + Math.max(0, toFiniteNumber(def.pauseMs, 220));
          }
        }
        currentX = pointA.x + dx * progress;
        currentY = pointA.y + dy * progress;
      }

      const vx = (currentX - lastX) / Math.max(0.0001, dtSec);
      const vy = (currentY - lastY) / Math.max(0.0001, dtSec);
      lastX = currentX;
      lastY = currentY;
      updatePadTransform(currentX, currentY, vx, vy);
      stickMarblesToTop(vx, vy);
    },
    serializeState() {
      return {
        progress: toFiniteNumber(progress, 0),
        direction: direction < 0 ? -1 : 1,
        holdUntil: toFiniteNumber(holdUntil, 0),
        lastTickAt: toFiniteNumber(lastTickAt, 0),
        currentX: toFiniteNumber(currentX, toFiniteNumber(def.x, 0)),
        currentY: toFiniteNumber(currentY, toFiniteNumber(def.y, 0)),
        lastX: toFiniteNumber(lastX, toFiniteNumber(def.x, 0)),
        lastY: toFiniteNumber(lastY, toFiniteNumber(def.y, 0)),
      };
    },
    restoreState(rawState) {
      const safeState = rawState && typeof rawState === 'object' ? rawState : {};
      progress = clamp(toFiniteNumber(safeState.progress, 0), 0, 1);
      direction = toFiniteNumber(safeState.direction, 1) < 0 ? -1 : 1;
      holdUntil = Math.max(0, toFiniteNumber(safeState.holdUntil, 0));
      lastTickAt = Math.max(0, toFiniteNumber(safeState.lastTickAt, 0));
      currentX = toFiniteNumber(safeState.currentX, toFiniteNumber(def.x, 0));
      currentY = toFiniteNumber(safeState.currentY, toFiniteNumber(def.y, 0));
      lastX = toFiniteNumber(safeState.lastX, currentX);
      lastY = toFiniteNumber(safeState.lastY, currentY);
      updatePadTransform(currentX, currentY, 0, 0);
      ensureTopBandVisualEffect();
    },
  };
}

function createFilledWallPolylineVisualBehavior(def, env) {
  const points = ensureClosedPolylinePoints(Array.isArray(def && def.points) ? def.points : [], 0.2);
  const polygon = normalizeClosedPolylinePoints(points);
  const color = DEFAULT_OBJECT_COLORS.box;
  const fillOpacity = 1;
  const centroid = getPolylineCentroid(polygon);
  const repelEnabled = toTruthyBoolean(def && def.repelEnabled, false);
  const repelSpeed = Math.max(0.8, toFiniteNumber(def && def.repelSpeed, 5.4));
  const repelClearance = clamp(toFiniteNumber(def && def.repelClearance, 0.12), 0.04, 0.45);
  const repelCooldownMs = Math.max(0, toFiniteNumber(def && def.repelCooldownMs, 90));
  const repelVelocityScale = clamp(toFiniteNumber(def && def.repelVelocityScale, 1.08), 0.5, 2.2);
  const ejectCooldownByMarble = {};
  const outsidePointByMarble = {};
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < polygon.length; index += 1) {
    const point = polygon[index];
    const x = toFiniteNumber(point && point[0], NaN);
    const y = toFiniteNumber(point && point[1], NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  let visualEffect = null;

  function cacheOutsidePoint(marbleKey, x, y, now) {
    outsidePointByMarble[marbleKey] = {
      x: toFiniteNumber(x, 0),
      y: toFiniteNumber(y, 0),
      at: Math.max(0, toFiniteNumber(now, 0)),
    };
  }

  function isNearBounds(x, y, margin = 0) {
    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
      return true;
    }
    return x >= minX - margin
      && x <= maxX + margin
      && y >= minY - margin
      && y <= maxY + margin;
  }

  function hasEntity() {
    const roulette = env.getRoulette();
    const physics = roulette && roulette.physics ? roulette.physics : null;
    const entities = physics && Array.isArray(physics.entities) ? physics.entities : [];
    const targetId = toFiniteNumber(def.entityId, NaN);
    if (!Number.isFinite(targetId)) {
      return true;
    }
    for (let index = 0; index < entities.length; index += 1) {
      const entry = entities[index];
      const entityId = toFiniteNumber(entry && entry.shape && entry.shape.__v2eid, NaN);
      if (Number.isFinite(entityId) && entityId === targetId) {
        return true;
      }
    }
    return false;
  }

  function resolveMarblesInsideFilledWall(now) {
    if (!repelEnabled || polygon.length < 3) {
      return;
    }
    const roulette = env.getRoulette();
    const physics = roulette && roulette.physics ? roulette.physics : null;
    const box2d = env.getBox2D();
    if (!roulette || !physics || !physics.marbleMap || !box2d || typeof box2d.b2Vec2 !== 'function') {
      return;
    }
    const marbles = Array.isArray(roulette._marbles) ? roulette._marbles : [];
    if (marbles.length <= 0) {
      return;
    }
    const nearMargin = Math.max(0.08, repelClearance * 1.4);
    for (let index = 0; index < marbles.length; index += 1) {
      const marble = marbles[index];
      if (!marble || typeof marble.id !== 'number') {
        continue;
      }
      const marbleKey = String(marble.id);
      const body = physics.marbleMap[marble.id];
      if (!body || typeof body.GetPosition !== 'function') {
        continue;
      }
      const position = body.GetPosition();
      const worldX = toFiniteNumber(position && position.x, NaN);
      const worldY = toFiniteNumber(position && position.y, NaN);
      if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) {
        continue;
      }
      if (!isNearBounds(worldX, worldY, nearMargin)) {
        cacheOutsidePoint(marbleKey, worldX, worldY, now);
        continue;
      }
      if (!isPointInsidePolygon(polygon, worldX, worldY)) {
        cacheOutsidePoint(marbleKey, worldX, worldY, now);
        continue;
      }
      if (now < toFiniteNumber(ejectCooldownByMarble[marbleKey], 0)) {
        continue;
      }

      const nearest = closestPointOnClosedPolyline(polygon, worldX, worldY);
      if (!nearest) {
        continue;
      }
      const velocity = typeof body.GetLinearVelocity === 'function' ? body.GetLinearVelocity() : null;
      const vx = toFiniteNumber(velocity && velocity.x, 0);
      const vy = toFiniteNumber(velocity && velocity.y, 0);
      const speed = Math.hypot(vx, vy);

      let dirX = 0;
      let dirY = 0;
      if (speed > 0.06) {
        dirX = -vx;
        dirY = -vy;
      } else {
        const outside = outsidePointByMarble[marbleKey];
        const outsideAge = Math.abs(toFiniteNumber(now, 0) - toFiniteNumber(outside && outside.at, 0));
        if (outside && outsideAge <= 2000) {
          dirX = toFiniteNumber(outside.x, worldX) - worldX;
          dirY = toFiniteNumber(outside.y, worldY) - worldY;
        }
      }
      let dirLen = Math.hypot(dirX, dirY);
      if (dirLen < 0.0001) {
        dirX = toFiniteNumber(nearest.x, worldX) - worldX;
        dirY = toFiniteNumber(nearest.y, worldY) - worldY;
        dirLen = Math.hypot(dirX, dirY);
      }
      if (dirLen < 0.0001) {
        dirX = toFiniteNumber(nearest.x, worldX) - toFiniteNumber(centroid.x, worldX);
        dirY = toFiniteNumber(nearest.y, worldY) - toFiniteNumber(centroid.y, worldY);
        dirLen = Math.hypot(dirX, dirY);
      }
      if (dirLen < 0.0001) {
        continue;
      }

      let unitX = dirX / dirLen;
      let unitY = dirY / dirLen;
      let targetX = toFiniteNumber(nearest.x, worldX) + unitX * repelClearance;
      let targetY = toFiniteNumber(nearest.y, worldY) + unitY * repelClearance;
      if (isPointInsidePolygon(polygon, targetX, targetY)) {
        const fallbackX = toFiniteNumber(nearest.x, worldX) - toFiniteNumber(centroid.x, worldX);
        const fallbackY = toFiniteNumber(nearest.y, worldY) - toFiniteNumber(centroid.y, worldY);
        const fallbackLen = Math.hypot(fallbackX, fallbackY);
        if (fallbackLen > 0.0001) {
          unitX = fallbackX / fallbackLen;
          unitY = fallbackY / fallbackLen;
          targetX = toFiniteNumber(nearest.x, worldX) + unitX * repelClearance;
          targetY = toFiniteNumber(nearest.y, worldY) + unitY * repelClearance;
        }
      }
      if (isPointInsidePolygon(polygon, targetX, targetY)) {
        targetX = toFiniteNumber(nearest.x, worldX) + unitX * Math.max(0.08, repelClearance * 1.8);
        targetY = toFiniteNumber(nearest.y, worldY) + unitY * Math.max(0.08, repelClearance * 1.8);
      }
      const normalSpeed = vx * unitX + vy * unitY;
      const tangentX = vx - normalSpeed * unitX;
      const tangentY = vy - normalSpeed * unitY;
      const ejectSpeed = Math.max(repelSpeed, speed * repelVelocityScale);
      const nextVx = unitX * ejectSpeed + tangentX * 0.16;
      const nextVy = unitY * ejectSpeed + tangentY * 0.16;
      try {
        if (typeof body.SetEnabled === 'function') {
          body.SetEnabled(true);
        }
        if (typeof body.SetAwake === 'function') {
          body.SetAwake(true);
        }
        if (typeof body.SetTransform === 'function') {
          const angle = typeof body.GetAngle === 'function' ? body.GetAngle() : 0;
          body.SetTransform(new box2d.b2Vec2(targetX, targetY), angle);
        }
        if (typeof body.SetLinearVelocity === 'function') {
          body.SetLinearVelocity(new box2d.b2Vec2(nextVx, nextVy));
        }
        marble.x = targetX;
        marble.y = targetY;
        if (marble.lastPosition && typeof marble.lastPosition === 'object') {
          marble.lastPosition.x = targetX;
          marble.lastPosition.y = targetY;
        }
        cacheOutsidePoint(marbleKey, targetX, targetY, now);
        ejectCooldownByMarble[marbleKey] = now + repelCooldownMs;
      } catch (_) {
      }
    }
  }

  function ensureVisualEffect() {
    const roulette = env.getRoulette();
    if (!roulette || !Array.isArray(roulette._effects) || points.length < 4) {
      return;
    }
    if (visualEffect && visualEffect.isDestroy !== true) {
      return;
    }
    visualEffect = {
      elapsed: 0,
      duration: Number.MAX_SAFE_INTEGER,
      isDestroy: false,
      update(deltaMs) {
        this.elapsed += toFiniteNumber(deltaMs, 0);
        if (!hasEntity()) {
          this.isDestroy = true;
        }
      },
      render(ctx) {
        if (!ctx || points.length < 4) {
          return;
        }
        if (!hasEntity()) {
          this.isDestroy = true;
          return;
        }
        ctx.save();
        ctx.globalAlpha = fillOpacity;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let index = 1; index < points.length; index += 1) {
          const point = points[index];
          ctx.lineTo(toFiniteNumber(point && point[0], 0), toFiniteNumber(point && point[1], 0));
        }
        ctx.closePath();
        fillPathEvenOdd(ctx);
        ctx.restore();
      },
    };
    roulette._effects.push(visualEffect);
  }

  return {
    kind: 'wall_filled_polyline_visual',
    oid: def.oid,
    tick(now) {
      ensureVisualEffect();
      if (env.isPaused()) {
        return;
      }
      resolveMarblesInsideFilledWall(now);
    },
  };
}

function createGoalMarkerImageBehavior(def, env) {
  let nextEmitAt = 0;
  const image = getRuntimeImage(def.imageSrc || '../../background/finish.png');

  function emitRenderEffect(now) {
    const roulette = env.getRoulette();
    if (!roulette || !Array.isArray(roulette._effects)) {
      return;
    }
    roulette._effects.push({
      elapsed: 0,
      duration: 220,
      isDestroy: false,
      update(deltaMs) {
        this.elapsed += toFiniteNumber(deltaMs, 0);
        if (this.elapsed >= this.duration) {
          this.isDestroy = true;
        }
      },
      render(ctx) {
        if (!ctx) {
          return;
        }
        const width = Math.max(0.2, toFiniteNumber(def.width, 6));
        const height = Math.max(0.2, toFiniteNumber(def.height, 1.8));
        const alpha = clamp(toFiniteNumber(def.opacity, 0.86), 0.05, 1);
        const x = toFiniteNumber(def.x, 0);
        const y = toFiniteNumber(def.y, 0);
        const rotation = degToRad(toFiniteNumber(def.rotation, 0));
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rotation);
        ctx.globalAlpha = alpha;
        if (image && image.complete && image.naturalWidth > 0) {
          ctx.drawImage(image, -width, -height, width * 2, height * 2);
        } else {
          ctx.fillStyle = 'rgba(255, 140, 207, 0.45)';
          ctx.strokeStyle = 'rgba(255, 205, 229, 0.95)';
          ctx.lineWidth = 0.08;
          ctx.beginPath();
          ctx.rect(-width, -height, width * 2, height * 2);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      },
    });
  }

  return {
    kind: 'goal_marker_image',
    oid: def.oid,
    tick(now) {
      if (now >= nextEmitAt) {
        emitRenderEffect(now);
        nextEmitAt = now + 120;
      }
    },
    serializeState() {
      return {
        nextEmitAt: toFiniteNumber(nextEmitAt, 0),
      };
    },
    restoreState(rawState) {
      const safeState = rawState && typeof rawState === 'object' ? rawState : {};
      nextEmitAt = toFiniteNumber(safeState.nextEmitAt, 0);
    },
  };
}

function createDiamondAutoRotateBehavior(def, env) {
  let nextShuffleAt = 0;
  let currentAngularVelocity = 0;
  const maxAbsSpeedDeg = Math.max(
    30,
    Math.abs(toFiniteNumber(def && def.maxAbsSpeedDeg, 120)),
  );

  function getBody() {
    const roulette = env.getRoulette();
    const physics = roulette && roulette.physics ? roulette.physics : null;
    const entities = physics && Array.isArray(physics.entities) ? physics.entities : [];
    const targetId = Math.floor(toFiniteNumber(def && def.entityId, NaN));
    if (!Number.isFinite(targetId)) {
      return null;
    }
    for (let index = 0; index < entities.length; index += 1) {
      const entry = entities[index];
      const entityId = Math.floor(toFiniteNumber(entry && entry.shape && entry.shape.__v2eid, NaN));
      if (entityId === targetId) {
        return entry && entry.body ? entry.body : null;
      }
    }
    return null;
  }

  function applyAngularVelocity(nextAngularVelocity) {
    const body = getBody();
    if (!body) {
      return false;
    }
    const safeAngularVelocity = toFiniteNumber(nextAngularVelocity, 0);
    currentAngularVelocity = safeAngularVelocity;
    try {
      if (typeof body.SetAngularVelocity === 'function') {
        body.SetAngularVelocity(safeAngularVelocity);
      }
      if (typeof body.SetAwake === 'function') {
        body.SetAwake(true);
      }
      if (typeof body.SetEnabled === 'function') {
        body.SetEnabled(true);
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function shuffleAngularVelocity(now) {
    const rng = env.getRng();
    const randomUnit = rng && typeof rng.next === 'function' ? rng.next() : Math.random();
    const randomSignSeed = rng && typeof rng.next === 'function' ? rng.next() : Math.random();
    const minAbsSpeedDeg = 20;
    const absSpeedDeg = minAbsSpeedDeg + (maxAbsSpeedDeg - minAbsSpeedDeg) * clamp(toFiniteNumber(randomUnit, 0.5), 0, 1);
    const sign = randomSignSeed < 0.5 ? -1 : 1;
    const nextDegPerSec = absSpeedDeg * sign;
    applyAngularVelocity(degToRad(nextDegPerSec));
    nextShuffleAt = now + 1000;
  }

  return {
    kind: 'diamond_auto_rotate',
    oid: def.oid,
    tick(now) {
      const safeNow = Math.max(0, toFiniteNumber(now, Date.now()));
      if (safeNow >= nextShuffleAt) {
        shuffleAngularVelocity(safeNow);
      } else if (Math.abs(currentAngularVelocity) > 0.0001) {
        applyAngularVelocity(currentAngularVelocity);
      }
    },
    serializeState() {
      return {
        nextShuffleAt: toFiniteNumber(nextShuffleAt, 0),
        angularVelocity: toFiniteNumber(currentAngularVelocity, 0),
      };
    },
    restoreState(rawState) {
      const safeState = rawState && typeof rawState === 'object' ? rawState : {};
      nextShuffleAt = Math.max(0, toFiniteNumber(safeState.nextShuffleAt, 0));
      currentAngularVelocity = toFiniteNumber(safeState.angularVelocity, 0);
      if (Math.abs(currentAngularVelocity) > 0.0001) {
        applyAngularVelocity(currentAngularVelocity);
      }
    },
  };
}

export function createBehaviorRuntime(env, behaviorDefs) {
  const defs = Array.isArray(behaviorDefs) ? behaviorDefs : [];
  const portalDefs = defs
    .filter((item) => item && item.kind === 'portal')
    .map((item) => ({ ...item }));
  const blackHoleDefs = defs
    .filter((item) => item && item.kind === 'black_hole')
    .map((item) => ({ ...item }));
  const whiteHoleDefs = defs
    .filter((item) => item && item.kind === 'white_hole')
    .map((item) => ({ ...item }));
  const burstDefs = defs
    .filter((item) => item && item.kind === 'burst_bumper')
    .map((item) => ({ ...item }));
  const hammerDefs = defs
    .filter((item) => item && item.kind === 'hammer')
    .map((item) => ({ ...item }));
  const bottomBumperDefs = defs
    .filter((item) => item && item.kind === 'bottom_bumper')
    .map((item) => ({ ...item }));
  const fanDefs = defs
    .filter((item) => item && item.kind === 'fan')
    .map((item) => ({ ...item }));
  const magicWizardDefs = defs
    .filter((item) => item && item.kind === 'magic_wizard')
    .map((item) => ({ ...item }));
  const stopwatchDefs = defs
    .filter((item) => item && item.kind === 'stopwatch_bomb')
    .map((item) => ({ ...item }));
  const stickyDefs = defs
    .filter((item) => item && item.kind === 'sticky_pad')
    .map((item) => ({ ...item }));
  const diamondAutoRotateDefs = defs
    .filter((item) => item && item.kind === 'diamond_auto_rotate')
    .map((item) => ({ ...item }));
  const filledWallDefs = defs
    .filter((item) => item && item.kind === 'wall_filled_polyline_visual')
    .map((item) => ({ ...item }));
  const goalMarkerDefs = defs
    .filter((item) => item && item.kind === 'goal_marker_image')
    .map((item) => ({ ...item }));

  const portalByOid = new Map();
  for (const portalDef of portalDefs) {
    portalByOid.set(portalDef.oid, portalDef);
  }

  const behaviors = [];
  for (const portalDef of portalDefs) {
    behaviors.push(createPortalBehavior(portalDef, portalByOid, env));
  }
  if (blackHoleDefs.length > 0) {
    behaviors.push(createBlackHoleNetworkBehavior(blackHoleDefs, whiteHoleDefs, env));
  }
  for (const burstDef of burstDefs) {
    behaviors.push(createBurstBumperBehavior(burstDef, env));
  }
  for (const hammerDef of hammerDefs) {
    behaviors.push(createHammerBehavior(hammerDef, env));
  }
  for (const bottomBumperDef of bottomBumperDefs) {
    behaviors.push(createBottomBumperBehavior(bottomBumperDef, env));
  }
  for (const fanDef of fanDefs) {
    behaviors.push(createFanBehavior(fanDef, env));
  }
  for (const magicWizardDef of magicWizardDefs) {
    behaviors.push(createMagicWizardBehavior(magicWizardDef, env));
  }
  for (const stopwatchDef of stopwatchDefs) {
    behaviors.push(createStopwatchBombBehavior(stopwatchDef, env));
  }
  for (const stickyDef of stickyDefs) {
    behaviors.push(createStickyPadBehavior(stickyDef, env));
  }
  for (const diamondAutoRotateDef of diamondAutoRotateDefs) {
    behaviors.push(createDiamondAutoRotateBehavior(diamondAutoRotateDef, env));
  }
  for (const filledWallDef of filledWallDefs) {
    behaviors.push(createFilledWallPolylineVisualBehavior(filledWallDef, env));
  }
  for (const goalMarkerDef of goalMarkerDefs) {
    behaviors.push(createGoalMarkerImageBehavior(goalMarkerDef, env));
  }

  return {
    tick(now) {
      for (let index = 0; index < behaviors.length; index += 1) {
        const behavior = behaviors[index];
        if (!behavior || typeof behavior.tick !== 'function') {
          continue;
        }
        behavior.tick(now);
      }
    },
    serializeState() {
      const portal = {};
      const burst = {};
      const hammer = {};
      const bottomBumper = {};
      const fan = {};
      const magicWizard = {};
      const stopwatch = {};
      const sticky = {};
      const diamondAutoRotate = {};
      const goalMarker = {};
      const wormhole = {};
      for (let index = 0; index < behaviors.length; index += 1) {
        const behavior = behaviors[index];
        const state = behavior && typeof behavior.serializeState === 'function'
          ? behavior.serializeState()
          : null;
        if (!state) {
          continue;
        }
        if (behavior.kind === 'portal') {
          portal[behavior.oid] = state;
        } else if (behavior.kind === 'burst_bumper') {
          burst[behavior.oid] = state;
        } else if (behavior.kind === 'hammer') {
          hammer[behavior.oid] = state;
        } else if (behavior.kind === 'bottom_bumper') {
          bottomBumper[behavior.oid] = state;
        } else if (behavior.kind === 'fan') {
          fan[behavior.oid] = state;
        } else if (behavior.kind === 'magic_wizard') {
          magicWizard[behavior.oid] = state;
        } else if (behavior.kind === 'stopwatch_bomb') {
          stopwatch[behavior.oid] = state;
        } else if (behavior.kind === 'sticky_pad') {
          sticky[behavior.oid] = state;
        } else if (behavior.kind === 'diamond_auto_rotate') {
          diamondAutoRotate[behavior.oid] = state;
        } else if (behavior.kind === 'goal_marker_image') {
          goalMarker[behavior.oid] = state;
        } else if (behavior.kind === 'black_hole_network') {
          wormhole[behavior.oid] = state;
        }
      }
      return { portal, burst, hammer, bottomBumper, fan, magicWizard, stopwatch, sticky, diamondAutoRotate, goalMarker, wormhole };
    },
    restoreState(rawState) {
      const safeState = rawState && typeof rawState === 'object' ? rawState : {};
      const portalState = safeState.portal && typeof safeState.portal === 'object' ? safeState.portal : {};
      const burstState = safeState.burst && typeof safeState.burst === 'object' ? safeState.burst : {};
      const hammerState = safeState.hammer && typeof safeState.hammer === 'object' ? safeState.hammer : {};
      const bottomBumperState = safeState.bottomBumper && typeof safeState.bottomBumper === 'object' ? safeState.bottomBumper : {};
      const fanState = safeState.fan && typeof safeState.fan === 'object' ? safeState.fan : {};
      const magicWizardState = safeState.magicWizard && typeof safeState.magicWizard === 'object'
        ? safeState.magicWizard
        : {};
      const stopwatchState = safeState.stopwatch && typeof safeState.stopwatch === 'object' ? safeState.stopwatch : {};
      const stickyState = safeState.sticky && typeof safeState.sticky === 'object' ? safeState.sticky : {};
      const diamondAutoRotateState = safeState.diamondAutoRotate && typeof safeState.diamondAutoRotate === 'object'
        ? safeState.diamondAutoRotate
        : {};
      const goalMarkerState = safeState.goalMarker && typeof safeState.goalMarker === 'object' ? safeState.goalMarker : {};
      const wormholeState = safeState.wormhole && typeof safeState.wormhole === 'object' ? safeState.wormhole : {};
      for (let index = 0; index < behaviors.length; index += 1) {
        const behavior = behaviors[index];
        if (!behavior || typeof behavior.restoreState !== 'function') {
          continue;
        }
        if (behavior.kind === 'portal') {
          behavior.restoreState(portalState[behavior.oid]);
        } else if (behavior.kind === 'burst_bumper') {
          behavior.restoreState(burstState[behavior.oid]);
        } else if (behavior.kind === 'hammer') {
          behavior.restoreState(hammerState[behavior.oid]);
        } else if (behavior.kind === 'bottom_bumper') {
          behavior.restoreState(bottomBumperState[behavior.oid]);
        } else if (behavior.kind === 'fan') {
          behavior.restoreState(fanState[behavior.oid]);
        } else if (behavior.kind === 'magic_wizard') {
          behavior.restoreState(magicWizardState[behavior.oid]);
        } else if (behavior.kind === 'stopwatch_bomb') {
          behavior.restoreState(stopwatchState[behavior.oid]);
        } else if (behavior.kind === 'sticky_pad') {
          behavior.restoreState(stickyState[behavior.oid]);
        } else if (behavior.kind === 'diamond_auto_rotate') {
          behavior.restoreState(diamondAutoRotateState[behavior.oid]);
        } else if (behavior.kind === 'goal_marker_image') {
          behavior.restoreState(goalMarkerState[behavior.oid]);
        } else if (behavior.kind === 'black_hole_network') {
          behavior.restoreState(wormholeState[behavior.oid]);
        }
      }
    },
  };
}
