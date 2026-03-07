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

const RUNTIME_REVISION = 'v2-runtime-r20260307-03';
const STATUS_ELEMENT_ID = 'v2Status';
const DEFAULT_MARBLE_RADIUS = 0.25;
const MIN_MARBLE_RADIUS = 0.05;
const MAX_MARBLE_RADIUS = 4;
const SLOW_MOTION_RANGE_Y = 6;
const SLOW_MOTION_ENTER_MARGIN_Y = 7;
const MINIMAP_BASE_WORLD_WIDTH = 26;
const MINIMAP_BASE_SCREEN_SCALE = 4;

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
  marbleRadius: DEFAULT_MARBLE_RADIUS,
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
let initInFlightPromise = null;

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

function normalizeMarbleRadius(rawRadius, fallback = DEFAULT_MARBLE_RADIUS) {
  const fallbackRadius = Math.min(
    MAX_MARBLE_RADIUS,
    Math.max(MIN_MARBLE_RADIUS, toFiniteNumber(fallback, DEFAULT_MARBLE_RADIUS)),
  );
  const numeric = toFiniteNumber(rawRadius, NaN);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallbackRadius;
  }
  return Math.min(MAX_MARBLE_RADIUS, Math.max(MIN_MARBLE_RADIUS, numeric));
}

function resolveConfiguredMarbleRadiusFromMap(mapJson) {
  const safeMap = mapJson && typeof mapJson === 'object' ? mapJson : null;
  const stage = safeMap && safeMap.stage && typeof safeMap.stage === 'object'
    ? safeMap.stage
    : null;
  const fromStage = resolveConfiguredMarbleRadiusFromStage(stage);
  if (Number.isFinite(fromStage) && fromStage > 0) {
    return fromStage;
  }

  const objects = Array.isArray(safeMap && safeMap.objects) ? safeMap.objects : [];
  let firstPhysicsBallRadius = NaN;
  for (let index = 0; index < objects.length; index += 1) {
    const rawObject = objects[index];
    if (!rawObject || typeof rawObject !== 'object') {
      continue;
    }
    const objectType = typeof rawObject.type === 'string' ? rawObject.type.trim() : '';
    if (objectType !== 'physics_ball') {
      continue;
    }
    const radius = toFiniteNumber(rawObject.radius, NaN);
    if (!Number.isFinite(radius) || radius <= 0) {
      continue;
    }
    const normalizedRadius = normalizeMarbleRadius(radius);
    if (!Number.isFinite(firstPhysicsBallRadius)) {
      firstPhysicsBallRadius = normalizedRadius;
    }
    const oid = typeof rawObject.oid === 'string' ? rawObject.oid.trim().toLowerCase() : '';
    if (oid === 'ball_1' || oid === 'player_ball' || oid.startsWith('ball_')) {
      return normalizedRadius;
    }
  }
  if (Number.isFinite(firstPhysicsBallRadius)) {
    return firstPhysicsBallRadius;
  }
  return DEFAULT_MARBLE_RADIUS;
}

function resolveConfiguredMarbleRadiusFromStage(stageInput) {
  const stage = stageInput && typeof stageInput === 'object' ? stageInput : null;
  if (!stage) {
    return NaN;
  }
  const spawn = stage.spawn && typeof stage.spawn === 'object'
    ? stage.spawn
    : null;

  const scaleCandidates = [
    stage.marbleSizeScale,
    spawn && spawn.marbleSizeScale,
  ];
  for (let index = 0; index < scaleCandidates.length; index += 1) {
    const scale = toFiniteNumber(scaleCandidates[index], NaN);
    if (Number.isFinite(scale) && scale > 0) {
      return normalizeMarbleRadius(DEFAULT_MARBLE_RADIUS * scale);
    }
  }

  const directRadiusCandidates = [
    stage.marbleRadius,
    stage.ballRadius,
    spawn && spawn.marbleRadius,
    spawn && spawn.ballRadius,
  ];
  for (let index = 0; index < directRadiusCandidates.length; index += 1) {
    const value = toFiniteNumber(directRadiusCandidates[index], NaN);
    if (Number.isFinite(value) && value > 0) {
      return normalizeMarbleRadius(value);
    }
  }

  const diameterCandidates = [
    stage.ballSize,
    spawn && spawn.ballSize,
  ];
  for (let index = 0; index < diameterCandidates.length; index += 1) {
    const diameter = toFiniteNumber(diameterCandidates[index], NaN);
    if (Number.isFinite(diameter) && diameter > 0) {
      return normalizeMarbleRadius(diameter * 0.5);
    }
  }

  return NaN;
}

function getConfiguredMarbleRadius() {
  const roulette = getRoulette();
  const stage = roulette && roulette._stage && typeof roulette._stage === 'object'
    ? roulette._stage
    : null;
  if (stage) {
    const stageRadius = resolveConfiguredMarbleRadiusFromStage(stage);
    if (Number.isFinite(stageRadius) && stageRadius > 0) {
      return normalizeMarbleRadius(stageRadius);
    }
  }
  return normalizeMarbleRadius(
    resolveConfiguredMarbleRadiusFromMap(control.mapJson),
    DEFAULT_MARBLE_RADIUS,
  );
}

