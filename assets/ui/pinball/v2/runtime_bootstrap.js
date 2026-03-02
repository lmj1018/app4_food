import { compileMap, createBehaviorRuntime } from './object_registry.js';
import {
  SNAPSHOT_VERSION,
  SUPPORTED_SLOT_IDS,
  normalizeSlotId,
  createSnapshotStore,
  buildSnapshotLabel,
  captureBodyState,
  applyBodyState,
  captureMarbleMeta,
  applyMarbleMeta,
  stableHash,
} from './snapshot_manager.js';

const RUNTIME_REVISION = 'v2-runtime-r20260302-03';
const STATUS_ELEMENT_ID = 'v2Status';

function toFiniteNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeCandidates(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set();
  const normalized = [];
  for (let index = 0; index < raw.length; index += 1) {
    const name = String(raw[index] ?? '').trim();
    if (!name || seen.has(name)) {
      continue;
    }
    seen.add(name);
    normalized.push(name);
  }
  return normalized;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createDeterministicRng(initialSeed) {
  let state = (toFiniteNumber(initialSeed, 0x9e3779b9) >>> 0) || 0x9e3779b9;
  return {
    next() {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      return state / 0x100000000;
    },
    getState() {
      return state >>> 0;
    },
    setState(nextState) {
      state = (toFiniteNumber(nextState, 1) >>> 0) || 1;
    },
    setSeed(seed) {
      state = (toFiniteNumber(seed, 0x9e3779b9) >>> 0) || 0x9e3779b9;
    },
  };
}

const control = {
  mapId: '',
  mapJson: null,
  compiledMap: null,
  candidates: [],
  winningRank: 1,
  paused: true,
  goalReceived: false,
  behaviorRuntime: null,
  destroyedEntityIds: [],
  allEntityIds: [],
  snapshotStore: createSnapshotStore(),
  tickStarted: false,
  statusText: '',
  rngSeed: 0x9e3779b9,
  rng: createDeterministicRng(0x9e3779b9),
  lastSnapshotHash: '',
  spinStartedAt: 0,
  skillWarmupMs: 5000,
  skillDisabled: true,
  mapDisableSkills: false,
  mapDisableSkillsInSlowMotion: true,
  fromApp: false,
};

const marbleImageState = {
  dataUrls: {},
  images: new Map(),
  roundedImages: new Map(),
  revision: 0,
};

function isSupportedRuntimeImageSrc(src) {
  const safeSrc = typeof src === 'string' ? src.trim() : '';
  if (!safeSrc) {
    return false;
  }
  return safeSrc.startsWith('data:image/')
    || safeSrc.startsWith('http://')
    || safeSrc.startsWith('https://')
    || safeSrc.startsWith('/__app_asset/')
    || safeSrc.startsWith('__app_asset/');
}

function detectFromAppContext(payload = null) {
  const query = new URLSearchParams(window.location.search);
  const byQuery = query.get('fromApp') === '1' || query.get('isPinballApp') === '1';
  const byPayload = payload && typeof payload === 'object' && (payload.fromApp === true || payload.isPinballApp === true);
  return byQuery || byPayload;
}

function applyAppVisualCompatibility() {
  if (control.fromApp !== true) {
    return;
  }
  const statusElement = document.getElementById(STATUS_ELEMENT_ID);
  if (statusElement) {
    statusElement.style.display = 'none';
    statusElement.style.opacity = '0';
    statusElement.style.pointerEvents = 'none';
  }
  const roulette = getRoulette();
  if (!roulette) {
    return;
  }
  if (Array.isArray(roulette._uiObjects) && roulette._uiObjects.length > 0) {
    roulette._uiObjects = [];
  }
  if (roulette.__v2AppUiObjectMuted !== true && typeof roulette.addUiObject === 'function') {
    roulette.__v2AppUiObjectMuted = true;
    roulette.__v2AppOriginalAddUiObject = roulette.addUiObject.bind(roulette);
    roulette.addUiObject = () => {};
  }
  const particleManager = roulette._particleManager;
  if (particleManager && particleManager.__v2AppGoalFxMuted !== true && typeof particleManager.shot === 'function') {
    particleManager.__v2AppGoalFxMuted = true;
    particleManager.__v2AppOriginalShot = particleManager.shot.bind(particleManager);
    particleManager.shot = () => {};
  }
}

function ensureCanvasFillLayout() {
  const roulette = getRoulette();
  const renderer = roulette && roulette._renderer && typeof roulette._renderer === 'object'
    ? roulette._renderer
    : null;
  const canvas = renderer && renderer.canvas
    ? renderer.canvas
    : document.querySelector('canvas');
  if (!canvas) {
    return;
  }
  const root = document.documentElement;
  if (root && root.__v2CanvasFillApplied !== true) {
    root.style.width = '100%';
    root.style.height = '100%';
    root.style.overflow = 'hidden';
    root.__v2CanvasFillApplied = true;
  }
  const body = document.body;
  if (body && body.__v2CanvasFillApplied !== true) {
    body.style.width = '100%';
    body.style.height = '100%';
    body.style.margin = '0';
    body.style.overflow = 'hidden';
    body.__v2CanvasFillApplied = true;
  }
  if (canvas.__v2CanvasFillApplied !== true) {
    canvas.style.display = 'block';
    canvas.style.position = 'fixed';
    canvas.style.inset = '0';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.maxWidth = '100vw';
    canvas.style.maxHeight = '100vh';
    canvas.__v2CanvasFillApplied = true;
  }
}

function installContextMenuGuard() {
  if (window.__v2RuntimeContextMenuGuard === true) {
    return;
  }
  const block = (event) => {
    if (!event) {
      return;
    }
    if (typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    if (typeof event.stopPropagation === 'function') {
      event.stopPropagation();
    }
  };
  try {
    window.addEventListener('contextmenu', block, true);
    document.addEventListener('contextmenu', block, true);
    window.__v2RuntimeContextMenuGuard = true;
  } catch (_) {
  }
}

function setStatus(text) {
  const message = String(text ?? '');
  control.statusText = message;
  const element = document.getElementById(STATUS_ELEMENT_ID);
  if (element) {
    element.textContent = message;
  }
}

function postBridge(eventName, payload = {}) {
  try {
    if (window.PinballBridge && typeof window.PinballBridge.postMessage === 'function') {
      window.PinballBridge.postMessage(
        JSON.stringify({
          source: 'pinball-v2',
          event: eventName,
          payload,
          timestamp: new Date().toISOString(),
        }),
      );
    }
  } catch (_) {
  }
}

function getRoulette() {
  return window.roulette && typeof window.roulette === 'object'
    ? window.roulette
    : null;
}

function normalizeImageDataUrlMap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const out = {};
  const entries = Object.entries(raw);
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const rawName = entry && entry.length > 0 ? entry[0] : '';
    const rawSrc = entry && entry.length > 1 ? entry[1] : '';
    const name = typeof rawName === 'string' ? rawName.trim() : '';
    const src = typeof rawSrc === 'string' ? rawSrc.trim() : '';
    if (!name || !isSupportedRuntimeImageSrc(src)) {
      continue;
    }
    out[name] = src;
  }
  return out;
}

