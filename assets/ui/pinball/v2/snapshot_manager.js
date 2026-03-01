export const SNAPSHOT_VERSION = 1;
export const SUPPORTED_SLOT_IDS = [
  'quick',
  'slot1',
  'slot2',
  'slot3',
  'slot4',
  'slot5',
  'slot6',
  'slot7',
  'slot8',
];

function toFiniteNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function normalizeSlotId(slotId) {
  const raw = typeof slotId === 'string' ? slotId.trim().toLowerCase() : '';
  if (!raw) {
    return 'quick';
  }
  if (SUPPORTED_SLOT_IDS.includes(raw)) {
    return raw;
  }
  return null;
}

export function createSnapshotStore() {
  const bySlot = new Map();
  return {
    set(slotId, snapshot) {
      bySlot.set(slotId, snapshot);
    },
    get(slotId) {
      return bySlot.get(slotId) || null;
    },
    delete(slotId) {
      return bySlot.delete(slotId);
    },
    list() {
      return Array.from(bySlot.entries()).map(([slotId, snapshot]) => ({
        slotId,
        snapshot,
      }));
    },
    clear() {
      bySlot.clear();
    },
  };
}

export function buildSnapshotLabel(snapshot) {
  const safe = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const date = new Date(toFiniteNumber(safe.createdAt, Date.now()));
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  const mapId = typeof safe.mapId === 'string' && safe.mapId ? safe.mapId : 'unknown-map';
  const marbleCount = Array.isArray(safe.physicsState && safe.physicsState.marbleBodies)
    ? safe.physicsState.marbleBodies.length
    : 0;
  return `${mapId} | ${marbleCount} marbles | ${hh}:${mm}:${ss}`;
}

export function captureBodyState(body) {
  if (!body || typeof body !== 'object') {
    return null;
  }
  const position = typeof body.GetPosition === 'function' ? body.GetPosition() : null;
  const linearVelocity = typeof body.GetLinearVelocity === 'function' ? body.GetLinearVelocity() : null;
  return {
    x: position ? toFiniteNumber(position.x, 0) : 0,
    y: position ? toFiniteNumber(position.y, 0) : 0,
    angle: typeof body.GetAngle === 'function' ? toFiniteNumber(body.GetAngle(), 0) : 0,
    vx: linearVelocity ? toFiniteNumber(linearVelocity.x, 0) : 0,
    vy: linearVelocity ? toFiniteNumber(linearVelocity.y, 0) : 0,
    av: typeof body.GetAngularVelocity === 'function' ? toFiniteNumber(body.GetAngularVelocity(), 0) : 0,
    enabled: typeof body.IsEnabled === 'function' ? !!body.IsEnabled() : true,
    awake: typeof body.IsAwake === 'function' ? !!body.IsAwake() : true,
  };
}

export function applyBodyState(body, state, box2d) {
  if (!body || !state || typeof state !== 'object') {
    return false;
  }
  if (!box2d || typeof box2d.b2Vec2 !== 'function') {
    return false;
  }
  try {
    const targetEnabled = state.enabled !== false;
    const targetAwake = state.awake !== false;
    if (typeof body.SetEnabled === 'function') {
      body.SetEnabled(targetEnabled);
    }
    if (typeof body.SetAwake === 'function') {
      body.SetAwake(targetAwake);
    }
    if (typeof body.SetTransform === 'function') {
      body.SetTransform(
        new box2d.b2Vec2(toFiniteNumber(state.x, 0), toFiniteNumber(state.y, 0)),
        toFiniteNumber(state.angle, 0),
      );
    }
    if (typeof body.SetLinearVelocity === 'function') {
      body.SetLinearVelocity(
        new box2d.b2Vec2(toFiniteNumber(state.vx, 0), toFiniteNumber(state.vy, 0)),
      );
    }
    if (typeof body.SetAngularVelocity === 'function') {
      body.SetAngularVelocity(toFiniteNumber(state.av, 0));
    }
  } catch (_) {
    return false;
  }
  return true;
}

export function captureMarbleMeta(marble) {
  if (!marble || typeof marble !== 'object') {
    return null;
  }
  const lastPosition = marble.lastPosition && typeof marble.lastPosition === 'object'
    ? {
        x: toFiniteNumber(marble.lastPosition.x, 0),
        y: toFiniteNumber(marble.lastPosition.y, 0),
      }
    : { x: 0, y: 0 };
  return {
    id: toFiniteNumber(marble.id, -1),
    name: typeof marble.name === 'string' ? marble.name : '',
    weight: toFiniteNumber(marble.weight, 1),
    hue: toFiniteNumber(marble.hue, 0),
    color: typeof marble.color === 'string' ? marble.color : '',
    skill: toFiniteNumber(marble.skill, 0),
    isActive: marble.isActive !== false,
    impact: toFiniteNumber(marble.impact, 0),
    coolTime: toFiniteNumber(marble._coolTime, 0),
    maxCoolTime: toFiniteNumber(marble._maxCoolTime, 0),
    stuckTime: toFiniteNumber(marble._stuckTime, 0),
    lastPosition,
  };
}

export function applyMarbleMeta(marble, state) {
  if (!marble || !state || typeof state !== 'object') {
    return;
  }
  marble.name = typeof state.name === 'string' ? state.name : marble.name;
  marble.weight = toFiniteNumber(state.weight, marble.weight);
  marble.hue = toFiniteNumber(state.hue, marble.hue);
  marble.color = typeof state.color === 'string' ? state.color : marble.color;
  marble.skill = toFiniteNumber(state.skill, marble.skill);
  marble.isActive = state.isActive !== false;
  marble.impact = toFiniteNumber(state.impact, marble.impact);
  marble._coolTime = toFiniteNumber(state.coolTime, marble._coolTime);
  marble._maxCoolTime = toFiniteNumber(state.maxCoolTime, marble._maxCoolTime);
  marble._stuckTime = toFiniteNumber(state.stuckTime, marble._stuckTime);
  const lastPosition = state.lastPosition && typeof state.lastPosition === 'object'
    ? state.lastPosition
    : null;
  if (lastPosition) {
    marble.lastPosition = {
      x: toFiniteNumber(lastPosition.x, 0),
      y: toFiniteNumber(lastPosition.y, 0),
    };
  }
}

export function stableHash(input) {
  const text = typeof input === 'string' ? input : JSON.stringify(input);
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash) ^ text.charCodeAt(index);
  }
  return `h${(hash >>> 0).toString(16)}`;
}