function applyMarbleRenderSize(radius) {
  const roulette = getRoulette();
  if (!roulette || !Array.isArray(roulette._marbles)) {
    return;
  }
  const targetSize = Math.max(0.1, normalizeMarbleRadius(radius) * 2);
  for (let index = 0; index < roulette._marbles.length; index += 1) {
    const marble = roulette._marbles[index];
    if (!marble || typeof marble !== 'object') {
      continue;
    }
    marble.size = targetSize;
  }
}

function applyMarbleBodyRadius(body, radius) {
  if (!body || typeof body.GetFixtureList !== 'function') {
    return;
  }
  const nextRadius = normalizeMarbleRadius(radius);
  let touchedFixture = false;
  try {
    let guard = 0;
    let fixture = body.GetFixtureList();
    while (fixture && guard < 64) {
      const shape = typeof fixture.GetShape === 'function'
        ? fixture.GetShape()
        : null;
      if (shape && typeof shape.set_m_radius === 'function') {
        shape.set_m_radius(nextRadius);
        touchedFixture = true;
      } else if (shape && typeof shape.SetRadius === 'function') {
        shape.SetRadius(nextRadius);
        touchedFixture = true;
      }
      const nextFixture = typeof fixture.GetNext === 'function'
        ? fixture.GetNext()
        : null;
      if (!nextFixture || nextFixture === fixture) {
        break;
      }
      fixture = nextFixture;
      guard += 1;
    }
  } catch (_) {
  }
  if (touchedFixture && typeof body.ResetMassData === 'function') {
    try {
      body.ResetMassData();
    } catch (_) {
    }
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

function clearRuntimeVisualEffects() {
  const roulette = getRoulette();
  if (!roulette) {
    return;
  }
  if (Array.isArray(roulette._effects)) {
    roulette._effects = [];
  }
  const particleManager = roulette._particleManager;
  if (particleManager && Array.isArray(particleManager._particles)) {
    particleManager._particles = [];
  }
}

function isMiniMapUiObject(value) {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return typeof value.onViewportChange === 'function'
    && typeof value.drawViewport === 'function'
    && typeof value.drawEntities === 'function'
    && typeof value.drawMarbles === 'function';
}

function cacheMiniMapUiObject() {
  const roulette = getRoulette();
  if (!roulette || !Array.isArray(roulette._uiObjects)) {
    return null;
  }
  if (isMiniMapUiObject(roulette.__v2MiniMapUiObject)) {
    return roulette.__v2MiniMapUiObject;
  }
  const found = roulette._uiObjects.find((item) => isMiniMapUiObject(item)) || null;
  if (found) {
    roulette.__v2MiniMapUiObject = found;
  }
  return found;
}

function computeMiniMapEntityBoundsX(entity) {
  if (!entity || typeof entity !== 'object') {
    return null;
  }
  const shape = entity.shape && typeof entity.shape === 'object'
    ? entity.shape
    : null;
  if (!shape || typeof shape.type !== 'string') {
    return null;
  }
  const x = toFiniteNumber(entity.x, 0);
  const angle = toFiniteNumber(entity.angle, 0);
  if (shape.type === 'circle') {
    const radius = Math.max(0.001, toFiniteNumber(shape.radius, 0.2));
    return { minX: x - radius, maxX: x + radius };
  }
  if (shape.type === 'box') {
    const halfWidth = Math.max(0.001, toFiniteNumber(shape.width, 0.2));
    const halfHeight = Math.max(0.001, toFiniteNumber(shape.height, 0.2));
    const totalAngle = angle + toFiniteNumber(shape.rotation, 0);
    const absCos = Math.abs(Math.cos(totalAngle));
    const absSin = Math.abs(Math.sin(totalAngle));
    const extentX = absCos * halfWidth + absSin * halfHeight;
    return { minX: x - extentX, maxX: x + extentX };
  }
  if (shape.type === 'polyline') {
    const points = Array.isArray(shape.points) ? shape.points : [];
    if (points.length <= 0) {
      return null;
    }
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      if (!Array.isArray(point)) {
        continue;
      }
      const px = toFiniteNumber(point[0], 0);
      const py = toFiniteNumber(point[1], 0);
      const worldX = x + (px * cosA) - (py * sinA);
      if (worldX < minX) {
        minX = worldX;
      }
      if (worldX > maxX) {
        maxX = worldX;
      }
    }
    if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
      return null;
    }
    return { minX, maxX };
  }
  return null;
}

function resolveMiniMapWorldBounds(params) {
  const entities = Array.isArray(params && params.entities) ? params.entities : [];
  let minX = 0;
  let maxX = MINIMAP_BASE_WORLD_WIDTH;
  for (let index = 0; index < entities.length; index += 1) {
    const bounds = computeMiniMapEntityBoundsX(entities[index]);
    if (!bounds) {
      continue;
    }
    if (bounds.minX < minX) {
      minX = bounds.minX;
    }
    if (bounds.maxX > maxX) {
      maxX = bounds.maxX;
    }
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
  }
  if (!Number.isFinite(maxX)) {
    maxX = MINIMAP_BASE_WORLD_WIDTH;
  }
  const width = Math.max(1, maxX - minX);
  const scaleX = MINIMAP_BASE_WORLD_WIDTH / width;
  return { minX, maxX, width, scaleX };
}