function setPayloadMarbleImages(raw) {
  const normalized = normalizeImageDataUrlMap(raw);
  marbleImageState.dataUrls = normalized;
  marbleImageState.images.clear();
  marbleImageState.roundedImages.clear();
  const names = Object.keys(normalized);
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    const src = normalized[name];
    if (!name || !src) {
      continue;
    }
    let image = null;
    try {
      image = new Image();
      image.decoding = 'async';
      image.__v2Failed = false;
      image.onload = () => {
        image.__v2Failed = false;
      };
      image.onerror = () => {
        image.__v2Failed = true;
      };
      image.src = src;
    } catch (_) {
      image = null;
    }
    if (image) {
      marbleImageState.images.set(name, image);
    }
  }
  marbleImageState.revision += 1;
}

function buildRoundedMarbleImage(name, image) {
  if (!image || image.complete !== true || Number(image.naturalWidth) <= 0 || Number(image.naturalHeight) <= 0) {
    return null;
  }
  const key = typeof name === 'string' ? name.trim() : '';
  if (key && marbleImageState.roundedImages.has(key)) {
    return marbleImageState.roundedImages.get(key);
  }
  const sourceWidth = Math.max(1, Number(image.naturalWidth) || 1);
  const sourceHeight = Math.max(1, Number(image.naturalHeight) || 1);
  const size = Math.max(24, Math.min(sourceWidth, sourceHeight));
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return image;
  }
  const scale = Math.max(size / sourceWidth, size / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const dx = (size - drawWidth) / 2;
  const dy = (size - drawHeight) / 2;
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(image, dx, dy, drawWidth, drawHeight);
  ctx.restore();
  if (key) {
    marbleImageState.roundedImages.set(key, canvas);
  }
  return canvas;
}

function setPayloadGoalMarkerImage(raw) {
  const src = typeof raw === 'string' ? raw.trim() : '';
  if (isSupportedRuntimeImageSrc(src)) {
    window.__v2GoalMarkerImageDataUrl = src;
    return;
  }
  try {
    delete window.__v2GoalMarkerImageDataUrl;
  } catch (_) {
    window.__v2GoalMarkerImageDataUrl = '';
  }
}

function patchRendererMarbleImages() {
  const roulette = getRoulette();
  const renderer = roulette && roulette._renderer && typeof roulette._renderer === 'object'
    ? roulette._renderer
    : null;
  if (!renderer || typeof renderer.getMarbleImage !== 'function') {
    return false;
  }
  if (renderer.__v2MarbleImagePatchRevision === marbleImageState.revision) {
    return true;
  }
  if (typeof renderer.__v2OriginalGetMarbleImage !== 'function') {
    renderer.__v2OriginalGetMarbleImage = renderer.getMarbleImage.bind(renderer);
  }
  renderer.getMarbleImage = (name) => {
    const marbleName = typeof name === 'string' ? name.trim() : '';
    if (marbleName) {
      const image = marbleImageState.images.get(marbleName);
      if (image) {
        if (image.__v2Failed === true) {
          return renderer.__v2OriginalGetMarbleImage(name);
        }
        if (image.complete === true) {
          if (image.naturalWidth > 0) {
            const rounded = buildRoundedMarbleImage(marbleName, image);
            if (rounded) {
              return rounded;
            }
          }
          return renderer.__v2OriginalGetMarbleImage(name);
        }
        return renderer.__v2OriginalGetMarbleImage(name);
      }
    }
    return renderer.__v2OriginalGetMarbleImage(name);
  };
  renderer.__v2MarbleImagePatchRevision = marbleImageState.revision;
  return true;
}

function getPhysics() {
  const roulette = getRoulette();
  return roulette && roulette.physics ? roulette.physics : null;
}

function getBox2D() {
  const physics = getPhysics();
  return physics && physics.Box2D ? physics.Box2D : null;
}

function suppressMarbleCooldownIndicator() {
  const roulette = getRoulette();
  const marbles = roulette && Array.isArray(roulette._marbles) ? roulette._marbles : [];
  const sample = marbles.find((marble) => marble && typeof marble._renderCoolTime === 'function');
  if (!sample) {
    return;
  }
  const proto = Object.getPrototypeOf(sample);
  if (proto && typeof proto._renderCoolTime === 'function' && proto.__v2HideCoolTimePatched !== true) {
    proto._renderCoolTime = function noopRenderCoolTime() {};
    proto.__v2HideCoolTimePatched = true;
  }
}

function setSkillsEnabled(enabled) {
  const nextEnabled = enabled === true;
  if (window.options && typeof window.options === 'object') {
    window.options.useSkills = nextEnabled;
  }
  const roulette = getRoulette();
  const marbles = roulette && Array.isArray(roulette._marbles) ? roulette._marbles : [];
  if (!nextEnabled) {
    for (let index = 0; index < marbles.length; index += 1) {
      const marble = marbles[index];
      if (marble) {
        marble.skill = 0;
      }
    }
  }
  control.skillDisabled = !nextEnabled;
}

function updateSkillPolicy(nowMs) {
  const roulette = getRoulette();
  if (!roulette) {
    setSkillsEnabled(false);
    return;
  }
  if (control.mapDisableSkills) {
    setSkillsEnabled(false);
    return;
  }
  const running = roulette._isRunning === true && control.paused === false;
  if (!running) {
    setSkillsEnabled(false);
    return;
  }
  const warmupUntil = toFiniteNumber(control.spinStartedAt, 0) + Math.max(0, toFiniteNumber(control.skillWarmupMs, 5000));
  const inWarmup = nowMs < warmupUntil;
  const slowNearGoal = toFiniteNumber(roulette._timeScale, 1) < 0.999
    || toFiniteNumber(roulette._goalDist, Number.POSITIVE_INFINITY) < 5;
  const disableBySlowMotion = control.mapDisableSkillsInSlowMotion !== false && slowNearGoal;
  setSkillsEnabled(!(inWarmup || disableBySlowMotion));
}

function getSortedMarbleIds(physics) {
  const map = physics && physics.marbleMap && typeof physics.marbleMap === 'object'
    ? physics.marbleMap
    : {};
  return Object.keys(map)
    .map((key) => toFiniteNumber(key, NaN))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
}

async function ensureRouletteReady(timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const roulette = getRoulette();
    if (roulette && roulette.isReady === true) {
      return roulette;
    }
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  throw new Error('Roulette runtime did not become ready in time');
}

function patchPhysicsStep() {
  const physics = getPhysics();
  if (!physics || physics.__v2StepPatched === true) {
    return;
  }
  if (typeof physics.step !== 'function') {
    return;
  }
  const originalStep = physics.step.bind(physics);
  physics.__v2OriginalStep = originalStep;
  physics.step = (deltaSeconds) => {
    if (control.paused) {
      return;
    }
    return originalStep(deltaSeconds);
  };
  physics.__v2StepPatched = true;
}

