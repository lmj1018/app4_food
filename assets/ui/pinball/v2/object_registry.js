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

function toId(value, fallback) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return fallback;
}

function clamp(value, minValue, maxValue) {
  return Math.min(maxValue, Math.max(minValue, value));
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

function compileWallPolyline(raw, entityId) {
  const points = Array.isArray(raw.points)
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
  if (points.length < 2) {
    return null;
  }
  const color = typeof raw.color === 'string' ? raw.color : '#4f6fdb';
  return withEntityId(
    {
      position: { x: 0, y: 0 },
      type: 'static',
      props: {
        density: 1,
        angularVelocity: 0,
        restitution: 0,
      },
      shape: {
        type: 'polyline',
        rotation: 0,
        points,
        color,
      },
    },
    entityId,
  );
}

function compileBox(raw, entityId, forceKinematic = false) {
  const width = Math.max(0.02, toFiniteNumber(raw.width, 0.35));
  const height = Math.max(0.02, toFiniteNumber(raw.height, 0.18));
  const rotationInput = Number.isFinite(Number(raw.rotationRad))
    ? toFiniteNumber(raw.rotationRad, 0)
    : toFiniteNumber(raw.rotation, 0);
  const rotation = normalizeRotationRad(rotationInput, 0);
  const restitution = clamp(toFiniteNumber(raw.restitution, 0), 0, 5);
  const density = Math.max(0.01, toFiniteNumber(raw.density, 1));
  const angularVelocity = toFiniteNumber(
    raw.angularVelocity,
    forceKinematic ? toFiniteNumber(raw.angularVelocity, 0) : 0,
  );
  const color = typeof raw.color === 'string' ? raw.color : '#6dd3f7';
  return withEntityId(
    {
      position: {
        x: toFiniteNumber(raw.x, 11.75),
        y: toFiniteNumber(raw.y, 40),
      },
      type: forceKinematic ? 'kinematic' : (raw.type === 'kinematic' ? 'kinematic' : 'static'),
      props: {
        density,
        angularVelocity,
        restitution,
      },
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
  const density = Math.max(0.01, toFiniteNumber(raw.density, defaults.density));
  const life = Number.isFinite(Number(raw.life)) ? Math.max(-1, Math.floor(Number(raw.life))) : defaults.life;
  const color = typeof raw.color === 'string' ? raw.color : defaults.color;
  return withEntityId(
    {
      position: {
        x: toFiniteNumber(raw.x, defaults.x),
        y: toFiniteNumber(raw.y, defaults.y),
      },
      type: 'static',
      props: {
        density,
        angularVelocity: 0,
        restitution,
        life,
      },
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
  return compileBox(
    {
      ...raw,
      width: Math.max(0.05, toFiniteNumber(raw.width, size)),
      height: Math.max(0.05, toFiniteNumber(raw.height, size)),
      rotation: rotationDeg,
      restitution: toFiniteNumber(raw.restitution, 1.4),
      density: toFiniteNumber(raw.density, 1),
    },
    entityId,
    false,
  );
}

function compileObject(rawObject, entityId) {
  if (!rawObject || typeof rawObject !== 'object') {
    return { entity: null, behavior: null };
  }

  const type = toId(rawObject.type, '');
  switch (type) {
    case 'wall_polyline':
      return {
        entity: compileWallPolyline(rawObject, entityId),
        behavior: null,
      };
    case 'box_block':
      return {
        entity: compileBox(rawObject, entityId, false),
        behavior: null,
      };
    case 'diamond_block':
      return {
        entity: compileDiamond(rawObject, entityId),
        behavior: null,
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
          color: '#ffe082',
        }),
        behavior: null,
      };
    case 'burst_bumper':
      return {
        entity: compileCircle(rawObject, entityId, {
          radius: 0.68,
          restitution: 3.2,
          density: 1,
          life: -1,
          x: 11.75,
          y: 72,
          color: '#ff9f6e',
        }),
        behavior: {
          kind: 'burst_bumper',
          oid: toId(rawObject.oid, `burst_${entityId}`),
          entityId,
          x: toFiniteNumber(rawObject.x, 11.75),
          y: toFiniteNumber(rawObject.y, 72),
          radius: Math.max(0.08, toFiniteNumber(rawObject.radius, 0.68)),
          triggerRadius: Math.max(0.14, toFiniteNumber(rawObject.triggerRadius, toFiniteNumber(rawObject.radius, 0.68) + 0.45)),
          force: Math.max(0.1, toFiniteNumber(rawObject.force, toFiniteNumber(rawObject.burstForce, 6.2))),
          cooldownMs: Math.max(20, toFiniteNumber(rawObject.cooldownMs, toFiniteNumber(rawObject.intervalMs, 420))),
          upwardBoost: Math.max(0, toFiniteNumber(rawObject.upwardBoost, 0)),
        },
      };
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
          color: '#c18bff',
        }),
        behavior: {
          kind: 'portal',
          oid: toId(rawObject.oid, `portal_${entityId}`),
          pair: toId(rawObject.pair, ''),
          x: toFiniteNumber(rawObject.x, 0),
          y: toFiniteNumber(rawObject.y, 0),
          radius: Math.max(0.12, toFiniteNumber(rawObject.radius, 0.45)),
          cooldownMs: Math.max(0, toFiniteNumber(rawObject.cooldownMs, 900)),
          preserveVelocity: toBoolean(rawObject.preserveVelocity, false),
          exitImpulse: Math.max(0, toFiniteNumber(rawObject.exitImpulse, 0)),
          exitDirDeg: toFiniteNumber(rawObject.exitDirDeg, 0),
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
            rotation: toFiniteNumber(rawObject.rotation, 0),
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
    if (compiled.entity) {
      entities.push(compiled.entity);
      objectIndex.push({
        oid,
        type: toId(rawObject.type, ''),
        entityId: entityIdCursor,
      });
      entityIdCursor += 1;
    }
    if (compiled.behavior) {
      behaviorDefs.push(compiled.behavior);
    }
  }

  const stage = {
    title: toId(safeMap.title, toId(safeMap.id, 'V2 Map')),
    goalY: Math.max(20, toFiniteNumber(stageRaw.goalY, DEFAULT_STAGE.goalY)),
    zoomY: Math.max(0, toFiniteNumber(stageRaw.zoomY, DEFAULT_STAGE.zoomY)),
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
  const getPairPortal = () => portalByOid.get(def.pair) || null;

  function getKey(marbleId) {
    return `${def.oid}:${marbleId}`;
  }

  function setCooldown(marbleId, expiresAt) {
    cooldownByMarble[getKey(marbleId)] = expiresAt;
    const pair = getPairPortal();
    if (pair) {
      cooldownByMarble[`${pair.oid}:${marbleId}`] = expiresAt;
    }
  }

  function getCooldown(marbleId) {
    return toFiniteNumber(cooldownByMarble[getKey(marbleId)], 0);
  }

  function teleportMarble(marble, source, target, now) {
    const roulette = env.getRoulette();
    const physics = roulette && roulette.physics ? roulette.physics : null;
    if (!physics || !physics.marbleMap) {
      return;
    }
    const body = physics.marbleMap[marble.id];
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
        if (source.preserveVelocity) {
          body.SetLinearVelocity(new box2d.b2Vec2(previousVx, previousVy));
        } else {
          body.SetLinearVelocity(new box2d.b2Vec2(0, 0));
        }
      }
      const impulse = Math.max(0, toFiniteNumber(source.exitImpulse, 0));
      if (impulse > 0 && typeof body.ApplyLinearImpulseToCenter === 'function') {
        const rad = degToRad(toFiniteNumber(source.exitDirDeg, 0));
        const ix = Math.cos(rad) * impulse;
        const iy = Math.sin(rad) * impulse;
        body.ApplyLinearImpulseToCenter(new box2d.b2Vec2(ix, iy), true);
      }
      marble.x = targetX;
      marble.y = targetY;
    } catch (_) {
      return;
    }

    const cooldownMs = Math.max(0, toFiniteNumber(source.cooldownMs, 900));
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
      if (!source || !target) {
        return;
      }
      const radiusSq = source.radius * source.radius;
      const localTeleported = new Set();
      for (let index = 0; index < marbles.length; index += 1) {
        const marble = marbles[index];
        if (!marble || typeof marble.id !== 'number') {
          continue;
        }
        if (localTeleported.has(marble.id)) {
          continue;
        }
        const cooldown = getCooldown(marble.id);
        if (cooldown > now) {
          continue;
        }
        const dx = toFiniteNumber(marble.x, NaN) - source.x;
        const dy = toFiniteNumber(marble.y, NaN) - source.y;
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
          continue;
        }
        if (dx * dx + dy * dy > radiusSq) {
          continue;
        }
        teleportMarble(marble, source, target, now);
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

function createBurstBumperBehavior(def, env) {
  const cooldownByMarble = {};

  function canTrigger(marbleId, now) {
    const key = String(marbleId);
    return toFiniteNumber(cooldownByMarble[key], 0) <= now;
  }

  function setCooldown(marbleId, now) {
    cooldownByMarble[String(marbleId)] = now + def.cooldownMs;
  }

  function triggerBurst(marble, now) {
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
    let dx = toFiniteNumber(marble.x, def.x) - def.x;
    let dy = toFiniteNumber(marble.y, def.y) - def.y;
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
  }

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
      const marbles = Array.isArray(roulette._marbles) ? roulette._marbles : [];
      if (marbles.length === 0) {
        return;
      }
      const radius = Math.max(0.12, toFiniteNumber(def.triggerRadius, toFiniteNumber(def.radius, 0.68) + 0.45));
      const radiusSq = radius * radius;
      for (let index = 0; index < marbles.length; index += 1) {
        const marble = marbles[index];
        if (!marble || typeof marble.id !== 'number') {
          continue;
        }
        if (!canTrigger(marble.id, now)) {
          continue;
        }
        const dx = toFiniteNumber(marble.x, NaN) - def.x;
        const dy = toFiniteNumber(marble.y, NaN) - def.y;
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
          continue;
        }
        if (dx * dx + dy * dy > radiusSq) {
          continue;
        }
        triggerBurst(marble, now);
      }
    },
    serializeState() {
      return {
        cooldownByMarble: { ...cooldownByMarble },
      };
    },
    restoreState(rawState) {
      for (const key of Object.keys(cooldownByMarble)) {
        delete cooldownByMarble[key];
      }
      const safeState = rawState && typeof rawState === 'object' ? rawState : {};
      const nextCooldown = safeState.cooldownByMarble && typeof safeState.cooldownByMarble === 'object'
        ? safeState.cooldownByMarble
        : {};
      for (const key of Object.keys(nextCooldown)) {
        cooldownByMarble[key] = toFiniteNumber(nextCooldown[key], 0);
      }
    },
  };
}