function patchMiniMapUiObject() {
  const miniMap = cacheMiniMapUiObject();
  if (!miniMap) {
    return false;
  }
  if (miniMap.__v2AutoFitPatched === true) {
    return true;
  }
  const originalDrawEntities = typeof miniMap.drawEntities === 'function'
    ? miniMap.drawEntities.bind(miniMap)
    : null;
  const originalDrawMarbles = typeof miniMap.drawMarbles === 'function'
    ? miniMap.drawMarbles.bind(miniMap)
    : null;
  const originalDrawViewport = typeof miniMap.drawViewport === 'function'
    ? miniMap.drawViewport.bind(miniMap)
    : null;
  if (!originalDrawEntities || !originalDrawMarbles || !originalDrawViewport) {
    return false;
  }
  miniMap.__v2MiniMapWorldBounds = {
    minX: 0,
    maxX: MINIMAP_BASE_WORLD_WIDTH,
    width: MINIMAP_BASE_WORLD_WIDTH,
    scaleX: 1,
  };
  miniMap.render = function patchedMiniMapRender(ctx, params) {
    if (!ctx || !params || !params.stage) {
      return;
    }
    const stage = params.stage;
    const goalY = Math.max(1, toFiniteNumber(stage.goalY, 1));
    this.boundingBox.h = MINIMAP_BASE_SCREEN_SCALE * goalY;
    this.lastParams = params;
    this.ctx = ctx;
    const bounds = resolveMiniMapWorldBounds(params);
    this.__v2MiniMapWorldBounds = bounds;

    ctx.save();
    ctx.fillStyle = params.theme && params.theme.minimapBackground
      ? params.theme.minimapBackground
      : '#fefefe';
    ctx.translate(this.boundingBox.x, this.boundingBox.y);
    ctx.scale(MINIMAP_BASE_SCREEN_SCALE, MINIMAP_BASE_SCREEN_SCALE);
    ctx.beginPath();
    ctx.rect(0, 0, MINIMAP_BASE_WORLD_WIDTH, goalY);
    ctx.clip();
    ctx.fillRect(0, 0, MINIMAP_BASE_WORLD_WIDTH, goalY);
    ctx.save();
    ctx.scale(bounds.scaleX, 1);
    ctx.translate(-bounds.minX, 0);
    this.ctx.lineWidth = 3 / (toFiniteNumber(params.camera && params.camera.zoom, 0) + 30);
    originalDrawEntities(params.entities, params.theme);
    originalDrawMarbles(params);
    originalDrawViewport(params);
    ctx.restore();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'green';
    ctx.lineWidth = 1;
    ctx.strokeRect(this.boundingBox.x, this.boundingBox.y, this.boundingBox.w, this.boundingBox.h);
    ctx.restore();
  };
  miniMap.onMouseMove = function patchedMiniMapMouseMove(localPoint) {
    if (!localPoint) {
      this.mousePosition = null;
      if (typeof this._onViewportChangeHandler === 'function') {
        this._onViewportChangeHandler();
      }
      return;
    }
    if (!this.lastParams) {
      return;
    }
    this.mousePosition = {
      x: toFiniteNumber(localPoint.x, 0),
      y: toFiniteNumber(localPoint.y, 0),
    };
    const bounds = this.__v2MiniMapWorldBounds && typeof this.__v2MiniMapWorldBounds === 'object'
      ? this.__v2MiniMapWorldBounds
      : { minX: 0, scaleX: 1 };
    const scaleX = Math.max(0.0001, toFiniteNumber(bounds.scaleX, 1));
    const worldX = toFiniteNumber(bounds.minX, 0)
      + (this.mousePosition.x / MINIMAP_BASE_SCREEN_SCALE) / scaleX;
    const worldY = this.mousePosition.y / MINIMAP_BASE_SCREEN_SCALE;
    if (typeof this._onViewportChangeHandler === 'function') {
      this._onViewportChangeHandler({ x: worldX, y: worldY });
    }
  };
  miniMap.__v2AutoFitPatched = true;
  return true;
}