function patchPhysicsCreateEntities() {
  const physics = getPhysics();
  if (!physics || physics.__v2CreateEntitiesPatched === true) {
    return;
  }
  const box2d = physics.Box2D;
  if (!box2d || typeof physics.createEntities !== 'function') {
    return;
  }
  const resolveBodyType = (type) => {
    if (type === 'dynamic') {
      return box2d.b2_dynamicBody;
    }
    if (type === 'kinematic') {
      return box2d.b2_kinematicBody;
    }
    return box2d.b2_staticBody;
  };
  const originalCreateEntities = physics.createEntities.bind(physics);
  physics.__v2OriginalCreateEntities = originalCreateEntities;
  physics.createEntities = (entitiesInput) => {
    const entities = Array.isArray(entitiesInput) ? entitiesInput : [];
    if (entities.length === 0) {
      return;
    }
    if (!physics.world || typeof physics.world.CreateBody !== 'function') {
      return originalCreateEntities(entitiesInput);
    }
    for (let index = 0; index < entities.length; index += 1) {
      const rawEntity = entities[index];
      if (!rawEntity || typeof rawEntity !== 'object') {
        continue;
      }
      const shape = rawEntity.shape && typeof rawEntity.shape === 'object'
        ? rawEntity.shape
        : null;
      if (!shape || typeof shape.type !== 'string') {
        continue;
      }
      const props = rawEntity.props && typeof rawEntity.props === 'object'
        ? rawEntity.props
        : {};
      const bodyDef = new box2d.b2BodyDef();
      bodyDef.set_type(resolveBodyType(rawEntity.type));
      const body = physics.world.CreateBody(bodyDef);
      const fixtureDef = new box2d.b2FixtureDef();
      fixtureDef.set_density(Math.max(0.001, toFiniteNumber(props.density, 1)));
      fixtureDef.set_restitution(Math.max(0, toFiniteNumber(props.restitution, 0)));
      if (typeof fixtureDef.set_friction === 'function') {
        fixtureDef.set_friction(Math.max(0, toFiniteNumber(props.friction, 0.2)));
      }
      if (typeof fixtureDef.set_isSensor === 'function') {
        fixtureDef.set_isSensor(props.sensor === true);
      }
      let createdFixture = null;

      if (shape.type === 'box') {
        const polygon = new box2d.b2PolygonShape();
        polygon.SetAsBox(
          Math.max(0.001, toFiniteNumber(shape.width, 0.2)),
          Math.max(0.001, toFiniteNumber(shape.height, 0.2)),
          0,
          toFiniteNumber(shape.rotation, 0),
        );
        fixtureDef.set_shape(polygon);
        createdFixture = body.CreateFixture(fixtureDef);
      } else if (shape.type === 'circle') {
        const circle = new box2d.b2CircleShape();
        circle.set_m_radius(Math.max(0.001, toFiniteNumber(shape.radius, 0.2)));
        fixtureDef.set_shape(circle);
        createdFixture = body.CreateFixture(fixtureDef);
      } else if (shape.type === 'polyline') {
        const points = Array.isArray(shape.points) ? shape.points : [];
        for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex += 1) {
          const pointA = points[pointIndex];
          const pointB = points[pointIndex + 1];
          if (!Array.isArray(pointA) || !Array.isArray(pointB)) {
            continue;
          }
          const edge = new box2d.b2EdgeShape();
          edge.SetTwoSided(
            new box2d.b2Vec2(toFiniteNumber(pointA[0], 0), toFiniteNumber(pointA[1], 0)),
            new box2d.b2Vec2(toFiniteNumber(pointB[0], 0), toFiniteNumber(pointB[1], 0)),
          );
          if (typeof fixtureDef.set_shape === 'function') {
            fixtureDef.set_shape(edge);
            body.CreateFixture(fixtureDef);
          } else {
            body.CreateFixture(edge, Math.max(0.001, toFiniteNumber(props.density, 1)));
          }
        }
      }
      if (props.sensor === true && createdFixture && typeof createdFixture.SetSensor === 'function') {
        try {
          createdFixture.SetSensor(true);
        } catch (_) {
        }
      }

      if (typeof body.SetAngularVelocity === 'function') {
        body.SetAngularVelocity(toFiniteNumber(props.angularVelocity, 0));
      }
      if (typeof body.SetFixedRotation === 'function') {
        body.SetFixedRotation(props.fixedRotation === true);
      }
      if (typeof body.SetGravityScale === 'function' && Number.isFinite(Number(props.gravityScale))) {
        body.SetGravityScale(Math.max(0, toFiniteNumber(props.gravityScale, 1)));
      }
      if (typeof body.SetLinearDamping === 'function' && Number.isFinite(Number(props.linearDamping))) {
        body.SetLinearDamping(Math.max(0, toFiniteNumber(props.linearDamping, 0)));
      }
      if (typeof body.SetAngularDamping === 'function' && Number.isFinite(Number(props.angularDamping))) {
        body.SetAngularDamping(Math.max(0, toFiniteNumber(props.angularDamping, 0)));
      }
      if (typeof body.SetTransform === 'function' && typeof box2d.b2Vec2 === 'function') {
        body.SetTransform(
          new box2d.b2Vec2(
            toFiniteNumber(rawEntity.position && rawEntity.position.x, 0),
            toFiniteNumber(rawEntity.position && rawEntity.position.y, 0),
          ),
          0,
        );
      }
      if (rawEntity.type === 'dynamic') {
        if (typeof body.SetAwake === 'function') {
          body.SetAwake(true);
        }
        if (typeof body.SetEnabled === 'function') {
          body.SetEnabled(true);
        }
      }
      const life = Number.isFinite(Number(props.life))
        ? Math.max(-1, Math.floor(Number(props.life)))
        : -1;
      physics.entities.push({
        body,
        x: toFiniteNumber(rawEntity.position && rawEntity.position.x, 0),
        y: toFiniteNumber(rawEntity.position && rawEntity.position.y, 0),
        angle: 0,
        shape,
        life,
      });
    }
  };
  physics.__v2CreateEntitiesPatched = true;
}

function patchPhysicsGetEntities() {
  const physics = getPhysics();
  if (!physics || physics.__v2GetEntitiesPatched === true) {
    return;
  }
  if (typeof physics.getEntities !== 'function') {
    return;
  }
  const originalGetEntities = physics.getEntities.bind(physics);
  physics.__v2OriginalGetEntities = originalGetEntities;
  physics.getEntities = () => {
    const entries = Array.isArray(physics.entities) ? physics.entities : [];
    return entries.map((entry) => {
      const safeEntry = entry && typeof entry === 'object' ? entry : {};
      const body = safeEntry.body;
      let x = toFiniteNumber(safeEntry.x, 0);
      let y = toFiniteNumber(safeEntry.y, 0);
      let angle = toFiniteNumber(safeEntry.angle, 0);
      if (body && typeof body.GetPosition === 'function') {
        try {
          const position = body.GetPosition();
          x = toFiniteNumber(position && position.x, x);
          y = toFiniteNumber(position && position.y, y);
        } catch (_) {
        }
      }
      if (body && typeof body.GetAngle === 'function') {
        try {
          angle = toFiniteNumber(body.GetAngle(), angle);
        } catch (_) {
        }
      }
      return {
        ...safeEntry,
        x,
        y,
        angle,
      };
    });
  };
  physics.__v2GetEntitiesPatched = true;
}