function createHammerBehavior(def, env) {
  let lastFiredAt = 0;
  let queue = [];
  const cooldownByMarble = {};
  let swingUntil = 0;
  let baseAngleRad = null;
  let basePosX = NaN;
  let basePosY = NaN;

  function canHitMarble(marbleId, now) {
    const key = String(marbleId);
    const cooldownUntil = toFiniteNumber(cooldownByMarble[key], 0);
    return cooldownUntil <= now;
  }

  function applyCooldown(marbleId, now) {
    cooldownByMarble[String(marbleId)] = now + def.cooldownMs;
  }

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
      baseAngleRad = currentAngle;
    }
    if (!Number.isFinite(basePosX) || !Number.isFinite(basePosY)) {
      const currentPos = typeof body.GetPosition === 'function' ? body.GetPosition() : null;
      basePosX = currentPos ? toFiniteNumber(currentPos.x, toFiniteNumber(def.x, 0)) : toFiniteNumber(def.x, 0);
      basePosY = currentPos ? toFiniteNumber(currentPos.y, toFiniteNumber(def.y, 0)) : toFiniteNumber(def.y, 0);
    }
    const swingDuration = Math.max(40, toFiniteNumber(def.swingDurationMs, 220));
    const swingDeg = Math.max(0, toFiniteNumber(def.swingDeg, 26));
    const hitDistance = Math.max(0, toFiniteNumber(def.hitDistance, 0.95));
    const dirRad = degToRad(toFiniteNumber(def.dirDeg, 90));
    let targetAngle = toFiniteNumber(baseAngleRad, 0);
    let swingProgress = 0;
    if (swingUntil > now) {
      const elapsed = swingDuration - (swingUntil - now);
      const progress = clamp(elapsed / swingDuration, 0, 1);
      swingProgress = Math.sin(progress * Math.PI);
      targetAngle += swingProgress * degToRad(swingDeg);
    }
    const targetX = toFiniteNumber(basePosX, toFiniteNumber(def.x, 0)) + Math.cos(dirRad) * hitDistance * swingProgress;
    const targetY = toFiniteNumber(basePosY, toFiniteNumber(def.y, 0)) + Math.sin(dirRad) * hitDistance * swingProgress;
    try {
      if (typeof body.SetTransform === 'function') {
        body.SetTransform(new box2d.b2Vec2(targetX, targetY), targetAngle);
      }
      if (typeof body.SetAngularVelocity === 'function') {
        body.SetAngularVelocity(0);
      }
      if (typeof body.SetAwake === 'function') {
        body.SetAwake(true);
      }
    } catch (_) {
    }
  }

  function fire(forceScale, now) {
    const roulette = env.getRoulette();
    if (!roulette || !roulette.physics || env.isPaused()) {
      return;
    }
    const marbles = Array.isArray(roulette._marbles) ? roulette._marbles : [];
    if (marbles.length === 0) {
      return;
    }
    const physics = roulette.physics;
    const box2d = env.getBox2D();
    if (!physics.marbleMap || !box2d || typeof box2d.b2Vec2 !== 'function') {
      return;
    }
    const rad = degToRad(def.dirDeg);
    const ix = Math.cos(rad) * def.force * forceScale;
    const iy = Math.sin(rad) * def.force * forceScale;
    const triggerRadiusSq = def.triggerRadius * def.triggerRadius;

    for (let index = 0; index < marbles.length; index += 1) {
      const marble = marbles[index];
      if (!marble || typeof marble.id !== 'number') {
        continue;
      }
      if (!canHitMarble(marble.id, now)) {
        continue;
      }
      const dx = toFiniteNumber(marble.x, NaN) - def.x;
      const dy = toFiniteNumber(marble.y, NaN) - def.y;
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
        continue;
      }
      if (dx * dx + dy * dy > triggerRadiusSq) {
        continue;
      }
      const body = physics.marbleMap[marble.id];
      if (!body || typeof body.ApplyLinearImpulseToCenter !== 'function') {
        continue;
      }
      try {
        if (typeof body.SetEnabled === 'function') {
          body.SetEnabled(true);
        }
        if (typeof body.SetAwake === 'function') {
          body.SetAwake(true);
        }
        body.ApplyLinearImpulseToCenter(new box2d.b2Vec2(ix, iy), true);
      } catch (_) {
        continue;
      }
      applyCooldown(marble.id, now);
    }
    swingUntil = Math.max(swingUntil, now + Math.max(40, toFiniteNumber(def.swingDurationMs, 220)));
  }

  return {
    kind: 'hammer',
    oid: def.oid,
    tick(now) {
      if (env.isPaused()) {
        return;
      }
      if (lastFiredAt <= 0) {
        lastFiredAt = now;
      }
      if (now - lastFiredAt >= def.intervalMs) {
        lastFiredAt = now;
        queue.push({ at: now, scale: 1 });
        if (def.doubleHit) {
          queue.push({ at: now + 140, scale: 0.72 });
        }
      }
      const pending = [];
      for (let index = 0; index < queue.length; index += 1) {
        const item = queue[index];
        if (toFiniteNumber(item.at, 0) > now) {
          pending.push(item);
          continue;
        }
        fire(toFiniteNumber(item.scale, 1), now);
      }
      queue = pending;
      updateSwingVisual(now);
    },
    serializeState() {
      return {
        lastFiredAt,
        swingUntil,
        baseAngleRad: toFiniteNumber(baseAngleRad, 0),
        basePosX: toFiniteNumber(basePosX, toFiniteNumber(def.x, 0)),
        basePosY: toFiniteNumber(basePosY, toFiniteNumber(def.y, 0)),
        queue: queue.map((item) => ({ at: item.at, scale: item.scale })),
        cooldownByMarble: { ...cooldownByMarble },
      };
    },
    restoreState(rawState) {
      const nextState = rawState && typeof rawState === 'object' ? rawState : {};
      lastFiredAt = toFiniteNumber(nextState.lastFiredAt, 0);
      swingUntil = toFiniteNumber(nextState.swingUntil, 0);
      baseAngleRad = toFiniteNumber(nextState.baseAngleRad, 0);
      basePosX = toFiniteNumber(nextState.basePosX, toFiniteNumber(def.x, 0));
      basePosY = toFiniteNumber(nextState.basePosY, toFiniteNumber(def.y, 0));
      queue = Array.isArray(nextState.queue)
        ? nextState.queue
            .map((item) => ({
              at: toFiniteNumber(item && item.at, 0),
              scale: toFiniteNumber(item && item.scale, 1),
            }))
            .filter((item) => item.at > 0)
        : [];
      for (const key of Object.keys(cooldownByMarble)) {
        delete cooldownByMarble[key];
      }
      const nextCooldown = nextState.cooldownByMarble && typeof nextState.cooldownByMarble === 'object'
        ? nextState.cooldownByMarble
        : {};
      for (const key of Object.keys(nextCooldown)) {
        cooldownByMarble[key] = toFiniteNumber(nextCooldown[key], 0);
      }
      updateSwingVisual(Date.now());
    },
  };
}