function setMiniMapUiVisibility(visible = true) {
  const roulette = getRoulette();
  if (!roulette) {
    return { ok: false, reason: 'roulette unavailable' };
  }
  if (!Array.isArray(roulette._uiObjects)) {
    roulette._uiObjects = [];
  }
  const uiObjects = roulette._uiObjects;
  const shouldShow = visible !== false;
  const existingIndex = uiObjects.findIndex((item) => isMiniMapUiObject(item));

  if (shouldShow) {
    if (existingIndex >= 0) {
      patchMiniMapUiObject();
      return { ok: true, visible: true };
    }
    const cachedMiniMap = cacheMiniMapUiObject();
    if (!cachedMiniMap) {
      return { ok: false, reason: 'mini map ui unavailable' };
    }
    patchMiniMapUiObject();
    uiObjects.push(cachedMiniMap);
    return { ok: true, visible: true };
  }

  if (existingIndex >= 0) {
    const removed = uiObjects.splice(existingIndex, 1)[0];
    if (removed) {
      roulette.__v2MiniMapUiObject = removed;
    }
  }
  return { ok: true, visible: false };
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

function setPayloadMagicWizardImage(raw) {
  const src = typeof raw === 'string' ? raw.trim() : '';
  if (isSupportedRuntimeImageSrc(src)) {
    window.__v2MagicWizardImageDataUrl = src;
    return;
  }
  try {
    delete window.__v2MagicWizardImageDataUrl;
  } catch (_) {
    window.__v2MagicWizardImageDataUrl = '';
  }
}

function setPayloadNinjaImage(raw) {
  const src = typeof raw === 'string' ? raw.trim() : '';
  if (isSupportedRuntimeImageSrc(src)) {
    window.__v2NinjaImageDataUrl = src;
    return;
  }
  try {
    delete window.__v2NinjaImageDataUrl;
  } catch (_) {
    window.__v2NinjaImageDataUrl = '';
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

function patchRendererEntityVisuals() {
  const roulette = getRoulette();
  const renderer = roulette && roulette._renderer && typeof roulette._renderer === 'object'
    ? roulette._renderer
    : null;
  if (!renderer || typeof renderer.renderEntities !== 'function') {
    return false;
  }
  if (renderer.__v2EntityVisualsPatched === true) {
    return true;
  }
  renderer.__v2OriginalRenderEntities = renderer.renderEntities.bind(renderer);
  renderer.renderEntities = (entitiesInput) => {
    const entities = Array.isArray(entitiesInput) ? entitiesInput : [];
    const entityTypeMap = buildEntityTypeMapFromCompiled();
    if (entityTypeMap.size <= 0) {
      return renderer.__v2OriginalRenderEntities(entitiesInput);
    }
    const ctx = renderer.ctx;
    const theme = renderer._theme && typeof renderer._theme === 'object'
      ? renderer._theme
      : null;
    if (!ctx || !theme || !theme.entity) {
      return renderer.__v2OriginalRenderEntities(entitiesInput);
    }
    ctx.save();
    for (let index = 0; index < entities.length; index += 1) {
      const entry = entities[index];
      if (!entry || !entry.shape || typeof entry.shape.type !== 'string') {
        continue;
      }
      const shape = entry.shape;
      const themeEntity = theme.entity[shape.type] && typeof theme.entity[shape.type] === 'object'
        ? theme.entity[shape.type]
        : { fill: 'white', outline: 'white', bloom: 'white', bloomRadius: 0 };
      const transform = ctx.getTransform();
      ctx.translate(toFiniteNumber(entry.x, 0), toFiniteNumber(entry.y, 0));
      ctx.rotate(toFiniteNumber(entry.angle, 0));
      ctx.fillStyle = shape.color ?? themeEntity.fill;
      ctx.strokeStyle = shape.color ?? themeEntity.outline;
      ctx.shadowBlur = toFiniteNumber(themeEntity.bloomRadius, 0);
      ctx.shadowColor = shape.bloomColor ?? shape.color ?? themeEntity.bloom;
      if (shape.type === 'polyline') {
        const points = Array.isArray(shape.points) ? shape.points : [];
        if (points.length > 0) {
          ctx.beginPath();
          ctx.moveTo(toFiniteNumber(points[0] && points[0][0], 0), toFiniteNumber(points[0] && points[0][1], 0));
          for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
            ctx.lineTo(
              toFiniteNumber(points[pointIndex] && points[pointIndex][0], 0),
              toFiniteNumber(points[pointIndex] && points[pointIndex][1], 0),
            );
          }
          ctx.stroke();
        }
      } else if (shape.type === 'box') {
        const width = Math.max(0.001, toFiniteNumber(shape.width, 0.2)) * 2;
        const height = Math.max(0.001, toFiniteNumber(shape.height, 0.2)) * 2;
        ctx.rotate(toFiniteNumber(shape.rotation, 0));
        ctx.fillRect(-width / 2, -height / 2, width, height);
        ctx.strokeRect(-width / 2, -height / 2, width, height);
      } else if (shape.type === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(0.001, toFiniteNumber(shape.radius, 0.2)), 0, Math.PI * 2, false);
        const eid = Math.floor(toFiniteNumber(shape.__v2eid, NaN));
        const objectType = Number.isFinite(eid) ? entityTypeMap.get(eid) : '';
        if (objectType === 'physics_ball') {
          ctx.fill();
        }
        ctx.stroke();
      }
      ctx.setTransform(transform);
    }
    ctx.restore();
  };
  renderer.__v2EntityVisualsPatched = true;
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

function patchRouletteSlowMotionRange() {
  const roulette = getRoulette();
  if (!roulette || typeof roulette._calcTimeScale !== 'function') {
    return false;
  }
  if (roulette.__v2SlowMotionRangePatched === true) {
    return true;
  }
  roulette.__v2OriginalCalcTimeScale = roulette._calcTimeScale.bind(roulette);
  roulette._calcTimeScale = function patchedCalcTimeScale() {
    const stage = this && this._stage && typeof this._stage === 'object'
      ? this._stage
      : null;
    if (!stage) {
      return 1;
    }
    const winnerRank = Math.max(0, Math.floor(toFiniteNumber(this._winnerRank, 0)));
    const winners = Array.isArray(this._winners) ? this._winners : [];
    const marbles = Array.isArray(this._marbles) ? this._marbles : [];
    const targetIndex = winnerRank - winners.length;
    const targetMarble = marbles[targetIndex];
    const hasNeighbor = !!(marbles[targetIndex - 1] || marbles[targetIndex + 1]);

    const zoomY = toFiniteNumber(stage.zoomY, NaN);
    const targetY = toFiniteNumber(targetMarble && targetMarble.y, NaN);
    const goalDist = toFiniteNumber(this._goalDist, Number.POSITIVE_INFINITY);
    const slowRangeY = Math.max(5, toFiniteNumber(stage.slowMotionRangeY, SLOW_MOTION_RANGE_Y));
    const enterMarginY = Math.max(
      slowRangeY,
      toFiniteNumber(stage.slowMotionEnterMarginY, SLOW_MOTION_ENTER_MARGIN_Y),
    );

    if (
      winners.length < winnerRank + 1
      && goalDist < slowRangeY
      && Number.isFinite(targetY)
      && Number.isFinite(zoomY)
      && targetY > zoomY - enterMarginY
      && hasNeighbor
    ) {
      return Math.max(0.2, goalDist / slowRangeY);
    }
    return 1;
  };
  roulette.__v2SlowMotionRangePatched = true;
  return true;
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
      const safeDensity = Math.max(0.001, toFiniteNumber(props.density, 1));
      fixtureDef.set_density(safeDensity);
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
        let colliderThickness = toFiniteNumber(props.colliderThickness, NaN);
        if (!Number.isFinite(colliderThickness)) {
          colliderThickness = toFiniteNumber(shape.colliderThickness, 0);
        }
        const useSegmentBoxes = colliderThickness > 0.0001 && typeof box2d.b2PolygonShape === 'function';
        for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex += 1) {
          const pointA = points[pointIndex];
          const pointB = points[pointIndex + 1];
          if (!Array.isArray(pointA) || !Array.isArray(pointB)) {
            continue;
          }
          const ax = toFiniteNumber(pointA[0], 0);
          const ay = toFiniteNumber(pointA[1], 0);
          const bx = toFiniteNumber(pointB[0], 0);
          const by = toFiniteNumber(pointB[1], 0);
          if (useSegmentBoxes) {
            const dx = bx - ax;
            const dy = by - ay;
            const length = Math.hypot(dx, dy);
            if (!(length > 0.0001)) {
              continue;
            }
            try {
              const segment = new box2d.b2PolygonShape();
              segment.SetAsBox(
                Math.max(0.0005, length / 2),
                Math.max(0.0005, colliderThickness / 2),
                new box2d.b2Vec2((ax + bx) / 2, (ay + by) / 2),
                Math.atan2(dy, dx),
              );
              if (typeof fixtureDef.set_shape === 'function') {
                fixtureDef.set_shape(segment);
                const nextFixture = body.CreateFixture(fixtureDef);
                if (!createdFixture && nextFixture) {
                  createdFixture = nextFixture;
                }
              } else {
                const nextFixture = body.CreateFixture(segment, safeDensity);
                if (!createdFixture && nextFixture) {
                  createdFixture = nextFixture;
                }
              }
              continue;
            } catch (_) {
            }
          }
          const edge = new box2d.b2EdgeShape();
          edge.SetTwoSided(
            new box2d.b2Vec2(ax, ay),
            new box2d.b2Vec2(bx, by),
          );
          if (typeof fixtureDef.set_shape === 'function') {
            fixtureDef.set_shape(edge);
            const nextFixture = body.CreateFixture(fixtureDef);
            if (!createdFixture && nextFixture) {
              createdFixture = nextFixture;
            }
          } else {
            const nextFixture = body.CreateFixture(edge, safeDensity);
            if (!createdFixture && nextFixture) {
              createdFixture = nextFixture;
            }
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
      } else if (
        rawEntity.type === 'kinematic'
        && Math.abs(toFiniteNumber(props.angularVelocity, 0)) > 0.0001
      ) {
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

function postDebug(step, payload = {}) {
  const safeStep = typeof step === 'string' ? step : 'debug';
  const safePayload = payload && typeof payload === 'object' ? payload : {};
  const eventPayload = {
    step: safeStep,
    mapId: control.mapId,
    paused: control.paused,
    statusText: control.statusText,
    runtimeRevision: RUNTIME_REVISION,
    ...safePayload,
  };
  try {
    if (typeof console !== 'undefined' && typeof console.debug === 'function') {
      console.debug('[pinball-v2]', safeStep, eventPayload);
    }
  } catch (_) {
  }
  postBridge('debug', eventPayload);
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

function enforceMarbleBodyPhysics() {
  const targetRadius = getConfiguredMarbleRadius();
  applyMarbleRenderSize(targetRadius);
  const physics = getPhysics();
  if (!physics || !physics.marbleMap || typeof physics.marbleMap !== 'object') {
    return;
  }
  const marbleIds = Object.keys(physics.marbleMap);
  for (let index = 0; index < marbleIds.length; index += 1) {
    const marbleId = marbleIds[index];
    const body = physics.marbleMap[marbleId];
    if (!body) {
      continue;
    }
    try {
      applyMarbleBodyRadius(body, targetRadius);
      if (typeof body.SetBullet === 'function') {
        body.SetBullet(true);
      }
      if (typeof body.SetAwake === 'function') {
        body.SetAwake(true);
      }
      if (typeof body.SetEnabled === 'function') {
        body.SetEnabled(true);
      }
    } catch (_) {
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
    const ranking = Array.isArray(roulette && roulette._winners)
      ? roulette._winners
          .map((item) => item && typeof item.name === 'string' ? item.name.trim() : '')
          .filter((name) => !!name)
      : [];
    if (winner && !ranking.includes(winner)) {
      ranking.unshift(winner);
    }
    postBridge('goal', { winner, ranking });
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

  const marbleRadius = getConfiguredMarbleRadius();
  const columns = Math.max(1, Math.floor(toFiniteNumber(spawn.columns, 10)));
  const spacingX = Math.max(
    0.08,
    toFiniteNumber(spawn.spacingX, 0.6),
    marbleRadius * 2.05,
  );
  const rowSpacing = Math.max(1, marbleRadius * 2.05);
  const spawnX = toFiniteNumber(spawn.x, 10.25);
  const spawnY = toFiniteNumber(spawn.y, 0);
  const visibleRows = Math.max(1, Math.floor(toFiniteNumber(spawn.visibleRows, 5)));
  const rows = Math.max(1, Math.ceil(marbles.length / columns));
  const lineDelta = -Math.max(0, Math.ceil(rows - visibleRows)) * rowSpacing;

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
    const targetY = spawnY + row * rowSpacing + lineDelta;
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

function readStageSpawnSnapshot(stageInput) {
  const stage = stageInput && typeof stageInput === 'object' ? stageInput : null;
  const spawn = stage && stage.spawn && typeof stage.spawn === 'object'
    ? stage.spawn
    : null;
  if (!spawn) {
    return null;
  }
  return {
    x: toFiniteNumber(spawn.x, 10.25),
    y: toFiniteNumber(spawn.y, 0),
    columns: Math.max(1, Math.floor(toFiniteNumber(spawn.columns, 10))),
    spacingX: Math.max(0.08, toFiniteNumber(spawn.spacingX, 0.6)),
    visibleRows: Math.max(1, Math.floor(toFiniteNumber(spawn.visibleRows, 5))),
    marbleRadius: normalizeMarbleRadius(stage && stage.marbleRadius, DEFAULT_MARBLE_RADIUS),
  };
}

function hasStageSpawnChanged(previousStage, nextStage) {
  const previous = readStageSpawnSnapshot(previousStage);
  const next = readStageSpawnSnapshot(nextStage);
  if (!previous && !next) {
    return false;
  }
  if (!previous || !next) {
    return true;
  }
  const samePosition = Math.abs(previous.x - next.x) <= 0.0001
    && Math.abs(previous.y - next.y) <= 0.0001;
  const sameGrid = previous.columns === next.columns
    && Math.abs(previous.spacingX - next.spacingX) <= 0.0001
    && previous.visibleRows === next.visibleRows
    && Math.abs(previous.marbleRadius - next.marbleRadius) <= 0.0001;
  return !(samePosition && sameGrid);
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
      marbleRadius: DEFAULT_MARBLE_RADIUS,
      disableSkills: false,
      disableSkillsInSlowMotion: true,
      skillWarmupMs: 5000,
      spawn: { x: 10.25, y: 0, columns: 10, spacingX: 0.6, visibleRows: 5 },
    },
    objects: [],
  };
}

function alignStageZoomYToGoalY(stage) {
  if (!stage || typeof stage !== 'object') {
    return;
  }
  const goalY = toFiniteNumber(stage.goalY, NaN);
  if (!Number.isFinite(goalY) || goalY <= 0) {
    return;
  }
  // Keep slow-motion trigger location anchored to goal line.
  stage.zoomY = goalY;
}

async function applyMapJson(rawMapJson) {
  const roulette = await ensureRouletteReady();
  patchPhysicsStep();
  patchPhysicsCreateEntities();
  patchPhysicsGetEntities();
  patchRendererEntityVisuals();
  wireGoalEvent();
  patchRouletteSlowMotionRange();
  patchMiniMapUiObject();

  const mapJson = rawMapJson && typeof rawMapJson === 'object'
    ? deepClone(rawMapJson)
    : buildDefaultMapIfNeeded('v2_dynamic_map');
  const compiled = compileMap(mapJson);
  const stage = deepClone(compiled.stage);
  const mapMarbleRadius = resolveConfiguredMarbleRadiusFromMap(mapJson);
  if (stage && typeof stage === 'object') {
    stage.marbleRadius = mapMarbleRadius;
    alignStageZoomYToGoalY(stage);
  }

  control.paused = true;
  control.goalReceived = false;
  control.spinStartedAt = 0;
  setSkillsEnabled(false);
  control.mapId = compiled.mapId;
  control.mapJson = mapJson;
  control.compiledMap = compiled;
  control.marbleRadius = mapMarbleRadius;
  control.mapDisableSkills = compiled && compiled.stage && compiled.stage.disableSkills === true;
  control.mapDisableSkillsInSlowMotion = !(compiled && compiled.stage && compiled.stage.disableSkillsInSlowMotion === false);
  control.skillWarmupMs = Math.max(0, toFiniteNumber(compiled && compiled.stage && compiled.stage.skillWarmupMs, 5000));
  control.allEntityIds = compiled.objectIndex
    .map((entry) => toFiniteNumber(entry.entityId, NaN))
    .filter((value) => Number.isFinite(value));
  control.destroyedEntityIds = [];

  roulette._stage = stage;
  roulette.reset();
  clearRuntimeVisualEffects();
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
    enforceMarbleBodyPhysics();
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
  patchRendererEntityVisuals();
  wireGoalEvent();
  patchRouletteSlowMotionRange();
  patchMiniMapUiObject();

  const mapJson = rawMapJson && typeof rawMapJson === 'object'
    ? deepClone(rawMapJson)
    : buildDefaultMapIfNeeded(control.mapId || 'v2_dynamic_map');
  const compiled = compileMap(mapJson);
  const stage = deepClone(compiled.stage);
  const mapMarbleRadius = resolveConfiguredMarbleRadiusFromMap(mapJson);
  if (stage && typeof stage === 'object') {
    stage.marbleRadius = mapMarbleRadius;
    alignStageZoomYToGoalY(stage);
  }

  const physics = getPhysics();
  if (!physics || typeof physics.clearEntities !== 'function' || typeof physics.createStage !== 'function') {
    return applyMapJson(mapJson);
  }

  const pausedBefore = control.paused;
  const runningBefore = roulette._isRunning === true && pausedBefore === false;
  const preserveRunning = options && options.preserveRunning === true;
  const stageBeforeLive = roulette && roulette._stage && typeof roulette._stage === 'object'
    ? roulette._stage
    : null;

  control.goalReceived = false;
  if (!preserveRunning || !runningBefore) {
    control.spinStartedAt = 0;
    setSkillsEnabled(false);
  }
  control.mapId = compiled.mapId;
  control.mapJson = mapJson;
  control.compiledMap = compiled;
  control.marbleRadius = mapMarbleRadius;
  control.mapDisableSkills = compiled && compiled.stage && compiled.stage.disableSkills === true;
  control.mapDisableSkillsInSlowMotion = !(compiled && compiled.stage && compiled.stage.disableSkillsInSlowMotion === false);
  control.skillWarmupMs = Math.max(0, toFiniteNumber(compiled && compiled.stage && compiled.stage.skillWarmupMs, 5000));
  control.allEntityIds = compiled.objectIndex
    .map((entry) => toFiniteNumber(entry.entityId, NaN))
    .filter((value) => Number.isFinite(value));
  control.destroyedEntityIds = [];

  roulette._stage = stage;

  physics.clearEntities();
  clearRuntimeVisualEffects();
  physics.createStage(stage);
  enforceCompiledEntityPhysics();

  control.behaviorRuntime = createBehaviorRuntime(createBehaviorEnvironment(), compiled.behaviorDefs);
  startTickLoop();

  const preserveMarbles = !(options && options.preserveMarbles === false);
  const spawnChanged = hasStageSpawnChanged(stageBeforeLive, stage);
  const shouldRespawnForSpawnChange = spawnChanged;
  if (!preserveMarbles) {
    roulette.clearMarbles();
  }
  if ((!Array.isArray(roulette._marbles) || roulette._marbles.length === 0) && control.candidates.length > 0) {
    roulette.setMarbles(control.candidates.slice());
    suppressMarbleCooldownIndicator();
    alignSpawnToStage();
  } else if (!preserveMarbles || shouldRespawnForSpawnChange) {
    alignSpawnToStage();
  }
  enforceMarbleBodyPhysics();
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
  enforceMarbleBodyPhysics();
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
  patchRouletteSlowMotionRange();
  patchMiniMapUiObject();
  postDebug('start_begin', {
    candidateCount: Array.isArray(control.candidates) ? control.candidates.length : 0,
    marbleCountBefore: Array.isArray(roulette && roulette._marbles) ? roulette._marbles.length : 0,
  });
  let marbles = Array.isArray(roulette._marbles) ? roulette._marbles : [];
  if (marbles.length === 0 && control.candidates.length > 0) {
    roulette.setMarbles(control.candidates.slice());
    suppressMarbleCooldownIndicator();
    alignSpawnToStage();
    enforceMarbleBodyPhysics();
    patchRendererMarbleImages();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    marbles = Array.isArray(roulette._marbles) ? roulette._marbles : [];
  }
  if (marbles.length === 0) {
    const failed = { ok: false, reason: 'No marbles to start' };
    postDebug('start_failed', failed);
    return failed;
  }
  setWinningRank(control.winningRank);
  control.goalReceived = false;
  control.paused = false;
  control.spinStartedAt = Date.now();
  setSkillsEnabled(false);
  roulette._isRunning = false;
  roulette.start();
  // Some engine paths recreate marble fixtures on spin start; re-apply map radius shortly after.
  enforceMarbleBodyPhysics();
  patchRendererMarbleImages();
  window.setTimeout(() => {
    enforceMarbleBodyPhysics();
    patchRendererMarbleImages();
  }, 80);
  window.setTimeout(() => {
    enforceMarbleBodyPhysics();
    patchRendererMarbleImages();
  }, 220);
  postBridge('spinStarted', {
    mapId: control.mapId,
    count: marbles.length,
  });
  setStatus('running');
  postDebug('start_ok', {
    marbleCount: marbles.length,
    winningRank: control.winningRank,
  });
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
    clearRuntimeVisualEffects();
    patchPhysicsStep();
    patchPhysicsCreateEntities();
    patchPhysicsGetEntities();
  }
  if (control.candidates.length > 0) {
    roulette.setMarbles(control.candidates.slice());
    alignSpawnToStage();
    enforceMarbleBodyPhysics();
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
  const winner = roulette && roulette._winner && typeof roulette._winner.name === 'string'
    ? roulette._winner.name.trim()
    : '';
  const ranking = Array.isArray(roulette && roulette._winners)
    ? roulette._winners
        .map((item) => item && typeof item.name === 'string' ? item.name.trim() : '')
        .filter((name) => !!name)
    : [];
  if (winner && !ranking.includes(winner)) {
    ranking.unshift(winner);
  }
  const slowMotionActive = running && (
    toFiniteNumber(roulette && roulette._timeScale, 1) < 0.999
    || toFiniteNumber(roulette && roulette._goalDist, Number.POSITIVE_INFINITY) < 5
  );
  return {
    runtimeRevision: RUNTIME_REVISION,
    mapId: control.mapId,
    paused: control.paused,
    running,
    miniMapVisible: Array.isArray(roulette && roulette._uiObjects)
      ? roulette._uiObjects.some((item) => isMiniMapUiObject(item))
      : false,
    slowMotionActive,
    winner,
    ranking,
    top3: ranking.slice(0, 3),
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
  if (initInFlightPromise) {
    postDebug('init_wait_existing');
    return initInFlightPromise;
  }
  initInFlightPromise = (async () => {
    const safePayload = payload && typeof payload === 'object' ? payload : {};
    postDebug('init_begin', {
      payloadMapId: typeof safePayload.mapId === 'string' ? safePayload.mapId.trim() : '',
      payloadCandidateCount: Array.isArray(safePayload.candidates) ? safePayload.candidates.length : 0,
      autoStart: safePayload.autoStart === true,
    });
    await ensureRouletteReady();
    ensureCanvasFillLayout();
    cacheMiniMapUiObject();
    patchMiniMapUiObject();
    control.fromApp = detectFromAppContext(safePayload);
    applyAppVisualCompatibility();
    patchPhysicsStep();
    patchPhysicsCreateEntities();
    patchPhysicsGetEntities();
    wireGoalEvent();
    patchRouletteSlowMotionRange();
    startTickLoop();

    const mapIdFromQuery = new URLSearchParams(window.location.search).get('mapId') || '';
    const payloadMapId = typeof safePayload.mapId === 'string' ? safePayload.mapId.trim() : '';
    const selectedMapId = payloadMapId || mapIdFromQuery || control.mapId || 'v2_default';

    const payloadCandidates = normalizeCandidates(safePayload.candidates);
    if (payloadCandidates.length > 0) {
      control.candidates = payloadCandidates;
    }
    if (Number.isFinite(Number(safePayload.winningRank))) {
      setWinningRank(Math.max(1, Math.floor(Number(safePayload.winningRank))));
    } else {
      setWinningRank(control.winningRank);
    }
    if (Number.isFinite(Number(safePayload.seed))) {
      control.rngSeed = toFiniteNumber(safePayload.seed, control.rngSeed);
      control.rng.setSeed(control.rngSeed);
    }
    setPayloadMarbleImages(safePayload.imageDataUrls);
    setPayloadGoalMarkerImage(safePayload.goalLineImageDataUrl);
    setPayloadMagicWizardImage(safePayload.magicWizardImageDataUrl);
    setPayloadNinjaImage(safePayload.ninjaImageDataUrl);

    const mapResult = await loadMapById(selectedMapId);
    if (!mapResult.ok) {
      const failed = { ok: false, reason: mapResult.reason || 'map load failed' };
      setStatus(failed.reason);
      postDebug('init_failed_map', failed);
      return failed;
    }
    if (control.candidates.length > 0) {
      const candidateResult = await setCandidates(control.candidates);
      if (!candidateResult || candidateResult.ok !== true) {
        const reason = candidateResult && candidateResult.reason ? candidateResult.reason : 'set candidates failed';
        const failed = { ok: false, reason };
        setStatus(reason);
        postDebug('init_failed_candidates', failed);
        return failed;
      }
      postDebug('init_candidates_ready', {
        candidateCount: control.candidates.length,
      });
    }
    if (safePayload.autoStart === true) {
      const startResult = await start();
      if (!startResult || startResult.ok !== true) {
        const reason = startResult && startResult.reason ? startResult.reason : 'start failed';
        const failed = { ok: false, reason };
        setStatus(reason);
        postDebug('init_failed_start', failed);
        return failed;
      }
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
    const success = { ok: true, mapId: control.mapId };
    postDebug('init_ok', {
      mapId: control.mapId,
      candidateCount: control.candidates.length,
    });
    return success;
  })();
  try {
    return await initInFlightPromise;
  } finally {
    if (initInFlightPromise) {
      initInFlightPromise = null;
    }
  }
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
  setMiniMapVisible(visible = true) {
    return setMiniMapUiVisibility(visible);
  },
  getState,
  saveSnapshot,
  loadSnapshot,
  listSnapshots,
  deleteSnapshot,
};

window.__appPinballV2 = api;
installContextMenuGuard();
setStatus('v2 runtime booting...');
const bootFromApp = detectFromAppContext();
if (bootFromApp) {
  control.fromApp = true;
  ensureCanvasFillLayout();
  applyAppVisualCompatibility();
  setStatus('waiting init payload from app');
  postDebug('boot_wait_app_init', {
    search: String(window.location.search || ''),
  });
} else {
  void init().catch((error) => {
    const message = String(error && error.message ? error.message : error);
    setStatus(`init failed: ${message}`);
    postDebug('boot_init_failed', { message });
  });
}