function buildEntityTypeMapFromCompiled() {
  const compiled = control.compiledMap && typeof control.compiledMap === 'object'
    ? control.compiledMap
    : null;
  const objectIndex = compiled && Array.isArray(compiled.objectIndex)
    ? compiled.objectIndex
    : [];
  const map = new Map();
  for (let index = 0; index < objectIndex.length; index += 1) {
    const entry = objectIndex[index];
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const entityId = Math.floor(toFiniteNumber(entry.entityId, NaN));
    if (!Number.isFinite(entityId)) {
      continue;
    }
    const type = typeof entry.type === 'string' ? entry.type.trim() : '';
    if (!type) {
      continue;
    }
    map.set(entityId, type);
  }
  return map;
}

function setBodyFixturesSensor(body, enabled) {
  if (!body || typeof body.GetFixtureList !== 'function') {
    return;
  }
  try {
    let guard = 0;
    let fixture = body.GetFixtureList();
    while (fixture && guard < 64) {
      if (typeof fixture.SetSensor === 'function') {
        fixture.SetSensor(enabled === true);
      }
      const nextFixture = typeof fixture.GetNext === 'function' ? fixture.GetNext() : null;
      if (nextFixture === fixture) {
        break;
      }
      fixture = nextFixture;
      guard += 1;
    }
  } catch (_) {
  }
}

function enforceCompiledEntityPhysics() {
  const physics = getPhysics();
  const box2d = getBox2D();
  if (!physics || !Array.isArray(physics.entities) || !box2d) {
    return;
  }
  const entityTypeMap = buildEntityTypeMapFromCompiled();
  if (entityTypeMap.size <= 0) {
    return;
  }
  for (let index = 0; index < physics.entities.length; index += 1) {
    const entry = physics.entities[index];
    if (!entry || !entry.body) {
      continue;
    }
    const shape = entry.shape && typeof entry.shape === 'object' ? entry.shape : null;
    const eid = Math.floor(toFiniteNumber(shape && shape.__v2eid, NaN));
    if (!Number.isFinite(eid)) {
      continue;
    }
    const objectType = entityTypeMap.get(eid);
    if (!objectType) {
      continue;
    }
    const body = entry.body;
    if (objectType === 'domino_block' || objectType === 'physics_ball') {
      try {
        if (typeof body.SetType === 'function') {
          body.SetType(box2d.b2_dynamicBody);
        }
        if (typeof body.SetFixedRotation === 'function') {
          body.SetFixedRotation(false);
        }
        if (typeof body.SetGravityScale === 'function') {
          body.SetGravityScale(1);
        }
        if (typeof body.SetEnabled === 'function') {
          body.SetEnabled(true);
        }
        if (typeof body.SetAwake === 'function') {
          body.SetAwake(true);
        }
      } catch (_) {
      }
      continue;
    }
    if (objectType === 'black_hole' || objectType === 'white_hole') {
      setBodyFixturesSensor(body, true);
    }
  }
}

function wireGoalEvent() {
  const roulette = getRoulette();
  if (!roulette || roulette.__v2GoalWired === true) {
    return;
  }
  roulette.addEventListener('goal', (event) => {
    control.goalReceived = true;
    const winner = event && event.detail && typeof event.detail.winner === 'string'
      ? event.detail.winner
      : '';
    postBridge('goal', { winner });
  });
  roulette.__v2GoalWired = true;
}

function setWinningRank(rankOneBased) {
  const roulette = getRoulette();
  const safeOneBased = Math.max(1, Math.floor(toFiniteNumber(rankOneBased, 1)));
  const zeroBased = Math.max(0, safeOneBased - 1);
  control.winningRank = safeOneBased;
  if (window.options && typeof window.options === 'object') {
    window.options.winningRank = zeroBased;
  }
  if (roulette && typeof roulette.setWinningRank === 'function') {
    roulette.setWinningRank(zeroBased);
  }
}

function alignSpawnToStage() {
  const roulette = getRoulette();
  const physics = getPhysics();
  const box2d = getBox2D();
  if (!roulette || !physics || !box2d || typeof box2d.b2Vec2 !== 'function') {
    return;
  }
  const stage = roulette._stage && typeof roulette._stage === 'object'
    ? roulette._stage
    : null;
  const spawn = stage && stage.spawn && typeof stage.spawn === 'object'
    ? stage.spawn
    : null;
  const marbles = Array.isArray(roulette._marbles) ? roulette._marbles : [];
  if (!spawn || marbles.length === 0 || !physics.marbleMap) {
    return;
  }

  const columns = Math.max(1, Math.floor(toFiniteNumber(spawn.columns, 10)));
  const spacingX = Math.max(0.08, toFiniteNumber(spawn.spacingX, 0.6));
  const spawnX = toFiniteNumber(spawn.x, 10.25);
  const spawnY = toFiniteNumber(spawn.y, 0);
  const visibleRows = Math.max(1, Math.floor(toFiniteNumber(spawn.visibleRows, 5)));
  const rows = Math.max(1, Math.ceil(marbles.length / columns));
  const lineDelta = -Math.max(0, Math.ceil(rows - visibleRows));

  const ordered = marbles
    .slice()
    .sort((left, right) => toFiniteNumber(left.id, 0) - toFiniteNumber(right.id, 0));

  for (let index = 0; index < ordered.length; index += 1) {
    const marble = ordered[index];
    if (!marble || typeof marble.id !== 'number') {
      continue;
    }
    const body = physics.marbleMap[marble.id];
    if (!body) {
      continue;
    }
    const col = index % columns;
    const row = Math.floor(index / columns);
    const targetX = spawnX + col * spacingX;
    const targetY = spawnY + row + lineDelta;
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
      marble.x = targetX;
      marble.y = targetY;
      marble.isActive = true;
    } catch (_) {
    }
  }
}

function createBehaviorEnvironment() {
  return {
    getRoulette,
    getBox2D,
    isPaused() {
      return control.paused;
    },
    getRng() {
      return control.rng;
    },
  };
}

function refreshDestroyedEntityIds() {
  const physics = getPhysics();
  if (!physics || !Array.isArray(physics.entities) || control.allEntityIds.length === 0) {
    control.destroyedEntityIds = [];
    return;
  }
  const existing = new Set();
  for (let index = 0; index < physics.entities.length; index += 1) {
    const entry = physics.entities[index];
    const eid = toFiniteNumber(
      entry &&
      entry.shape &&
      entry.shape.__v2eid,
      NaN,
    );
    if (Number.isFinite(eid)) {
      existing.add(eid);
    }
  }
  control.destroyedEntityIds = control.allEntityIds.filter((eid) => !existing.has(eid));
}

function startTickLoop() {
  if (control.tickStarted) {
    return;
  }
  control.tickStarted = true;
  const tick = () => {
    const now = Date.now();
    ensureCanvasFillLayout();
    applyAppVisualCompatibility();
    patchRendererMarbleImages();
    suppressMarbleCooldownIndicator();
    updateSkillPolicy(now);
    if (control.behaviorRuntime && typeof control.behaviorRuntime.tick === 'function') {
      control.behaviorRuntime.tick(now);
      refreshDestroyedEntityIds();
    }
    window.requestAnimationFrame(tick);
  };
  window.requestAnimationFrame(tick);
}

