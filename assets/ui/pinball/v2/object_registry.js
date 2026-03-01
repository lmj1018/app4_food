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
  burst: '#5dff7a',
  hammer: '#ffa557',
  diamond: '#6affea',
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
  const pointsFromArray = Array.isArray(raw.points)
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
  const points = pointsFromArray.length >= 2
    ? pointsFromArray
    : [
        [toFiniteNumber(raw.x1, toFiniteNumber(raw.x, NaN)), toFiniteNumber(raw.y1, toFiniteNumber(raw.y, NaN))],
        [toFiniteNumber(raw.x2, toFiniteNumber(raw.x + 1, NaN)), toFiniteNumber(raw.y2, toFiniteNumber(raw.y + 1, NaN))],
      ].filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
  if (points.length < 2) {
    return null;
  }
  const color = typeof raw.color === 'string' ? raw.color : DEFAULT_OBJECT_COLORS.wall;
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
  const color = typeof raw.color === 'string' ? raw.color : DEFAULT_OBJECT_COLORS.box;
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
      color: typeof raw.color === 'string' ? raw.color : DEFAULT_OBJECT_COLORS.diamond,
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
    case 'wall_segment':
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
          color: DEFAULT_OBJECT_COLORS.circle,
        }),
        behavior: null,
      };
    case 'burst_bumper': {
      const totalLayers = Math.max(1, Math.floor(toFiniteNumber(rawObject.layers, 3)));
      const hpPerLayer = Math.max(1, Math.floor(toFiniteNumber(rawObject.hpPerLayer, toFiniteNumber(rawObject.hp, 1))));
      const damagePerHit = Math.max(1, Math.floor(toFiniteNumber(rawObject.damagePerHit, 1)));
      const baseRadius = Math.max(0.08, toFiniteNumber(rawObject.radius, 0.68));
      const baseTriggerRadius = Math.max(0.14, toFiniteNumber(rawObject.triggerRadius, baseRadius + 0.45));
      const color = typeof rawObject.color === 'string' ? rawObject.color : DEFAULT_OBJECT_COLORS.burst;
      const entities = [];
      const layerEntityIds = [];
      const layerRadii = [];

      for (let layerIndex = 0; layerIndex < totalLayers; layerIndex += 1) {
        const ratio = (totalLayers - layerIndex) / totalLayers;
        const layerRadius = Math.max(0.06, baseRadius * ratio);
        const defaultLayerColor = `rgba(93,255,122,${Math.max(0.28, 0.18 + ratio * 0.82)})`;
        const layerColor = typeof rawObject.color === 'string' && rawObject.color.trim()
          ? rawObject.color
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
          preserveVelocity: toBoolean(rawObject.preserveVelocity, true),
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
          rotation: toFiniteNumber(rawObject.rotation, 0),
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
        const rad = degToRad(toFiniteNumber(target.exitDirDeg, 0));
        const ix = Math.cos(rad) * impulse;
        const iy = Math.sin(rad) * impulse;
        body.ApplyLinearImpulseToCenter(new box2d.b2Vec2(ix, iy), true);
      }
      marble.x = targetX;
      marble.y = targetY;
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
  const layerHp = Array.from({ length: totalLayers }, () => hpPerLayer);
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
        const nextHp = Math.floor(toFiniteNumber(restoredLayerHp[index], hpPerLayer));
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
      const initialRotation = degToRad(toFiniteNumber(def.rotation, toFiniteNumber(def.dirDeg, 0)));
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
    if (entry.shape && typeof entry.shape === 'object') {
      entry.shape.rotation = targetAngle;
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