export function createBehaviorRuntime(env, behaviorDefs) {
  const defs = Array.isArray(behaviorDefs) ? behaviorDefs : [];
  const portalDefs = defs
    .filter((item) => item && item.kind === 'portal')
    .map((item) => ({ ...item }));
  const burstDefs = defs
    .filter((item) => item && item.kind === 'burst_bumper')
    .map((item) => ({ ...item }));
  const hammerDefs = defs
    .filter((item) => item && item.kind === 'hammer')
    .map((item) => ({ ...item }));

  const portalByOid = new Map();
  for (const portalDef of portalDefs) {
    portalByOid.set(portalDef.oid, portalDef);
  }

  const behaviors = [];
  for (const portalDef of portalDefs) {
    behaviors.push(createPortalBehavior(portalDef, portalByOid, env));
  }
  for (const burstDef of burstDefs) {
    behaviors.push(createBurstBumperBehavior(burstDef, env));
  }
  for (const hammerDef of hammerDefs) {
    behaviors.push(createHammerBehavior(hammerDef, env));
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
        }
      }
      return { portal, burst, hammer };
    },
    restoreState(rawState) {
      const safeState = rawState && typeof rawState === 'object' ? rawState : {};
      const portalState = safeState.portal && typeof safeState.portal === 'object' ? safeState.portal : {};
      const burstState = safeState.burst && typeof safeState.burst === 'object' ? safeState.burst : {};
      const hammerState = safeState.hammer && typeof safeState.hammer === 'object' ? safeState.hammer : {};
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
        }
      }
    },
  };
}