async function loadManifest() {
  const response = await fetch(`./maps/manifest.json?nocache=${Date.now()}`, {
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Failed to load manifest: ${response.status}`);
  }
  const json = await response.json();
  const maps = Array.isArray(json && json.maps) ? json.maps : [];
  return maps;
}

async function loadMapJsonById(mapId) {
  let maps = [];
  try {
    maps = await loadManifest();
  } catch (_) {
    maps = [];
  }
  const matched = maps.find(
    (entry) =>
      entry &&
      typeof entry.id === 'string' &&
      entry.id === mapId &&
      (entry.engine === undefined || entry.engine === 'v2'),
  );
  const fileFromManifest = matched && typeof matched.file === 'string'
    ? matched.file.trim()
    : '';
  const safeMapId = typeof mapId === 'string'
    ? mapId.trim().replace(/[^a-zA-Z0-9_.-]/g, '')
    : '';
  const fallbackFile = safeMapId ? `${safeMapId}.json` : '';
  const fileCandidates = [];
  if (fileFromManifest) {
    fileCandidates.push(fileFromManifest);
  }
  if (fallbackFile && !fileCandidates.includes(fallbackFile)) {
    fileCandidates.push(fallbackFile);
  }
  if (fileCandidates.length === 0) {
    return { ok: false, reason: 'Map not found for snapshot mapId' };
  }
  let lastStatus = 0;
  for (let index = 0; index < fileCandidates.length; index += 1) {
    const fileName = fileCandidates[index];
    const response = await fetch(`./maps/${fileName}?nocache=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!response.ok) {
      lastStatus = response.status;
      continue;
    }
    const mapJson = await response.json();
    return { ok: true, mapJson };
  }
  return {
    ok: false,
    reason: lastStatus > 0
      ? `Map file load failed: ${lastStatus}`
      : 'Map file is missing in manifest entry',
  };
}

function buildDefaultMapIfNeeded(mapId) {
  return {
    schemaVersion: 1,
    id: mapId || 'v2_dynamic_map',
    title: mapId || 'V2 Dynamic Map',
    stage: {
      goalY: 210,
      zoomY: 200,
      disableSkills: false,
      disableSkillsInSlowMotion: true,
      skillWarmupMs: 5000,
      spawn: { x: 10.25, y: 0, columns: 10, spacingX: 0.6, visibleRows: 5 },
    },
    objects: [],
  };
}

async function applyMapJson(rawMapJson) {
  const roulette = await ensureRouletteReady();
  patchPhysicsStep();
  patchPhysicsCreateEntities();
  patchPhysicsGetEntities();
  wireGoalEvent();

  const mapJson = rawMapJson && typeof rawMapJson === 'object'
    ? deepClone(rawMapJson)
    : buildDefaultMapIfNeeded('v2_dynamic_map');
  const compiled = compileMap(mapJson);
  const stage = deepClone(compiled.stage);

  control.paused = true;
  control.goalReceived = false;
  control.spinStartedAt = 0;
  setSkillsEnabled(false);
  control.mapId = compiled.mapId;
  control.mapJson = mapJson;
  control.compiledMap = compiled;
  control.mapDisableSkills = compiled && compiled.stage && compiled.stage.disableSkills === true;
  control.mapDisableSkillsInSlowMotion = !(compiled && compiled.stage && compiled.stage.disableSkillsInSlowMotion === false);
  control.skillWarmupMs = Math.max(0, toFiniteNumber(compiled && compiled.stage && compiled.stage.skillWarmupMs, 5000));
  control.allEntityIds = compiled.objectIndex
    .map((entry) => toFiniteNumber(entry.entityId, NaN))
    .filter((value) => Number.isFinite(value));
  control.destroyedEntityIds = [];

  roulette._stage = stage;
  roulette.reset();
  patchPhysicsStep();
  patchPhysicsCreateEntities();
  patchPhysicsGetEntities();
  enforceCompiledEntityPhysics();
  setWinningRank(control.winningRank);

  control.behaviorRuntime = createBehaviorRuntime(createBehaviorEnvironment(), compiled.behaviorDefs);
  startTickLoop();

  if (control.candidates.length > 0) {
    roulette.setMarbles(control.candidates.slice());
    suppressMarbleCooldownIndicator();
    alignSpawnToStage();
  }
  patchRendererMarbleImages();
  setStatus(`map loaded: ${control.mapId}`);
  return { ok: true, mapId: control.mapId };
}

async function applyMapJsonLive(rawMapJson, options = {}) {
  const roulette = await ensureRouletteReady();
  patchPhysicsStep();
  patchPhysicsCreateEntities();
  patchPhysicsGetEntities();
  wireGoalEvent();

  const mapJson = rawMapJson && typeof rawMapJson === 'object'
    ? deepClone(rawMapJson)
    : buildDefaultMapIfNeeded(control.mapId || 'v2_dynamic_map');
  const compiled = compileMap(mapJson);
  const stage = deepClone(compiled.stage);

  const physics = getPhysics();
  if (!physics || typeof physics.clearEntities !== 'function' || typeof physics.createStage !== 'function') {
    return applyMapJson(mapJson);
  }

  const pausedBefore = control.paused;
  const runningBefore = roulette._isRunning === true && pausedBefore === false;
  const preserveRunning = options && options.preserveRunning === true;

  control.goalReceived = false;
  if (!preserveRunning || !runningBefore) {
    control.spinStartedAt = 0;
    setSkillsEnabled(false);
  }
  control.mapId = compiled.mapId;
  control.mapJson = mapJson;
  control.compiledMap = compiled;
  control.mapDisableSkills = compiled && compiled.stage && compiled.stage.disableSkills === true;
  control.mapDisableSkillsInSlowMotion = !(compiled && compiled.stage && compiled.stage.disableSkillsInSlowMotion === false);
  control.skillWarmupMs = Math.max(0, toFiniteNumber(compiled && compiled.stage && compiled.stage.skillWarmupMs, 5000));
  control.allEntityIds = compiled.objectIndex
    .map((entry) => toFiniteNumber(entry.entityId, NaN))
    .filter((value) => Number.isFinite(value));
  control.destroyedEntityIds = [];

  roulette._stage = stage;

  physics.clearEntities();
  physics.createStage(stage);
  enforceCompiledEntityPhysics();

  control.behaviorRuntime = createBehaviorRuntime(createBehaviorEnvironment(), compiled.behaviorDefs);
  startTickLoop();

  const preserveMarbles = !(options && options.preserveMarbles === false);
  if (!preserveMarbles) {
    roulette.clearMarbles();
  }
  if ((!Array.isArray(roulette._marbles) || roulette._marbles.length === 0) && control.candidates.length > 0) {
    roulette.setMarbles(control.candidates.slice());
    suppressMarbleCooldownIndicator();
    alignSpawnToStage();
  } else if (!preserveMarbles) {
    alignSpawnToStage();
  }
  patchRendererMarbleImages();

  setWinningRank(control.winningRank);
  if (preserveRunning && runningBefore) {
    control.paused = false;
    roulette._isRunning = true;
    const marbles = Array.isArray(roulette._marbles) ? roulette._marbles : [];
    for (let index = 0; index < marbles.length; index += 1) {
      const marble = marbles[index];
      if (marble) {
        marble.isActive = true;
      }
    }
  } else {
    control.paused = pausedBefore;
    if (control.paused) {
      roulette._isRunning = false;
      setSkillsEnabled(false);
    }
  }

  setStatus(`map live applied: ${control.mapId}`);
  return { ok: true, mapId: control.mapId, live: true };
}

