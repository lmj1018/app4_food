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

const RUNTIME_REVISION = 'v2-runtime-r20260301-01';
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
};

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

function getPhysics() {
  const roulette = getRoulette();
  return roulette && roulette.physics ? roulette.physics : null;
}

function getBox2D() {
  const physics = getPhysics();
  return physics && physics.Box2D ? physics.Box2D : null;
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
    if (control.behaviorRuntime && typeof control.behaviorRuntime.tick === 'function') {
      control.behaviorRuntime.tick(Date.now());
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
  const maps = await loadManifest();
  const matched = maps.find(
    (entry) =>
      entry &&
      typeof entry.id === 'string' &&
      entry.id === mapId &&
      (entry.engine === undefined || entry.engine === 'v2'),
  );
  if (!matched) {
    return { ok: false, reason: 'Map not found for snapshot mapId' };
  }
  if (typeof matched.file !== 'string' || !matched.file.trim()) {
    return { ok: false, reason: 'Map file is missing in manifest entry' };
  }
  const response = await fetch(`./maps/${matched.file}?nocache=${Date.now()}`, {
    cache: 'no-store',
  });
  if (!response.ok) {
    return { ok: false, reason: `Map file load failed: ${response.status}` };
  }
  const mapJson = await response.json();
  return { ok: true, mapJson };
}

function buildDefaultMapIfNeeded(mapId) {
  return {
    schemaVersion: 1,
    id: mapId || 'v2_dynamic_map',
    title: mapId || 'V2 Dynamic Map',
    stage: {
      goalY: 210,
      zoomY: 200,
      spawn: { x: 10.25, y: 0, columns: 10, spacingX: 0.6, visibleRows: 5 },
    },
    objects: [],
  };
}

async function applyMapJson(rawMapJson) {
  const roulette = await ensureRouletteReady();
  patchPhysicsStep();
  wireGoalEvent();

  const mapJson = rawMapJson && typeof rawMapJson === 'object'
    ? deepClone(rawMapJson)
    : buildDefaultMapIfNeeded('v2_dynamic_map');
  const compiled = compileMap(mapJson);
  const stage = deepClone(compiled.stage);

  control.paused = true;
  control.goalReceived = false;
  control.mapId = compiled.mapId;
  control.mapJson = mapJson;
  control.compiledMap = compiled;
  control.allEntityIds = compiled.objectIndex
    .map((entry) => toFiniteNumber(entry.entityId, NaN))
    .filter((value) => Number.isFinite(value));
  control.destroyedEntityIds = [];

  roulette._stage = stage;
  roulette.reset();
  patchPhysicsStep();
  setWinningRank(control.winningRank);

  control.behaviorRuntime = createBehaviorRuntime(createBehaviorEnvironment(), compiled.behaviorDefs);
  startTickLoop();

  if (control.candidates.length > 0) {
    roulette.setMarbles(control.candidates.slice());
    alignSpawnToStage();
  }
  setStatus(`map loaded: ${control.mapId}`);
  return { ok: true, mapId: control.mapId };
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
  alignSpawnToStage();
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
  if (opts.autoResume === true) {
    control.paused = false;
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
  if (!Array.isArray(roulette._marbles) || roulette._marbles.length === 0) {
    return { ok: false, reason: 'No marbles to start' };
  }
  setWinningRank(control.winningRank);
  control.goalReceived = false;
  control.paused = false;
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
  if (control.compiledMap && control.compiledMap.sourceMap) {
    await applyMapJson(control.compiledMap.sourceMap);
  } else {
    roulette.reset();
    patchPhysicsStep();
  }
  if (control.candidates.length > 0) {
    roulette.setMarbles(control.candidates.slice());
    alignSpawnToStage();
  }
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
  return {
    runtimeRevision: RUNTIME_REVISION,
    mapId: control.mapId,
    paused: control.paused,
    running: roulette ? roulette._isRunning === true : false,
    candidateCount: control.candidates.length,
    marbleCount: marbles.length,
    winningRank: control.winningRank,
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
  patchPhysicsStep();
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
  }

  postBridge('ready', {
    mapId: control.mapId,
    candidates: control.candidates.length,
    runtimeRevision: RUNTIME_REVISION,
  });
  setStatus(`ready: ${control.mapId}`);
  return { ok: true, mapId: control.mapId };
}

const api = {
  init,
  loadMapById,
  applyMapJson,
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
setStatus('v2 runtime booting...');
void init().catch((error) => {
  const message = String(error && error.message ? error.message : error);
  setStatus(`init failed: ${message}`);
});