async function loadMapById(mapId) {
  const safeMapId = typeof mapId === 'string' && mapId.trim() ? mapId.trim() : '';
  if (!safeMapId) {
    return { ok: false, reason: 'mapId is required' };
  }
  const loaded = await loadMapJsonById(safeMapId);
  if (!loaded.ok) {
    return loaded;
  }
  return applyMapJson(loaded.mapJson);
}

async function setCandidates(rawCandidates) {
  const roulette = await ensureRouletteReady();
  const candidates = normalizeCandidates(rawCandidates);
  control.candidates = candidates;
  if (candidates.length === 0) {
    roulette.clearMarbles();
    setStatus('candidates cleared');
    return { ok: true, count: 0 };
  }
  roulette.setMarbles(candidates.slice());
  suppressMarbleCooldownIndicator();
  alignSpawnToStage();
  patchRendererMarbleImages();
  setWinningRank(control.winningRank);
  setStatus(`candidates set: ${candidates.length}`);
  return { ok: true, count: candidates.length };
}

function disableEntityBody(entry) {
  const box2d = getBox2D();
  if (!entry || !entry.body || !box2d || typeof box2d.b2Vec2 !== 'function') {
    return;
  }
  const body = entry.body;
  try {
    if (typeof body.SetEnabled === 'function') {
      body.SetEnabled(false);
    }
    if (typeof body.SetAwake === 'function') {
      body.SetAwake(false);
    }
    if (typeof body.SetLinearVelocity === 'function') {
      body.SetLinearVelocity(new box2d.b2Vec2(0, 0));
    }
    if (typeof body.SetAngularVelocity === 'function') {
      body.SetAngularVelocity(0);
    }
    if (typeof body.SetTransform === 'function') {
      const angle = typeof body.GetAngle === 'function' ? body.GetAngle() : 0;
      body.SetTransform(new box2d.b2Vec2(-9999, -9999), angle);
    }
  } catch (_) {
  }
  entry.x = -9999;
  entry.y = -9999;
}

function captureEngineState() {
  const roulette = getRoulette();
  if (!roulette) {
    return null;
  }
  const marbles = Array.isArray(roulette._marbles) ? roulette._marbles : [];
  const winners = Array.isArray(roulette._winners) ? roulette._winners : [];
  return {
    isRunning: roulette._isRunning === true,
    speed: toFiniteNumber(roulette._speed, 1),
    elapsed: toFiniteNumber(roulette._elapsed, 0),
    timeScale: toFiniteNumber(roulette._timeScale, 1),
    goalDist: toFiniteNumber(roulette._goalDist, Number.POSITIVE_INFINITY),
    winnerRank: toFiniteNumber(roulette._winnerRank, 0),
    totalMarbleCount: toFiniteNumber(roulette._totalMarbleCount, marbles.length),
    marbleMeta: marbles.map((marble) => captureMarbleMeta(marble)).filter((meta) => !!meta),
    winnerIds: winners
      .map((marble) => toFiniteNumber(marble && marble.id, NaN))
      .filter((value) => Number.isFinite(value)),
    winnerId: roulette._winner ? toFiniteNumber(roulette._winner.id, NaN) : null,
  };
}

function capturePhysicsState() {
  const physics = getPhysics();
  if (!physics) {
    return null;
  }
  const marbleBodies = [];
  const ids = getSortedMarbleIds(physics);
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    const body = physics.marbleMap[id];
    const state = captureBodyState(body);
    if (!state) {
      continue;
    }
    marbleBodies.push({
      id,
      ...state,
    });
  }

  const entityBodies = [];
  const entries = Array.isArray(physics.entities) ? physics.entities : [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const eid = toFiniteNumber(
      entry &&
      entry.shape &&
      entry.shape.__v2eid,
      NaN,
    );
    if (!Number.isFinite(eid)) {
      continue;
    }
    const state = captureBodyState(entry.body);
    if (!state) {
      continue;
    }
    entityBodies.push({
      eid,
      life: toFiniteNumber(entry.life, -1),
      ...state,
    });
  }

  refreshDestroyedEntityIds();
  return {
    marbleBodies,
    entityBodies,
    destroyedEntityIds: control.destroyedEntityIds.slice(),
  };
}

function applyEngineState(engineState) {
  const roulette = getRoulette();
  if (!roulette || !engineState || typeof engineState !== 'object') {
    return;
  }
  roulette._speed = toFiniteNumber(engineState.speed, roulette._speed);
  roulette._elapsed = toFiniteNumber(engineState.elapsed, roulette._elapsed);
  roulette._timeScale = toFiniteNumber(engineState.timeScale, roulette._timeScale);
  roulette._goalDist = toFiniteNumber(engineState.goalDist, roulette._goalDist);
  roulette._winnerRank = toFiniteNumber(engineState.winnerRank, roulette._winnerRank);
  roulette._totalMarbleCount = toFiniteNumber(engineState.totalMarbleCount, roulette._totalMarbleCount);

  const marbles = Array.isArray(roulette._marbles) ? roulette._marbles : [];
  const marbleById = new Map();
  for (let index = 0; index < marbles.length; index += 1) {
    const marble = marbles[index];
    const id = toFiniteNumber(marble && marble.id, NaN);
    if (Number.isFinite(id)) {
      marbleById.set(id, marble);
    }
  }
  const marbleMeta = Array.isArray(engineState.marbleMeta) ? engineState.marbleMeta : [];
  for (let index = 0; index < marbleMeta.length; index += 1) {
    const meta = marbleMeta[index];
    const marble = marbleById.get(toFiniteNumber(meta && meta.id, NaN));
    if (!marble) {
      continue;
    }
    applyMarbleMeta(marble, meta);
  }
  const winnerIds = Array.isArray(engineState.winnerIds) ? engineState.winnerIds : [];
  const winners = [];
  for (let index = 0; index < winnerIds.length; index += 1) {
    const winner = marbleById.get(toFiniteNumber(winnerIds[index], NaN));
    if (winner) {
      winners.push(winner);
    }
  }
  roulette._winners = winners;
  const winnerId = toFiniteNumber(engineState.winnerId, NaN);
  roulette._winner = Number.isFinite(winnerId) ? (marbleById.get(winnerId) || null) : null;
  roulette._isRunning = false;
}

function applyPhysicsState(physicsState) {
  const physics = getPhysics();
  const roulette = getRoulette();
  const box2d = getBox2D();
  if (!physics || !roulette || !box2d || !physicsState || typeof physicsState !== 'object') {
    return;
  }
  const marbleBodyState = Array.isArray(physicsState.marbleBodies) ? physicsState.marbleBodies : [];
  for (let index = 0; index < marbleBodyState.length; index += 1) {
    const state = marbleBodyState[index];
    const id = toFiniteNumber(state && state.id, NaN);
    if (!Number.isFinite(id)) {
      continue;
    }
    const body = physics.marbleMap ? physics.marbleMap[id] : null;
    if (!body) {
      continue;
    }
    applyBodyState(body, state, box2d);
  }

  const entityById = new Map();
  const entries = Array.isArray(physics.entities) ? physics.entities : [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const eid = toFiniteNumber(entry && entry.shape && entry.shape.__v2eid, NaN);
    if (Number.isFinite(eid)) {
      entityById.set(eid, entry);
    }
  }
  const entityBodyState = Array.isArray(physicsState.entityBodies) ? physicsState.entityBodies : [];
  for (let index = 0; index < entityBodyState.length; index += 1) {
    const state = entityBodyState[index];
    const eid = toFiniteNumber(state && state.eid, NaN);
    if (!Number.isFinite(eid)) {
      continue;
    }
    const entry = entityById.get(eid);
    if (!entry || !entry.body) {
      continue;
    }
    applyBodyState(entry.body, state, box2d);
    entry.x = toFiniteNumber(state.x, entry.x);
    entry.y = toFiniteNumber(state.y, entry.y);
    entry.life = toFiniteNumber(state.life, entry.life);
  }

  const destroyed = Array.isArray(physicsState.destroyedEntityIds)
    ? physicsState.destroyedEntityIds
        .map((eid) => toFiniteNumber(eid, NaN))
        .filter((eid) => Number.isFinite(eid))
    : [];
  for (let index = 0; index < destroyed.length; index += 1) {
    const entry = entityById.get(destroyed[index]);
    if (!entry) {
      continue;
    }
    disableEntityBody(entry);
  }
  control.destroyedEntityIds = destroyed.slice();
}

function buildSnapshotEnvelope() {
  const engineState = captureEngineState();
  const physicsState = capturePhysicsState();
  const behaviorState = control.behaviorRuntime && typeof control.behaviorRuntime.serializeState === 'function'
    ? control.behaviorRuntime.serializeState()
    : {};
  const snapshot = {
    version: SNAPSHOT_VERSION,
    runtimeRevision: RUNTIME_REVISION,
    createdAt: Date.now(),
    mapId: control.mapId,
    mapJson: control.mapJson ? deepClone(control.mapJson) : null,
    candidates: control.candidates.slice(),
    winningRank: control.winningRank,
    engineState,
    physicsState,
    behaviorState,
    rngState: {
      seed: control.rngSeed,
      state: control.rng.getState(),
    },
  };
  snapshot.stateHash = stableHash(snapshot);
  return snapshot;
}

function listSnapshots() {
  const order = new Map(SUPPORTED_SLOT_IDS.map((slotId, index) => [slotId, index]));
  return control.snapshotStore
    .list()
    .map(({ slotId, snapshot }) => {
      const label = buildSnapshotLabel(snapshot);
      return {
        slotId,
        label,
        createdAt: toFiniteNumber(snapshot && snapshot.createdAt, 0),
        mapId: snapshot && typeof snapshot.mapId === 'string' ? snapshot.mapId : '',
        marbleCount: Array.isArray(snapshot && snapshot.physicsState && snapshot.physicsState.marbleBodies)
          ? snapshot.physicsState.marbleBodies.length
          : 0,
      };
    })
    .sort((left, right) => (order.get(left.slotId) ?? 99) - (order.get(right.slotId) ?? 99));
}

async function saveSnapshot(slotId = 'quick') {
  try {
    await ensureRouletteReady();
    patchPhysicsStep();
    patchPhysicsCreateEntities();
    patchPhysicsGetEntities();
    const normalizedSlot = normalizeSlotId(slotId);
    if (!normalizedSlot) {
      return { ok: false, reason: `Unsupported slot: ${slotId}` };
    }
    if (!control.mapId) {
      return { ok: false, reason: 'No map loaded' };
    }
    const roulette = getRoulette();
    if (!roulette) {
      return { ok: false, reason: 'Roulette is not ready' };
    }
    if (roulette._winner || control.goalReceived) {
      return { ok: false, reason: 'Cannot save after goal resolution' };
    }

    const pausedBefore = control.paused;
    control.paused = true;
    const snapshot = buildSnapshotEnvelope();
    control.snapshotStore.set(normalizedSlot, snapshot);
    control.lastSnapshotHash = snapshot.stateHash;
    control.paused = pausedBefore;

    const meta = {
      slotId: normalizedSlot,
      label: buildSnapshotLabel(snapshot),
      createdAt: snapshot.createdAt,
      mapId: snapshot.mapId,
      marbleCount: Array.isArray(snapshot.physicsState && snapshot.physicsState.marbleBodies)
        ? snapshot.physicsState.marbleBodies.length
        : 0,
      stateHash: snapshot.stateHash,
    };
    setStatus(`snapshot saved: ${normalizedSlot}`);
    return { ok: true, meta };
  } catch (error) {
    return {
      ok: false,
      reason: String(error && error.message ? error.message : error),
    };
  }
}

async function restoreSnapshot(snapshot, opts = {}) {
  const roulette = await ensureRouletteReady();
  patchPhysicsStep();
  patchPhysicsCreateEntities();
  patchPhysicsGetEntities();
  wireGoalEvent();

  control.paused = true;
  control.goalReceived = false;

  const reloadedMap = await loadMapById(snapshot.mapId);
  if (!reloadedMap.ok) {
    if (snapshot.mapJson && typeof snapshot.mapJson === 'object') {
      const applyResult = await applyMapJson(snapshot.mapJson);
      if (!applyResult || applyResult.ok !== true) {
        throw new Error('Map restore from embedded mapJson failed');
      }
    } else {
      throw new Error(reloadedMap.reason || 'Map load failed during restore');
    }
  }
  await setCandidates(snapshot.candidates);
  setWinningRank(snapshot.winningRank);

  if (snapshot.rngState && typeof snapshot.rngState === 'object') {
    control.rngSeed = toFiniteNumber(snapshot.rngState.seed, control.rngSeed);
    control.rng.setState(toFiniteNumber(snapshot.rngState.state, control.rng.getState()));
  }
  if (control.behaviorRuntime && typeof control.behaviorRuntime.restoreState === 'function') {
    control.behaviorRuntime.restoreState(snapshot.behaviorState);
  }
  applyPhysicsState(snapshot.physicsState);
  applyEngineState(snapshot.engineState);
  roulette._isRunning = false;
  control.paused = true;
  control.spinStartedAt = 0;
  setSkillsEnabled(false);
  if (opts.autoResume === true) {
    control.paused = false;
    control.spinStartedAt = Date.now();
    roulette.start();
  }
}

async function loadSnapshot(slotId = 'quick', opts = {}) {
  const normalizedSlot = normalizeSlotId(slotId);
  if (!normalizedSlot) {
    return { ok: false, reason: `Unsupported slot: ${slotId}` };
  }
  const snapshot = control.snapshotStore.get(normalizedSlot);
  if (!snapshot) {
    return { ok: false, reason: 'No snapshot in slot' };
  }
  if (snapshot.version !== SNAPSHOT_VERSION) {
    return { ok: false, reason: 'Snapshot version is not supported' };
  }
  if (snapshot.runtimeRevision !== RUNTIME_REVISION) {
    return { ok: false, reason: 'Snapshot incompatible with runtime revision' };
  }

  try {
    await restoreSnapshot(snapshot, opts);
  } catch (error) {
    try {
      await reset();
    } catch (_) {
    }
    return {
      ok: false,
      reason: `Restore failed: ${String(error && error.message ? error.message : error)}`,
    };
  }

  setStatus(`snapshot restored (${normalizedSlot})`);
  return { ok: true };
}

function deleteSnapshot(slotId) {
  const normalizedSlot = normalizeSlotId(slotId);
  if (!normalizedSlot) {
    return { ok: false, reason: `Unsupported slot: ${slotId}` };
  }
  control.snapshotStore.delete(normalizedSlot);
  setStatus(`snapshot deleted: ${normalizedSlot}`);
  return { ok: true };
}

async function start() {
  const roulette = await ensureRouletteReady();
  patchPhysicsStep();
  patchPhysicsCreateEntities();
  patchPhysicsGetEntities();
  if (!Array.isArray(roulette._marbles) || roulette._marbles.length === 0) {
    return { ok: false, reason: 'No marbles to start' };
  }
  setWinningRank(control.winningRank);
  control.goalReceived = false;
  control.paused = false;
  control.spinStartedAt = Date.now();
  setSkillsEnabled(false);
  roulette._isRunning = false;
  roulette.start();
  postBridge('spinStarted', {
    mapId: control.mapId,
    count: roulette._marbles.length,
  });
  setStatus('running');
  return { ok: true };
}

async function pause() {
  await ensureRouletteReady();
  control.paused = true;
  control.spinStartedAt = 0;
  setSkillsEnabled(false);
  const roulette = getRoulette();
  if (roulette) {
    roulette._isRunning = false;
  }
  setStatus('paused');
  return { ok: true };
}

async function reset() {
  const roulette = await ensureRouletteReady();
  control.paused = true;
  control.goalReceived = false;
  control.spinStartedAt = 0;
  setSkillsEnabled(false);
  if (control.compiledMap && control.compiledMap.sourceMap) {
    await applyMapJson(control.compiledMap.sourceMap);
  } else {
    roulette.reset();
    patchPhysicsStep();
    patchPhysicsCreateEntities();
    patchPhysicsGetEntities();
  }
  if (control.candidates.length > 0) {
    roulette.setMarbles(control.candidates.slice());
    alignSpawnToStage();
  }
  patchRendererMarbleImages();
  setWinningRank(control.winningRank);
  setStatus('reset complete');
  return { ok: true };
}

async function setSpeed(multiplier) {
  const roulette = await ensureRouletteReady();
  const safeSpeed = Math.max(0.1, toFiniteNumber(multiplier, 1));
  roulette.setSpeed(safeSpeed);
  return { ok: true, speed: safeSpeed };
}

function getState() {
  const roulette = getRoulette();
  const marbles = roulette && Array.isArray(roulette._marbles) ? roulette._marbles : [];
  const running = roulette ? roulette._isRunning === true : false;
  const slowMotionActive = running && (
    toFiniteNumber(roulette && roulette._timeScale, 1) < 0.999
    || toFiniteNumber(roulette && roulette._goalDist, Number.POSITIVE_INFINITY) < 5
  );
  return {
    runtimeRevision: RUNTIME_REVISION,
    mapId: control.mapId,
    paused: control.paused,
    running,
    slowMotionActive,
    candidateCount: control.candidates.length,
    marbleCount: marbles.length,
    winningRank: control.winningRank,
    skillPolicy: {
      disableAll: control.mapDisableSkills,
      disableInSlowMotion: control.mapDisableSkillsInSlowMotion,
      warmupMs: control.skillWarmupMs,
      skillDisabled: control.skillDisabled,
    },
    statusText: control.statusText,
    snapshotCount: listSnapshots().length,
    lastSnapshotHash: control.lastSnapshotHash,
  };
}

function getCurrentMapJson() {
  return control.mapJson ? deepClone(control.mapJson) : null;
}

async function init(payload = {}) {
  await ensureRouletteReady();
  ensureCanvasFillLayout();
  control.fromApp = detectFromAppContext(payload);
  applyAppVisualCompatibility();
  patchPhysicsStep();
  patchPhysicsCreateEntities();
  patchPhysicsGetEntities();
  wireGoalEvent();
  startTickLoop();

  const mapIdFromQuery = new URLSearchParams(window.location.search).get('mapId') || '';
  const payloadMapId = typeof payload.mapId === 'string' ? payload.mapId.trim() : '';
  const selectedMapId = payloadMapId || mapIdFromQuery || control.mapId || 'v2_default';

  const payloadCandidates = normalizeCandidates(payload.candidates);
  if (payloadCandidates.length > 0) {
    control.candidates = payloadCandidates;
  }
  if (Number.isFinite(Number(payload.winningRank))) {
    setWinningRank(Math.max(1, Math.floor(Number(payload.winningRank))));
  } else {
    setWinningRank(control.winningRank);
  }
  if (Number.isFinite(Number(payload.seed))) {
    control.rngSeed = toFiniteNumber(payload.seed, control.rngSeed);
    control.rng.setSeed(control.rngSeed);
  }
  setPayloadMarbleImages(payload.imageDataUrls);
  setPayloadGoalMarkerImage(payload.goalLineImageDataUrl);

  const mapResult = await loadMapById(selectedMapId);
  if (!mapResult.ok) {
    setStatus(mapResult.reason || 'map load failed');
    return mapResult;
  }
  if (control.candidates.length > 0) {
    await setCandidates(control.candidates);
  }
  if (payload.autoStart === true) {
    await start();
  } else {
    await pause();
    setSkillsEnabled(false);
  }

  postBridge('ready', {
    mapId: control.mapId,
    candidates: control.candidates.length,
    runtimeRevision: RUNTIME_REVISION,
  });
  applyAppVisualCompatibility();
  setStatus(`ready: ${control.mapId}`);
  return { ok: true, mapId: control.mapId };
}

const api = {
  init,
  loadMapById,
  applyMapJson,
  applyMapJsonLive,
  getCurrentMapJson,
  setCandidates,
  setWinningRank(rankOneBased) {
    setWinningRank(rankOneBased);
    return { ok: true, winningRank: control.winningRank };
  },
  start,
  pause,
  reset,
  setSpeed,
  getState,
  saveSnapshot,
  loadSnapshot,
  listSnapshots,
  deleteSnapshot,
};

window.__appPinballV2 = api;
installContextMenuGuard();
setStatus('v2 runtime booting...');
void init().catch((error) => {
  const message = String(error && error.message ? error.message : error);
  setStatus(`init failed: ${message}`);
});
