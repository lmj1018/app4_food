const SLOT_IDS = ['slot1', 'slot2', 'slot3'];
const FILE_PROTOCOL = window.location.protocol === 'file:';
const DEFAULT_MARBLE_COUNT = 32;
const DEFAULT_WINNING_RANK = 1;
const WORLD_WIDTH = 81;
const MIN_MARBLE_COUNT = 1;
const MAX_MARBLE_COUNT = 256;
const LIVE_APPLY_DEBOUNCE_MS = 120;
const LIVE_MARBLE_COUNT_DEBOUNCE_MS = 120;
const AUTO_SAVE_DEBOUNCE_MS = 900;
const CANVAS_MIN_ZOOM = 0.18;
const CANVAS_MAX_ZOOM = 14;
const MAX_UNDO_HISTORY = 50;
const ENABLE_COORDINATE_OVERLAY = false;
const GOAL_MARKER_IMAGE_DEFAULT_SRC = '../../background/finish.png';
const GOAL_MARKER_IMAGE_PREVIEW_SRC = '../assets/background/finish.png';
const OBJECT_COLOR_PRESET = {
  wall: '#ff7cc8',
  box: '#ff4fa8',
  diamond: '#6affea',
  peg: '#ff62bf',
  rotor: '#ff66c8',
  portal: '#b68cff',
  blackHole: '#7b55b8',
  whiteHole: '#c8abff',
  hammer: '#ffa557',
  fan: '#7fd9ff',
  burst: '#5dff7a',
  sticky: '#ff8fc9',
  domino: '#ff67be',
  physicsBall: '#ff79cb',
  goalMarker: '#ffc4e7',
};
const DEFAULT_MARBLE_SIZE_SCALE = 1;
const MIN_MARBLE_SIZE_SCALE = 0.4;
const MAX_MARBLE_SIZE_SCALE = 3;
let engineCanvasFillTimer = 0;
let liveApplyTimer = 0;
let liveApplyInFlight = false;
let liveApplyPending = false;
let liveApplyResetRequested = false;
let liveApplyAutoStartRequested = false;
let autoSaveTimer = 0;
let autoSaveInFlight = false;
let autoSavePending = false;
let autoObjectApplyTimer = 0;
let autoStageApplyTimer = 0;
let previewLiveApplyInFlight = false;
let previewCanvasFillTimer = 0;
let marbleCountApplyTimer = 0;
let marbleCountApplyInFlight = false;
let marbleCountApplyPending = false;
const undoHistory = [];
let goalMarkerPreviewImage = null;

let mapCatalog = [];
let workingMapJson = null;
const editorState = {
  selectedIndex: -1,
  pendingWallStart: null,
  pendingWallOid: '',
  pendingWallType: '',
  pendingPortalOid: '',
  pendingHammerOid: '',
  canvasZoom: 1,
  canvasPanX: 0,
  canvasPanY: 0,
  isCanvasPanning: false,
  canvasPanLastX: 0,
  canvasPanLastY: 0,
  canvasHoverWorld: null,
  dragState: null,
  suppressClickOnce: false,
  isMiniMapDragging: false,
};

const elements = {
  mapSelect: document.getElementById('mapSelect'),
  mapNameInput: document.getElementById('mapNameInput'),
  refreshMapListButton: document.getElementById('refreshMapListButton'),
  saveAsNewMapButton: document.getElementById('saveAsNewMapButton'),
  reloadButton: document.getElementById('reloadButton'),
  playPauseToggleButton: document.getElementById('playPauseToggleButton'),
  playPauseIcon: document.getElementById('playPauseIcon'),
  playPauseText: document.getElementById('playPauseText'),
  resetButton: document.getElementById('resetButton'),
  quickSaveButton: document.getElementById('quickSaveButton'),
  quickLoadButton: document.getElementById('quickLoadButton'),
  marbleCountInput: document.getElementById('marbleCountInput'),
  toggleJsonViewButton: document.getElementById('toggleJsonViewButton'),
  currentJsonViewer: document.getElementById('currentJsonViewer'),
  currentJsonText: document.getElementById('currentJsonText'),
  statusBox: document.getElementById('statusBox'),
  engineFrame: document.getElementById('engineFrame'),
  engineUrlText: document.getElementById('engineUrlText'),
  previewFrame: document.getElementById('previewFrame'),
  previewPlayPauseButton: document.getElementById('previewPlayPauseButton'),
  previewResetButton: document.getElementById('previewResetButton'),
  previewStatusText: document.getElementById('previewStatusText'),
  viewZoomInput: document.getElementById('viewZoomInput'),
  marbleSizeInput: document.getElementById('marbleSizeInput'),
  stageZoomInput: document.getElementById('stageZoomInput'),
  stageDisableSkillsInput: document.getElementById('stageDisableSkillsInput'),
  stageResetOnObjectChangeInput: document.getElementById('stageResetOnObjectChangeInput'),
  applyViewZoomButton: document.getElementById('applyViewZoomButton'),
  applyMarbleSizeButton: document.getElementById('applyMarbleSizeButton'),
  fitStageButton: document.getElementById('fitStageButton'),
  applyStageButton: document.getElementById('applyStageButton'),
  makerToolSelect: document.getElementById('makerToolSelect'),
  makerToolButtons: Array.from(document.querySelectorAll('.maker-tool-button')),
  corridorGapInput: document.getElementById('corridorGapInput'),
  miniMapCanvas: document.getElementById('miniMapCanvas'),
  makerCanvas: document.getElementById('makerCanvas'),
  clearObjectsButton: document.getElementById('clearObjectsButton'),
  makerHintText: document.getElementById('makerHintText'),
  objectList: document.getElementById('objectList'),
  objOidInput: document.getElementById('objOidInput'),
  objColorInput: document.getElementById('objColorInput'),
  objXInput: document.getElementById('objXInput'),
  objYInput: document.getElementById('objYInput'),
  objExtra1Label: document.getElementById('objExtra1Label'),
  objExtra1Input: document.getElementById('objExtra1Input'),
  objExtra2Label: document.getElementById('objExtra2Label'),
  objExtra2Input: document.getElementById('objExtra2Input'),
  objRadiusLabel: document.getElementById('objRadiusLabel'),
  objRadiusInput: document.getElementById('objRadiusInput'),
  objRotationInput: document.getElementById('objRotationInput'),
  reverseRotationButton: document.getElementById('reverseRotationButton'),
  objPairInput: document.getElementById('objPairInput'),
  objDirLabel: document.getElementById('objDirLabel'),
  objDirInput: document.getElementById('objDirInput'),
  objForceLabel: document.getElementById('objForceLabel'),
  objForceInput: document.getElementById('objForceInput'),
  objIntervalLabel: document.getElementById('objIntervalLabel'),
  objIntervalInput: document.getElementById('objIntervalInput'),
  objHitDistanceLabel: document.getElementById('objHitDistanceLabel'),
  objHitDistanceInput: document.getElementById('objHitDistanceInput'),
  objRestitutionInput: document.getElementById('objRestitutionInput'),
  objFrictionInput: document.getElementById('objFrictionInput'),
  applyObjectButton: document.getElementById('applyObjectButton'),
  duplicateObjectButton: document.getElementById('duplicateObjectButton'),
  deleteObjectButton: document.getElementById('deleteObjectButton'),
  floatingObjectInspector: document.getElementById('floatingObjectInspector'),
  floatingObjectTitle: document.getElementById('floatingObjectTitle'),
  floatingObjectFields: document.getElementById('floatingObjectFields'),
  floatingReverseButton: document.getElementById('floatingReverseButton'),
  floatingDuplicateButton: document.getElementById('floatingDuplicateButton'),
  floatingDeleteButton: document.getElementById('floatingDeleteButton'),
};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function toFinite(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clamp(value, minValue, maxValue) {
  return Math.min(maxValue, Math.max(minValue, value));
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function normalizeDeg(value) {
  const raw = toFinite(value, 0);
  let deg = raw % 360;
  if (deg < 0) {
    deg += 360;
  }
  return deg;
}

function snapAngleDeg(valueDeg, stepDeg = 45) {
  const step = Math.max(1, toFinite(stepDeg, 45));
  return normalizeDeg(Math.round(toFinite(valueDeg, 0) / step) * step);
}

function snapPointBy45(anchor, point) {
  const ax = toFinite(anchor && anchor.x, 0);
  const ay = toFinite(anchor && anchor.y, 0);
  const px = toFinite(point && point.x, ax);
  const py = toFinite(point && point.y, ay);
  const dx = px - ax;
  const dy = py - ay;
  const length = Math.hypot(dx, dy);
  if (length <= 0.0001) {
    return { x: ax, y: ay };
  }
  const angle = Math.atan2(dy, dx);
  const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  return {
    x: round1(ax + Math.cos(snapped) * length),
    y: round1(ay + Math.sin(snapped) * length),
  };
}

function isTypingTarget(target) {
  if (!target || !(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = String(target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button') {
    return true;
  }
  return false;
}

function getCurrentMarbleCount() {
  const raw = elements.marbleCountInput ? elements.marbleCountInput.value : DEFAULT_MARBLE_COUNT;
  const parsed = Math.floor(toFinite(raw, DEFAULT_MARBLE_COUNT));
  const safe = clamp(parsed, MIN_MARBLE_COUNT, MAX_MARBLE_COUNT);
  if (elements.marbleCountInput) {
    elements.marbleCountInput.value = String(safe);
  }
  return safe;
}

function setMarbleCountInput(count) {
  if (!elements.marbleCountInput) {
    return;
  }
  const safe = clamp(Math.floor(toFinite(count, DEFAULT_MARBLE_COUNT)), MIN_MARBLE_COUNT, MAX_MARBLE_COUNT);
  elements.marbleCountInput.value = String(safe);
}

function getCurrentMarbleSizeScale() {
  const raw = elements.marbleSizeInput ? elements.marbleSizeInput.value : DEFAULT_MARBLE_SIZE_SCALE;
  const parsed = toFinite(raw, DEFAULT_MARBLE_SIZE_SCALE);
  const safe = clamp(parsed, MIN_MARBLE_SIZE_SCALE, MAX_MARBLE_SIZE_SCALE);
  if (elements.marbleSizeInput) {
    elements.marbleSizeInput.value = String(round2(safe));
  }
  return safe;
}

function setMarbleSizeInput(scale) {
  if (!elements.marbleSizeInput) {
    return;
  }
  const safe = clamp(toFinite(scale, DEFAULT_MARBLE_SIZE_SCALE), MIN_MARBLE_SIZE_SCALE, MAX_MARBLE_SIZE_SCALE);
  elements.marbleSizeInput.value = String(round2(safe));
}

function isJsonViewerOpen() {
  return !!(elements.currentJsonViewer && elements.currentJsonViewer.classList.contains('open'));
}

function refreshCurrentJsonViewer(force = false) {
  if (!elements.currentJsonText) {
    return;
  }
  if (!force && !isJsonViewerOpen()) {
    return;
  }
  const mapJson = workingMapJson && typeof workingMapJson === 'object'
    ? workingMapJson
    : buildDefaultMapJson(resolveCurrentMapId());
  elements.currentJsonText.textContent = JSON.stringify(mapJson, null, 2);
}

function setJsonViewerOpen(open) {
  const isOpen = open === true;
  if (elements.currentJsonViewer) {
    elements.currentJsonViewer.classList.toggle('open', isOpen);
  }
  if (elements.toggleJsonViewButton) {
    elements.toggleJsonViewButton.textContent = isOpen ? '현재 작업 JSON 숨기기' : '현재 작업 JSON 보기';
  }
  if (isOpen) {
    refreshCurrentJsonViewer(true);
  }
}

function setStatus(message, kind = 'ok') {
  if (!elements.statusBox) {
    return;
  }
  elements.statusBox.textContent = String(message ?? '');
  if (kind === 'error') {
    elements.statusBox.style.color = '#ff9898';
    return;
  }
  if (kind === 'warn') {
    elements.statusBox.style.color = '#ffcf84';
    return;
  }
  elements.statusBox.style.color = '#7df4bc';
}

function setPlayPauseUi(isRunning) {
  if (!elements.playPauseToggleButton) {
    return;
  }
  const running = isRunning === true;
  elements.playPauseToggleButton.setAttribute('aria-pressed', running ? 'true' : 'false');
  if (elements.playPauseIcon) {
    elements.playPauseIcon.textContent = running ? '⏸' : '▶';
  }
  if (elements.playPauseText) {
    elements.playPauseText.textContent = running ? '일시정지' : '시작';
  }
}

function setPreviewPlayPauseUi(isRunning) {
  if (!elements.previewPlayPauseButton) {
    return;
  }
  const running = isRunning === true;
  elements.previewPlayPauseButton.textContent = running ? '좌표창 일시정지' : '좌표창 시작';
  elements.previewPlayPauseButton.classList.toggle('primary', !running);
}

function setPreviewStatus(text, kind = 'ok') {
  if (!elements.previewStatusText) {
    return;
  }
  elements.previewStatusText.textContent = String(text || '');
  if (kind === 'error') {
    elements.previewStatusText.style.color = '#ff9898';
    return;
  }
  if (kind === 'warn') {
    elements.previewStatusText.style.color = '#ffcf84';
    return;
  }
  elements.previewStatusText.style.color = '#9ec0ff';
}

function readEngineRunning(api) {
  if (!api || typeof api.getState !== 'function') {
    return false;
  }
  const state = api.getState();
  return !!(state && state.running === true);
}

function applyViewZoomRespectRunning() {
  const api = getEngineApi();
  const running = readEngineRunning(api);
  const applied = applyViewZoomToEngine(!running);
  if (running) {
    setCameraLock(false);
  }
  return applied;
}

function bindEvent(element, eventName, handler) {
  if (!element || typeof element.addEventListener !== 'function') {
    return;
  }
  element.addEventListener(eventName, handler);
}

function installContextMenuGuard(targetWindow) {
  if (!targetWindow || targetWindow.__v2MakerContextMenuGuard === true) {
    return;
  }
  const block = (event) => {
    if (!event) {
      return;
    }
    if (typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
  };
  try {
    targetWindow.addEventListener('contextmenu', block, true);
    if (targetWindow.document && typeof targetWindow.document.addEventListener === 'function') {
      targetWindow.document.addEventListener('contextmenu', block, true);
    }
    targetWindow.__v2MakerContextMenuGuard = true;
  } catch (_) {
  }
}

function setBusy(isBusy) {
  const controls = [
    elements.mapSelect,
    elements.mapNameInput,
    elements.refreshMapListButton,
    elements.saveAsNewMapButton,
    elements.reloadButton,
    elements.playPauseToggleButton,
    elements.resetButton,
    elements.quickSaveButton,
    elements.quickLoadButton,
    elements.previewPlayPauseButton,
    elements.previewResetButton,
    elements.marbleCountInput,
    elements.toggleJsonViewButton,
    elements.viewZoomInput,
    elements.marbleSizeInput,
    elements.stageZoomInput,
    elements.stageResetOnObjectChangeInput,
    elements.applyViewZoomButton,
    elements.applyMarbleSizeButton,
    elements.fitStageButton,
    elements.applyStageButton,
    elements.makerToolSelect,
    elements.corridorGapInput,
    elements.clearObjectsButton,
    elements.objectList,
    elements.objOidInput,
    elements.objColorInput,
    elements.objXInput,
    elements.objYInput,
    elements.objExtra1Input,
    elements.objExtra2Input,
    elements.objRadiusInput,
    elements.objRotationInput,
    elements.reverseRotationButton,
    elements.objPairInput,
    elements.objDirInput,
    elements.objForceInput,
    elements.objIntervalInput,
    elements.objHitDistanceInput,
    elements.objRestitutionInput,
    elements.objFrictionInput,
    elements.applyObjectButton,
    elements.duplicateObjectButton,
    elements.deleteObjectButton,
    elements.floatingReverseButton,
    elements.floatingDuplicateButton,
    elements.floatingDeleteButton,
  ];
  if (Array.isArray(elements.makerToolButtons)) {
    controls.push(...elements.makerToolButtons);
  }
  controls.forEach((control) => {
    if (control) {
      control.disabled = isBusy;
    }
  });
}

function buildAutoCandidates(count = getCurrentMarbleCount()) {
  const safeCount = clamp(Math.floor(toFinite(count, DEFAULT_MARBLE_COUNT)), MIN_MARBLE_COUNT, MAX_MARBLE_COUNT);
  const list = [];
  for (let index = 0; index < safeCount; index += 1) {
    list.push(`후보 ${String(index + 1).padStart(2, '0')}`);
  }
  return list;
}

function selectedMapIdFromDropdown() {
  const value = String(elements.mapSelect && elements.mapSelect.value ? elements.mapSelect.value : '').trim();
  return value || '';
}

function sanitizeMapId(value) {
  const raw = String(value || '').trim();
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]/g, '_');
  return cleaned || `v2_map_${Date.now()}`;
}

function resolveCurrentMapId() {
  const selected = selectedMapIdFromDropdown();
  if (selected) {
    return selected;
  }
  if (workingMapJson && typeof workingMapJson.id === 'string' && workingMapJson.id.trim()) {
    return workingMapJson.id.trim();
  }
  return 'v2_default';
}

function readPayload() {
  const marbleCount = getCurrentMarbleCount();
  return {
    mapId: resolveCurrentMapId(),
    winningRank: DEFAULT_WINNING_RANK,
    candidates: buildAutoCandidates(marbleCount),
    autoStart: false,
  };
}

function buildDefaultMapJson(mapId = 'v2_custom_map') {
  return {
    schemaVersion: 1,
    id: mapId,
    title: mapId,
    stage: {
      goalY: 210,
      zoomY: 200,
      leftWallX: 2.5,
      rightWallX: 21,
      disableSkills: false,
      spawn: { x: 10.25, y: 0, columns: 10, spacingX: 0.6, visibleRows: 5 },
    },
    objects: [],
  };
}

function readVerticalWallX(obj) {
  if (!obj || obj.type !== 'wall_polyline') {
    return NaN;
  }
  const points = Array.isArray(obj.points) ? obj.points : [];
  if (points.length < 2) {
    return NaN;
  }
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let sumX = 0;
  let count = 0;
  for (let index = 0; index < points.length; index += 1) {
    const px = toFinite(points[index] && points[index][0], NaN);
    const py = toFinite(points[index] && points[index][1], NaN);
    if (!Number.isFinite(px) || !Number.isFinite(py)) {
      continue;
    }
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px);
    minY = Math.min(minY, py);
    maxY = Math.max(maxY, py);
    sumX += px;
    count += 1;
  }
  if (count < 2) {
    return NaN;
  }
  const xSpan = maxX - minX;
  const ySpan = maxY - minY;
  if (xSpan > 0.45 || ySpan < 12) {
    return NaN;
  }
  return round1(sumX / count);
}

function inferStageWallBounds(mapJson) {
  const source = mapJson && typeof mapJson === 'object' ? mapJson : {};
  const stage = source.stage && typeof source.stage === 'object' ? source.stage : {};
  const objects = Array.isArray(source.objects) ? source.objects : [];
  const leftByOid = objects.find((obj) => obj && obj.type === 'wall_polyline' && String(obj.oid || '') === 'wall-left');
  const rightByOid = objects.find((obj) => obj && obj.type === 'wall_polyline' && String(obj.oid || '') === 'wall-right');
  const leftByOidX = readVerticalWallX(leftByOid);
  const rightByOidX = readVerticalWallX(rightByOid);
  if (Number.isFinite(leftByOidX) && Number.isFinite(rightByOidX) && rightByOidX > leftByOidX + 1.5) {
    return {
      leftX: round1(clamp(leftByOidX, 0.1, WORLD_WIDTH - 2.1)),
      rightX: round1(clamp(rightByOidX, leftByOidX + 2, WORLD_WIDTH - 0.1)),
    };
  }
  const fromStageLeft = toFinite(stage.leftWallX, NaN);
  const fromStageRight = toFinite(stage.rightWallX, NaN);
  if (Number.isFinite(fromStageLeft) && Number.isFinite(fromStageRight) && fromStageRight > fromStageLeft + 1.5) {
    return {
      leftX: round1(clamp(fromStageLeft, 0.1, WORLD_WIDTH - 2.1)),
      rightX: round1(clamp(fromStageRight, fromStageLeft + 2, WORLD_WIDTH - 0.1)),
    };
  }
  return { leftX: 2.5, rightX: 21 };
}

function isBoundaryWallObject(obj) {
  if (!obj || obj.type !== 'wall_polyline') {
    return false;
  }
  const oid = String(obj.oid || '').trim();
  return oid === 'wall-left' || oid === 'wall-right';
}

function normalizeMapJson(rawMapJson, fallbackMapId = 'v2_custom_map') {
  const fallbackId = String(fallbackMapId || '').trim() || 'v2_custom_map';
  const source = rawMapJson && typeof rawMapJson === 'object' && !Array.isArray(rawMapJson)
    ? deepClone(rawMapJson)
    : buildDefaultMapJson(fallbackId);
  if (typeof source.id !== 'string' || !source.id.trim()) {
    source.id = fallbackId;
  } else {
    source.id = source.id.trim();
  }
  source.title = source.id;
  if (!Number.isFinite(Number(source.schemaVersion))) {
    source.schemaVersion = 1;
  } else {
    source.schemaVersion = Math.max(1, Math.floor(Number(source.schemaVersion)));
  }
  if (!source.stage || typeof source.stage !== 'object' || Array.isArray(source.stage)) {
    source.stage = {};
  }
  source.stage.goalY = Math.max(20, toFinite(source.stage.goalY, 210));
  source.stage.zoomY = Math.max(10, toFinite(source.stage.zoomY, source.stage.goalY - 4));
  const spawn = source.stage.spawn && typeof source.stage.spawn === 'object' && !Array.isArray(source.stage.spawn)
    ? source.stage.spawn
    : {};
  source.stage.spawn = {
    x: toFinite(spawn.x, 10.25),
    y: toFinite(spawn.y, 0),
    columns: Math.max(1, Math.floor(toFinite(spawn.columns, 10))),
    spacingX: Math.max(0.08, toFinite(spawn.spacingX, 0.6)),
    visibleRows: Math.max(1, Math.floor(toFinite(spawn.visibleRows, 5))),
  };
  if (!Array.isArray(source.objects)) {
    source.objects = [];
  }
  source.objects = source.objects
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => {
      const obj = item;
      const type = String(obj.type || '');
      if (type === 'domino_block') {
        obj.bodyType = 'dynamic';
        obj.density = Math.max(0.01, toFinite(obj.density, 1.35));
      } else if (type === 'physics_ball') {
        obj.bodyType = 'dynamic';
        obj.density = Math.max(0.01, toFinite(obj.density, 1.8));
      } else if (type === 'burst_bumper') {
        obj.layers = Math.max(1, Math.floor(toFinite(obj.layers, 3)));
        obj.hpPerLayer = Math.max(1, Math.floor(toFinite(obj.hpPerLayer, 1)));
        obj.damagePerHit = Math.max(1, Math.floor(toFinite(obj.damagePerHit, 1)));
        obj.force = Math.max(0.1, toFinite(obj.force, 6.2));
        obj.triggerRadius = Math.max(0.2, toFinite(obj.triggerRadius, Math.max(0.08, toFinite(obj.radius, 0.72)) + 0.45));
        if (typeof obj.color !== 'string' || !obj.color.trim()) {
          obj.color = OBJECT_COLOR_PRESET.burst;
        }
      } else if (type === 'black_hole') {
        obj.radius = Math.max(0.18, toFinite(obj.radius, 0.72));
        obj.triggerRadius = Math.max(obj.radius + 0.2, toFinite(obj.triggerRadius, 2.1));
        obj.suctionForce = Math.max(0.35, toFinite(obj.suctionForce, toFinite(obj.force, 0.55)));
        obj.launchImpulse = Math.max(0.1, toFinite(obj.launchImpulse, 2.9));
        obj.cooldownMs = Math.max(80, Math.floor(toFinite(obj.cooldownMs, 900)));
        if (typeof obj.color !== 'string' || !obj.color.trim()) {
          obj.color = OBJECT_COLOR_PRESET.blackHole;
        }
      } else if (type === 'white_hole') {
        obj.radius = Math.max(0.16, toFinite(obj.radius, 0.62));
        obj.launchImpulse = Math.max(0.1, toFinite(obj.launchImpulse, 2.9));
        obj.cooldownMs = Math.max(80, Math.floor(toFinite(obj.cooldownMs, 900)));
        if (typeof obj.color !== 'string' || !obj.color.trim()) {
          obj.color = OBJECT_COLOR_PRESET.whiteHole;
        }
      } else if (type === 'goal_marker_image') {
        const src = String(obj.imageSrc || '').trim();
        obj.imageSrc = !src || src.includes('goal_line_tab1.svg')
          ? GOAL_MARKER_IMAGE_DEFAULT_SRC
          : src;
        obj.opacity = round2(clamp(toFinite(obj.opacity, 0.86), 0.05, 1));
      }
      if (supportsImpactTuning(obj)) {
        obj.restitution = round2(clamp(
          toFinite(obj.restitution, defaultRestitutionForType(type)),
          0,
          8,
        ));
        obj.friction = round2(clamp(
          toFinite(obj.friction, defaultFrictionForType(type)),
          0,
          8,
        ));
      }
      return obj;
    });
  const bounds = inferStageWallBounds(source);
  const safeLeft = round1(clamp(toFinite(source.stage.leftWallX, bounds.leftX), 0.1, WORLD_WIDTH - 2.1));
  const safeRight = round1(clamp(toFinite(source.stage.rightWallX, bounds.rightX), safeLeft + 2, WORLD_WIDTH - 0.1));
  source.stage.leftWallX = safeLeft;
  source.stage.rightWallX = safeRight;
  source.stage.disableSkills = source.stage.disableSkills === true;
  return source;
}

function setWorkingMapJson(rawMapJson, fallbackMapId = '') {
  const fallbackId = fallbackMapId || resolveCurrentMapId();
  const normalized = normalizeMapJson(rawMapJson, fallbackId);
  workingMapJson = deepClone(normalized);
  resetPendingWall();
  resetPendingPortal();
  resetPendingHammer();
  resetActiveDrag();
  applyStageWallBoundsToMap();
  refreshCurrentJsonViewer();
  return deepClone(normalized);
}

function getWorkingMapJson(fallbackMapId = '') {
  if (workingMapJson && typeof workingMapJson === 'object') {
    return deepClone(workingMapJson);
  }
  const fallbackId = fallbackMapId || resolveCurrentMapId();
  return setWorkingMapJson(buildDefaultMapJson(fallbackId), fallbackId);
}

function getMutableMap() {
  if (!workingMapJson || typeof workingMapJson !== 'object') {
    const fallbackId = resolveCurrentMapId();
    setWorkingMapJson(buildDefaultMapJson(fallbackId), fallbackId);
  }
  return workingMapJson;
}

function getObjects() {
  const mapJson = getMutableMap();
  if (!Array.isArray(mapJson.objects)) {
    mapJson.objects = [];
  }
  return mapJson.objects;
}

function buildUndoSnapshot() {
  const mapJson = getWorkingMapJson(resolveCurrentMapId());
  const selectedIndex = Math.floor(toFinite(editorState.selectedIndex, -1));
  const payload = {
    mapJson,
    selectedIndex,
  };
  return {
    ...payload,
    key: JSON.stringify(payload),
  };
}

function rememberUndoState(reason = '') {
  const snapshot = buildUndoSnapshot();
  const last = undoHistory.length > 0 ? undoHistory[undoHistory.length - 1] : null;
  if (last && last.key === snapshot.key) {
    return;
  }
  undoHistory.push(snapshot);
  if (undoHistory.length > MAX_UNDO_HISTORY) {
    undoHistory.shift();
  }
}

function clearUndoHistory() {
  undoHistory.length = 0;
}

function undoLastChange() {
  if (undoHistory.length <= 0) {
    setStatus('되돌릴 작업이 없습니다.', 'warn');
    return false;
  }
  const snapshot = undoHistory.pop();
  if (!snapshot || !snapshot.mapJson) {
    return false;
  }
  const restored = setWorkingMapJson(snapshot.mapJson, snapshot.mapJson.id || resolveCurrentMapId());
  syncStageInputsFromMap();
  const objectCount = Array.isArray(restored.objects) ? restored.objects.length : 0;
  if (objectCount <= 0) {
    editorState.selectedIndex = -1;
  } else {
    const rawIndex = Math.floor(toFinite(snapshot.selectedIndex, objectCount - 1));
    editorState.selectedIndex = clamp(rawIndex, 0, objectCount - 1);
  }
  syncObjectList();
  drawMakerCanvas();
  queueObjectLiveDraftApply('Ctrl+Z');
  setStatus(`되돌리기 완료 (${undoHistory.length}/${MAX_UNDO_HISTORY})`);
  return true;
}

function syncStageInputsFromMap() {
  const mapJson = getMutableMap();
  if (elements.stageZoomInput) {
    elements.stageZoomInput.value = String(round1(toFinite(mapJson.stage.zoomY, 206)));
  }
  if (elements.stageDisableSkillsInput) {
    elements.stageDisableSkillsInput.checked = mapJson.stage && mapJson.stage.disableSkills === true;
  }
}

function upsertStageBoundaryWall(oid, x) {
  const mapJson = getMutableMap();
  const objects = getObjects();
  const matchingIndexes = [];
  for (let index = 0; index < objects.length; index += 1) {
    const obj = objects[index];
    if (obj && obj.type === 'wall_polyline' && String(obj.oid || '') === oid) {
      matchingIndexes.push(index);
    }
  }
  for (let index = matchingIndexes.length - 1; index >= 1; index -= 1) {
    objects.splice(matchingIndexes[index], 1);
  }
  let wall = matchingIndexes.length > 0 ? objects[matchingIndexes[0]] : null;
  if (!wall) {
    wall = {
      oid,
      type: 'wall_polyline',
      points: [],
      color: '#ff7cc8',
    };
    objects.push(wall);
  }
  const topY = 2;
  const bottomY = round1(Math.max(30, toFinite(mapJson.stage && mapJson.stage.goalY, 210) + 2));
  wall.points = [
    [round1(x), topY],
    [round1(x), bottomY],
  ];
  wall.color = '#ff7cc8';
}

function applyStageWallBoundsToMap() {
  const mapJson = getMutableMap();
  const inferred = inferStageWallBounds(mapJson);
  let leftX = round1(toFinite(mapJson.stage.leftWallX, inferred.leftX));
  let rightX = round1(toFinite(mapJson.stage.rightWallX, inferred.rightX));
  leftX = round1(clamp(leftX, 0.1, WORLD_WIDTH - 2.1));
  rightX = round1(clamp(rightX, leftX + 2, WORLD_WIDTH - 0.1));
  mapJson.stage.leftWallX = leftX;
  mapJson.stage.rightWallX = rightX;
  upsertStageBoundaryWall('wall-left', leftX);
  upsertStageBoundaryWall('wall-right', rightX);
}

function syncStageWallBoundsFromObjects() {
  const mapJson = getMutableMap();
  const bounds = inferStageWallBounds(mapJson);
  mapJson.stage.leftWallX = round1(clamp(bounds.leftX, 0.1, WORLD_WIDTH - 2.1));
  mapJson.stage.rightWallX = round1(clamp(bounds.rightX, mapJson.stage.leftWallX + 2, WORLD_WIDTH - 0.1));
}

function updateMakerHint(text) {
  if (!elements.makerHintText) {
    return;
  }
  elements.makerHintText.textContent = text;
}

function selectedMapCatalogEntry() {
  const mapId = selectedMapIdFromDropdown();
  if (!mapId) {
    return null;
  }
  return mapCatalog.find((entry) => entry && entry.id === mapId) || null;
}

function renderMapCatalog(preferredMapId = '') {
  if (!elements.mapSelect) {
    return;
  }
  const options = mapCatalog
    .map((entry) => `<option value="${entry.id}">${entry.id}</option>`)
    .join('');
  elements.mapSelect.innerHTML = `<option value="">맵 선택...</option>${options}`;
  const picked = preferredMapId && mapCatalog.some((entry) => entry.id === preferredMapId)
    ? preferredMapId
    : '';
  if (picked) {
    elements.mapSelect.value = picked;
  } else {
    elements.mapSelect.value = '';
  }
  if (elements.mapNameInput) {
    elements.mapNameInput.value = elements.mapSelect.value || 'v2_custom_map';
  }
}

async function callMapMakerApi(path, options = {}) {
  const response = await fetch(`/__pinball_v2_api/${path}`, options);
  let payload = null;
  try {
    payload = await response.json();
  } catch (_) {
  }
  if (!response.ok || !payload || payload.ok !== true) {
    if (response.status === 404) {
      throw new Error('맵 메이커 전용 서버가 아닙니다. tools/start_pinball_map_maker_v2.bat 로 실행하세요');
    }
    const reason = payload && payload.reason ? payload.reason : `API 오류: ${response.status}`;
    throw new Error(String(reason));
  }
  return payload;
}

function normalizeManifestData(raw) {
  const safe = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw
    : {};
  const maps = Array.isArray(safe.maps)
    ? safe.maps.filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    : [];
  return {
    version: Number.isFinite(Number(safe.version)) ? Number(safe.version) : 1,
    maps,
  };
}

async function fetchManifestFromServer() {
  const payload = await callMapMakerApi(`maps?nocache=${Date.now()}`);
  return normalizeManifestData({
    version: 1,
    maps: Array.isArray(payload.maps) ? payload.maps : [],
  });
}

async function refreshMapCatalog(preferredMapId = null) {
  const manifest = await fetchManifestFromServer();
  mapCatalog = manifest.maps
    .filter((entry) => {
      if (!entry || typeof entry !== 'object') {
        return false;
      }
      if (entry.enabled === false) {
        return false;
      }
      if (entry.engine && entry.engine !== 'v2') {
        return false;
      }
      if (typeof entry.id !== 'string' || !entry.id.trim()) {
        return false;
      }
      if (typeof entry.file !== 'string' || !entry.file.trim()) {
        return false;
      }
      return true;
    })
    .sort((left, right) => {
      const leftSort = Number.isFinite(Number(left.sort)) ? Number(left.sort) : 9999;
      const rightSort = Number.isFinite(Number(right.sort)) ? Number(right.sort) : 9999;
      return leftSort - rightSort;
    })
    .map((entry) => ({
      id: String(entry.id).trim(),
      file: String(entry.file).trim(),
      sort: Number.isFinite(Number(entry.sort)) ? Number(entry.sort) : 9999,
    }));
  const nextPreferredMapId = typeof preferredMapId === 'string'
    ? preferredMapId
    : resolveCurrentMapId();
  renderMapCatalog(nextPreferredMapId);
  if (mapCatalog.length > 0) {
    setStatus(`맵 목록 갱신 완료: ${mapCatalog.length}개`);
  } else {
    setStatus('맵 목록이 비어 있습니다', 'warn');
  }
}

function getFrameWindow() {
  return elements.engineFrame && elements.engineFrame.contentWindow
    ? elements.engineFrame.contentWindow
    : null;
}

function getEngineFrameWindow() {
  return getFrameWindow();
}

function getPreviewFrameWindow() {
  return elements.previewFrame && elements.previewFrame.contentWindow
    ? elements.previewFrame.contentWindow
    : null;
}

function getEngineApi() {
  const frameWindow = getFrameWindow();
  if (!frameWindow) {
    return null;
  }
  const api = frameWindow.__appPinballV2;
  if (!api || typeof api !== 'object') {
    return null;
  }
  return api;
}

function getPreviewApi() {
  const frameWindow = getPreviewFrameWindow();
  if (!frameWindow) {
    return null;
  }
  const api = frameWindow.__appPinballV2;
  if (!api || typeof api !== 'object') {
    return null;
  }
  return api;
}

function applyMarbleSizeScaleToFrame(frameWindow, scale) {
  if (!frameWindow || !frameWindow.roulette) {
    return false;
  }
  const roulette = frameWindow.roulette;
  const marbles = Array.isArray(roulette._marbles) ? roulette._marbles : [];
  const nextSize = round2(0.5 * clamp(toFinite(scale, DEFAULT_MARBLE_SIZE_SCALE), MIN_MARBLE_SIZE_SCALE, MAX_MARBLE_SIZE_SCALE));
  for (let index = 0; index < marbles.length; index += 1) {
    const marble = marbles[index];
    if (!marble) {
      continue;
    }
    marble.size = nextSize;
  }
  return true;
}

function applyMarbleSizeToEngines(scale, options = {}) {
  const safeScale = clamp(toFinite(scale, DEFAULT_MARBLE_SIZE_SCALE), MIN_MARBLE_SIZE_SCALE, MAX_MARBLE_SIZE_SCALE);
  const mainFrame = getFrameWindow();
  const previewFrame = getPreviewFrameWindow();
  const appliedMain = applyMarbleSizeScaleToFrame(mainFrame, safeScale);
  const appliedPreview = applyMarbleSizeScaleToFrame(previewFrame, safeScale);
  if (!options.silent) {
    if (appliedMain || appliedPreview) {
      setStatus(`공 크기 적용: x${round2(safeScale)}`);
    } else {
      setStatus('엔진 준비 후 공 크기를 적용할 수 있습니다.', 'warn');
    }
  }
  return appliedMain || appliedPreview;
}

async function applyLiveMarbleCountNow(statusPrefix = '') {
  if (FILE_PROTOCOL) {
    return;
  }
  if (marbleCountApplyInFlight) {
    marbleCountApplyPending = true;
    return;
  }
  marbleCountApplyInFlight = true;
  const marbleCount = getCurrentMarbleCount();
  try {
    const api = await waitForEngineApi(8000);
    const candidateResult = await api.setCandidates(buildAutoCandidates(marbleCount));
    if (!candidateResult || candidateResult.ok !== true) {
      throw new Error(candidateResult && candidateResult.reason ? candidateResult.reason : '공 개수 적용에 실패했습니다');
    }
    applyMarbleSizeToEngines(getCurrentMarbleSizeScale(), { silent: true });
    setPlayPauseUi(readEngineRunning(api));
    await syncPreviewFromDraft({
      preserveMarbles: false,
      preserveRunning: false,
      updateCandidates: true,
    });
    if (statusPrefix) {
      setStatus(`${statusPrefix}: ${marbleCount}개`);
    }
  } catch (error) {
    const message = String(error && error.message ? error.message : error);
    if (!message.includes('엔진 API 대기 시간 초과')) {
      setStatus(message, 'error');
    }
  } finally {
    marbleCountApplyInFlight = false;
    if (marbleCountApplyPending) {
      marbleCountApplyPending = false;
      void applyLiveMarbleCountNow(statusPrefix);
    }
  }
}

function scheduleLiveMarbleCountApply(statusPrefix = '') {
  getCurrentMarbleCount();
  if (marbleCountApplyTimer) {
    window.clearTimeout(marbleCountApplyTimer);
    marbleCountApplyTimer = 0;
  }
  marbleCountApplyTimer = window.setTimeout(() => {
    marbleCountApplyTimer = 0;
    void applyLiveMarbleCountNow(statusPrefix);
  }, LIVE_MARBLE_COUNT_DEBOUNCE_MS);
}

function ensureEngineCanvasFill() {
  const frameWindow = getFrameWindow();
  if (!frameWindow || !frameWindow.document) {
    return false;
  }
  let documentRef = null;
  try {
    documentRef = frameWindow.document;
  } catch (_) {
    return false;
  }
  const canvas = documentRef.querySelector('canvas');
  if (!canvas) {
    return false;
  }
  if (documentRef.__v2MakerContextMenuBlocked !== true) {
    documentRef.addEventListener('contextmenu', (event) => {
      event.preventDefault();
    });
    documentRef.__v2MakerContextMenuBlocked = true;
  }
  if (documentRef.documentElement) {
    documentRef.documentElement.style.width = '100%';
    documentRef.documentElement.style.height = '100%';
    documentRef.documentElement.style.overflow = 'hidden';
  }
  if (documentRef.body) {
    documentRef.body.style.width = '100%';
    documentRef.body.style.height = '100%';
    documentRef.body.style.margin = '0';
    documentRef.body.style.overflow = 'hidden';
  }
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.maxWidth = '100%';
  canvas.style.maxHeight = '100%';
  return true;
}

function startEngineCanvasFillRetry() {
  if (engineCanvasFillTimer) {
    window.clearInterval(engineCanvasFillTimer);
    engineCanvasFillTimer = 0;
  }
  let tries = 0;
  engineCanvasFillTimer = window.setInterval(() => {
    tries += 1;
    const applied = ensureEngineCanvasFill();
    if (applied || tries >= 40) {
      window.clearInterval(engineCanvasFillTimer);
      engineCanvasFillTimer = 0;
    }
  }, 80);
}

function ensurePreviewCanvasFill() {
  const frameWindow = getPreviewFrameWindow();
  if (!frameWindow || !frameWindow.document) {
    return false;
  }
  let documentRef = null;
  try {
    documentRef = frameWindow.document;
  } catch (_) {
    return false;
  }
  const canvas = documentRef.querySelector('canvas');
  if (!canvas) {
    return false;
  }
  if (documentRef.__v2PreviewContextMenuBlocked !== true) {
    documentRef.addEventListener('contextmenu', (event) => {
      event.preventDefault();
    });
    documentRef.__v2PreviewContextMenuBlocked = true;
  }
  if (documentRef.documentElement) {
    documentRef.documentElement.style.width = '100%';
    documentRef.documentElement.style.height = '100%';
    documentRef.documentElement.style.overflow = 'hidden';
  }
  if (documentRef.body) {
    documentRef.body.style.width = '100%';
    documentRef.body.style.height = '100%';
    documentRef.body.style.margin = '0';
    documentRef.body.style.overflow = 'hidden';
  }
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.maxWidth = '100%';
  canvas.style.maxHeight = '100%';
  return true;
}

function startPreviewCanvasFillRetry() {
  if (previewCanvasFillTimer) {
    window.clearInterval(previewCanvasFillTimer);
    previewCanvasFillTimer = 0;
  }
  let tries = 0;
  previewCanvasFillTimer = window.setInterval(() => {
    tries += 1;
    const applied = ensurePreviewCanvasFill();
    if (applied || tries >= 40) {
      window.clearInterval(previewCanvasFillTimer);
      previewCanvasFillTimer = 0;
    }
  }, 80);
}

function getStageFitZoom(roulette, goalY) {
  if (!roulette || !roulette._renderer) {
    return 0.2;
  }
  const rendererHeight = Math.max(320, toFinite(roulette._renderer.height, 900));
  const stageHeight = Math.max(40, toFinite(goalY, 210) + 8);
  const fitZoom = (rendererHeight * 0.94) / (stageHeight * 30);
  return clamp(fitZoom, 0.05, 10);
}

function syncViewZoomInputFromEngine() {
  const frameWindow = getFrameWindow();
  const roulette = frameWindow && frameWindow.roulette ? frameWindow.roulette : null;
  if (!roulette || !roulette._stage) {
    return;
  }
  const goalY = Math.max(20, toFinite(roulette._stage.goalY, 210));
  const fitZoom = round2(getStageFitZoom(roulette, goalY));
  if (elements.viewZoomInput) {
    elements.viewZoomInput.value = String(fitZoom);
  }
}

function applyViewZoomToEngine(lockCamera = true) {
  const frameWindow = getFrameWindow();
  const roulette = frameWindow && frameWindow.roulette ? frameWindow.roulette : null;
  if (!roulette || !roulette._camera) {
    return false;
  }
  const camera = roulette._camera;
  const stage = roulette._stage && typeof roulette._stage === 'object' ? roulette._stage : {};
  const spawn = stage.spawn && typeof stage.spawn === 'object' ? stage.spawn : {};
  const columns = Math.max(1, Math.floor(toFinite(spawn.columns, 8)));
  const spacingX = toFinite(spawn.spacingX, 0.6);
  const centerX = toFinite(spawn.x, 10.25) + ((columns - 1) * spacingX) / 2;
  const goalY = Math.max(20, toFinite(stage.goalY, 210));
  const centerY = clamp(goalY * 0.5, 6, Math.max(16, goalY - 2));
  const typedZoom = toFinite(elements.viewZoomInput ? elements.viewZoomInput.value : NaN, NaN);
  const zoom = Number.isFinite(typedZoom) && typedZoom > 0
    ? clamp(typedZoom, 0.05, 10)
    : getStageFitZoom(roulette, goalY);
  if (elements.viewZoomInput && (!Number.isFinite(typedZoom) || typedZoom <= 0)) {
    elements.viewZoomInput.value = String(round2(zoom));
  }
  camera.zoom = zoom;
  if (typeof camera.lock === 'function') {
    camera.lock(lockCamera);
  }
  if (typeof camera.setPosition === 'function') {
    camera.setPosition({ x: centerX, y: centerY }, false);
  }
  return true;
}

function setCameraLock(lock) {
  const frameWindow = getFrameWindow();
  const roulette = frameWindow && frameWindow.roulette ? frameWindow.roulette : null;
  if (!roulette || !roulette._camera || typeof roulette._camera.lock !== 'function') {
    return;
  }
  roulette._camera.lock(lock);
}

function readEngineFrameDiagnostics() {
  const frameWindow = getFrameWindow();
  if (!frameWindow) {
    return {
      hasApi: false,
      hasRoulette: false,
      readyState: '',
      statusText: '',
      bootError: '',
    };
  }
  let readyState = '';
  let statusText = '';
  try {
    readyState = frameWindow.document && frameWindow.document.readyState
      ? String(frameWindow.document.readyState)
      : '';
    const statusElement = frameWindow.document
      ? frameWindow.document.getElementById('v2Status')
      : null;
    statusText = statusElement && typeof statusElement.textContent === 'string'
      ? statusElement.textContent.trim()
      : '';
  } catch (_) {
  }
  let bootError = '';
  try {
    bootError = frameWindow.__v2BootError ? String(frameWindow.__v2BootError) : '';
  } catch (_) {
  }
  return {
    hasApi: !!(frameWindow.__appPinballV2 && typeof frameWindow.__appPinballV2 === 'object'),
    hasRoulette: !!(frameWindow.roulette && typeof frameWindow.roulette === 'object'),
    readyState,
    statusText,
    bootError,
  };
}

function formatEngineDiagnostics(diagnostics) {
  const safe = diagnostics && typeof diagnostics === 'object' ? diagnostics : {};
  const parts = [];
  if (safe.readyState) {
    parts.push(`readyState=${safe.readyState}`);
  }
  parts.push(`api=${safe.hasApi ? 'yes' : 'no'}`);
  parts.push(`roulette=${safe.hasRoulette ? 'yes' : 'no'}`);
  if (safe.statusText) {
    parts.push(`iframeStatus="${safe.statusText}"`);
  }
  if (safe.bootError) {
    parts.push(`bootError="${safe.bootError}"`);
  }
  return parts.join(', ');
}

function selectedTool() {
  return String(elements.makerToolSelect && elements.makerToolSelect.value ? elements.makerToolSelect.value : 'select');
}

function toolDisplayName(tool) {
  switch (String(tool || '')) {
    case 'select':
      return '선택';
    case 'spawn_point':
      return '공 시작점';
    case 'wall_segment':
      return '일반 벽선';
    case 'wall_polyline':
      return '다점 벽선';
    case 'wall_corridor_segment':
      return '통로형 일반벽선';
    case 'wall_corridor_polyline':
      return '통로형 다절벽선';
    case 'peg_circle':
      return '원형 핀';
    case 'diamond_block':
      return '마름모';
    case 'box_block':
      return '박스';
    case 'rotor':
      return '회전 바';
    case 'black_hole':
      return '블랙홀';
    case 'white_hole':
      return '화이트홀';
    case 'hammer':
      return '해머';
    case 'fan':
      return '선풍기';
    case 'sticky_pad':
      return '이동 점착패드';
    case 'burst_bumper':
      return '버스트 범퍼';
    case 'domino_block':
      return '도미노 블럭';
    case 'physics_ball':
      return '물리 공';
    case 'goal_marker_image':
      return '골라인 이미지';
    default:
      return String(tool || '툴');
  }
}

function objectTypeDisplayName(type) {
  return toolDisplayName(type);
}

function supportsImpactTuning(obj) {
  if (!obj || typeof obj !== 'object') {
    return false;
  }
  return String(obj.type || '') !== 'goal_marker_image';
}

function defaultRestitutionForType(type) {
  switch (String(type || '')) {
    case 'peg_circle':
      return 2;
    case 'diamond_block':
      return 1.4;
    case 'burst_bumper':
      return 3.2;
    case 'domino_block':
      return 0.08;
    case 'physics_ball':
      return 0.22;
    case 'hammer':
    case 'fan':
    case 'sticky_pad':
    case 'black_hole':
    case 'white_hole':
    case 'portal':
      return 0.12;
    case 'wall_polyline':
    case 'wall_corridor_polyline':
    case 'wall_corridor_segment':
    case 'rotor':
      return 0;
    default:
      return 0.08;
  }
}

function defaultFrictionForType(type) {
  switch (String(type || '')) {
    case 'sticky_pad':
      return 1.2;
    case 'wall_polyline':
    case 'wall_corridor_polyline':
    case 'wall_corridor_segment':
      return 0.35;
    default:
      return 0.2;
  }
}

function defaultColorForObjectType(type) {
  switch (String(type || '')) {
    case 'wall_polyline':
    case 'wall_corridor_polyline':
      return OBJECT_COLOR_PRESET.wall;
    case 'box_block':
      return OBJECT_COLOR_PRESET.box;
    case 'diamond_block':
      return OBJECT_COLOR_PRESET.diamond;
    case 'peg_circle':
      return OBJECT_COLOR_PRESET.peg;
    case 'rotor':
      return OBJECT_COLOR_PRESET.rotor;
    case 'portal':
      return OBJECT_COLOR_PRESET.portal;
    case 'black_hole':
      return OBJECT_COLOR_PRESET.blackHole;
    case 'white_hole':
      return OBJECT_COLOR_PRESET.whiteHole;
    case 'hammer':
      return OBJECT_COLOR_PRESET.hammer;
    case 'fan':
      return OBJECT_COLOR_PRESET.fan;
    case 'sticky_pad':
      return OBJECT_COLOR_PRESET.sticky;
    case 'burst_bumper':
      return OBJECT_COLOR_PRESET.burst;
    case 'domino_block':
      return OBJECT_COLOR_PRESET.domino;
    case 'physics_ball':
      return OBJECT_COLOR_PRESET.physicsBall;
    case 'goal_marker_image':
      return OBJECT_COLOR_PRESET.goalMarker;
    default:
      return '#7ab4ff';
  }
}

function isPolylineObject(obj) {
  if (!obj || typeof obj !== 'object') {
    return false;
  }
  const type = String(obj.type || '');
  return type === 'wall_polyline' || type === 'wall_corridor_polyline' || type === 'wall_corridor_segment';
}

function isDirectionalTargetObject(obj) {
  if (!obj || typeof obj !== 'object') {
    return false;
  }
  const type = String(obj.type || '');
  return type === 'hammer' || type === 'fan' || type === 'sticky_pad';
}

function isPolylineTool(tool) {
  const safe = String(tool || '');
  return safe === 'wall_polyline' || safe === 'wall_corridor_polyline';
}

function corridorGapForObject(obj, fallback = 1.2) {
  const base = Math.max(0.2, toFinite(fallback, 1.2));
  if (!obj || typeof obj !== 'object') {
    return base;
  }
  return round1(clamp(toFinite(obj.gap, base), 0.2, 8));
}

function getCorridorGapInput() {
  const raw = elements.corridorGapInput ? elements.corridorGapInput.value : 1.2;
  const gap = round1(clamp(toFinite(raw, 1.2), 0.2, 8));
  if (elements.corridorGapInput) {
    elements.corridorGapInput.value = String(gap);
  }
  return gap;
}

function syncToolButtons() {
  if (!Array.isArray(elements.makerToolButtons) || elements.makerToolButtons.length === 0) {
    return;
  }
  const current = selectedTool();
  for (let index = 0; index < elements.makerToolButtons.length; index += 1) {
    const button = elements.makerToolButtons[index];
    const tool = button && button.dataset ? String(button.dataset.makerTool || '') : '';
    const active = tool === current;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
}

function setSelectedTool(tool) {
  const fallback = 'select';
  const allowed = new Set([
    'select',
    'spawn_point',
    'wall_segment',
    'wall_polyline',
    'wall_corridor_segment',
    'wall_corridor_polyline',
    'peg_circle',
    'diamond_block',
    'box_block',
    'rotor',
    'portal',
    'black_hole',
    'white_hole',
    'hammer',
    'fan',
    'sticky_pad',
    'burst_bumper',
    'domino_block',
    'physics_ball',
    'goal_marker_image',
  ]);
  const nextTool = allowed.has(String(tool || '')) ? String(tool) : fallback;
  if (elements.makerToolSelect) {
    elements.makerToolSelect.value = nextTool;
  }
  syncToolButtons();
}

function resetPendingWall() {
  editorState.pendingWallStart = null;
  editorState.pendingWallOid = '';
  editorState.pendingWallType = '';
}

function resetPendingPortal() {
  editorState.pendingPortalOid = '';
}

function linkPortalPairBidirectional(firstPortal, secondPortal) {
  if (!firstPortal || !secondPortal || firstPortal === secondPortal) {
    return false;
  }
  const aOid = String(firstPortal.oid || '').trim();
  const bOid = String(secondPortal.oid || '').trim();
  if (!aOid || !bOid) {
    return false;
  }
  const objects = getObjects();
  for (let index = 0; index < objects.length; index += 1) {
    const obj = objects[index];
    if (!obj || obj.type !== 'portal') {
      continue;
    }
    const oid = String(obj.oid || '').trim();
    if (oid !== aOid && oid !== bOid) {
      if (String(obj.pair || '').trim() === aOid || String(obj.pair || '').trim() === bOid) {
        obj.pair = '';
      }
    }
  }
  firstPortal.pair = bOid;
  secondPortal.pair = aOid;
  return true;
}

function resetPendingHammer() {
  editorState.pendingHammerOid = '';
}

function resetActiveDrag() {
  editorState.dragState = null;
}

function nextOid(prefix) {
  const normalizedPrefix = String(prefix || 'obj').replace(/[^a-zA-Z0-9_]+/g, '_');
  const used = new Set(getObjects().map((obj) => String(obj && obj.oid ? obj.oid : '').trim()).filter((oid) => oid.length > 0));
  for (let index = 1; index < 9999; index += 1) {
    const candidate = `${normalizedPrefix}_${index}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }
  return `${normalizedPrefix}_${Date.now()}`;
}

function createObjectByTool(tool, x, y) {
  const mapJson = getMutableMap();
  const px = round1(clamp(x, 0.1, WORLD_WIDTH - 0.1));
  const py = round1(clamp(y, 0.1, Math.max(25, toFinite(mapJson.stage.goalY, 210) + 4)));
  if (tool === 'peg_circle') {
    return {
      oid: nextOid('peg'),
      type: 'peg_circle',
      x: px,
      y: py,
      radius: 0.7,
      restitution: 2.2,
      life: -1,
      color: OBJECT_COLOR_PRESET.peg,
    };
  }
  if (tool === 'box_block') {
    return {
      oid: nextOid('box'),
      type: 'box_block',
      x: px,
      y: py,
      width: 1.8,
      height: 0.24,
      rotation: 0,
      restitution: 0.08,
      color: OBJECT_COLOR_PRESET.box,
    };
  }
  if (tool === 'diamond_block') {
    return {
      oid: nextOid('diamond'),
      type: 'diamond_block',
      x: px,
      y: py,
      width: 0.34,
      height: 0.34,
      rotation: 45,
      restitution: 1.5,
      color: OBJECT_COLOR_PRESET.diamond,
    };
  }
  if (tool === 'rotor') {
    return {
      oid: nextOid('rotor'),
      type: 'rotor',
      x: px,
      y: py,
      width: 3.2,
      height: 0.12,
      angularVelocity: 2.2,
      color: OBJECT_COLOR_PRESET.rotor,
    };
  }
  if (tool === 'portal') {
    return {
      oid: nextOid('portal'),
      type: 'portal',
      x: px,
      y: py,
      radius: 0.6,
      triggerRadius: 1.05,
      pair: '',
      cooldownMs: 900,
      preserveVelocity: false,
      exitImpulse: 0,
      exitDirDeg: 0,
      color: OBJECT_COLOR_PRESET.portal,
    };
  }
  if (tool === 'black_hole') {
    return {
      oid: nextOid('black_hole'),
      type: 'black_hole',
      x: px,
      y: py,
      radius: 0.72,
      triggerRadius: 2.1,
      suctionForce: 0.55,
      cooldownMs: 900,
      launchImpulse: 2.9,
      color: OBJECT_COLOR_PRESET.blackHole,
    };
  }
  if (tool === 'white_hole') {
    return {
      oid: nextOid('white_hole'),
      type: 'white_hole',
      x: px,
      y: py,
      radius: 0.62,
      cooldownMs: 900,
      launchImpulse: 2.9,
      color: OBJECT_COLOR_PRESET.whiteHole,
    };
  }
  if (tool === 'hammer') {
    return {
      oid: nextOid('hammer'),
      type: 'hammer',
      x: px,
      y: py,
      width: 0.9,
      height: 0.32,
      rotation: 0,
      dirDeg: 90,
      force: 4.2,
      intervalMs: 1200,
      doubleHit: false,
      triggerRadius: 1.6,
      cooldownMs: 320,
      swingDeg: 26,
      swingDurationMs: 220,
      hitDistance: 0.95,
      color: OBJECT_COLOR_PRESET.hammer,
    };
  }
  if (tool === 'fan') {
    return {
      oid: nextOid('fan'),
      type: 'fan',
      x: px,
      y: py,
      width: 0.95,
      height: 0.32,
      rotation: 0,
      dirDeg: 0,
      force: 0.32,
      triggerRadius: 0.9,
      hitDistance: 2.8,
      color: OBJECT_COLOR_PRESET.fan,
    };
  }
  if (tool === 'sticky_pad') {
    return {
      oid: nextOid('sticky'),
      type: 'sticky_pad',
      x: px,
      y: py,
      width: 1.1,
      height: 0.24,
      rotation: 0,
      speed: 1.1,
      pauseMs: 220,
      stickyTopOnly: true,
      pathA: [px, py],
      pathB: [round1(clamp(px + 2.4, 0.1, WORLD_WIDTH - 0.1)), py],
      color: OBJECT_COLOR_PRESET.sticky,
    };
  }
  if (tool === 'burst_bumper') {
    return {
      oid: nextOid('burst'),
      type: 'burst_bumper',
      x: px,
      y: py,
      radius: 0.72,
      restitution: 3.2,
      life: -1,
      triggerRadius: 1.2,
      force: 6.2,
      intervalMs: 420,
      layers: 3,
      hpPerLayer: 1,
      color: OBJECT_COLOR_PRESET.burst,
    };
  }
  if (tool === 'domino_block') {
    return {
      oid: nextOid('domino'),
      type: 'domino_block',
      x: px,
      y: py,
      width: 0.16,
      height: 0.7,
      rotation: 0,
      restitution: 0.08,
      density: 1.35,
      color: OBJECT_COLOR_PRESET.domino,
      bodyType: 'dynamic',
    };
  }
  if (tool === 'physics_ball') {
    return {
      oid: nextOid('ball'),
      type: 'physics_ball',
      x: px,
      y: py,
      radius: 0.62,
      restitution: 0.22,
      density: 1.8,
      color: OBJECT_COLOR_PRESET.physicsBall,
      bodyType: 'dynamic',
    };
  }
  if (tool === 'goal_marker_image') {
    return {
      oid: nextOid('goal_marker'),
      type: 'goal_marker_image',
      x: px,
      y: py,
      width: 6,
      height: 1.8,
      rotation: 0,
      opacity: 0.86,
      imageSrc: GOAL_MARKER_IMAGE_DEFAULT_SRC,
      color: OBJECT_COLOR_PRESET.goalMarker,
    };
  }
  return null;
}

function getSelectedObject() {
  const objects = getObjects();
  if (editorState.selectedIndex < 0 || editorState.selectedIndex >= objects.length) {
    return null;
  }
  return objects[editorState.selectedIndex];
}

function clearObjectEditor() {
  if (elements.objOidInput) elements.objOidInput.value = '';
  if (elements.objColorInput) elements.objColorInput.value = '';
  if (elements.objXInput) elements.objXInput.value = '';
  if (elements.objYInput) elements.objYInput.value = '';
  if (elements.objExtra1Input) elements.objExtra1Input.value = '';
  if (elements.objExtra2Input) elements.objExtra2Input.value = '';
  if (elements.objRadiusInput) elements.objRadiusInput.value = '';
  if (elements.objRotationInput) {
    elements.objRotationInput.value = '';
    elements.objRotationInput.disabled = true;
  }
  if (elements.objPairInput) elements.objPairInput.value = '';
  if (elements.objDirInput) elements.objDirInput.value = '';
  if (elements.objForceInput) elements.objForceInput.value = '';
  if (elements.objIntervalInput) elements.objIntervalInput.value = '';
  if (elements.objHitDistanceInput) elements.objHitDistanceInput.value = '';
  if (elements.objHitDistanceInput) elements.objHitDistanceInput.disabled = true;
  if (elements.objRestitutionInput) {
    elements.objRestitutionInput.value = '';
    elements.objRestitutionInput.disabled = true;
  }
  if (elements.objFrictionInput) {
    elements.objFrictionInput.value = '';
    elements.objFrictionInput.disabled = true;
  }
  if (elements.objHitDistanceLabel) elements.objHitDistanceLabel.textContent = '이동거리';
  if (elements.objRadiusLabel) elements.objRadiusLabel.textContent = '반지름';
  if (elements.reverseRotationButton) elements.reverseRotationButton.disabled = true;
  if (elements.objDirLabel) elements.objDirLabel.textContent = '방향 각도(도)';
  if (elements.objForceLabel) elements.objForceLabel.textContent = '힘';
  if (elements.objIntervalLabel) elements.objIntervalLabel.textContent = '간격(ms)';
}

function populateObjectEditor() {
  const obj = getSelectedObject();
  if (!obj) {
    clearObjectEditor();
    updateMakerHint('툴을 선택하고 캔버스를 클릭해서 오브젝트를 추가하세요.');
    renderFloatingObjectInspector();
    return;
  }
  if (elements.objOidInput) elements.objOidInput.value = String(obj.oid || '');
  if (elements.objColorInput) elements.objColorInput.value = String(obj.color || '');
  if (elements.objRadiusInput) {
    if (obj.type === 'goal_marker_image') {
      elements.objRadiusInput.value = String(round2(clamp(toFinite(obj.opacity, 0.86), 0.05, 1)));
    } else {
      elements.objRadiusInput.value = String(round1(toFinite(obj.radius, 0.6)));
    }
  }
  if (elements.objRadiusLabel) {
    elements.objRadiusLabel.textContent = obj.type === 'goal_marker_image' ? '투명도' : '반지름';
  }
  if (elements.objRotationInput) {
    const canRotate = supportsRotationHandle(obj);
    elements.objRotationInput.disabled = !canRotate;
    elements.objRotationInput.value = canRotate
      ? String(round1(toFinite(obj.rotation, 0)))
      : ((obj.type === 'hammer' || obj.type === 'fan') ? '0' : '');
  }
  if (elements.objRestitutionInput) {
    const canTuneImpact = supportsImpactTuning(obj);
    elements.objRestitutionInput.disabled = !canTuneImpact;
    elements.objRestitutionInput.value = canTuneImpact
      ? String(round2(clamp(
        toFinite(obj.restitution, defaultRestitutionForType(obj.type)),
        0,
        8,
      )))
      : '';
  }
  if (elements.objFrictionInput) {
    const canTuneImpact = supportsImpactTuning(obj);
    elements.objFrictionInput.disabled = !canTuneImpact;
    elements.objFrictionInput.value = canTuneImpact
      ? String(round2(clamp(
        toFinite(obj.friction, defaultFrictionForType(obj.type)),
        0,
        8,
      )))
      : '';
  }
  if (elements.objPairInput) elements.objPairInput.value = String(obj.pair || '');
  if (elements.objDirInput) {
    if (obj.type === 'rotor') {
      elements.objDirInput.value = '';
    } else if (obj.type === 'goal_marker_image') {
      elements.objDirInput.value = '';
    } else if (obj.type === 'black_hole' || obj.type === 'white_hole') {
      elements.objDirInput.value = '';
    } else if (obj.type === 'portal') {
      elements.objDirInput.value = String(Math.round(toFinite(obj.exitDirDeg, 0)));
    } else if (obj.type === 'burst_bumper') {
      elements.objDirInput.value = String(Math.max(1, Math.floor(toFinite(obj.layers, 3))));
    } else if (obj.type === 'sticky_pad') {
      elements.objDirInput.value = String(round2(toFinite(obj.speed, 1.1)));
    } else {
      elements.objDirInput.value = String(Math.round(toFinite(obj.dirDeg, 90)));
    }
  }
  if (elements.objForceInput) {
    if (obj.type === 'rotor') {
      elements.objForceInput.value = String(round2(toFinite(obj.angularVelocity, 2.2)));
    } else if (obj.type === 'goal_marker_image') {
      elements.objForceInput.value = '';
    } else if (obj.type === 'black_hole') {
      elements.objForceInput.value = String(round2(toFinite(obj.suctionForce, toFinite(obj.force, 0.55))));
    } else if (obj.type === 'white_hole') {
      elements.objForceInput.value = String(round1(toFinite(obj.launchImpulse, 2.9)));
    } else if (obj.type === 'portal') {
      elements.objForceInput.value = String(round1(toFinite(obj.exitImpulse, 0)));
    } else if (obj.type === 'sticky_pad') {
      elements.objForceInput.value = String(Math.round(toFinite(obj.pauseMs, 220)));
    } else {
      elements.objForceInput.value = String(round1(toFinite(obj.force, 4.2)));
    }
  }
  if (elements.objIntervalInput) {
    if (obj.type === 'rotor') {
      elements.objIntervalInput.value = '';
    } else if (obj.type === 'goal_marker_image') {
      elements.objIntervalInput.value = '';
    } else if (obj.type === 'black_hole' || obj.type === 'white_hole') {
      elements.objIntervalInput.value = String(Math.round(toFinite(obj.cooldownMs, 900)));
    } else if (obj.type === 'portal') {
      elements.objIntervalInput.value = String(Math.round(toFinite(obj.cooldownMs, 900)));
    } else if (obj.type === 'burst_bumper') {
      elements.objIntervalInput.value = String(Math.round(toFinite(obj.intervalMs, 420)));
    } else if (obj.type === 'sticky_pad') {
      elements.objIntervalInput.value = '0';
    } else {
      elements.objIntervalInput.value = String(Math.round(toFinite(obj.intervalMs, 1200)));
    }
  }
  if (elements.objHitDistanceInput) {
    if (obj.type === 'hammer') {
      elements.objHitDistanceInput.value = String(round1(toFinite(obj.hitDistance, 0.95)));
      elements.objHitDistanceInput.disabled = false;
      if (elements.objHitDistanceLabel) {
        elements.objHitDistanceLabel.textContent = '이동거리';
      }
    } else if (obj.type === 'fan') {
      elements.objHitDistanceInput.value = String(round1(toFinite(obj.hitDistance, 2.8)));
      elements.objHitDistanceInput.disabled = false;
      if (elements.objHitDistanceLabel) {
        elements.objHitDistanceLabel.textContent = '바람거리';
      }
    } else if (obj.type === 'burst_bumper') {
      elements.objHitDistanceInput.value = String(Math.max(1, Math.floor(toFinite(obj.hpPerLayer, 1))));
      elements.objHitDistanceInput.disabled = false;
      if (elements.objHitDistanceLabel) {
        elements.objHitDistanceLabel.textContent = 'hp/층';
      }
    } else if (obj.type === 'sticky_pad') {
      const pathB = Array.isArray(obj.pathB) ? obj.pathB : [toFinite(obj.x, 0) + 2.4, toFinite(obj.y, 0)];
      const dist = Math.hypot(
        toFinite(pathB[0], toFinite(obj.x, 0)) - toFinite(obj.x, 0),
        toFinite(pathB[1], toFinite(obj.y, 0)) - toFinite(obj.y, 0),
      );
      elements.objHitDistanceInput.value = String(round1(Math.max(0.2, dist)));
      elements.objHitDistanceInput.disabled = false;
      if (elements.objHitDistanceLabel) {
        elements.objHitDistanceLabel.textContent = '이동거리';
      }
    } else {
      elements.objHitDistanceInput.value = '';
      elements.objHitDistanceInput.disabled = true;
      if (elements.objHitDistanceLabel) {
        elements.objHitDistanceLabel.textContent = '이동거리';
      }
    }
  }
  if (elements.reverseRotationButton) {
    elements.reverseRotationButton.disabled = !(supportsRotationHandle(obj) || obj.type === 'hammer' || obj.type === 'fan');
  }
  if (elements.objDirLabel) {
    let dirLabel = '방향 각도(도)';
    if (obj.type === 'rotor') {
      dirLabel = '방향 각도(미사용)';
    } else if (obj.type === 'goal_marker_image' || obj.type === 'black_hole' || obj.type === 'white_hole') {
      dirLabel = '방향(미사용)';
    } else if (obj.type === 'portal') {
      dirLabel = '출구 각도(도)';
    } else if (obj.type === 'burst_bumper') {
      dirLabel = '레이어 수';
    } else if (obj.type === 'fan') {
      dirLabel = '바람 방향(도)';
    } else if (obj.type === 'sticky_pad') {
      dirLabel = '이동속도';
    }
    elements.objDirLabel.textContent = dirLabel;
  }
  if (elements.objForceLabel) {
    let forceLabel = '힘';
    if (obj.type === 'rotor') {
      forceLabel = '회전 속도';
    } else if (obj.type === 'goal_marker_image') {
      forceLabel = '힘(미사용)';
    } else if (obj.type === 'black_hole') {
      forceLabel = '흡입력';
    } else if (obj.type === 'white_hole') {
      forceLabel = '발사힘';
    } else if (obj.type === 'portal') {
      forceLabel = '출구 가속(impulse)';
    } else if (obj.type === 'fan') {
      forceLabel = '풍압';
    } else if (obj.type === 'sticky_pad') {
      forceLabel = '대기(ms)';
    }
    elements.objForceLabel.textContent = forceLabel;
  }
  if (elements.objIntervalLabel) {
    let intervalLabel = '간격(ms)';
    if (obj.type === 'rotor' || obj.type === 'goal_marker_image' || obj.type === 'fan' || obj.type === 'sticky_pad') {
      intervalLabel = '간격(미사용)';
    } else if (obj.type === 'black_hole' || obj.type === 'white_hole') {
      intervalLabel = '재진입 쿨다운(ms)';
    } else if (obj.type === 'portal' || obj.type === 'burst_bumper') {
      intervalLabel = '쿨다운(ms)';
    }
    elements.objIntervalLabel.textContent = intervalLabel;
  }

  if (isPolylineObject(obj)) {
    const points = Array.isArray(obj.points) ? obj.points : [];
    const p1 = points[0] || [0, 0];
    const p2 = points[Math.max(1, points.length - 1)] || [0, 0];
    if (elements.objXInput) elements.objXInput.value = String(round1(toFinite(p1[0], 0)));
    if (elements.objYInput) elements.objYInput.value = String(round1(toFinite(p1[1], 0)));
    if (elements.objExtra1Input) elements.objExtra1Input.value = String(round1(toFinite(p2[0], 0)));
    if (elements.objExtra2Input) elements.objExtra2Input.value = String(round1(toFinite(p2[1], 0)));
    if (obj.type === 'wall_corridor_polyline' || obj.type === 'wall_corridor_segment') {
      if (elements.objExtra1Label) elements.objExtra1Label.textContent = '끝점 x';
      if (elements.objExtra2Label) elements.objExtra2Label.textContent = '끝점 y';
      if (elements.objRadiusInput) elements.objRadiusInput.value = String(corridorGapForObject(obj, getCorridorGapInput()));
      if (elements.objRadiusLabel) elements.objRadiusLabel.textContent = '통로 간격';
    } else {
      if (elements.objExtra1Label) elements.objExtra1Label.textContent = '점2 x';
      if (elements.objExtra2Label) elements.objExtra2Label.textContent = '점2 y';
      if (elements.objRadiusLabel) elements.objRadiusLabel.textContent = '반지름';
    }
  } else if (obj.type === 'burst_bumper') {
    if (elements.objXInput) elements.objXInput.value = String(round1(toFinite(obj.x, 0)));
    if (elements.objYInput) elements.objYInput.value = String(round1(toFinite(obj.y, 0)));
    if (elements.objExtra1Input) elements.objExtra1Input.value = String(round1(toFinite(obj.triggerRadius, toFinite(obj.radius, 0.7) + 0.45)));
    if (elements.objExtra2Input) elements.objExtra2Input.value = String(round1(toFinite(obj.restitution, 3.2)));
    if (elements.objExtra1Label) elements.objExtra1Label.textContent = '트리거 반경';
    if (elements.objExtra2Label) elements.objExtra2Label.textContent = '탄성';
  } else if (obj.type === 'hammer') {
    if (elements.objXInput) elements.objXInput.value = String(round1(toFinite(obj.x, 0)));
    if (elements.objYInput) elements.objYInput.value = String(round1(toFinite(obj.y, 0)));
    if (elements.objExtra1Input) elements.objExtra1Input.value = String(round1(toFinite(obj.triggerRadius, 1.2)));
    if (elements.objExtra2Input) elements.objExtra2Input.value = String(Math.round(toFinite(obj.cooldownMs, 320)));
    if (elements.objExtra1Label) elements.objExtra1Label.textContent = '트리거 반경';
    if (elements.objExtra2Label) elements.objExtra2Label.textContent = '쿨다운(ms)';
  } else if (obj.type === 'fan') {
    if (elements.objXInput) elements.objXInput.value = String(round1(toFinite(obj.x, 0)));
    if (elements.objYInput) elements.objYInput.value = String(round1(toFinite(obj.y, 0)));
    if (elements.objExtra1Input) elements.objExtra1Input.value = String(round1(toFinite(obj.triggerRadius, 0.9)));
    if (elements.objExtra2Input) elements.objExtra2Input.value = String('0');
    if (elements.objExtra1Label) elements.objExtra1Label.textContent = '영향폭';
    if (elements.objExtra2Label) elements.objExtra2Label.textContent = '보조(미사용)';
  } else if (obj.type === 'sticky_pad') {
    const pathB = Array.isArray(obj.pathB) ? obj.pathB : [toFinite(obj.x, 0) + 2.4, toFinite(obj.y, 0)];
    if (elements.objXInput) elements.objXInput.value = String(round1(toFinite(obj.x, 0)));
    if (elements.objYInput) elements.objYInput.value = String(round1(toFinite(obj.y, 0)));
    if (elements.objExtra1Input) elements.objExtra1Input.value = String(round1(toFinite(pathB[0], toFinite(obj.x, 0) + 2.4)));
    if (elements.objExtra2Input) elements.objExtra2Input.value = String(round1(toFinite(pathB[1], toFinite(obj.y, 0))));
    if (elements.objExtra1Label) elements.objExtra1Label.textContent = '목표점 x';
    if (elements.objExtra2Label) elements.objExtra2Label.textContent = '목표점 y';
  } else if (obj.type === 'physics_ball') {
    if (elements.objXInput) elements.objXInput.value = String(round1(toFinite(obj.x, 0)));
    if (elements.objYInput) elements.objYInput.value = String(round1(toFinite(obj.y, 0)));
    if (elements.objExtra1Input) elements.objExtra1Input.value = String(round1(toFinite(obj.restitution, 0.22)));
    if (elements.objExtra2Input) elements.objExtra2Input.value = String(round1(toFinite(obj.density, 1.8)));
    if (elements.objExtra1Label) elements.objExtra1Label.textContent = '탄성';
    if (elements.objExtra2Label) elements.objExtra2Label.textContent = '밀도';
  } else if (obj.type === 'portal') {
    if (elements.objXInput) elements.objXInput.value = String(round1(toFinite(obj.x, 0)));
    if (elements.objYInput) elements.objYInput.value = String(round1(toFinite(obj.y, 0)));
    if (elements.objExtra1Input) elements.objExtra1Input.value = String(round1(toFinite(obj.triggerRadius, toFinite(obj.radius, 0.6) + 0.45)));
    if (elements.objExtra2Input) elements.objExtra2Input.value = String(Math.round(toFinite(obj.cooldownMs, 900)));
    if (elements.objExtra1Label) elements.objExtra1Label.textContent = '트리거 반경';
    if (elements.objExtra2Label) elements.objExtra2Label.textContent = '쿨다운(ms)';
  } else if (obj.type === 'black_hole') {
    if (elements.objXInput) elements.objXInput.value = String(round1(toFinite(obj.x, 0)));
    if (elements.objYInput) elements.objYInput.value = String(round1(toFinite(obj.y, 0)));
    if (elements.objExtra1Input) elements.objExtra1Input.value = String(round1(toFinite(obj.triggerRadius, 2.1)));
    if (elements.objExtra2Input) elements.objExtra2Input.value = String(round1(toFinite(obj.launchImpulse, 2.9)));
    if (elements.objExtra1Label) elements.objExtra1Label.textContent = '흡입 반경';
    if (elements.objExtra2Label) elements.objExtra2Label.textContent = '출구 발사힘';
  } else if (obj.type === 'white_hole') {
    if (elements.objXInput) elements.objXInput.value = String(round1(toFinite(obj.x, 0)));
    if (elements.objYInput) elements.objYInput.value = String(round1(toFinite(obj.y, 0)));
    if (elements.objExtra1Input) elements.objExtra1Input.value = String(round1(toFinite(obj.launchImpulse, 2.9)));
    if (elements.objExtra2Input) elements.objExtra2Input.value = String('0');
    if (elements.objExtra1Label) elements.objExtra1Label.textContent = '발사힘';
    if (elements.objExtra2Label) elements.objExtra2Label.textContent = '보조(미사용)';
  } else if (obj.type === 'rotor') {
    if (elements.objXInput) elements.objXInput.value = String(round1(toFinite(obj.x, 0)));
    if (elements.objYInput) elements.objYInput.value = String(round1(toFinite(obj.y, 0)));
    if (elements.objExtra1Input) elements.objExtra1Input.value = String(round1(toFinite(obj.width, 3.2)));
    if (elements.objExtra2Input) elements.objExtra2Input.value = String(round1(toFinite(obj.height, 0.12)));
    if (elements.objExtra1Label) elements.objExtra1Label.textContent = '가로 반길이';
    if (elements.objExtra2Label) elements.objExtra2Label.textContent = '세로 반길이';
  } else if (obj.type === 'goal_marker_image') {
    if (elements.objXInput) elements.objXInput.value = String(round1(toFinite(obj.x, 0)));
    if (elements.objYInput) elements.objYInput.value = String(round1(toFinite(obj.y, 0)));
    if (elements.objExtra1Input) elements.objExtra1Input.value = String(round1(toFinite(obj.width, 6)));
    if (elements.objExtra2Input) elements.objExtra2Input.value = String(round1(toFinite(obj.height, 1.8)));
    if (elements.objExtra1Label) elements.objExtra1Label.textContent = '가로 반폭';
    if (elements.objExtra2Label) elements.objExtra2Label.textContent = '세로 반폭';
    if (elements.objPairInput) {
      elements.objPairInput.value = String(
        obj.imageSrc && String(obj.imageSrc).trim()
          ? String(obj.imageSrc).trim()
          : GOAL_MARKER_IMAGE_DEFAULT_SRC,
      );
    }
    if (elements.objRadiusLabel) elements.objRadiusLabel.textContent = '투명도';
  } else {
    if (elements.objXInput) elements.objXInput.value = String(round1(toFinite(obj.x, 0)));
    if (elements.objYInput) elements.objYInput.value = String(round1(toFinite(obj.y, 0)));
    if (elements.objExtra1Input) elements.objExtra1Input.value = String(round1(toFinite(obj.width, 1.2)));
    if (elements.objExtra2Input) elements.objExtra2Input.value = String(round1(toFinite(obj.height, 0.2)));
    if (elements.objExtra1Label) elements.objExtra1Label.textContent = '가로 반길이';
    if (elements.objExtra2Label) elements.objExtra2Label.textContent = '세로 반길이';
  }
  updateMakerHint(`선택됨: ${obj.oid} (${objectTypeDisplayName(obj.type)})`);
  renderFloatingObjectInspector();
}

function readMakerLabelText(labelElement, fallback = '') {
  if (!labelElement || typeof labelElement.textContent !== 'string') {
    return fallback;
  }
  const text = labelElement.textContent.trim();
  return text || fallback;
}

function shouldShowInlineOption(label, value, allowEmpty = false) {
  const safeLabel = String(label || '');
  const safeValue = String(value || '').trim();
  if (!allowEmpty && safeValue.length === 0) {
    return false;
  }
  if (safeLabel.includes('미사용')) {
    return false;
  }
  return true;
}

function buildFloatingInspectorFieldDefs(obj) {
  const defs = [];
  const pushField = (sourceKey, label, options = {}) => {
    const source = elements[sourceKey];
    if (!source) {
      return;
    }
    if (source.disabled && options.includeDisabled !== true) {
      return;
    }
    const value = source.value !== undefined && source.value !== null ? String(source.value) : '';
    if (!options.force && !shouldShowInlineOption(label, value, options.allowEmpty === true)) {
      return;
    }
    defs.push({
      sourceKey,
      label,
      value,
      type: source.type === 'number' ? 'number' : 'text',
      step: source.step || '',
      min: source.min || '',
      max: source.max || '',
      placeholder: source.placeholder || '',
    });
  };

  pushField('objOidInput', 'ID', { force: true, allowEmpty: true });
  pushField('objColorInput', '색상', { force: true, allowEmpty: true });

  if (isPolylineObject(obj)) {
    pushField('objXInput', '시작 X', { force: true });
    pushField('objYInput', '시작 Y', { force: true });
    pushField('objExtra1Input', readMakerLabelText(elements.objExtra1Label, '끝점 X'), { force: true });
    pushField('objExtra2Input', readMakerLabelText(elements.objExtra2Label, '끝점 Y'), { force: true });
    if (obj.type === 'wall_corridor_polyline' || obj.type === 'wall_corridor_segment') {
      pushField('objRadiusInput', readMakerLabelText(elements.objRadiusLabel, '통로 간격'), { force: true });
    }
    if (supportsImpactTuning(obj)) {
      pushField('objRestitutionInput', '반발력');
      pushField('objFrictionInput', '충격흡수(마찰)');
    }
    return defs;
  }

  pushField('objXInput', 'X', { force: true });
  pushField('objYInput', 'Y', { force: true });
  pushField('objExtra1Input', readMakerLabelText(elements.objExtra1Label, '보조값 1'));
  pushField('objExtra2Input', readMakerLabelText(elements.objExtra2Label, '보조값 2'));

  if (obj.type === 'goal_marker_image'
    || obj.type === 'peg_circle'
    || obj.type === 'portal'
    || obj.type === 'black_hole'
    || obj.type === 'white_hole'
    || obj.type === 'burst_bumper'
    || obj.type === 'physics_ball') {
    pushField('objRadiusInput', readMakerLabelText(elements.objRadiusLabel, '반지름'));
  }

  if (elements.objRotationInput && !elements.objRotationInput.disabled) {
    pushField('objRotationInput', '회전 각도');
  }

  if (obj.type === 'portal' || obj.type === 'goal_marker_image' || (elements.objPairInput && String(elements.objPairInput.value || '').trim())) {
    pushField('objPairInput', obj.type === 'goal_marker_image' ? '이미지 경로' : '연결 포털', {
      force: obj.type === 'portal' || obj.type === 'goal_marker_image',
      allowEmpty: obj.type === 'goal_marker_image',
    });
  }

  pushField('objDirInput', readMakerLabelText(elements.objDirLabel, '방향'));
  pushField('objForceInput', readMakerLabelText(elements.objForceLabel, '힘'));
  pushField('objIntervalInput', readMakerLabelText(elements.objIntervalLabel, '간격(ms)'));
  if (elements.objHitDistanceInput && !elements.objHitDistanceInput.disabled) {
    pushField('objHitDistanceInput', readMakerLabelText(elements.objHitDistanceLabel, '이동거리'));
  }
  if (supportsImpactTuning(obj)) {
    pushField('objRestitutionInput', '반발력');
    pushField('objFrictionInput', '충격흡수(마찰)');
  }

  return defs;
}

function setFloatingInspectorVisible(visible) {
  if (!elements.floatingObjectInspector) {
    return;
  }
  const show = visible === true;
  elements.floatingObjectInspector.classList.toggle('hidden', !show);
  elements.floatingObjectInspector.setAttribute('aria-hidden', show ? 'false' : 'true');
}

function renderFloatingObjectInspector() {
  if (!elements.floatingObjectInspector || !elements.floatingObjectFields) {
    return;
  }
  const obj = getSelectedObject();
  const visible = !!obj && selectedTool() === 'select';
  if (!visible) {
    setFloatingInspectorVisible(false);
    return;
  }
  setFloatingInspectorVisible(true);
  if (elements.floatingObjectTitle) {
    const oid = String(obj.oid || 'obj');
    elements.floatingObjectTitle.textContent = `${oid} · ${objectTypeDisplayName(obj.type)}`;
  }
  if (elements.floatingReverseButton) {
    elements.floatingReverseButton.disabled = !(supportsRotationHandle(obj) || obj.type === 'hammer' || obj.type === 'fan');
  }
  if (elements.floatingDeleteButton) {
    elements.floatingDeleteButton.disabled = false;
  }
  const defs = buildFloatingInspectorFieldDefs(obj);
  elements.floatingObjectFields.innerHTML = '';
  for (let index = 0; index < defs.length; index += 1) {
    const def = defs[index];
    const row = document.createElement('div');
    row.className = 'floating-object-row';
    const label = document.createElement('label');
    label.textContent = def.label;
    const input = document.createElement('input');
    input.type = def.type === 'number' ? 'number' : 'text';
    input.value = def.value;
    input.dataset.sourceKey = def.sourceKey;
    if (def.step) {
      input.step = def.step;
    }
    if (def.min) {
      input.min = def.min;
    }
    if (def.max) {
      input.max = def.max;
    }
    if (def.placeholder) {
      input.placeholder = def.placeholder;
    }
    row.appendChild(label);
    row.appendChild(input);
    elements.floatingObjectFields.appendChild(row);
  }
  positionFloatingObjectInspector();
}

function positionFloatingObjectInspector(layout = null) {
  if (!elements.floatingObjectInspector || elements.floatingObjectInspector.classList.contains('hidden')) {
    return;
  }
  const obj = getSelectedObject();
  if (!obj) {
    return;
  }
  const activeLayout = layout || getCanvasLayout();
  if (!activeLayout) {
    return;
  }
  const parent = elements.makerCanvas ? elements.makerCanvas.parentElement : null;
  if (!parent) {
    return;
  }
  const anchor = getObjectAnchorWorld(obj);
  const canvasPos = worldToCanvas(activeLayout, anchor.x, anchor.y);
  const dpr = Math.max(1, toFinite(activeLayout.dpr, 1));
  const anchorX = canvasPos.x / dpr;
  const anchorY = canvasPos.y / dpr;
  const parentRect = parent.getBoundingClientRect();
  const margin = 8;
  const panelWidth = Math.max(210, elements.floatingObjectInspector.offsetWidth || 220);
  const panelHeight = Math.max(88, elements.floatingObjectInspector.offsetHeight || 120);
  let left = anchorX + 18;
  let top = anchorY + 64;
  if (left + panelWidth > parentRect.width - margin) {
    left = anchorX - panelWidth - 18;
  }
  if (left < margin) {
    left = margin;
  }
  if (top + panelHeight > parentRect.height - margin) {
    top = anchorY - panelHeight - 16;
  }
  if (top < margin) {
    top = margin;
  }
  elements.floatingObjectInspector.style.left = `${Math.round(left)}px`;
  elements.floatingObjectInspector.style.top = `${Math.round(top)}px`;
}

function syncObjectList(options = {}) {
  const preserveNoSelection = options && options.preserveNoSelection === true;
  const objects = getObjects();
  if (!elements.objectList) {
    if (objects.length === 0) {
      editorState.selectedIndex = -1;
      populateObjectEditor();
      return;
    }
    if (editorState.selectedIndex < 0 || editorState.selectedIndex >= objects.length) {
      if (preserveNoSelection && editorState.selectedIndex < 0) {
        populateObjectEditor();
        return;
      }
      editorState.selectedIndex = objects.length - 1;
    }
    populateObjectEditor();
    return;
  }
  const optionItems = objects
    .map((obj, index) => {
      const oid = String(obj && obj.oid ? obj.oid : `obj_${index + 1}`);
      const type = String(obj && obj.type ? obj.type : 'unknown');
      let suffix = '';
      if (type === 'wall_polyline' || type === 'wall_corridor_polyline' || type === 'wall_corridor_segment') {
        const points = Array.isArray(obj.points) ? obj.points.length : 0;
        if (type === 'wall_corridor_polyline' || type === 'wall_corridor_segment') {
          suffix = ` (${points}pt, gap=${corridorGapForObject(obj, getCorridorGapInput())})`;
        } else {
          suffix = ` (${points}pt)`;
        }
      } else if (type === 'portal' && obj && obj.pair) {
        suffix = ` (→ ${obj.pair})`;
      }
      return `<option value="${index}">${index + 1}. ${oid} [${type}]${suffix}</option>`;
    })
    .join('');
  elements.objectList.innerHTML = `<option value="">선택 없음</option>${optionItems}`;
  if (objects.length === 0) {
    editorState.selectedIndex = -1;
    populateObjectEditor();
    return;
  }
  if (editorState.selectedIndex < 0 || editorState.selectedIndex >= objects.length) {
    if (preserveNoSelection && editorState.selectedIndex < 0) {
      editorState.selectedIndex = -1;
    } else {
      editorState.selectedIndex = objects.length - 1;
    }
  }
  elements.objectList.value = editorState.selectedIndex >= 0 ? String(editorState.selectedIndex) : '';
  populateObjectEditor();
}

function applyImpactTuningFromInputs(obj) {
  if (!obj || !supportsImpactTuning(obj)) {
    return;
  }
  const fallbackRestitution = clamp(toFinite(obj.restitution, defaultRestitutionForType(obj.type)), 0, 8);
  const fallbackFriction = clamp(toFinite(obj.friction, defaultFrictionForType(obj.type)), 0, 8);
  if (elements.objRestitutionInput && !elements.objRestitutionInput.disabled) {
    obj.restitution = round2(clamp(
      toFinite(elements.objRestitutionInput.value, fallbackRestitution),
      0,
      8,
    ));
  } else {
    obj.restitution = round2(fallbackRestitution);
  }
  if (elements.objFrictionInput && !elements.objFrictionInput.disabled) {
    obj.friction = round2(clamp(
      toFinite(elements.objFrictionInput.value, fallbackFriction),
      0,
      8,
    ));
  } else {
    obj.friction = round2(fallbackFriction);
  }
}

function finalizeObjectEditorValues(obj) {
  applyImpactTuningFromInputs(obj);
  refreshCurrentJsonViewer();
}

function applyObjectEditorValues() {
  const obj = getSelectedObject();
  if (!obj) {
    throw new Error('편집할 오브젝트를 먼저 선택하세요');
  }
  const newOid = String(elements.objOidInput && elements.objOidInput.value ? elements.objOidInput.value : '').trim();
  if (newOid) {
    obj.oid = newOid;
  }
  const color = String(elements.objColorInput && elements.objColorInput.value ? elements.objColorInput.value : '').trim();
  if (color) {
    obj.color = color;
  } else {
    delete obj.color;
  }
  if (isPolylineObject(obj)) {
    const x1 = round1(toFinite(elements.objXInput ? elements.objXInput.value : 0, 0));
    const y1 = round1(toFinite(elements.objYInput ? elements.objYInput.value : 0, 0));
    const x2 = round1(toFinite(elements.objExtra1Input ? elements.objExtra1Input.value : x1 + 1, x1 + 1));
    const y2 = round1(toFinite(elements.objExtra2Input ? elements.objExtra2Input.value : y1 + 1, y1 + 1));
    const points = Array.isArray(obj.points) ? obj.points : [];
    if (points.length < 2) {
      obj.points = [[x1, y1], [x2, y2]];
    } else {
      points[0][0] = x1;
      points[0][1] = y1;
      points[points.length - 1][0] = x2;
      points[points.length - 1][1] = y2;
      obj.points = points;
    }
    if (obj.type === 'wall_corridor_polyline' || obj.type === 'wall_corridor_segment') {
      obj.gap = corridorGapForObject(
        {
          gap: elements.objRadiusInput ? elements.objRadiusInput.value : obj.gap,
        },
        getCorridorGapInput(),
      );
    }
    finalizeObjectEditorValues(obj);
    return;
  }
  if (obj.type === 'burst_bumper') {
    obj.x = round1(toFinite(elements.objXInput ? elements.objXInput.value : obj.x, toFinite(obj.x, 0)));
    obj.y = round1(toFinite(elements.objYInput ? elements.objYInput.value : obj.y, toFinite(obj.y, 0)));
    obj.radius = round1(toFinite(elements.objRadiusInput ? elements.objRadiusInput.value : obj.radius, toFinite(obj.radius, 0.72)));
    obj.triggerRadius = round1(toFinite(
      elements.objExtra1Input ? elements.objExtra1Input.value : obj.triggerRadius,
      toFinite(obj.triggerRadius, toFinite(obj.radius, 0.72) + 0.45),
    ));
    obj.restitution = round1(toFinite(elements.objExtra2Input ? elements.objExtra2Input.value : obj.restitution, toFinite(obj.restitution, 3.2)));
    obj.force = round1(toFinite(elements.objForceInput ? elements.objForceInput.value : obj.force, toFinite(obj.force, 6.2)));
    obj.intervalMs = Math.round(toFinite(elements.objIntervalInput ? elements.objIntervalInput.value : obj.intervalMs, toFinite(obj.intervalMs, 420)));
    obj.layers = Math.max(1, Math.floor(toFinite(elements.objDirInput ? elements.objDirInput.value : obj.layers, toFinite(obj.layers, 3))));
    obj.hpPerLayer = Math.max(1, Math.floor(toFinite(
      elements.objHitDistanceInput ? elements.objHitDistanceInput.value : obj.hpPerLayer,
      toFinite(obj.hpPerLayer, 1),
    )));
    finalizeObjectEditorValues(obj);
    return;
  }
  if (obj.type === 'portal') {
    obj.x = round1(toFinite(elements.objXInput ? elements.objXInput.value : obj.x, toFinite(obj.x, 0)));
    obj.y = round1(toFinite(elements.objYInput ? elements.objYInput.value : obj.y, toFinite(obj.y, 0)));
    obj.radius = round1(toFinite(elements.objRadiusInput ? elements.objRadiusInput.value : obj.radius, toFinite(obj.radius, 0.6)));
    obj.triggerRadius = round1(toFinite(
      elements.objExtra1Input ? elements.objExtra1Input.value : obj.triggerRadius,
      toFinite(obj.triggerRadius, toFinite(obj.radius, 0.6) + 0.45),
    ));
    obj.cooldownMs = Math.round(toFinite(
      elements.objExtra2Input ? elements.objExtra2Input.value : obj.cooldownMs,
      toFinite(obj.cooldownMs, 900),
    ));
    obj.pair = String(elements.objPairInput && elements.objPairInput.value ? elements.objPairInput.value : obj.pair || '').trim();
    if (!Object.prototype.hasOwnProperty.call(obj, 'preserveVelocity')) {
      obj.preserveVelocity = false;
    }
    obj.exitDirDeg = Math.round(toFinite(
      elements.objDirInput ? elements.objDirInput.value : obj.exitDirDeg,
      toFinite(obj.exitDirDeg, 0),
    ));
    obj.exitImpulse = round1(toFinite(
      elements.objForceInput ? elements.objForceInput.value : obj.exitImpulse,
      toFinite(obj.exitImpulse, 0),
    ));
    if (obj.pair) {
      const objects = getObjects();
      const target = objects.find((item) => item && item.type === 'portal' && String(item.oid || '').trim() === obj.pair);
      if (target && target !== obj) {
        linkPortalPairBidirectional(obj, target);
      }
    }
    finalizeObjectEditorValues(obj);
    return;
  }
  if (obj.type === 'black_hole') {
    obj.x = round1(toFinite(elements.objXInput ? elements.objXInput.value : obj.x, toFinite(obj.x, 0)));
    obj.y = round1(toFinite(elements.objYInput ? elements.objYInput.value : obj.y, toFinite(obj.y, 0)));
    obj.radius = round1(Math.max(0.18, toFinite(
      elements.objRadiusInput ? elements.objRadiusInput.value : obj.radius,
      toFinite(obj.radius, 0.72),
    )));
    obj.triggerRadius = round1(Math.max(
      toFinite(obj.radius, 0.72) + 0.2,
      toFinite(elements.objExtra1Input ? elements.objExtra1Input.value : obj.triggerRadius, toFinite(obj.triggerRadius, 2.1)),
    ));
    obj.launchImpulse = round1(Math.max(0.1, toFinite(
      elements.objExtra2Input ? elements.objExtra2Input.value : obj.launchImpulse,
      toFinite(obj.launchImpulse, 2.9),
    )));
    obj.suctionForce = round2(Math.max(0.35, toFinite(
      elements.objForceInput ? elements.objForceInput.value : obj.suctionForce,
      toFinite(obj.suctionForce, toFinite(obj.force, 0.55)),
    )));
    obj.cooldownMs = Math.round(Math.max(80, toFinite(
      elements.objIntervalInput ? elements.objIntervalInput.value : obj.cooldownMs,
      toFinite(obj.cooldownMs, 900),
    )));
    finalizeObjectEditorValues(obj);
    return;
  }
  if (obj.type === 'white_hole') {
    obj.x = round1(toFinite(elements.objXInput ? elements.objXInput.value : obj.x, toFinite(obj.x, 0)));
    obj.y = round1(toFinite(elements.objYInput ? elements.objYInput.value : obj.y, toFinite(obj.y, 0)));
    obj.radius = round1(Math.max(0.16, toFinite(
      elements.objRadiusInput ? elements.objRadiusInput.value : obj.radius,
      toFinite(obj.radius, 0.62),
    )));
    obj.launchImpulse = round1(Math.max(0.1, toFinite(
      elements.objExtra1Input ? elements.objExtra1Input.value : obj.launchImpulse,
      toFinite(obj.launchImpulse, 2.9),
    )));
    obj.cooldownMs = Math.round(Math.max(80, toFinite(
      elements.objIntervalInput ? elements.objIntervalInput.value : obj.cooldownMs,
      toFinite(obj.cooldownMs, 900),
    )));
    if (elements.objForceInput && String(elements.objForceInput.value || '').trim()) {
      obj.launchImpulse = round1(Math.max(0.1, toFinite(elements.objForceInput.value, obj.launchImpulse)));
    }
    finalizeObjectEditorValues(obj);
    return;
  }
  if (obj.type === 'rotor') {
    obj.x = round1(toFinite(elements.objXInput ? elements.objXInput.value : obj.x, toFinite(obj.x, 0)));
    obj.y = round1(toFinite(elements.objYInput ? elements.objYInput.value : obj.y, toFinite(obj.y, 0)));
    obj.width = round1(toFinite(elements.objExtra1Input ? elements.objExtra1Input.value : obj.width, toFinite(obj.width, 3.2)));
    obj.height = round1(toFinite(elements.objExtra2Input ? elements.objExtra2Input.value : obj.height, toFinite(obj.height, 0.12)));
    obj.rotation = round1(toFinite(elements.objRotationInput ? elements.objRotationInput.value : obj.rotation, toFinite(obj.rotation, 0)));
    obj.angularVelocity = round2(toFinite(
      elements.objForceInput ? elements.objForceInput.value : obj.angularVelocity,
      toFinite(obj.angularVelocity, 2.2),
    ));
    finalizeObjectEditorValues(obj);
    return;
  }
  if (obj.type === 'goal_marker_image') {
    obj.x = round1(toFinite(elements.objXInput ? elements.objXInput.value : obj.x, toFinite(obj.x, 0)));
    obj.y = round1(toFinite(elements.objYInput ? elements.objYInput.value : obj.y, toFinite(obj.y, 0)));
    obj.width = round1(Math.max(0.2, toFinite(
      elements.objExtra1Input ? elements.objExtra1Input.value : obj.width,
      toFinite(obj.width, 6),
    )));
    obj.height = round1(Math.max(0.2, toFinite(
      elements.objExtra2Input ? elements.objExtra2Input.value : obj.height,
      toFinite(obj.height, 1.8),
    )));
    obj.rotation = round1(toFinite(
      elements.objRotationInput ? elements.objRotationInput.value : obj.rotation,
      toFinite(obj.rotation, 0),
    ));
    obj.opacity = round2(clamp(toFinite(
      elements.objRadiusInput ? elements.objRadiusInput.value : obj.opacity,
      toFinite(obj.opacity, 0.86),
    ), 0.05, 1));
    const imageSrc = String(
      elements.objPairInput && elements.objPairInput.value
        ? elements.objPairInput.value
        : (obj.imageSrc || GOAL_MARKER_IMAGE_DEFAULT_SRC),
    ).trim();
    obj.imageSrc = imageSrc || GOAL_MARKER_IMAGE_DEFAULT_SRC;
    finalizeObjectEditorValues(obj);
    return;
  }
  if (obj.type === 'hammer') {
    obj.x = round1(toFinite(elements.objXInput ? elements.objXInput.value : obj.x, toFinite(obj.x, 0)));
    obj.y = round1(toFinite(elements.objYInput ? elements.objYInput.value : obj.y, toFinite(obj.y, 0)));
    obj.triggerRadius = round1(toFinite(elements.objExtra1Input ? elements.objExtra1Input.value : obj.triggerRadius, toFinite(obj.triggerRadius, 1.2)));
    obj.cooldownMs = Math.round(toFinite(elements.objExtra2Input ? elements.objExtra2Input.value : obj.cooldownMs, toFinite(obj.cooldownMs, 320)));
    obj.rotation = 0;
    obj.dirDeg = Math.round(toFinite(elements.objDirInput ? elements.objDirInput.value : obj.dirDeg, toFinite(obj.dirDeg, 90)));
    obj.force = round1(toFinite(elements.objForceInput ? elements.objForceInput.value : obj.force, toFinite(obj.force, 4.2)));
    obj.intervalMs = Math.round(toFinite(elements.objIntervalInput ? elements.objIntervalInput.value : obj.intervalMs, toFinite(obj.intervalMs, 1200)));
    obj.hitDistance = round1(toFinite(
      elements.objHitDistanceInput ? elements.objHitDistanceInput.value : obj.hitDistance,
      toFinite(obj.hitDistance, 0.95),
    ));
    finalizeObjectEditorValues(obj);
    return;
  }
  if (obj.type === 'fan') {
    obj.x = round1(toFinite(elements.objXInput ? elements.objXInput.value : obj.x, toFinite(obj.x, 0)));
    obj.y = round1(toFinite(elements.objYInput ? elements.objYInput.value : obj.y, toFinite(obj.y, 0)));
    obj.triggerRadius = round1(toFinite(
      elements.objExtra1Input ? elements.objExtra1Input.value : obj.triggerRadius,
      toFinite(obj.triggerRadius, 0.9),
    ));
    obj.rotation = 0;
    obj.dirDeg = Math.round(toFinite(elements.objDirInput ? elements.objDirInput.value : obj.dirDeg, toFinite(obj.dirDeg, 0)));
    obj.force = round2(toFinite(elements.objForceInput ? elements.objForceInput.value : obj.force, toFinite(obj.force, 0.32)));
    obj.hitDistance = round1(toFinite(
      elements.objHitDistanceInput ? elements.objHitDistanceInput.value : obj.hitDistance,
      toFinite(obj.hitDistance, 2.8),
    ));
    finalizeObjectEditorValues(obj);
    return;
  }
  if (obj.type === 'sticky_pad') {
    obj.x = round1(toFinite(elements.objXInput ? elements.objXInput.value : obj.x, toFinite(obj.x, 0)));
    obj.y = round1(toFinite(elements.objYInput ? elements.objYInput.value : obj.y, toFinite(obj.y, 0)));
    obj.speed = round2(Math.max(0.05, toFinite(
      elements.objDirInput ? elements.objDirInput.value : obj.speed,
      toFinite(obj.speed, 1.1),
    )));
    obj.pauseMs = Math.round(Math.max(0, toFinite(
      elements.objForceInput ? elements.objForceInput.value : obj.pauseMs,
      toFinite(obj.pauseMs, 220),
    )));
    const rawTargetX = toFinite(
      elements.objExtra1Input ? elements.objExtra1Input.value : (Array.isArray(obj.pathB) ? obj.pathB[0] : obj.x + 2.4),
      toFinite(obj.x, 0) + 2.4,
    );
    const rawTargetY = toFinite(
      elements.objExtra2Input ? elements.objExtra2Input.value : (Array.isArray(obj.pathB) ? obj.pathB[1] : obj.y),
      toFinite(obj.y, 0),
    );
    let target = {
      x: round1(clamp(rawTargetX, 0.1, WORLD_WIDTH - 0.1)),
      y: round1(clamp(rawTargetY, 0.1, Math.max(25, getGoalYWorld() + 4))),
    };
    const hitDistance = toFinite(
      elements.objHitDistanceInput ? elements.objHitDistanceInput.value : NaN,
      NaN,
    );
    if (Number.isFinite(hitDistance) && hitDistance > 0.2) {
      const dx = target.x - obj.x;
      const dy = target.y - obj.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= 0.0001) {
        target.x = round1(clamp(obj.x + hitDistance, 0.1, WORLD_WIDTH - 0.1));
        target.y = obj.y;
      } else {
        const scale = hitDistance / dist;
        target.x = round1(clamp(obj.x + dx * scale, 0.1, WORLD_WIDTH - 0.1));
        target.y = round1(clamp(obj.y + dy * scale, 0.1, Math.max(25, getGoalYWorld() + 4)));
      }
    }
    obj.pathA = [obj.x, obj.y];
    obj.pathB = [target.x, target.y];
    finalizeObjectEditorValues(obj);
    return;
  }
  if (obj.type === 'physics_ball') {
    obj.x = round1(toFinite(elements.objXInput ? elements.objXInput.value : obj.x, toFinite(obj.x, 0)));
    obj.y = round1(toFinite(elements.objYInput ? elements.objYInput.value : obj.y, toFinite(obj.y, 0)));
    obj.radius = round1(Math.max(0.08, toFinite(
      elements.objRadiusInput ? elements.objRadiusInput.value : obj.radius,
      toFinite(obj.radius, 0.62),
    )));
    obj.restitution = round2(toFinite(
      elements.objExtra1Input ? elements.objExtra1Input.value : obj.restitution,
      toFinite(obj.restitution, 0.22),
    ));
    obj.density = round2(Math.max(0.01, toFinite(
      elements.objExtra2Input ? elements.objExtra2Input.value : obj.density,
      toFinite(obj.density, 1.8),
    )));
    obj.bodyType = 'dynamic';
    finalizeObjectEditorValues(obj);
    return;
  }
  obj.x = round1(toFinite(elements.objXInput ? elements.objXInput.value : obj.x, toFinite(obj.x, 0)));
  obj.y = round1(toFinite(elements.objYInput ? elements.objYInput.value : obj.y, toFinite(obj.y, 0)));
  obj.width = round1(toFinite(elements.objExtra1Input ? elements.objExtra1Input.value : obj.width, toFinite(obj.width, 1.2)));
  obj.height = round1(toFinite(elements.objExtra2Input ? elements.objExtra2Input.value : obj.height, toFinite(obj.height, 0.2)));
  if (obj.type === 'diamond_block') {
    const half = round1(Math.max(0.12, Math.max(toFinite(obj.width, 0.12), toFinite(obj.height, 0.12))));
    obj.width = half;
    obj.height = half;
  }
  obj.radius = round1(toFinite(elements.objRadiusInput ? elements.objRadiusInput.value : obj.radius, toFinite(obj.radius, 0.6)));
  obj.rotation = round1(toFinite(elements.objRotationInput ? elements.objRotationInput.value : obj.rotation, toFinite(obj.rotation, 0)));
  obj.pair = String(elements.objPairInput && elements.objPairInput.value ? elements.objPairInput.value : obj.pair || '').trim();
  obj.dirDeg = Math.round(toFinite(elements.objDirInput ? elements.objDirInput.value : obj.dirDeg, toFinite(obj.dirDeg, 90)));
  obj.force = round1(toFinite(elements.objForceInput ? elements.objForceInput.value : obj.force, toFinite(obj.force, 4.2)));
  obj.intervalMs = Math.round(toFinite(elements.objIntervalInput ? elements.objIntervalInput.value : obj.intervalMs, toFinite(obj.intervalMs, 1200)));
  finalizeObjectEditorValues(obj);
}

function reverseSelectedObjectRotation() {
  const obj = getSelectedObject();
  if (!obj) {
    throw new Error('회전을 반전할 오브젝트를 먼저 선택하세요');
  }
  if (obj.type === 'rotor') {
    const angularVelocity = toFinite(obj.angularVelocity, 2.2);
    const normalized = Math.abs(angularVelocity) < 0.01 ? 2.2 : angularVelocity;
    obj.angularVelocity = round2(-normalized);
    refreshCurrentJsonViewer();
    return `회전 바 반전 완료 (angularVelocity=${obj.angularVelocity})`;
  }
  if (obj.type === 'hammer') {
    obj.dirDeg = round1(normalizeDeg(toFinite(obj.dirDeg, 90) + 180));
    refreshCurrentJsonViewer();
    return `해머 타격 방향 반전 완료 (dirDeg=${obj.dirDeg})`;
  }
  if (obj.type === 'fan') {
    obj.dirDeg = round1(normalizeDeg(toFinite(obj.dirDeg, 0) + 180));
    refreshCurrentJsonViewer();
    return `선풍기 방향 반전 완료 (dirDeg=${obj.dirDeg})`;
  }
  obj.rotation = round1(normalizeDeg(-toFinite(obj.rotation, 0)));
  refreshCurrentJsonViewer();
  return '회전 반전 완료';
}

function duplicateSelectedObject() {
  const obj = getSelectedObject();
  if (!obj) {
    throw new Error('복제할 오브젝트를 먼저 선택하세요');
  }
  const copy = deepClone(obj);
  copy.oid = nextOid(copy.type || 'obj');
  if (copy.type === 'wall_corridor_polyline' || copy.type === 'wall_corridor_segment') {
    copy.gap = corridorGapForObject(copy, getCorridorGapInput());
  }
  const objects = getObjects();
  objects.push(copy);
  editorState.selectedIndex = objects.length - 1;
  refreshCurrentJsonViewer();
}

function deleteSelectedObject() {
  const objects = getObjects();
  if (editorState.selectedIndex < 0 || editorState.selectedIndex >= objects.length) {
    throw new Error('삭제할 오브젝트를 먼저 선택하세요');
  }
  const removed = objects.splice(editorState.selectedIndex, 1)[0];
  if (removed && isPolylineObject(removed) && String(removed.oid || '') === editorState.pendingWallOid) {
    resetPendingWall();
  }
  if (removed && removed.type === 'portal') {
    const removedOid = String(removed.oid || '').trim();
    for (let index = 0; index < objects.length; index += 1) {
      const obj = objects[index];
      if (obj && obj.type === 'portal' && String(obj.pair || '') === removedOid) {
        obj.pair = '';
      }
    }
    if (editorState.pendingPortalOid === removedOid) {
      editorState.pendingPortalOid = '';
    }
  }
  if (removed && String(removed.oid || '') === editorState.pendingHammerOid) {
    resetPendingHammer();
  }
  if (objects.length === 0) {
    editorState.selectedIndex = -1;
    refreshCurrentJsonViewer();
    return;
  }
  editorState.selectedIndex = Math.min(editorState.selectedIndex, objects.length - 1);
  refreshCurrentJsonViewer();
}

function queueObjectLiveDraftApply(reason = '', options = {}) {
  queueLiveDraftApply(reason, {
    objectMutation: true,
    autoResumeAfterReset: options && options.autoResumeAfterReset === true,
  });
}

function runApplySelectedObjectValuesAction(options = {}) {
  const trackUndo = options.trackUndo !== false;
  if (trackUndo) {
    rememberUndoState(options.undoReason || '오브젝트 값 수정');
  }
  applyObjectEditorValues();
  syncObjectList();
  queueObjectLiveDraftApply(options.liveReason || '오브젝트 수정');
  drawMakerCanvas();
  if (options.silentStatus !== true) {
    setStatus(options.statusMessage || '선택 오브젝트 값 반영 완료');
  }
}

function runReverseSelectedObjectAction() {
  rememberUndoState('회전/방향 반전');
  const message = reverseSelectedObjectRotation();
  syncObjectList();
  populateObjectEditor();
  queueObjectLiveDraftApply('회전 반전');
  drawMakerCanvas();
  setStatus(message);
}

function runDuplicateSelectedObjectAction() {
  rememberUndoState('오브젝트 복제');
  duplicateSelectedObject();
  syncObjectList();
  queueObjectLiveDraftApply('오브젝트 복제');
  drawMakerCanvas();
  setStatus('선택 오브젝트 복제 완료');
}

function runDeleteSelectedObjectAction(reason = '오브젝트 삭제', statusMessage = '선택 오브젝트 삭제 완료') {
  rememberUndoState(reason);
  deleteSelectedObject();
  syncObjectList();
  queueObjectLiveDraftApply(reason);
  drawMakerCanvas();
  setStatus(statusMessage);
}

function applyFloatingInspectorField(sourceKey, value) {
  const source = elements[sourceKey];
  if (!source) {
    return;
  }
  source.value = String(value ?? '');
  runApplySelectedObjectValuesAction({ trackUndo: true, silentStatus: true });
}

function runApplyStageValuesAction(options = {}) {
  const trackUndo = options.trackUndo !== false;
  if (trackUndo) {
    rememberUndoState(options.undoReason || '스테이지 값 변경');
  }
  applyStageInputsToDraft();
  applyViewZoomRespectRunning();
  applyMarbleSizeToEngines(getCurrentMarbleSizeScale(), { silent: true });
  queueLiveDraftApply(options.liveReason || '스테이지 값 변경');
  drawMakerCanvas();
  if (options.silentStatus !== true) {
    setStatus(options.statusMessage || '스테이지 적용 완료 (실시간)');
  }
}

function scheduleAutoObjectApply(reason = '오브젝트 자동 반영') {
  if (autoObjectApplyTimer) {
    window.clearTimeout(autoObjectApplyTimer);
    autoObjectApplyTimer = 0;
  }
  autoObjectApplyTimer = window.setTimeout(() => {
    autoObjectApplyTimer = 0;
    if (!getSelectedObject()) {
      return;
    }
    try {
      runApplySelectedObjectValuesAction({
        trackUndo: true,
        undoReason: reason,
        liveReason: reason,
        silentStatus: true,
      });
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), 'error');
    }
  }, 120);
}

function scheduleAutoStageApply(reason = '스테이지 자동 반영') {
  if (autoStageApplyTimer) {
    window.clearTimeout(autoStageApplyTimer);
    autoStageApplyTimer = 0;
  }
  autoStageApplyTimer = window.setTimeout(() => {
    autoStageApplyTimer = 0;
    try {
      runApplyStageValuesAction({
        trackUndo: true,
        undoReason: reason,
        liveReason: reason,
        silentStatus: true,
      });
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), 'error');
    }
  }, 120);
}

function clearAllObjects() {
  const mapJson = getMutableMap();
  mapJson.objects = [];
  editorState.selectedIndex = -1;
  resetPendingWall();
  resetPendingPortal();
  resetPendingHammer();
  resetActiveDrag();
  refreshCurrentJsonViewer();
}

function applyStageInputsToDraft() {
  const mapJson = getMutableMap();
  mapJson.stage.zoomY = Math.max(10, toFinite(elements.stageZoomInput ? elements.stageZoomInput.value : mapJson.stage.zoomY, mapJson.stage.zoomY));
  mapJson.stage.disableSkills = !!(elements.stageDisableSkillsInput && elements.stageDisableSkillsInput.checked);
  applyStageWallBoundsToMap();
  syncStageInputsFromMap();
  refreshCurrentJsonViewer();
}

function autoFitStageFromObjects() {
  const objects = getObjects();
  let maxY = 30;
  for (let index = 0; index < objects.length; index += 1) {
    const obj = objects[index];
    if (!obj || typeof obj !== 'object') {
      continue;
    }
    if (isPolylineObject(obj)) {
      const points = Array.isArray(obj.points) ? obj.points : [];
      for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
        maxY = Math.max(maxY, toFinite(points[pointIndex] && points[pointIndex][1], 0));
      }
      continue;
    }
    const y = toFinite(obj.y, 0);
    const radius = Math.max(0, toFinite(obj.radius, 0));
    const height = Math.max(0, toFinite(obj.height, 0));
    maxY = Math.max(maxY, y + radius + height + 2);
  }
  const mapJson = getMutableMap();
  mapJson.stage.goalY = Math.max(40, Math.ceil(maxY + 10));
  mapJson.stage.zoomY = Math.max(20, round1(mapJson.stage.goalY - 4));
  syncStageInputsFromMap();
  refreshCurrentJsonViewer();
}

function getCanvasLayout() {
  const canvas = elements.makerCanvas;
  if (!canvas) {
    return null;
  }
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(280, Math.floor(rect.width * dpr));
  const height = Math.max(360, Math.floor(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const stageGoalY = Math.max(20, toFinite(getMutableMap().stage.goalY, 210));
  const padding = 22 * dpr;
  const usableW = Math.max(20, width - padding * 2);
  const usableH = Math.max(20, height - padding * 2);
  const fitScale = Math.max(0.001, Math.min(usableW / WORLD_WIDTH, usableH / stageGoalY));
  const zoom = clamp(toFinite(editorState.canvasZoom, 1), CANVAS_MIN_ZOOM, CANVAS_MAX_ZOOM);
  const scale = fitScale * zoom;
  const drawW = WORLD_WIDTH * scale;
  const drawH = stageGoalY * scale;
  const offsetX = (width - drawW) / 2 + toFinite(editorState.canvasPanX, 0);
  const offsetY = (height - drawH) / 2 + toFinite(editorState.canvasPanY, 0);
  return {
    canvas,
    dpr,
    width,
    height,
    padding,
    fitScale,
    zoom,
    scale,
    offsetX,
    offsetY,
    drawW,
    drawH,
    stageGoalY,
  };
}

function worldToCanvas(layout, x, y) {
  const safeX = clamp(toFinite(x, 0), 0, WORLD_WIDTH);
  const safeY = clamp(toFinite(y, 0), 0, layout.stageGoalY);
  return {
    x: layout.offsetX + safeX * layout.scale,
    y: layout.offsetY + safeY * layout.scale,
  };
}

function canvasToWorld(layout, px, py) {
  const nx = (px - layout.offsetX) / layout.drawW;
  const ny = (py - layout.offsetY) / layout.drawH;
  return {
    x: round1(clamp(nx, 0, 1) * WORLD_WIDTH),
    y: round1(clamp(ny, 0, 1) * layout.stageGoalY),
  };
}

function canvasToWorldRaw(layout, px, py) {
  return {
    x: ((px - layout.offsetX) / Math.max(0.0001, layout.scale)),
    y: ((py - layout.offsetY) / Math.max(0.0001, layout.scale)),
  };
}

function getMiniMapLayout() {
  const canvas = elements.miniMapCanvas;
  if (!canvas) {
    return null;
  }
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(120, Math.floor(rect.width * dpr));
  const height = Math.max(160, Math.floor(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const stageGoalY = Math.max(20, toFinite(getMutableMap().stage.goalY, 210));
  const padding = 8 * dpr;
  const usableW = Math.max(30, width - padding * 2);
  const usableH = Math.max(30, height - padding * 2);
  const scale = Math.max(0.001, Math.min(usableW / WORLD_WIDTH, usableH / stageGoalY));
  const drawW = WORLD_WIDTH * scale;
  const drawH = stageGoalY * scale;
  const offsetX = (width - drawW) / 2;
  const offsetY = (height - drawH) / 2;
  return {
    canvas,
    dpr,
    width,
    height,
    stageGoalY,
    scale,
    drawW,
    drawH,
    offsetX,
    offsetY,
  };
}

function worldToMiniMap(layout, x, y) {
  return {
    x: layout.offsetX + clamp(toFinite(x, 0), 0, WORLD_WIDTH) * layout.scale,
    y: layout.offsetY + clamp(toFinite(y, 0), 0, layout.stageGoalY) * layout.scale,
  };
}

function miniMapToWorld(layout, px, py) {
  const x = (px - layout.offsetX) / layout.scale;
  const y = (py - layout.offsetY) / layout.scale;
  return {
    x: round1(clamp(x, 0, WORLD_WIDTH)),
    y: round1(clamp(y, 0, layout.stageGoalY)),
  };
}

function centerCanvasToWorld(targetX, targetY) {
  const layout = getCanvasLayout();
  if (!layout) {
    return;
  }
  const safeX = clamp(toFinite(targetX, WORLD_WIDTH / 2), 0, WORLD_WIDTH);
  const safeY = clamp(toFinite(targetY, layout.stageGoalY / 2), 0, layout.stageGoalY);
  editorState.canvasPanX = (WORLD_WIDTH / 2 - safeX) * layout.scale;
  editorState.canvasPanY = (layout.stageGoalY / 2 - safeY) * layout.scale;
  drawMakerCanvas();
}

function readMiniMapWorldPoint(event) {
  const layout = getMiniMapLayout();
  if (!layout) {
    return null;
  }
  const rect = layout.canvas.getBoundingClientRect();
  const px = (event.clientX - rect.left) * layout.dpr;
  const py = (event.clientY - rect.top) * layout.dpr;
  return miniMapToWorld(layout, px, py);
}

function drawMiniMap(mainLayout = null) {
  const layout = getMiniMapLayout();
  if (!layout) {
    return;
  }
  const ctx = layout.canvas.getContext('2d');
  if (!ctx) {
    return;
  }
  ctx.clearRect(0, 0, layout.width, layout.height);
  ctx.fillStyle = '#070f22';
  ctx.fillRect(0, 0, layout.width, layout.height);
  ctx.strokeStyle = 'rgba(106, 148, 221, 0.34)';
  ctx.lineWidth = 1;
  ctx.strokeRect(layout.offsetX, layout.offsetY, layout.drawW, layout.drawH);
  const bounds = inferStageWallBounds(getMutableMap());
  const leftGuide = worldToMiniMap(layout, bounds.leftX, 0);
  const leftGuideBottom = worldToMiniMap(layout, bounds.leftX, layout.stageGoalY);
  const rightGuide = worldToMiniMap(layout, bounds.rightX, 0);
  const rightGuideBottom = worldToMiniMap(layout, bounds.rightX, layout.stageGoalY);
  ctx.strokeStyle = 'rgba(255, 124, 200, 0.95)';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(leftGuide.x, leftGuide.y);
  ctx.lineTo(leftGuideBottom.x, leftGuideBottom.y);
  ctx.moveTo(rightGuide.x, rightGuide.y);
  ctx.lineTo(rightGuideBottom.x, rightGuideBottom.y);
  ctx.stroke();

  const goalY = getGoalYWorld();
  const goalP1 = worldToMiniMap(layout, 0, goalY);
  const goalP2 = worldToMiniMap(layout, WORLD_WIDTH, goalY);
  ctx.strokeStyle = 'rgba(255, 120, 120, 0.9)';
  ctx.lineWidth = 1.3;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(goalP1.x, goalP1.y);
  ctx.lineTo(goalP2.x, goalP2.y);
  ctx.stroke();
  ctx.setLineDash([]);

  const spawn = getSpawnPointWorld();
  const spawnP = worldToMiniMap(layout, spawn.x, spawn.y);
  ctx.strokeStyle = '#7ff8be';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(spawnP.x - 4, spawnP.y);
  ctx.lineTo(spawnP.x + 4, spawnP.y);
  ctx.moveTo(spawnP.x, spawnP.y - 4);
  ctx.lineTo(spawnP.x, spawnP.y + 4);
  ctx.stroke();

  const objects = getObjects();
  for (let index = 0; index < objects.length; index += 1) {
    const obj = objects[index];
    if (!obj || typeof obj !== 'object') {
      continue;
    }
    const selected = index === editorState.selectedIndex;
    if (!selected && isBoundaryWallObject(obj)) {
      continue;
    }
    const color = selected ? '#ffd44d' : String(obj.color || defaultColorForObjectType(obj.type));
    ctx.strokeStyle = color;
    ctx.fillStyle = selected ? 'rgba(255,212,77,0.28)' : 'rgba(123,180,255,0.22)';
    if (isPolylineObject(obj)) {
      const points = Array.isArray(obj.points) ? obj.points : [];
      if (points.length < 2) {
        continue;
      }
      const drawPath = (pathPoints) => {
        const first = worldToMiniMap(layout, pathPoints[0][0], pathPoints[0][1]);
        ctx.beginPath();
        ctx.moveTo(first.x, first.y);
        for (let p = 1; p < pathPoints.length; p += 1) {
          const next = worldToMiniMap(layout, pathPoints[p][0], pathPoints[p][1]);
          ctx.lineTo(next.x, next.y);
        }
        ctx.stroke();
      };
      if (obj.type === 'wall_corridor_polyline' || obj.type === 'wall_corridor_segment') {
        const gap = corridorGapForObject(obj, getCorridorGapInput());
        const sides = buildCorridorSides(points, gap);
        if (sides.left.length >= 2) {
          drawPath(sides.left);
        }
        if (sides.right.length >= 2) {
          drawPath(sides.right);
        }
      } else {
        drawPath(points);
      }
      continue;
    }
    if (obj.type === 'peg_circle'
      || obj.type === 'portal'
      || obj.type === 'black_hole'
      || obj.type === 'white_hole'
      || obj.type === 'burst_bumper'
      || obj.type === 'physics_ball') {
      const center = worldToMiniMap(layout, obj.x, obj.y);
      const radius = Math.max(1.8, toFinite(obj.radius, 0.6) * layout.scale);
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      continue;
    }
    const center = worldToMiniMap(layout, obj.x, obj.y);
    const width = Math.max(1.8, toFinite(obj.width, 1.2) * layout.scale);
    const height = Math.max(1.2, toFinite(obj.height, 0.2) * layout.scale);
    ctx.beginPath();
    ctx.rect(center.x - width, center.y - height, width * 2, height * 2);
    ctx.fill();
    ctx.stroke();
  }

  const main = mainLayout || getCanvasLayout();
  if (main) {
    const worldTL = canvasToWorldRaw(main, 0, 0);
    const worldBR = canvasToWorldRaw(main, main.width, main.height);
    const left = clamp(Math.min(worldTL.x, worldBR.x), 0, WORLD_WIDTH);
    const right = clamp(Math.max(worldTL.x, worldBR.x), 0, WORLD_WIDTH);
    const top = clamp(Math.min(worldTL.y, worldBR.y), 0, main.stageGoalY);
    const bottom = clamp(Math.max(worldTL.y, worldBR.y), 0, main.stageGoalY);
    const p1 = worldToMiniMap(layout, left, top);
    const p2 = worldToMiniMap(layout, right, bottom);
    ctx.strokeStyle = '#ffd44d';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(p1.x, p1.y, Math.max(2, p2.x - p1.x), Math.max(2, p2.y - p1.y));
    ctx.setLineDash([]);
  }
}

function distancePointToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const abLenSq = abx * abx + aby * aby;
  if (abLenSq <= 0.000001) {
    return Math.hypot(px - ax, py - ay);
  }
  const apx = px - ax;
  const apy = py - ay;
  const t = clamp((apx * abx + apy * aby) / abLenSq, 0, 1);
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return Math.hypot(px - cx, py - cy);
}

function normalizeEditorPolylinePoints(rawPoints) {
  if (!Array.isArray(rawPoints)) {
    return [];
  }
  const points = [];
  for (let index = 0; index < rawPoints.length; index += 1) {
    const point = rawPoints[index];
    const x = toFinite(point && point[0], NaN);
    const y = toFinite(point && point[1], NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }
    points.push([x, y]);
  }
  return points;
}

function buildCorridorSides(pointsInput, gap) {
  const points = normalizeEditorPolylinePoints(pointsInput);
  if (points.length < 2) {
    return { left: [], right: [] };
  }
  const halfGap = Math.max(0.1, toFinite(gap, 1.2) / 2);
  const segmentNormals = [];
  for (let index = 1; index < points.length; index += 1) {
    const p0 = points[index - 1];
    const p1 = points[index];
    const dx = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    const length = Math.hypot(dx, dy);
    if (length <= 0.0001) {
      segmentNormals.push([0, 0]);
      continue;
    }
    segmentNormals.push([-dy / length, dx / length]);
  }
  const left = [];
  const right = [];
  for (let index = 0; index < points.length; index += 1) {
    const prevNormal = index > 0 ? segmentNormals[index - 1] : segmentNormals[index];
    const nextNormal = index < segmentNormals.length ? segmentNormals[index] : segmentNormals[index - 1];
    const normalX = toFinite((toFinite(prevNormal && prevNormal[0], 0) + toFinite(nextNormal && nextNormal[0], 0)) / 2, 0);
    const normalY = toFinite((toFinite(prevNormal && prevNormal[1], 0) + toFinite(nextNormal && nextNormal[1], 0)) / 2, 0);
    const normalLength = Math.hypot(normalX, normalY);
    const unitX = normalLength > 0.0001 ? normalX / normalLength : 0;
    const unitY = normalLength > 0.0001 ? normalY / normalLength : 0;
    const px = points[index][0];
    const py = points[index][1];
    left.push([round1(px + unitX * halfGap), round1(py + unitY * halfGap)]);
    right.push([round1(px - unitX * halfGap), round1(py - unitY * halfGap)]);
  }
  return { left, right };
}

function objectDistanceWorld(obj, x, y) {
  if (!obj || typeof obj !== 'object') {
    return Number.POSITIVE_INFINITY;
  }
  if (isPolylineObject(obj)) {
    const points = Array.isArray(obj.points) ? obj.points : [];
    if (points.length < 2) {
      return Number.POSITIVE_INFINITY;
    }
    let best = Number.POSITIVE_INFINITY;
    for (let index = 1; index < points.length; index += 1) {
      const prev = points[index - 1];
      const next = points[index];
      const dist = distancePointToSegment(
        x,
        y,
        toFinite(prev && prev[0], 0),
        toFinite(prev && prev[1], 0),
        toFinite(next && next[0], 0),
        toFinite(next && next[1], 0),
      );
      if (dist < best) {
        best = dist;
      }
    }
    return best;
  }
  return Math.hypot(x - toFinite(obj.x, 0), y - toFinite(obj.y, 0));
}

function findNearestObjectIndex(x, y) {
  const objects = getObjects();
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < objects.length; index += 1) {
    const dist = objectDistanceWorld(objects[index], x, y);
    if (dist < bestDistance) {
      bestDistance = dist;
      bestIndex = index;
    }
  }
  if (bestDistance > 0.9) {
    return -1;
  }
  return bestIndex;
}

function clampWorldPoint(point, stageGoalY) {
  const safeGoalY = Math.max(20, toFinite(stageGoalY, getMutableMap().stage.goalY));
  return {
    x: round1(clamp(toFinite(point && point.x, 0), 0, WORLD_WIDTH)),
    y: round1(clamp(toFinite(point && point.y, 0), 0, safeGoalY)),
  };
}

function getSpawnPointWorld() {
  const mapJson = getMutableMap();
  const spawn = mapJson.stage && mapJson.stage.spawn ? mapJson.stage.spawn : {};
  return {
    x: round1(clamp(toFinite(spawn.x, 10.25), 0, WORLD_WIDTH)),
    y: round1(clamp(toFinite(spawn.y, 0), 0, Math.max(20, toFinite(mapJson.stage.goalY, 210)))),
  };
}

function setSpawnPointWorld(point) {
  const mapJson = getMutableMap();
  if (!mapJson.stage || typeof mapJson.stage !== 'object') {
    mapJson.stage = { goalY: 210, zoomY: 200, spawn: { x: 10.25, y: 0, columns: 10, spacingX: 0.6, visibleRows: 5 } };
  }
  const spawn = mapJson.stage.spawn && typeof mapJson.stage.spawn === 'object'
    ? mapJson.stage.spawn
    : { x: 10.25, y: 0, columns: 10, spacingX: 0.6, visibleRows: 5 };
  const goalY = Math.max(20, toFinite(mapJson.stage.goalY, 210));
  const clamped = clampWorldPoint(point, goalY);
  spawn.x = clamped.x;
  spawn.y = clamped.y;
  mapJson.stage.spawn = spawn;
}

function getGoalYWorld() {
  const mapJson = getMutableMap();
  return round1(Math.max(20, toFinite(mapJson.stage.goalY, 210)));
}

function setGoalYWorld(nextGoalY) {
  const mapJson = getMutableMap();
  mapJson.stage.goalY = round1(clamp(toFinite(nextGoalY, mapJson.stage.goalY), 20, 2000));
  mapJson.stage.zoomY = round1(clamp(toFinite(mapJson.stage.zoomY, mapJson.stage.goalY - 4), 10, 2000));
  if (Number.isFinite(toFinite(mapJson.stage.leftWallX, NaN)) && Number.isFinite(toFinite(mapJson.stage.rightWallX, NaN))) {
    upsertStageBoundaryWall('wall-left', toFinite(mapJson.stage.leftWallX, 2.5));
    upsertStageBoundaryWall('wall-right', toFinite(mapJson.stage.rightWallX, 21));
  }
}

function getObjectAnchorWorld(obj) {
  if (!obj || typeof obj !== 'object') {
    return { x: 0, y: 0 };
  }
  if (isPolylineObject(obj)) {
    const points = Array.isArray(obj.points) ? obj.points : [];
    if (points.length >= 2) {
      const p1 = points[0];
      const p2 = points[points.length - 1];
      return {
        x: (toFinite(p1 && p1[0], 0) + toFinite(p2 && p2[0], 0)) / 2,
        y: (toFinite(p1 && p1[1], 0) + toFinite(p2 && p2[1], 0)) / 2,
      };
    }
  }
  return {
    x: toFinite(obj.x, 0),
    y: toFinite(obj.y, 0),
  };
}

function moveObjectToWorld(obj, targetX, targetY) {
  if (!obj || typeof obj !== 'object') {
    return;
  }
  if (isPolylineObject(obj)) {
    const points = Array.isArray(obj.points) ? obj.points : [];
    if (points.length < 2) {
      return;
    }
    const anchor = getObjectAnchorWorld(obj);
    const dx = round1(targetX - anchor.x);
    const dy = round1(targetY - anchor.y);
    const lockVertical = isBoundaryWallObject(obj);
    if (lockVertical) {
      const nextX = round1(clamp(toFinite(points[0] && points[0][0], anchor.x) + dx, 0.1, WORLD_WIDTH - 0.1));
      for (let index = 0; index < points.length; index += 1) {
        points[index][0] = nextX;
      }
      return;
    }
    for (let index = 0; index < points.length; index += 1) {
      points[index][0] = round1(toFinite(points[index][0], 0) + dx);
      points[index][1] = round1(toFinite(points[index][1], 0) + dy);
    }
    return;
  }
  if (obj.type === 'sticky_pad') {
    const prevX = toFinite(obj.x, targetX);
    const prevY = toFinite(obj.y, targetY);
    const dx = round1(targetX - prevX);
    const dy = round1(targetY - prevY);
    const pathA = Array.isArray(obj.pathA) ? obj.pathA : [prevX, prevY];
    const pathB = Array.isArray(obj.pathB) ? obj.pathB : [prevX + 2.4, prevY];
    obj.pathA = [round1(toFinite(pathA[0], prevX) + dx), round1(toFinite(pathA[1], prevY) + dy)];
    obj.pathB = [round1(toFinite(pathB[0], prevX) + dx), round1(toFinite(pathB[1], prevY) + dy)];
  }
  obj.x = round1(targetX);
  obj.y = round1(targetY);
}

function supportsRotationHandle(obj) {
  const type = String(obj && obj.type ? obj.type : '');
  return type === 'box_block'
    || type === 'diamond_block'
    || type === 'rotor'
    || type === 'domino_block'
    || type === 'sticky_pad'
    || type === 'goal_marker_image';
}

function getRotorEndHandlesWorld(obj) {
  if (!obj || obj.type !== 'rotor') {
    return [];
  }
  const cx = toFinite(obj.x, 0);
  const cy = toFinite(obj.y, 0);
  const halfLen = Math.max(0.08, toFinite(obj.width, 3.2));
  const rad = (Math.PI / 180) * normalizeDeg(toFinite(obj.rotation, 0));
  const dx = Math.cos(rad) * halfLen;
  const dy = Math.sin(rad) * halfLen;
  return [
    { x: round1(cx - dx), y: round1(cy - dy), endSign: -1 },
    { x: round1(cx + dx), y: round1(cy + dy), endSign: 1 },
  ];
}

function getRotationHandleWorld(obj) {
  if (!supportsRotationHandle(obj)) {
    return null;
  }
  const cx = toFinite(obj.x, 0);
  const cy = toFinite(obj.y, 0);
  const width = Math.max(0.08, toFinite(obj.width, 1.2));
  const height = Math.max(0.05, toFinite(obj.height, 0.2));
  const distance = Math.max(width, height) + 0.65;
  const rad = (Math.PI / 180) * normalizeDeg(toFinite(obj.rotation, 0));
  const dirX = -Math.sin(rad);
  const dirY = -Math.cos(rad);
  return {
    x: round1(cx + dirX * distance),
    y: round1(cy + dirY * distance),
  };
}

function getBoxResizeHandlesWorld(obj) {
  if (!obj || typeof obj !== 'object') {
    return [];
  }
  const type = String(obj.type || '');
  if (type !== 'box_block'
    && type !== 'diamond_block'
    && type !== 'hammer'
    && type !== 'fan'
    && type !== 'sticky_pad'
    && type !== 'domino_block'
    && type !== 'goal_marker_image') {
    return [];
  }
  const cx = toFinite(obj.x, 0);
  const cy = toFinite(obj.y, 0);
  const width = Math.max(0.08, toFinite(obj.width, 1.2));
  const height = Math.max(0.05, toFinite(obj.height, 0.2));
  const angleDeg = type === 'hammer' || type === 'fan'
    ? normalizeDeg(toFinite(obj.dirDeg, toFinite(obj.rotation, 0)))
    : normalizeDeg(toFinite(obj.rotation, 0));
  const rad = (Math.PI / 180) * angleDeg;
  const axisX = { x: Math.cos(rad), y: Math.sin(rad) };
  const axisY = { x: -Math.sin(rad), y: Math.cos(rad) };
  return [
    {
      kind: 'size_x',
      x: round1(cx + axisX.x * width),
      y: round1(cy + axisX.y * width),
    },
    {
      kind: 'size_y',
      x: round1(cx + axisY.x * height),
      y: round1(cy + axisY.y * height),
    },
  ];
}

function getCircleHandlesWorld(obj) {
  if (!obj || typeof obj !== 'object') {
    return [];
  }
  const type = String(obj.type || '');
  if (type !== 'peg_circle'
    && type !== 'portal'
    && type !== 'black_hole'
    && type !== 'white_hole'
    && type !== 'burst_bumper'
    && type !== 'physics_ball') {
    return [];
  }
  const cx = toFinite(obj.x, 0);
  const cy = toFinite(obj.y, 0);
  const radius = Math.max(0.08, toFinite(obj.radius, 0.6));
  const handles = [
    { kind: 'radius', x: round1(cx + radius), y: round1(cy) },
  ];
  if (type === 'portal' || type === 'black_hole' || type === 'burst_bumper') {
    const trigger = Math.max(radius + 0.05, toFinite(obj.triggerRadius, radius + 0.45));
    handles.push({ kind: 'trigger_radius', x: round1(cx), y: round1(cy - trigger) });
  }
  return handles;
}

function getHammerDirectionHandleWorld(obj) {
  if (!obj || (obj.type !== 'hammer' && obj.type !== 'fan')) {
    return null;
  }
  const cx = toFinite(obj.x, 0);
  const cy = toFinite(obj.y, 0);
  const dir = (Math.PI / 180) * normalizeDeg(toFinite(obj.dirDeg, 90));
  const distance = Math.max(0.2, toFinite(obj.hitDistance, 0.95));
  return {
    kind: 'hammer_dir',
    x: round1(cx + Math.cos(dir) * distance),
    y: round1(cy + Math.sin(dir) * distance),
  };
}

function getStickyPathHandleWorld(obj) {
  if (!obj || obj.type !== 'sticky_pad') {
    return null;
  }
  const pathB = Array.isArray(obj.pathB) ? obj.pathB : null;
  const bx = pathB ? toFinite(pathB[0], NaN) : NaN;
  const by = pathB ? toFinite(pathB[1], NaN) : NaN;
  if (!Number.isFinite(bx) || !Number.isFinite(by)) {
    const fallbackX = toFinite(obj.x, 0) + 2.4;
    const fallbackY = toFinite(obj.y, 0);
    return { kind: 'sticky_target', x: round1(fallbackX), y: round1(fallbackY) };
  }
  return { kind: 'sticky_target', x: round1(bx), y: round1(by) };
}

function drawRingHandle(ctx, x, y, radiusPx, style = {}) {
  const fill = style.fill || '#0b1530';
  const stroke = style.stroke || '#ffd44d';
  const lineWidth = Number.isFinite(style.lineWidth) ? style.lineWidth : 1.8;
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.arc(x, y, radiusPx, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function findSelectedHandle(point, layout) {
  const obj = getSelectedObject();
  if (!obj || !layout) {
    return null;
  }
  const thresholdWorld = Math.max(0.08, 9 / Math.max(0.001, layout.scale));
  const type = String(obj.type || '');
  const centerDist = Math.hypot(point.x - toFinite(obj.x, 0), point.y - toFinite(obj.y, 0));
  if (type !== 'wall_polyline' && type !== 'wall_corridor_polyline' && type !== 'wall_corridor_segment' && centerDist <= thresholdWorld * 0.9) {
    return { kind: 'move_anchor' };
  }
  if (type === 'wall_polyline' || type === 'wall_corridor_polyline' || type === 'wall_corridor_segment') {
    const points = Array.isArray(obj.points) ? obj.points : [];
    for (let index = 0; index < points.length; index += 1) {
      const px = toFinite(points[index] && points[index][0], NaN);
      const py = toFinite(points[index] && points[index][1], NaN);
      if (!Number.isFinite(px) || !Number.isFinite(py)) {
        continue;
      }
      const dist = Math.hypot(point.x - px, point.y - py);
      if (dist <= thresholdWorld) {
        return { kind: 'wall_point', pointIndex: index };
      }
    }
  }
  const circleHandles = getCircleHandlesWorld(obj);
  for (let index = 0; index < circleHandles.length; index += 1) {
    const handle = circleHandles[index];
    const dist = Math.hypot(point.x - handle.x, point.y - handle.y);
    if (dist <= thresholdWorld) {
      return { kind: handle.kind };
    }
  }
  const resizeHandles = getBoxResizeHandlesWorld(obj);
  for (let index = 0; index < resizeHandles.length; index += 1) {
    const handle = resizeHandles[index];
    const dist = Math.hypot(point.x - handle.x, point.y - handle.y);
    if (dist <= thresholdWorld) {
      return { kind: handle.kind };
    }
  }
  if (type === 'hammer' || type === 'fan') {
    const hammerHandle = getHammerDirectionHandleWorld(obj);
    if (hammerHandle) {
      const dist = Math.hypot(point.x - hammerHandle.x, point.y - hammerHandle.y);
      if (dist <= thresholdWorld) {
        return { kind: 'hammer_dir' };
      }
    }
  }
  if (type === 'sticky_pad') {
    const stickyHandle = getStickyPathHandleWorld(obj);
    if (stickyHandle) {
      const dist = Math.hypot(point.x - stickyHandle.x, point.y - stickyHandle.y);
      if (dist <= thresholdWorld) {
        return { kind: 'sticky_target' };
      }
    }
  }
  if (type === 'rotor') {
    const endHandles = getRotorEndHandlesWorld(obj);
    for (let index = 0; index < endHandles.length; index += 1) {
      const handle = endHandles[index];
      const dist = Math.hypot(point.x - handle.x, point.y - handle.y);
      if (dist <= thresholdWorld) {
        return { kind: 'rotor_end', endSign: handle.endSign };
      }
    }
  }
  const rotateHandle = getRotationHandleWorld(obj);
  if (rotateHandle) {
    const dist = Math.hypot(point.x - rotateHandle.x, point.y - rotateHandle.y);
    if (dist <= thresholdWorld) {
      return { kind: 'rotation' };
    }
  }
  return null;
}

function findStageHandle(point, layout) {
  if (!layout) {
    return null;
  }
  const thresholdWorld = Math.max(0.1, 10 / Math.max(0.001, layout.scale));
  const spawn = getSpawnPointWorld();
  const spawnDist = Math.hypot(point.x - spawn.x, point.y - spawn.y);
  if (spawnDist <= thresholdWorld) {
    return { kind: 'spawn' };
  }
  const goalY = getGoalYWorld();
  const goalHandleX = WORLD_WIDTH;
  const goalHandleDist = Math.hypot(point.x - goalHandleX, point.y - goalY);
  if (goalHandleDist <= thresholdWorld * 1.2 || (point.x >= WORLD_WIDTH - 1.4 && Math.abs(point.y - goalY) <= thresholdWorld * 0.8)) {
    return { kind: 'goal' };
  }
  return null;
}

function fanZoneConfig(obj) {
  if (!obj || obj.type !== 'fan') {
    return null;
  }
  const originX = toFinite(obj.x, 0);
  const originY = toFinite(obj.y, 0);
  const dirRad = (Math.PI / 180) * normalizeDeg(toFinite(obj.dirDeg, 0));
  const length = Math.max(0.2, toFinite(obj.hitDistance, 2.8));
  const halfWidth = Math.max(
    0.2,
    Math.max(
      toFinite(obj.triggerRadius, 0.9),
      toFinite(obj.width, 0.95) * 1.2,
    ),
  );
  return { originX, originY, dirRad, length, halfWidth };
}

function drawFanWaveZone(ctx, layout, zone, options = {}) {
  if (!ctx || !layout || !zone) {
    return;
  }
  const origin = worldToCanvas(layout, zone.originX, zone.originY);
  const lengthPx = Math.max(6, zone.length * layout.scale);
  const halfWidthPx = Math.max(4, zone.halfWidth * layout.scale);
  const alpha = Number.isFinite(options.alpha) ? options.alpha : 1;
  const fillStyle = options.fillStyle || `rgba(127, 217, 255, ${0.13 * alpha})`;
  const strokeStyle = options.strokeStyle || `rgba(143, 230, 255, ${0.9 * alpha})`;
  const waveStroke = options.waveStroke || `rgba(176, 240, 255, ${0.58 * alpha})`;
  const waveCount = Math.max(2, Math.floor(lengthPx / 22));
  ctx.save();
  ctx.translate(origin.x, origin.y);
  ctx.rotate(zone.dirRad);
  ctx.fillStyle = fillStyle;
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.rect(0, -halfWidthPx, lengthPx, halfWidthPx * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  for (let lane = -1; lane <= 1; lane += 1) {
    const laneY = lane * (halfWidthPx * 0.55);
    const waveAmp = Math.max(2, halfWidthPx * 0.14);
    const step = lengthPx / waveCount;
    ctx.moveTo(0, laneY);
    for (let i = 0; i <= waveCount; i += 1) {
      const x = i * step;
      const wave = Math.sin((i / waveCount) * Math.PI * 2.6) * waveAmp;
      ctx.lineTo(x, laneY + wave);
    }
  }
  ctx.strokeStyle = waveStroke;
  ctx.lineWidth = 1.05;
  ctx.stroke();
  ctx.restore();
}

function getGoalMarkerPreviewImage() {
  if (goalMarkerPreviewImage) {
    return goalMarkerPreviewImage;
  }
  const image = new Image();
  image.decoding = 'async';
  image.src = GOAL_MARKER_IMAGE_PREVIEW_SRC;
  image.addEventListener('load', () => {
    drawMakerCanvas();
  });
  image.addEventListener('error', () => {
    goalMarkerPreviewImage = null;
  });
  goalMarkerPreviewImage = image;
  return goalMarkerPreviewImage;
}

function drawObjectOnCanvas(ctx, layout, obj, selected) {
  if (!selected && isBoundaryWallObject(obj)) {
    return;
  }
  ctx.save();
  const color = String(obj && obj.color ? obj.color : defaultColorForObjectType(obj && obj.type));
  ctx.strokeStyle = selected ? '#ffd44d' : color;
  ctx.fillStyle = selected ? 'rgba(255, 212, 77, 0.25)' : 'rgba(110, 180, 255, 0.22)';
  ctx.lineWidth = selected ? 3 : 2;

  if (isPolylineObject(obj)) {
    const points = Array.isArray(obj.points) ? obj.points : [];
    if (points.length >= 2) {
      const drawPath = (pathPoints) => {
        const first = worldToCanvas(layout, pathPoints[0][0], pathPoints[0][1]);
        ctx.beginPath();
        ctx.moveTo(first.x, first.y);
        for (let index = 1; index < pathPoints.length; index += 1) {
          const next = worldToCanvas(layout, pathPoints[index][0], pathPoints[index][1]);
          ctx.lineTo(next.x, next.y);
        }
        ctx.stroke();
      };
      if (obj.type === 'wall_corridor_polyline' || obj.type === 'wall_corridor_segment') {
        const gap = corridorGapForObject(obj, getCorridorGapInput());
        const sides = buildCorridorSides(points, gap);
        if (sides.left.length >= 2) {
          drawPath(sides.left);
        }
        if (sides.right.length >= 2) {
          drawPath(sides.right);
        }
      } else {
        drawPath(points);
      }
      if (selected) {
        for (let index = 0; index < points.length; index += 1) {
          const point = worldToCanvas(layout, points[index][0], points[index][1]);
          drawRingHandle(ctx, point.x, point.y, 5.2, {
            fill: 'rgba(8, 16, 36, 0.92)',
            stroke: '#ffd44d',
            lineWidth: 1.9,
          });
        }
      }
    }
    ctx.restore();
    return;
  }

  const center = worldToCanvas(layout, obj.x, obj.y);
  if (obj.type === 'peg_circle'
    || obj.type === 'portal'
    || obj.type === 'black_hole'
    || obj.type === 'white_hole'
    || obj.type === 'burst_bumper'
    || obj.type === 'physics_ball') {
    const radius = Math.max(0.08, toFinite(obj.radius, 0.6)) * layout.scale;
    if (obj.type === 'burst_bumper') {
      const layers = Math.max(1, Math.floor(toFinite(obj.layers, 3)));
      for (let layer = layers; layer >= 1; layer -= 1) {
        const layerRadius = radius * (layer / layers);
        ctx.beginPath();
        ctx.arc(center.x, center.y, layerRadius, 0, Math.PI * 2);
        ctx.strokeStyle = selected ? '#ffd44d' : `rgba(93,255,122,${0.25 + (layer / layers) * 0.55})`;
        ctx.lineWidth = selected ? 2.2 : 1.6;
        ctx.stroke();
      }
      ctx.fillStyle = selected ? 'rgba(255, 212, 77, 0.16)' : 'rgba(93,255,122,0.12)';
    }
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (obj.type === 'burst_bumper') {
      const triggerRadius = Math.max(0.12, toFinite(obj.triggerRadius, toFinite(obj.radius, 0.7) + 0.45)) * layout.scale;
      ctx.beginPath();
      ctx.arc(center.x, center.y, triggerRadius, 0, Math.PI * 2);
      ctx.strokeStyle = selected ? '#ffd44d' : 'rgba(255, 169, 120, 0.9)';
      ctx.lineWidth = selected ? 2.2 : 1.5;
      ctx.stroke();
    } else if (obj.type === 'portal' || obj.type === 'black_hole') {
      const triggerRadius = Math.max(0.18, toFinite(obj.triggerRadius, toFinite(obj.radius, 0.6) + 0.45)) * layout.scale;
      ctx.beginPath();
      ctx.arc(center.x, center.y, triggerRadius, 0, Math.PI * 2);
      ctx.strokeStyle = selected
        ? '#ffd44d'
        : (obj.type === 'black_hole' ? 'rgba(187, 150, 240, 0.95)' : 'rgba(197, 158, 255, 0.92)');
      ctx.lineWidth = selected ? 2 : 1.4;
      ctx.stroke();
    }
    if (selected) {
      drawRingHandle(ctx, center.x, center.y, 5.1, {
        fill: 'rgba(8,16,36,0.95)',
        stroke: '#ffd44d',
      });
      const circleHandles = getCircleHandlesWorld(obj);
      for (let index = 0; index < circleHandles.length; index += 1) {
        const handle = circleHandles[index];
        const p = worldToCanvas(layout, handle.x, handle.y);
        drawRingHandle(ctx, p.x, p.y, 5.2, {
          fill: handle.kind === 'trigger_radius' ? 'rgba(58,26,78,0.9)' : 'rgba(8,16,36,0.95)',
          stroke: handle.kind === 'trigger_radius' ? '#d8b2ff' : '#ffd44d',
        });
      }
    }
    ctx.restore();
    return;
  }
  if (obj.type === 'goal_marker_image') {
    const width = Math.max(0.2, toFinite(obj.width, 6));
    const height = Math.max(0.2, toFinite(obj.height, 1.8));
    const rotation = (Math.PI / 180) * normalizeDeg(toFinite(obj.rotation, 0));
    const opacity = clamp(toFinite(obj.opacity, 0.86), 0.05, 1);
    const drawWidth = width * layout.scale;
    const drawHeight = height * layout.scale;
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(rotation);
    ctx.globalAlpha = opacity;
    const image = getGoalMarkerPreviewImage();
    if (image && image.complete && image.naturalWidth > 0) {
      ctx.drawImage(image, -drawWidth, -drawHeight, drawWidth * 2, drawHeight * 2);
    } else {
      ctx.fillStyle = 'rgba(255, 140, 207, 0.52)';
      ctx.strokeStyle = '#ffc4e7';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(-drawWidth, -drawHeight, drawWidth * 2, drawHeight * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (selected) {
      ctx.strokeStyle = '#ffd44d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(-drawWidth, -drawHeight, drawWidth * 2, drawHeight * 2);
      ctx.stroke();
    }
    ctx.restore();
    if (selected) {
      drawRingHandle(ctx, center.x, center.y, 5.1, {
        fill: 'rgba(8,16,36,0.95)',
        stroke: '#ffd44d',
      });
      const resizeHandles = getBoxResizeHandlesWorld(obj);
      for (let index = 0; index < resizeHandles.length; index += 1) {
        const handle = resizeHandles[index];
        const p = worldToCanvas(layout, handle.x, handle.y);
        drawRingHandle(ctx, p.x, p.y, 5.2, {
          fill: 'rgba(8,16,36,0.95)',
          stroke: '#ffd44d',
        });
      }
      const rotationHandle = getRotationHandleWorld(obj);
      if (rotationHandle) {
        const hp = worldToCanvas(layout, rotationHandle.x, rotationHandle.y);
        drawRingHandle(ctx, hp.x, hp.y, 5.2, {
          fill: 'rgba(8,16,36,0.95)',
          stroke: '#ffd44d',
        });
      }
    }
    ctx.restore();
    return;
  }

  const width = Math.max(0.08, toFinite(obj.width, obj.type === 'rotor' ? 3 : (obj.type === 'diamond_block' ? 0.32 : 1.2)));
  const height = Math.max(0.05, toFinite(obj.height, obj.type === 'rotor' ? 0.12 : (obj.type === 'diamond_block' ? 0.32 : 0.2)));
  const angleDeg = obj.type === 'hammer' || obj.type === 'fan'
    ? normalizeDeg(toFinite(obj.dirDeg, toFinite(obj.rotation, 0)))
    : toFinite(obj.rotation, 0);
  const rad = (Math.PI / 180) * angleDeg;
  const drawWidth = width * layout.scale;
  const drawHeight = height * layout.scale;
  ctx.translate(center.x, center.y);
  ctx.rotate(rad);
  ctx.beginPath();
  ctx.rect(-drawWidth, -drawHeight, drawWidth * 2, drawHeight * 2);
  ctx.fill();
  ctx.stroke();
  if (obj.type === 'fan') {
    const zone = fanZoneConfig(obj);
    if (zone) {
      ctx.restore();
      drawFanWaveZone(ctx, layout, zone, {
        alpha: selected ? 1 : 0.72,
      });
      ctx.save();
      ctx.translate(center.x, center.y);
      ctx.rotate(rad);
    }
  }
  if (obj.type === 'sticky_pad') {
    const target = getStickyPathHandleWorld(obj);
    if (target) {
      const start = worldToCanvas(layout, toFinite(obj.x, 0), toFinite(obj.y, 0));
      const end = worldToCanvas(layout, target.x, target.y);
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = selected ? '#ffaad9' : 'rgba(255, 170, 217, 0.6)';
      ctx.lineWidth = selected ? 1.5 : 1.2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.setLineDash([]);
      if (selected) {
        drawRingHandle(ctx, end.x, end.y, 5.2, {
          fill: 'rgba(8,16,36,0.95)',
          stroke: '#ffaad9',
        });
      }
      ctx.restore();
      ctx.save();
      ctx.translate(center.x, center.y);
      ctx.rotate(rad);
    }
  }

  if (selected && supportsRotationHandle(obj)) {
    const handleLength = (Math.max(width, height) + 0.65) * layout.scale;
    ctx.strokeStyle = '#ffd44d';
    ctx.fillStyle = '#0b1530';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -handleLength);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -handleLength, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
  if (selected) {
    drawRingHandle(ctx, center.x, center.y, 5.1, {
      fill: 'rgba(8,16,36,0.95)',
      stroke: '#ffd44d',
    });
  }
  if (selected) {
    const resizeHandles = getBoxResizeHandlesWorld(obj);
    for (let index = 0; index < resizeHandles.length; index += 1) {
      const handle = resizeHandles[index];
      const p = worldToCanvas(layout, handle.x, handle.y);
      drawRingHandle(ctx, p.x, p.y, 5.2, {
        fill: 'rgba(8,16,36,0.95)',
        stroke: '#ffd44d',
      });
    }
  }
  if (selected && (obj.type === 'hammer' || obj.type === 'fan')) {
    const hammerHandle = getHammerDirectionHandleWorld(obj);
    if (hammerHandle) {
      const hp = worldToCanvas(layout, hammerHandle.x, hammerHandle.y);
      ctx.save();
      const isFan = obj.type === 'fan';
      const lineColor = isFan ? '#8fe6ff' : '#9fd7ff';
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(hp.x, hp.y);
      ctx.stroke();
      ctx.setLineDash([]);
      drawRingHandle(ctx, hp.x, hp.y, 5.2, {
        fill: 'rgba(8,16,36,0.95)',
        stroke: lineColor,
      });
      const distWorld = Math.max(0.2, toFinite(obj.hitDistance, isFan ? 2.8 : 0.95));
      const dir = (Math.PI / 180) * normalizeDeg(toFinite(obj.dirDeg, isFan ? 0 : 90));
      const targetX = toFinite(obj.x, 0) + Math.cos(dir) * distWorld;
      const targetY = toFinite(obj.y, 0) + Math.sin(dir) * distWorld;
      if (isFan) {
        const zone = fanZoneConfig(obj);
        if (zone) {
          drawFanWaveZone(ctx, layout, zone, {
            alpha: 1,
            strokeStyle: 'rgba(143, 230, 255, 0.98)',
            waveStroke: 'rgba(189, 246, 255, 0.74)',
          });
        }
      } else {
        const ghost = worldToCanvas(layout, targetX, targetY);
        const halfW = Math.max(0.08, toFinite(obj.width, 0.9)) * layout.scale;
        const halfH = Math.max(0.05, toFinite(obj.height, 0.32)) * layout.scale;
        ctx.translate(ghost.x, ghost.y);
        ctx.rotate(dir);
        ctx.fillStyle = 'rgba(255, 165, 87, 0.2)';
        ctx.strokeStyle = '#ffb77e';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.rect(-halfW, -halfH, halfW * 2, halfH * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  if (selected && obj.type === 'sticky_pad') {
    const target = getStickyPathHandleWorld(obj);
    if (target) {
      const start = worldToCanvas(layout, toFinite(obj.x, 0), toFinite(obj.y, 0));
      const end = worldToCanvas(layout, target.x, target.y);
      ctx.save();
      ctx.strokeStyle = '#ffaad9';
      ctx.lineWidth = 1.7;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.setLineDash([]);
      drawRingHandle(ctx, end.x, end.y, 5.2, {
        fill: 'rgba(8,16,36,0.95)',
        stroke: '#ffaad9',
      });
      const halfW = Math.max(0.08, toFinite(obj.width, 1.1)) * layout.scale;
      const halfH = Math.max(0.05, toFinite(obj.height, 0.24)) * layout.scale;
      const rotation = (Math.PI / 180) * normalizeDeg(toFinite(obj.rotation, 0));
      ctx.translate(end.x, end.y);
      ctx.rotate(rotation);
      ctx.fillStyle = 'rgba(255, 143, 201, 0.18)';
      ctx.strokeStyle = '#ffaad9';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.rect(-halfW, -halfH, halfW * 2, halfH * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
  if (selected && obj.type === 'rotor') {
    const endHandles = getRotorEndHandlesWorld(obj);
    ctx.save();
    for (let index = 0; index < endHandles.length; index += 1) {
      const p = worldToCanvas(layout, endHandles[index].x, endHandles[index].y);
      drawRingHandle(ctx, p.x, p.y, 5.2, {
        fill: 'rgba(8,16,36,0.95)',
        stroke: '#ffd44d',
      });
    }
    ctx.restore();
  }
}

function drawCreateDragPreview(ctx, layout, drag) {
  if (!drag || drag.type !== 'create') {
    return;
  }
  const start = drag.startWorld;
  const current = drag.currentWorld || start;
  if (!start || !current) {
    return;
  }
  const tool = String(drag.tool || '');
  if (tool === 'spawn_point') {
    const p = worldToCanvas(layout, current.x, current.y);
    ctx.save();
    ctx.strokeStyle = '#7ff8be';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x - 8, p.y);
    ctx.lineTo(p.x + 8, p.y);
    ctx.moveTo(p.x, p.y - 8);
    ctx.lineTo(p.x, p.y + 8);
    ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.save();
  if (tool === 'peg_circle'
    || tool === 'portal'
    || tool === 'black_hole'
    || tool === 'white_hole'
    || tool === 'burst_bumper'
    || tool === 'physics_ball') {
    const center = worldToCanvas(layout, start.x, start.y);
    const radiusWorld = Math.max(0.08, Math.hypot(current.x - start.x, current.y - start.y));
    const radius = radiusWorld * layout.scale;
    ctx.fillStyle = 'rgba(120, 217, 255, 0.2)';
    ctx.strokeStyle = '#88d9ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (tool === 'portal' || tool === 'black_hole' || tool === 'burst_bumper') {
      const trigger = (radiusWorld + 0.45) * layout.scale;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(center.x, center.y, trigger, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
    return;
  }
  if (tool === 'rotor') {
    const centerX = (start.x + current.x) / 2;
    const centerY = (start.y + current.y) / 2;
    const length = Math.max(0.2, Math.hypot(current.x - start.x, current.y - start.y));
    let angleDeg = (Math.atan2(current.y - start.y, current.x - start.x) * 180) / Math.PI;
    if (drag.shiftKey) {
      angleDeg = snapAngleDeg(angleDeg, 45);
    }
    const center = worldToCanvas(layout, centerX, centerY);
    ctx.translate(center.x, center.y);
    ctx.rotate((Math.PI / 180) * angleDeg);
    const halfWidth = (length / 2) * layout.scale;
    const halfHeight = Math.max(0.08, 0.12) * layout.scale;
    ctx.fillStyle = 'rgba(255, 143, 168, 0.23)';
    ctx.strokeStyle = '#ff8fa8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(-halfWidth, -halfHeight, halfWidth * 2, halfHeight * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-halfWidth, 0, 4, 0, Math.PI * 2);
    ctx.arc(halfWidth, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  if (tool === 'wall_segment' || tool === 'wall_corridor_segment') {
    let target = { x: current.x, y: current.y };
    if (drag.shiftKey) {
      target = snapPointBy45(start, target);
    }
    const p1 = worldToCanvas(layout, start.x, start.y);
    const p2 = worldToCanvas(layout, target.x, target.y);
    ctx.strokeStyle = OBJECT_COLOR_PRESET.wall;
    ctx.lineWidth = 2.6;
    ctx.setLineDash([8, 5]);
    if (tool === 'wall_corridor_segment') {
      const gap = getCorridorGapInput();
      const dx = target.x - start.x;
      const dy = target.y - start.y;
      const length = Math.hypot(dx, dy);
      if (length > 0.0001) {
        const nx = (-dy / length) * (gap / 2);
        const ny = (dx / length) * (gap / 2);
        const left1 = worldToCanvas(layout, start.x + nx, start.y + ny);
        const left2 = worldToCanvas(layout, target.x + nx, target.y + ny);
        const right1 = worldToCanvas(layout, start.x - nx, start.y - ny);
        const right2 = worldToCanvas(layout, target.x - nx, target.y - ny);
        ctx.beginPath();
        ctx.moveTo(left1.x, left1.y);
        ctx.lineTo(left2.x, left2.y);
        ctx.moveTo(right1.x, right1.y);
        ctx.lineTo(right2.x, right2.y);
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    drawRingHandle(ctx, p1.x, p1.y, 4.8, { fill: 'rgba(8,16,36,0.95)', stroke: '#ffd44d' });
    drawRingHandle(ctx, p2.x, p2.y, 4.8, { fill: 'rgba(8,16,36,0.95)', stroke: '#ffd44d' });
    ctx.restore();
    return;
  }
  if (tool === 'diamond_block') {
    const half = Math.max(0.08, Math.max(Math.abs(current.x - start.x), Math.abs(current.y - start.y)) / 2);
    const cx = (start.x + current.x) / 2;
    const cy = (start.y + current.y) / 2;
    const center = worldToCanvas(layout, cx, cy);
    const extent = half * layout.scale;
    ctx.translate(center.x, center.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = 'rgba(106, 255, 234, 0.18)';
    ctx.strokeStyle = '#6affea';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(-extent, -extent, extent * 2, extent * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    return;
  }

  const p1 = worldToCanvas(layout, start.x, start.y);
  const p2 = worldToCanvas(layout, current.x, current.y);
  const left = Math.min(p1.x, p2.x);
  const top = Math.min(p1.y, p2.y);
  const width = Math.abs(p2.x - p1.x);
  const height = Math.abs(p2.y - p1.y);
  if (tool === 'sticky_pad') {
    ctx.fillStyle = 'rgba(255, 143, 201, 0.22)';
    ctx.strokeStyle = '#ff8fc9';
  } else if (tool === 'domino_block') {
    ctx.fillStyle = 'rgba(255, 103, 190, 0.2)';
    ctx.strokeStyle = '#ff67be';
  } else if (tool === 'goal_marker_image') {
    ctx.fillStyle = 'rgba(255, 140, 207, 0.22)';
    ctx.strokeStyle = '#ffc4e7';
  } else {
    ctx.fillStyle = tool === 'hammer' ? 'rgba(255, 165, 87, 0.22)' : 'rgba(126, 208, 255, 0.2)';
    ctx.strokeStyle = tool === 'hammer' ? '#ffa557' : '#8dd6ff';
  }
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.rect(left, top, width, height);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawMakerCanvas() {
  const layout = getCanvasLayout();
  if (!layout) {
    return;
  }
  const ctx = layout.canvas.getContext('2d');
  if (!ctx) {
    return;
  }

  ctx.clearRect(0, 0, layout.width, layout.height);
  ctx.fillStyle = '#081226';
  ctx.fillRect(0, 0, layout.width, layout.height);
  ctx.strokeStyle = 'rgba(99, 131, 178, 0.26)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= WORLD_WIDTH; x += 2) {
    const p1 = worldToCanvas(layout, x, 0);
    const p2 = worldToCanvas(layout, x, layout.stageGoalY);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
  const stepY = layout.stageGoalY > 220 ? 20 : 10;
  for (let y = 0; y <= layout.stageGoalY; y += stepY) {
    const p1 = worldToCanvas(layout, 0, y);
    const p2 = worldToCanvas(layout, WORLD_WIDTH, y);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
  ctx.strokeStyle = '#62a5ff';
  ctx.lineWidth = 2;
  ctx.strokeRect(layout.offsetX, layout.offsetY, layout.drawW, layout.drawH);

  const stageBounds = inferStageWallBounds(getMutableMap());
  const leftGuide = worldToCanvas(layout, stageBounds.leftX, 0);
  const leftGuideBottom = worldToCanvas(layout, stageBounds.leftX, layout.stageGoalY);
  const rightGuide = worldToCanvas(layout, stageBounds.rightX, 0);
  const rightGuideBottom = worldToCanvas(layout, stageBounds.rightX, layout.stageGoalY);
  ctx.strokeStyle = 'rgba(255, 124, 200, 0.98)';
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.moveTo(leftGuide.x, leftGuide.y);
  ctx.lineTo(leftGuideBottom.x, leftGuideBottom.y);
  ctx.moveTo(rightGuide.x, rightGuide.y);
  ctx.lineTo(rightGuideBottom.x, rightGuideBottom.y);
  ctx.stroke();

  const goalY = getGoalYWorld();
  const goalP1 = worldToCanvas(layout, 0, goalY);
  const goalP2 = worldToCanvas(layout, WORLD_WIDTH, goalY);
  ctx.strokeStyle = 'rgba(255, 113, 113, 0.98)';
  ctx.lineWidth = 2.2;
  ctx.setLineDash([9, 5]);
  ctx.beginPath();
  ctx.moveTo(goalP1.x, goalP1.y);
  ctx.lineTo(goalP2.x, goalP2.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#ff8686';
  ctx.font = `${Math.max(11, Math.round(12 * layout.dpr))}px Segoe UI`;
  ctx.fillText('GOAL', goalP2.x - (40 * layout.dpr), goalP2.y - (6 * layout.dpr));
  drawRingHandle(ctx, goalP2.x, goalP2.y, 5.2 * layout.dpr, {
    fill: 'rgba(32, 9, 14, 0.95)',
    stroke: '#ff8686',
    lineWidth: 2 * layout.dpr,
  });

  const spawn = getSpawnPointWorld();
  const spawnCanvas = worldToCanvas(layout, spawn.x, spawn.y);
  ctx.strokeStyle = '#7ff8be';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(spawnCanvas.x - 8, spawnCanvas.y);
  ctx.lineTo(spawnCanvas.x + 8, spawnCanvas.y);
  ctx.moveTo(spawnCanvas.x, spawnCanvas.y - 8);
  ctx.lineTo(spawnCanvas.x, spawnCanvas.y + 8);
  ctx.stroke();
  ctx.fillStyle = 'rgba(127, 248, 190, 0.2)';
  ctx.beginPath();
  ctx.arc(spawnCanvas.x, spawnCanvas.y, 7, 0, Math.PI * 2);
  ctx.fill();
  drawRingHandle(ctx, spawnCanvas.x, spawnCanvas.y, 5.2, {
    fill: 'rgba(8, 20, 16, 0.95)',
    stroke: '#7ff8be',
    lineWidth: 1.8,
  });
  ctx.fillStyle = '#7ff8be';
  ctx.fillText('SPAWN', spawnCanvas.x + (8 * layout.dpr), spawnCanvas.y - (8 * layout.dpr));

  const objects = getObjects();
  for (let index = 0; index < objects.length; index += 1) {
    drawObjectOnCanvas(ctx, layout, objects[index], index === editorState.selectedIndex);
  }

  if (editorState.pendingWallStart) {
    const p = worldToCanvas(layout, editorState.pendingWallStart.x, editorState.pendingWallStart.y);
    if (editorState.canvasHoverWorld) {
      const hoverWorld = { x: editorState.canvasHoverWorld.x, y: editorState.canvasHoverWorld.y };
      const hover = worldToCanvas(layout, hoverWorld.x, hoverWorld.y);
      ctx.strokeStyle = '#ffd44d';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([6, 4]);
      if (editorState.pendingWallType === 'wall_corridor_polyline') {
        const start = editorState.pendingWallStart;
        const dx = hoverWorld.x - toFinite(start.x, 0);
        const dy = hoverWorld.y - toFinite(start.y, 0);
        const length = Math.hypot(dx, dy);
        if (length > 0.0001) {
          const gap = getCorridorGapInput();
          const nx = (-dy / length) * (gap / 2);
          const ny = (dx / length) * (gap / 2);
          const leftStart = worldToCanvas(layout, toFinite(start.x, 0) + nx, toFinite(start.y, 0) + ny);
          const leftEnd = worldToCanvas(layout, hoverWorld.x + nx, hoverWorld.y + ny);
          const rightStart = worldToCanvas(layout, toFinite(start.x, 0) - nx, toFinite(start.y, 0) - ny);
          const rightEnd = worldToCanvas(layout, hoverWorld.x - nx, hoverWorld.y - ny);
          ctx.beginPath();
          ctx.moveTo(leftStart.x, leftStart.y);
          ctx.lineTo(leftEnd.x, leftEnd.y);
          ctx.moveTo(rightStart.x, rightStart.y);
          ctx.lineTo(rightEnd.x, rightEnd.y);
          ctx.stroke();
        }
      } else {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(hover.x, hover.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    ctx.fillStyle = '#ffd44d';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  if (editorState.pendingPortalOid) {
    const objects = getObjects();
    const pending = objects.find((item) => item && item.oid === editorState.pendingPortalOid);
    if (pending) {
      const p = worldToCanvas(layout, pending.x, pending.y);
      ctx.strokeStyle = '#c18bff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(9, toFinite(pending.radius, 0.6) * layout.scale + 6), 0, Math.PI * 2);
      ctx.stroke();
      if (editorState.canvasHoverWorld) {
        const hover = worldToCanvas(layout, editorState.canvasHoverWorld.x, editorState.canvasHoverWorld.y);
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(hover.x, hover.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  if (editorState.pendingHammerOid) {
    const objects = getObjects();
    const directional = objects.find(
      (item) =>
        item &&
        item.oid === editorState.pendingHammerOid &&
        (item.type === 'hammer' || item.type === 'fan' || item.type === 'sticky_pad'),
    );
    if (directional) {
      const isFan = directional.type === 'fan';
      const isSticky = directional.type === 'sticky_pad';
      const center = worldToCanvas(layout, directional.x, directional.y);
      const hoverWorld = editorState.canvasHoverWorld;
      const pathB = Array.isArray(directional.pathB) ? directional.pathB : null;
      const stickyTargetX = pathB ? toFinite(pathB[0], toFinite(directional.x, 0) + 2.4) : toFinite(directional.x, 0) + 2.4;
      const stickyTargetY = pathB ? toFinite(pathB[1], toFinite(directional.y, 0)) : toFinite(directional.y, 0);
      const baseRad = (Math.PI / 180) * toFinite(directional.dirDeg, isFan ? 0 : 90);
      const targetWorld = hoverWorld
        ? { x: hoverWorld.x, y: hoverWorld.y }
        : (isSticky
          ? { x: stickyTargetX, y: stickyTargetY }
          : {
            x: toFinite(directional.x, 0) + Math.cos(baseRad) * Math.max(0.2, toFinite(directional.hitDistance, isFan ? 2.8 : 1)),
            y: toFinite(directional.y, 0) + Math.sin(baseRad) * Math.max(0.2, toFinite(directional.hitDistance, isFan ? 2.8 : 1)),
          });
      const target = worldToCanvas(layout, targetWorld.x, targetWorld.y);
      ctx.save();
      ctx.strokeStyle = isSticky ? '#ffaad9' : (isFan ? '#8fe6ff' : '#9fd7ff');
      ctx.lineWidth = 1.8;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
      ctx.setLineDash([]);
      drawRingHandle(ctx, target.x, target.y, 5.2, {
        fill: 'rgba(8,16,36,0.94)',
        stroke: isSticky ? '#ffaad9' : (isFan ? '#8fe6ff' : '#9fd7ff'),
        lineWidth: 1.6,
      });
      const dir = Math.atan2(target.y - center.y, target.x - center.x);
      const distWorld = Math.max(
        0.2,
        Math.hypot(
          targetWorld.x - toFinite(directional.x, 0),
          targetWorld.y - toFinite(directional.y, 0),
        ),
      );
      const hitX = toFinite(directional.x, 0) + Math.cos(dir) * distWorld;
      const hitY = toFinite(directional.y, 0) + Math.sin(dir) * distWorld;
      if (isFan) {
        const zone = fanZoneConfig(directional);
        if (zone) {
          drawFanWaveZone(ctx, layout, zone, {
            alpha: 1,
            strokeStyle: 'rgba(143, 230, 255, 0.98)',
            waveStroke: 'rgba(189, 246, 255, 0.74)',
          });
        }
      } else if (isSticky) {
        const ghost = worldToCanvas(layout, targetWorld.x, targetWorld.y);
        const halfW = Math.max(0.08, toFinite(directional.width, 1.1)) * layout.scale;
        const halfH = Math.max(0.05, toFinite(directional.height, 0.24)) * layout.scale;
        const rotation = (Math.PI / 180) * normalizeDeg(toFinite(directional.rotation, 0));
        ctx.translate(ghost.x, ghost.y);
        ctx.rotate(rotation);
        ctx.fillStyle = 'rgba(255, 143, 201, 0.2)';
        ctx.strokeStyle = '#ffaad9';
        ctx.lineWidth = 1.45;
        ctx.beginPath();
        ctx.rect(-halfW, -halfH, halfW * 2, halfH * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        const ghost = worldToCanvas(layout, hitX, hitY);
        const halfW = Math.max(0.08, toFinite(directional.width, 0.9)) * layout.scale;
        const halfH = Math.max(0.05, toFinite(directional.height, 0.32)) * layout.scale;
        ctx.translate(ghost.x, ghost.y);
        ctx.rotate(dir);
        ctx.fillStyle = 'rgba(255, 165, 87, 0.2)';
        ctx.strokeStyle = '#ffb77e';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.rect(-halfW, -halfH, halfW * 2, halfH * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    } else {
      resetPendingHammer();
    }
  }

  drawCreateDragPreview(ctx, layout, editorState.dragState);
  positionFloatingObjectInspector(layout);
  drawMiniMap(layout);
}

function readCanvasWorldPoint(event) {
  const layout = getCanvasLayout();
  if (!layout) {
    return null;
  }
  const rect = layout.canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * layout.dpr;
  const y = (event.clientY - rect.top) * layout.dpr;
  return canvasToWorld(layout, x, y);
}

function readCanvasWorldPointRaw(event) {
  const layout = getCanvasLayout();
  if (!layout) {
    return null;
  }
  const rect = layout.canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * layout.dpr;
  const y = (event.clientY - rect.top) * layout.dpr;
  return canvasToWorldRaw(layout, x, y);
}

function setCanvasPanningState(active) {
  editorState.isCanvasPanning = active === true;
  if (elements.makerCanvas) {
    elements.makerCanvas.classList.toggle('panning', editorState.isCanvasPanning);
  }
}

function handleMakerCanvasWheel(event) {
  if (!elements.makerCanvas) {
    return;
  }
  event.preventDefault();
  const oldLayout = getCanvasLayout();
  if (!oldLayout) {
    return;
  }
  const rect = oldLayout.canvas.getBoundingClientRect();
  const px = (event.clientX - rect.left) * oldLayout.dpr;
  const py = (event.clientY - rect.top) * oldLayout.dpr;
  const worldPoint = canvasToWorld(oldLayout, px, py);

  const direction = event.deltaY < 0 ? 1 : -1;
  const zoomFactor = direction > 0 ? 1.36 : 1 / 1.36;
  const previousZoom = clamp(toFinite(editorState.canvasZoom, 1), CANVAS_MIN_ZOOM, CANVAS_MAX_ZOOM);
  const nextZoom = clamp(previousZoom * zoomFactor, CANVAS_MIN_ZOOM, CANVAS_MAX_ZOOM);
  if (Math.abs(nextZoom - previousZoom) < 0.0001) {
    return;
  }
  editorState.canvasZoom = nextZoom;

  const newLayout = getCanvasLayout();
  if (!newLayout) {
    drawMakerCanvas();
    return;
  }
  const pinned = worldToCanvas(newLayout, worldPoint.x, worldPoint.y);
  editorState.canvasPanX += px - pinned.x;
  editorState.canvasPanY += py - pinned.y;
  drawMakerCanvas();
  updateMakerHint(`좌표맵 줌: ${round2(nextZoom)}x`);
}

function beginMakerCanvasPan(event) {
  if (event.button !== 1) {
    return;
  }
  event.preventDefault();
  const layout = getCanvasLayout();
  if (!layout) {
    return;
  }
  editorState.canvasPanLastX = event.clientX * layout.dpr;
  editorState.canvasPanLastY = event.clientY * layout.dpr;
  setCanvasPanningState(true);
}

function updateMakerCanvasPan(event) {
  if (!editorState.isCanvasPanning) {
    return;
  }
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const currentX = event.clientX * dpr;
  const currentY = event.clientY * dpr;
  const dx = currentX - toFinite(editorState.canvasPanLastX, currentX);
  const dy = currentY - toFinite(editorState.canvasPanLastY, currentY);
  editorState.canvasPanLastX = currentX;
  editorState.canvasPanLastY = currentY;
  editorState.canvasPanX += dx;
  editorState.canvasPanY += dy;
  drawMakerCanvas();
}

function endMakerCanvasPan() {
  if (!editorState.isCanvasPanning) {
    return;
  }
  setCanvasPanningState(false);
}

function updateCanvasHoverPoint(event) {
  if (!elements.makerCanvas) {
    return;
  }
  const rect = elements.makerCanvas.getBoundingClientRect();
  const inside = event.clientX >= rect.left
    && event.clientX <= rect.right
    && event.clientY >= rect.top
    && event.clientY <= rect.bottom;
  if (!inside && !editorState.dragState) {
    editorState.canvasHoverWorld = null;
    return;
  }
  const point = readCanvasWorldPoint(event);
  if (!point) {
    return;
  }
  if (isPolylineTool(selectedTool()) && editorState.pendingWallStart && event.shiftKey) {
    editorState.canvasHoverWorld = snapPointBy45(editorState.pendingWallStart, point);
    return;
  }
  editorState.canvasHoverWorld = point;
}

function beginMoveDrag(index, point) {
  const objects = getObjects();
  if (index < 0 || index >= objects.length) {
    return false;
  }
  const obj = objects[index];
  const anchor = getObjectAnchorWorld(obj);
  editorState.dragState = {
    type: 'move',
    index,
    offsetX: round2(point.x - anchor.x),
    offsetY: round2(point.y - anchor.y),
    anchorX: anchor.x,
    anchorY: anchor.y,
    moved: false,
  };
  return true;
}

function beginHandleDrag(index, handle) {
  if (!handle || !Number.isFinite(index)) {
    return false;
  }
  if (handle.kind === 'move_anchor') {
    const objects = getObjects();
    const obj = objects[index];
    if (!obj) {
      return false;
    }
    const anchor = getObjectAnchorWorld(obj);
    editorState.dragState = {
      type: 'move',
      index,
      offsetX: 0,
      offsetY: 0,
      moved: false,
      anchorX: anchor.x,
      anchorY: anchor.y,
    };
    return true;
  }
  if (handle.kind === 'wall_point') {
    editorState.dragState = {
      type: 'wall_point',
      index,
      pointIndex: handle.pointIndex,
      moved: false,
    };
    return true;
  }
  if (handle.kind === 'radius' || handle.kind === 'trigger_radius') {
    editorState.dragState = {
      type: handle.kind,
      index,
      moved: false,
    };
    return true;
  }
  if (handle.kind === 'size_x' || handle.kind === 'size_y') {
    editorState.dragState = {
      type: handle.kind,
      index,
      moved: false,
    };
    return true;
  }
  if (handle.kind === 'rotation') {
    editorState.dragState = {
      type: 'rotation',
      index,
      moved: false,
    };
    return true;
  }
  if (handle.kind === 'hammer_dir') {
    editorState.dragState = {
      type: 'hammer_dir',
      index,
      moved: false,
    };
    return true;
  }
  if (handle.kind === 'sticky_target') {
    editorState.dragState = {
      type: 'sticky_target',
      index,
      moved: false,
    };
    return true;
  }
  if (handle.kind === 'rotor_end') {
    editorState.dragState = {
      type: 'rotor_end',
      index,
      endSign: handle.endSign === -1 ? -1 : 1,
      moved: false,
      shiftKey: false,
    };
    return true;
  }
  return false;
}

function beginStageHandleDrag(handle, options = {}) {
  if (!handle) {
    return false;
  }
  if (handle.kind === 'spawn') {
    editorState.dragState = {
      type: 'spawn_move',
      moved: false,
    };
    return true;
  }
  if (handle.kind === 'goal') {
    const startClientY = toFinite(options.startClientY, NaN);
    const startScale = toFinite(options.startScale, NaN);
    const startDpr = toFinite(options.startDpr, Math.max(1, window.devicePixelRatio || 1));
    editorState.dragState = {
      type: 'goal_move',
      moved: false,
      startGoalY: getGoalYWorld(),
      startClientY: Number.isFinite(startClientY) ? startClientY : null,
      startScale: Number.isFinite(startScale) ? Math.max(0.001, startScale) : null,
      startDpr: Number.isFinite(startDpr) ? Math.max(1, startDpr) : 1,
    };
    return true;
  }
  return false;
}

function beginCreateDrag(tool, point, shiftKey = false) {
  editorState.dragState = {
    type: 'create',
    tool: String(tool || ''),
    startWorld: { x: point.x, y: point.y },
    currentWorld: { x: point.x, y: point.y },
    moved: false,
    shiftKey: shiftKey === true,
  };
}

function createHammerFromDrag(startWorld, endWorld) {
  const mapJson = getMutableMap();
  const goalY = Math.max(25, toFinite(mapJson.stage && mapJson.stage.goalY, 210) + 4);
  const start = clampWorldPoint(startWorld, goalY);
  const end = clampWorldPoint(endWorld, goalY);
  const minSize = 0.08;
  const fullWidth = Math.max(minSize, Math.abs(end.x - start.x));
  const fullHeight = Math.max(minSize, Math.abs(end.y - start.y));
  const centerX = round1((start.x + end.x) / 2);
  const centerY = round1((start.y + end.y) / 2);
  const halfWidth = round1(Math.max(0.12, fullWidth / 2));
  const halfHeight = round1(Math.max(0.08, fullHeight / 2));
  return {
    oid: nextOid('hammer'),
    type: 'hammer',
    x: centerX,
    y: centerY,
    width: halfWidth,
    height: halfHeight,
    rotation: 0,
    dirDeg: 90,
    force: 4.2,
    intervalMs: 1200,
    doubleHit: false,
    triggerRadius: round1(Math.max(0.45, Math.max(halfWidth, halfHeight) + 0.8)),
    cooldownMs: 320,
    swingDeg: 26,
    swingDurationMs: 220,
    hitDistance: round1(Math.max(0.25, Math.max(halfWidth, halfHeight) * 1.4)),
    color: OBJECT_COLOR_PRESET.hammer,
  };
}

function createFanFromDrag(startWorld, endWorld) {
  const mapJson = getMutableMap();
  const goalY = Math.max(25, toFinite(mapJson.stage && mapJson.stage.goalY, 210) + 4);
  const start = clampWorldPoint(startWorld, goalY);
  const end = clampWorldPoint(endWorld, goalY);
  const minSize = 0.08;
  const fullWidth = Math.max(minSize, Math.abs(end.x - start.x));
  const fullHeight = Math.max(minSize, Math.abs(end.y - start.y));
  const centerX = round1((start.x + end.x) / 2);
  const centerY = round1((start.y + end.y) / 2);
  const halfWidth = round1(Math.max(0.12, fullWidth / 2));
  const halfHeight = round1(Math.max(0.08, fullHeight / 2));
  return {
    oid: nextOid('fan'),
    type: 'fan',
    x: centerX,
    y: centerY,
    width: halfWidth,
    height: halfHeight,
    rotation: 0,
    dirDeg: 0,
    force: 0.32,
    triggerRadius: round1(Math.max(0.35, Math.max(halfWidth, halfHeight) + 0.35)),
    hitDistance: round1(Math.max(0.5, Math.max(halfWidth, halfHeight) * 2.8)),
    color: OBJECT_COLOR_PRESET.fan,
  };
}

function createStickyPadFromDrag(startWorld, endWorld) {
  const mapJson = getMutableMap();
  const goalY = Math.max(25, toFinite(mapJson.stage && mapJson.stage.goalY, 210) + 4);
  const start = clampWorldPoint(startWorld, goalY);
  const end = clampWorldPoint(endWorld, goalY);
  const minSize = 0.08;
  const fullWidth = Math.max(minSize, Math.abs(end.x - start.x));
  const fullHeight = Math.max(minSize, Math.abs(end.y - start.y));
  const centerX = round1((start.x + end.x) / 2);
  const centerY = round1((start.y + end.y) / 2);
  const halfWidth = round1(Math.max(0.12, fullWidth / 2));
  const halfHeight = round1(Math.max(0.06, fullHeight / 2));
  const pathB = [round1(clamp(centerX + Math.max(1.2, halfWidth * 2), 0.1, WORLD_WIDTH - 0.1)), centerY];
  return {
    oid: nextOid('sticky'),
    type: 'sticky_pad',
    x: centerX,
    y: centerY,
    width: halfWidth,
    height: halfHeight,
    rotation: 0,
    speed: 1.1,
    pauseMs: 220,
    stickyTopOnly: true,
    pathA: [centerX, centerY],
    pathB,
    color: OBJECT_COLOR_PRESET.sticky,
  };
}

function setHammerDirectionAndDistance(obj, point, shiftKey = false) {
  if (!obj || (obj.type !== 'hammer' && obj.type !== 'fan')) {
    return false;
  }
  const cx = toFinite(obj.x, 0);
  const cy = toFinite(obj.y, 0);
  let dx = toFinite(point && point.x, cx) - cx;
  let dy = toFinite(point && point.y, cy) - cy;
  let distance = Math.hypot(dx, dy);
  if (distance < 0.05) {
    distance = Math.max(0.2, toFinite(obj.hitDistance, 1.1));
    dx = distance;
    dy = 0;
  }
  let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (shiftKey) {
    angleDeg = snapAngleDeg(angleDeg, 45);
    const rad = (Math.PI / 180) * angleDeg;
    dx = Math.cos(rad) * distance;
    dy = Math.sin(rad) * distance;
  }
  obj.dirDeg = round1(normalizeDeg(angleDeg));
  obj.rotation = obj.dirDeg;
  obj.hitDistance = round1(clamp(Math.hypot(dx, dy), 0.2, 24));
  return true;
}

function setStickyPathTarget(obj, point, shiftKey = false) {
  if (!obj || obj.type !== 'sticky_pad') {
    return false;
  }
  const ax = toFinite(obj.x, 0);
  const ay = toFinite(obj.y, 0);
  let target = {
    x: toFinite(point && point.x, ax),
    y: toFinite(point && point.y, ay),
  };
  if (shiftKey) {
    target = snapPointBy45({ x: ax, y: ay }, target);
  }
  target.x = round1(clamp(target.x, 0.1, WORLD_WIDTH - 0.1));
  target.y = round1(clamp(target.y, 0.1, Math.max(25, getGoalYWorld() + 4)));
  obj.pathA = [round1(ax), round1(ay)];
  obj.pathB = [target.x, target.y];
  return true;
}

function createObjectFromDrag(tool, startWorld, endWorld, options = {}) {
  const mapJson = getMutableMap();
  const goalY = Math.max(25, toFinite(mapJson.stage && mapJson.stage.goalY, 210) + 4);
  const start = clampWorldPoint(startWorld, goalY);
  const end = clampWorldPoint(endWorld, goalY);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.hypot(dx, dy);
  const clickThreshold = 0.06;
  if (distance < clickThreshold) {
    const useDefaultSizeOnClick = tool === 'peg_circle'
      || tool === 'portal'
      || tool === 'black_hole'
      || tool === 'white_hole'
      || tool === 'burst_bumper'
      || tool === 'physics_ball'
      || tool === 'box_block'
      || tool === 'diamond_block'
      || tool === 'rotor'
      || tool === 'hammer'
      || tool === 'fan'
      || tool === 'sticky_pad'
      || tool === 'domino_block'
      || tool === 'goal_marker_image';
    if (useDefaultSizeOnClick) {
      const createdByClick = createObjectByTool(tool, end.x, end.y);
      if (createdByClick) {
        return createdByClick;
      }
    }
  }
  if (tool === 'wall_segment') {
    if (distance < clickThreshold) {
      const shortHalf = 0.8;
      const y = round1(start.y);
      const x1 = round1(clamp(start.x - shortHalf, 0.1, WORLD_WIDTH - 0.1));
      const x2 = round1(clamp(start.x + shortHalf, 0.1, WORLD_WIDTH - 0.1));
      if (Math.abs(x2 - x1) < clickThreshold) {
        return null;
      }
      return {
        oid: nextOid('wall'),
        type: 'wall_polyline',
        points: [[x1, y], [x2, y]],
        color: OBJECT_COLOR_PRESET.wall,
      };
    }
    let target = { x: end.x, y: end.y };
    if (options.shiftKey === true) {
      target = snapPointBy45(start, target);
    }
    return {
      oid: nextOid('wall'),
      type: 'wall_polyline',
      points: [[round1(start.x), round1(start.y)], [round1(target.x), round1(target.y)]],
      color: OBJECT_COLOR_PRESET.wall,
    };
  }
  if (tool === 'wall_corridor_segment') {
    if (distance < clickThreshold) {
      const shortHalf = 0.8;
      const y = round1(start.y);
      const x1 = round1(clamp(start.x - shortHalf, 0.1, WORLD_WIDTH - 0.1));
      const x2 = round1(clamp(start.x + shortHalf, 0.1, WORLD_WIDTH - 0.1));
      if (Math.abs(x2 - x1) < clickThreshold) {
        return null;
      }
      return {
        oid: nextOid('corridor'),
        type: 'wall_corridor_polyline',
        points: [[x1, y], [x2, y]],
        gap: getCorridorGapInput(),
        color: OBJECT_COLOR_PRESET.wall,
      };
    }
    let target = { x: end.x, y: end.y };
    if (options.shiftKey === true) {
      target = snapPointBy45(start, target);
    }
    return {
      oid: nextOid('corridor'),
      type: 'wall_corridor_polyline',
      points: [[round1(start.x), round1(start.y)], [round1(target.x), round1(target.y)]],
      gap: getCorridorGapInput(),
      color: OBJECT_COLOR_PRESET.wall,
    };
  }
  if (tool === 'hammer') {
    return createHammerFromDrag(start, end);
  }
  if (tool === 'fan') {
    return createFanFromDrag(start, end);
  }
  if (tool === 'sticky_pad') {
    return createStickyPadFromDrag(start, end);
  }
  if (tool === 'box_block' || tool === 'diamond_block' || tool === 'goal_marker_image') {
    const created = createObjectByTool(tool, (start.x + end.x) / 2, (start.y + end.y) / 2);
    if (!created) {
      return null;
    }
    created.x = round1((start.x + end.x) / 2);
    created.y = round1((start.y + end.y) / 2);
    if (tool === 'diamond_block') {
      const half = round1(Math.max(0.12, Math.max(Math.abs(dx), Math.abs(dy)) / 2));
      created.width = half;
      created.height = half;
    } else {
      const minHalfWidth = tool === 'goal_marker_image' ? 0.2 : 0.08;
      const minHalfHeight = tool === 'goal_marker_image' ? 0.2 : 0.05;
      created.width = round1(Math.max(minHalfWidth, Math.abs(dx) / 2));
      created.height = round1(Math.max(minHalfHeight, Math.abs(dy) / 2));
    }
    return created;
  }
  if (tool === 'rotor') {
    const created = createObjectByTool(tool, (start.x + end.x) / 2, (start.y + end.y) / 2);
    if (!created) {
      return null;
    }
    let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (options.shiftKey === true) {
      angleDeg = snapAngleDeg(angleDeg, 45);
    }
    created.x = round1((start.x + end.x) / 2);
    created.y = round1((start.y + end.y) / 2);
    created.width = round1(Math.max(0.2, distance / 2));
    created.height = round1(Math.max(0.05, toFinite(created.height, 0.12)));
    created.rotation = round1(normalizeDeg(angleDeg));
    return created;
  }
  if (tool === 'domino_block') {
    const created = createObjectByTool(tool, (start.x + end.x) / 2, (start.y + end.y) / 2);
    if (!created) {
      return null;
    }
    created.x = round1((start.x + end.x) / 2);
    created.y = round1((start.y + end.y) / 2);
    created.width = round1(Math.max(0.05, Math.abs(dx) / 2));
    created.height = round1(Math.max(0.08, Math.abs(dy) / 2));
    return created;
  }
  if (tool === 'peg_circle'
    || tool === 'portal'
    || tool === 'black_hole'
    || tool === 'white_hole'
    || tool === 'burst_bumper'
    || tool === 'physics_ball') {
    const created = createObjectByTool(tool, start.x, start.y);
    if (!created) {
      return null;
    }
    created.x = round1(start.x);
    created.y = round1(start.y);
    const nextRadius = round1(Math.max(0.08, distance));
    created.radius = nextRadius;
    if (tool === 'portal' || tool === 'black_hole' || tool === 'burst_bumper') {
      created.triggerRadius = round1(Math.max(nextRadius + 0.45, toFinite(created.triggerRadius, nextRadius + 0.45)));
    }
    return created;
  }
  return createObjectByTool(tool, end.x, end.y);
}

function updateObjectByDrag(point, event = null, rawPoint = null) {
  const drag = editorState.dragState;
  if (!drag) {
    return false;
  }
  if (drag.type === 'create') {
    drag.currentWorld = { x: point.x, y: point.y };
    drag.shiftKey = !!(event && event.shiftKey);
    drag.moved = true;
    drawMakerCanvas();
    return false;
  }
  if (drag.type === 'hammer_target') {
    const objects = getObjects();
    const index = Math.floor(toFinite(drag.index, -1));
    if (index < 0 || index >= objects.length) {
      return false;
    }
    const obj = objects[index];
    if (!obj || !isDirectionalTargetObject(obj)) {
      return false;
    }
    const updated = obj.type === 'sticky_pad'
      ? setStickyPathTarget(obj, point, !!(event && event.shiftKey))
      : setHammerDirectionAndDistance(obj, point, !!(event && event.shiftKey));
    if (!updated) {
      return false;
    }
    drag.moved = true;
    return true;
  }
  if (drag.type === 'spawn_move') {
    setSpawnPointWorld(point);
    drag.moved = true;
    syncStageInputsFromMap();
    return true;
  }
  if (drag.type === 'goal_move') {
    let nextY = rawPoint && Number.isFinite(toFinite(rawPoint.y, NaN))
      ? toFinite(rawPoint.y, point.y)
      : point.y;
    if (event && Number.isFinite(toFinite(drag.startClientY, NaN)) && Number.isFinite(toFinite(drag.startScale, NaN))) {
      const dpr = Math.max(1, toFinite(drag.startDpr, Math.max(1, window.devicePixelRatio || 1)));
      const deltaCanvasY = (toFinite(event.clientY, drag.startClientY) - toFinite(drag.startClientY, event.clientY)) * dpr;
      const worldDelta = deltaCanvasY / Math.max(0.001, toFinite(drag.startScale, 1));
      nextY = toFinite(drag.startGoalY, nextY) + worldDelta;
    }
    setGoalYWorld(nextY);
    drag.moved = true;
    syncStageInputsFromMap();
    return true;
  }
  const objects = getObjects();
  const index = Math.floor(toFinite(drag.index, -1));
  if (index < 0 || index >= objects.length) {
    return false;
  }
  const obj = objects[index];
  if (!obj || typeof obj !== 'object') {
    return false;
  }
  if (drag.type === 'wall_point') {
    const points = Array.isArray(obj.points) ? obj.points : [];
    const pointIndex = Math.floor(toFinite(drag.pointIndex, -1));
    if (pointIndex >= 0 && pointIndex < points.length) {
      let nextPoint = { x: point.x, y: point.y };
      if (event && event.shiftKey) {
        const anchorIndex = pointIndex === 0 ? 1 : pointIndex - 1;
        const anchor = points[anchorIndex];
        if (anchor) {
          nextPoint = snapPointBy45(
            { x: toFinite(anchor[0], nextPoint.x), y: toFinite(anchor[1], nextPoint.y) },
            nextPoint,
          );
        }
      }
      if (isBoundaryWallObject(obj)) {
        const safeX = round1(clamp(toFinite(nextPoint.x, 0), 0.1, WORLD_WIDTH - 0.1));
        for (let boundaryIndex = 0; boundaryIndex < points.length; boundaryIndex += 1) {
          points[boundaryIndex][0] = safeX;
        }
      } else {
        points[pointIndex][0] = round1(nextPoint.x);
        points[pointIndex][1] = round1(nextPoint.y);
      }
      drag.moved = true;
      return true;
    }
    return false;
  }
  if (drag.type === 'radius') {
    if (obj.type === 'peg_circle'
      || obj.type === 'portal'
      || obj.type === 'black_hole'
      || obj.type === 'white_hole'
      || obj.type === 'burst_bumper'
      || obj.type === 'physics_ball') {
      const cx = toFinite(obj.x, 0);
      const cy = toFinite(obj.y, 0);
      const nextRadius = Math.max(0.08, Math.hypot(point.x - cx, point.y - cy));
      obj.radius = round1(nextRadius);
      if (obj.type === 'portal' || obj.type === 'black_hole' || obj.type === 'burst_bumper') {
        obj.triggerRadius = round1(Math.max(nextRadius + 0.05, toFinite(obj.triggerRadius, nextRadius + 0.45)));
      }
      drag.moved = true;
      return true;
    }
    return false;
  }
  if (drag.type === 'trigger_radius') {
    if (obj.type === 'portal' || obj.type === 'black_hole' || obj.type === 'burst_bumper') {
      const cx = toFinite(obj.x, 0);
      const cy = toFinite(obj.y, 0);
      const minRadius = Math.max(toFinite(obj.radius, 0.6) + 0.05, 0.2);
      const nextTrigger = Math.max(minRadius, Math.hypot(point.x - cx, point.y - cy));
      obj.triggerRadius = round1(nextTrigger);
      drag.moved = true;
      return true;
    }
    return false;
  }
  if (drag.type === 'size_x' || drag.type === 'size_y') {
    const type = String(obj.type || '');
    if (type === 'box_block'
      || type === 'diamond_block'
      || type === 'hammer'
      || type === 'fan'
      || type === 'sticky_pad'
      || type === 'domino_block'
      || type === 'goal_marker_image') {
      const cx = toFinite(obj.x, 0);
      const cy = toFinite(obj.y, 0);
      const angleDeg = type === 'hammer' || type === 'fan'
        ? normalizeDeg(toFinite(obj.dirDeg, toFinite(obj.rotation, 0)))
        : normalizeDeg(toFinite(obj.rotation, 0));
      const rad = (Math.PI / 180) * angleDeg;
      const axisX = { x: Math.cos(rad), y: Math.sin(rad) };
      const axisY = { x: -Math.sin(rad), y: Math.cos(rad) };
      const vx = point.x - cx;
      const vy = point.y - cy;
      if (drag.type === 'size_x') {
        const proj = Math.abs(vx * axisX.x + vy * axisX.y);
        obj.width = round1(Math.max(0.08, proj));
      } else {
        const proj = Math.abs(vx * axisY.x + vy * axisY.y);
        obj.height = round1(Math.max(0.05, proj));
      }
      if (type === 'diamond_block') {
        const half = round1(Math.max(0.12, Math.max(toFinite(obj.width, 0.12), toFinite(obj.height, 0.12))));
        obj.width = half;
        obj.height = half;
      }
      drag.moved = true;
      return true;
    }
    return false;
  }
  if (drag.type === 'hammer_dir') {
    if (obj.type !== 'hammer' && obj.type !== 'fan') {
      return false;
    }
    const updated = setHammerDirectionAndDistance(obj, point, !!(event && event.shiftKey));
    if (!updated) {
      return false;
    }
    drag.moved = true;
    return true;
  }
  if (drag.type === 'sticky_target') {
    if (obj.type !== 'sticky_pad') {
      return false;
    }
    const updated = setStickyPathTarget(obj, point, !!(event && event.shiftKey));
    if (!updated) {
      return false;
    }
    drag.moved = true;
    return true;
  }
  if (drag.type === 'rotation') {
    const cx = toFinite(obj.x, 0);
    const cy = toFinite(obj.y, 0);
    const angleRad = Math.atan2(point.y - cy, point.x - cx);
    let nextRotation = round1((angleRad * 180) / Math.PI + 90);
    if (event && event.shiftKey) {
      nextRotation = snapAngleDeg(nextRotation, 45);
    }
    obj.rotation = normalizeDeg(nextRotation);
    drag.moved = true;
    return true;
  }
  if (drag.type === 'rotor_end' && obj.type === 'rotor') {
    const cx = toFinite(obj.x, 0);
    const cy = toFinite(obj.y, 0);
    let angleDeg = (Math.atan2(point.y - cy, point.x - cx) * 180) / Math.PI;
    if (drag.endSign === -1) {
      angleDeg += 180;
    }
    if (event && event.shiftKey) {
      angleDeg = snapAngleDeg(angleDeg, 45);
    }
    const distance = Math.max(0.08, Math.hypot(point.x - cx, point.y - cy));
    obj.rotation = round1(normalizeDeg(angleDeg));
    obj.width = round1(Math.max(0.08, distance));
    drag.moved = true;
    return true;
  }
  if (drag.type === 'move') {
    const mapJson = getMutableMap();
    const goalY = Math.max(25, toFinite(mapJson.stage && mapJson.stage.goalY, 210) + 4);
    let target = {
      x: clamp(toFinite(point.x - toFinite(drag.offsetX, 0), 0), 0, WORLD_WIDTH),
      y: clamp(toFinite(point.y - toFinite(drag.offsetY, 0), 0), 0, goalY),
    };
    if (event && event.shiftKey && Number.isFinite(toFinite(drag.anchorX, NaN)) && Number.isFinite(toFinite(drag.anchorY, NaN))) {
      const snapped = snapPointBy45(
        { x: toFinite(drag.anchorX, target.x), y: toFinite(drag.anchorY, target.y) },
        target,
      );
      target = {
        x: clamp(toFinite(snapped.x, target.x), 0, WORLD_WIDTH),
        y: clamp(toFinite(snapped.y, target.y), 0, goalY),
      };
    }
    moveObjectToWorld(obj, round1(target.x), round1(target.y));
    drag.moved = true;
    return true;
  }
  return false;
}

function finishDrag() {
  const drag = editorState.dragState;
  if (!drag) {
    return;
  }
  if (drag.type === 'create') {
    const tool = String(drag.tool || '');
    const start = drag.startWorld;
    const end = drag.currentWorld || drag.startWorld;
    if (tool === 'spawn_point') {
      setSpawnPointWorld(end);
      syncStageInputsFromMap();
      refreshCurrentJsonViewer();
      queueLiveDraftApply('시작점 이동');
      updateMakerHint('공 시작점 배치 완료');
      resetActiveDrag();
      drawMakerCanvas();
      return;
    }
    const created = createObjectFromDrag(tool, start, end, { shiftKey: drag.shiftKey === true });
    if (created && typeof created === 'object') {
      const objects = getObjects();
      objects.push(created);
      editorState.selectedIndex = objects.length - 1;
      if (tool === 'portal') {
        const firstPortalOid = String(editorState.pendingPortalOid || '').trim();
        if (!firstPortalOid) {
          editorState.pendingPortalOid = created.oid;
          updateMakerHint(`포털 A 생성: ${created.oid} → 다음 포털 배치 시 자동 연결`);
        } else {
          const firstPortal = objects.find((item) => item && item.oid === firstPortalOid);
          if (firstPortal && firstPortal !== created && linkPortalPairBidirectional(firstPortal, created)) {
            updateMakerHint(`포털 연결 완료: ${firstPortal.oid} ↔ ${created.oid}`);
          }
          editorState.pendingPortalOid = '';
        }
      } else {
        resetPendingPortal();
      }
      if (tool === 'hammer' || tool === 'fan' || tool === 'sticky_pad') {
        editorState.pendingHammerOid = String(created.oid || '');
        updateMakerHint(tool === 'fan'
          ? '선풍기 생성 완료: 드래그/클릭으로 바람 방향·거리 설정'
          : (tool === 'sticky_pad'
            ? '점착패드 생성 완료: 드래그/클릭으로 이동 목표점(B) 지정'
            : '해머 생성 완료: 드래그/클릭으로 타격 방향·이동거리 설정'));
      } else {
        resetPendingHammer();
      }
      syncObjectList();
      refreshCurrentJsonViewer();
      queueObjectLiveDraftApply(`${toolDisplayName(tool)} 생성`, { autoResumeAfterReset: true });
      if (tool !== 'portal') {
        updateMakerHint(`${toolDisplayName(tool)} 생성 완료: ${created.oid || ''}`);
      }
    }
    resetActiveDrag();
    drawMakerCanvas();
    return;
  }
  const moved = drag.moved === true;
  const dragType = String(drag.type || '');
  const objects = getObjects();
  const dragIndex = Math.floor(toFinite(drag.index, -1));
  const draggedObject = dragIndex >= 0 && dragIndex < objects.length ? objects[dragIndex] : null;
  const finishedHammerTarget = dragType === 'hammer_target';
  resetActiveDrag();
  if (moved) {
    syncObjectList();
    syncStageWallBoundsFromObjects();
    syncStageInputsFromMap();
    refreshCurrentJsonViewer();
    if (dragType === 'goal_move') {
      queueLiveDraftApply('골라인 이동');
    } else if (dragType === 'spawn_move') {
      queueLiveDraftApply('공 시작점 이동');
    } else if (dragType === 'hammer_target') {
      const type = draggedObject && draggedObject.type;
      if (type === 'fan') {
        queueObjectLiveDraftApply('선풍기 방향/거리 설정');
        updateMakerHint('선풍기 바람 방향 설정 완료');
      } else if (type === 'sticky_pad') {
        queueObjectLiveDraftApply('점착패드 이동 경로 설정');
        updateMakerHint('점착패드 A↔B 이동 경로 설정 완료');
      } else {
        queueObjectLiveDraftApply('해머 타격 방향/거리 설정');
        updateMakerHint('해머 타격 방향 설정 완료');
      }
    } else if (dragType === 'sticky_target') {
      queueObjectLiveDraftApply('점착패드 이동 경로 설정');
      updateMakerHint('점착패드 이동 목표점 수정 완료');
    } else {
      queueObjectLiveDraftApply('오브젝트 드래그 수정');
    }
  }
  if (finishedHammerTarget) {
    resetPendingHammer();
  }
  drawMakerCanvas();
}

function cancelDrag() {
  if (!editorState.dragState) {
    return;
  }
  resetActiveDrag();
  drawMakerCanvas();
}

function handleMakerCanvasPointerDown(event) {
  if (event.button !== 0) {
    return;
  }
  const point = readCanvasWorldPoint(event);
  if (!point) {
    return;
  }
  const layout = getCanvasLayout();
  const tool = selectedTool();
  const stageHandle = findStageHandle(point, layout);
  if (stageHandle) {
    rememberUndoState(stageHandle.kind === 'goal' ? '골라인 이동 시작' : '시작점 이동 시작');
    beginStageHandleDrag(stageHandle, {
      startClientY: event.clientY,
      startScale: layout ? layout.scale : null,
      startDpr: layout ? layout.dpr : null,
    });
    editorState.suppressClickOnce = true;
    updateMakerHint(stageHandle.kind === 'goal' ? '골라인 드래그 이동중' : '공 시작점 드래그 이동중');
    drawMakerCanvas();
    return;
  }
  if ((tool === 'hammer' || tool === 'fan' || tool === 'sticky_pad') && editorState.pendingHammerOid) {
    const objects = getObjects();
    const index = objects.findIndex(
      (item) =>
        item &&
        item.oid === editorState.pendingHammerOid &&
        (item.type === 'hammer' || item.type === 'fan' || item.type === 'sticky_pad'),
    );
    if (index >= 0) {
      const directionalType = objects[index] && objects[index].type;
      rememberUndoState(
        directionalType === 'fan'
          ? '선풍기 방향 설정 시작'
          : (directionalType === 'sticky_pad' ? '점착패드 경로 설정 시작' : '해머 타격 설정 시작'),
      );
      editorState.selectedIndex = index;
      editorState.dragState = {
        type: 'hammer_target',
        index,
        moved: false,
      };
      updateObjectByDrag(point, event);
      editorState.suppressClickOnce = true;
      syncObjectList();
      updateMakerHint(
        directionalType === 'fan'
          ? '선풍기 바람 방향/거리 설정중'
          : (directionalType === 'sticky_pad'
            ? '점착패드 이동 목표점 설정중'
            : '해머 타격 방향/이동거리 설정중'),
      );
      drawMakerCanvas();
      return;
    }
    resetPendingHammer();
  }
  const selectedIndex = editorState.selectedIndex;
  const selectedHandle = findSelectedHandle(point, layout);
  if (selectedIndex >= 0 && selectedHandle) {
    rememberUndoState(selectedHandle.kind === 'rotation' ? '회전 수정 시작' : '핸들 수정 시작');
    beginHandleDrag(selectedIndex, selectedHandle);
    editorState.suppressClickOnce = true;
    if (selectedHandle.kind === 'wall_point') {
      updateMakerHint('벽 끝점 드래그 편집중');
    } else if (selectedHandle.kind === 'rotor_end') {
      updateMakerHint('회전바 끝점 드래그 길이/각도 편집중');
    } else if (selectedHandle.kind === 'hammer_dir') {
      const selectedObj = getSelectedObject();
      updateMakerHint(selectedObj && selectedObj.type === 'fan'
        ? '선풍기 바람 방향/거리 드래그 편집중'
        : '해머 타격 방향/거리 드래그 편집중');
    } else if (selectedHandle.kind === 'sticky_target') {
      updateMakerHint('점착패드 이동 목표점 드래그 편집중');
    } else if (selectedHandle.kind === 'radius') {
      updateMakerHint('반지름 핸들 드래그 편집중');
    } else if (selectedHandle.kind === 'trigger_radius') {
      updateMakerHint('트리거 반경 핸들 드래그 편집중');
    } else if (selectedHandle.kind === 'size_x' || selectedHandle.kind === 'size_y') {
      updateMakerHint('크기 핸들 드래그 편집중');
    } else if (selectedHandle.kind === 'move_anchor') {
      updateMakerHint('중심 핸들 드래그 이동중');
    } else {
      updateMakerHint('회전 핸들 드래그 편집중');
    }
    drawMakerCanvas();
    return;
  }
  if (tool === 'select') {
    const nearestIndex = findNearestObjectIndex(point.x, point.y);
    editorState.selectedIndex = nearestIndex;
    syncObjectList({ preserveNoSelection: true });
    if (nearestIndex >= 0) {
      rememberUndoState('오브젝트 이동 시작');
      beginMoveDrag(nearestIndex, point);
      editorState.suppressClickOnce = true;
      updateMakerHint('오브젝트 드래그 이동중');
    } else {
      updateMakerHint('선택 해제됨');
    }
    drawMakerCanvas();
    return;
  }
  if (isPolylineTool(tool)) {
    rememberUndoState(`${toolDisplayName(tool)} 추가`);
    addObjectAt(tool, point.x, point.y, { snap45: event.shiftKey === true });
    editorState.suppressClickOnce = true;
    return;
  }
  rememberUndoState(`${toolDisplayName(tool)} 생성 시작`);
  beginCreateDrag(tool, point, event.shiftKey === true);
  editorState.suppressClickOnce = true;
  updateMakerHint(`${toolDisplayName(tool)} 드래그로 크기/방향 지정중`);
  drawMakerCanvas();
}

function handleMakerCanvasPointerMove(event) {
  const shouldTrackHover = !!(editorState.pendingWallStart || editorState.pendingPortalOid || editorState.pendingHammerOid || editorState.dragState);
  if (!shouldTrackHover) {
    if (editorState.canvasHoverWorld) {
      editorState.canvasHoverWorld = null;
      drawMakerCanvas();
    }
    return;
  }
  updateCanvasHoverPoint(event);
  const point = readCanvasWorldPoint(event);
  const rawPoint = readCanvasWorldPointRaw(event);
  if (!point || !editorState.dragState) {
    drawMakerCanvas();
    return;
  }
  const updated = updateObjectByDrag(point, event, rawPoint);
  if (updated) {
    refreshCurrentJsonViewer();
    populateObjectEditor();
    queueLiveDraftApply('드래그 편집');
  }
  drawMakerCanvas();
}

function handleMakerCanvasPointerUp(event) {
  if (event && event.button !== 0) {
    return;
  }
  finishDrag();
}

function beginMiniMapDrag(event) {
  if (!elements.miniMapCanvas || event.button !== 0) {
    return;
  }
  const point = readMiniMapWorldPoint(event);
  if (!point) {
    return;
  }
  event.preventDefault();
  editorState.isMiniMapDragging = true;
  centerCanvasToWorld(point.x, point.y);
}

function updateMiniMapDrag(event) {
  if (!editorState.isMiniMapDragging) {
    return;
  }
  const point = readMiniMapWorldPoint(event);
  if (!point) {
    return;
  }
  centerCanvasToWorld(point.x, point.y);
}

function endMiniMapDrag() {
  if (!editorState.isMiniMapDragging) {
    return;
  }
  editorState.isMiniMapDragging = false;
}

function addObjectAt(tool, x, y, options = {}) {
  const objects = getObjects();
  if (tool === 'spawn_point') {
    setSpawnPointWorld({ x, y });
    syncStageInputsFromMap();
    refreshCurrentJsonViewer();
    queueLiveDraftApply('공 시작점 변경');
    drawMakerCanvas();
    updateMakerHint('공 시작점 위치가 변경되었습니다.');
    return;
  }
  if (isPolylineTool(tool)) {
    const wallType = String(tool || 'wall_polyline');
    const useSnap45 = options.snap45 === true;
    if (!editorState.pendingWallStart || !editorState.pendingWallType || editorState.pendingWallType !== wallType) {
      editorState.pendingWallStart = { x, y };
      editorState.pendingWallOid = '';
      editorState.pendingWallType = wallType;
      updateMakerHint(`${toolDisplayName(wallType)} 시작점 설정됨 (${x}, ${y}) → 다음 클릭으로 점 연결`);
      drawMakerCanvas();
      return;
    }
    const start = editorState.pendingWallStart;
    let endPoint = { x: toFinite(x, 0), y: toFinite(y, 0) };
    if (useSnap45) {
      endPoint = snapPointBy45(start, endPoint);
    }
    const length = Math.hypot(endPoint.x - toFinite(start.x, 0), endPoint.y - toFinite(start.y, 0));
    if (length < 0.06) {
      updateMakerHint('벽 길이가 너무 짧습니다. 다른 위치를 클릭하세요.');
      drawMakerCanvas();
      return;
    }
    if (!editorState.pendingWallOid) {
      const created = {
        oid: wallType === 'wall_corridor_polyline' ? nextOid('corridor') : nextOid('wall'),
        type: wallType === 'wall_corridor_polyline' ? 'wall_corridor_polyline' : 'wall_polyline',
        points: [[start.x, start.y], [endPoint.x, endPoint.y]],
        gap: wallType === 'wall_corridor_polyline' ? getCorridorGapInput() : undefined,
        color: OBJECT_COLOR_PRESET.wall,
      };
      objects.push(created);
      editorState.pendingWallOid = created.oid;
      editorState.selectedIndex = objects.length - 1;
    } else {
      const target = objects.find((item) => item && item.oid === editorState.pendingWallOid);
      if (!target || !isPolylineObject(target)) {
        editorState.pendingWallOid = '';
      }
      const targetWall = objects.find((item) => item && item.oid === editorState.pendingWallOid);
      if (targetWall && isPolylineObject(targetWall) && Array.isArray(targetWall.points)) {
        targetWall.points.push([endPoint.x, endPoint.y]);
        if (targetWall.type === 'wall_corridor_polyline' || targetWall.type === 'wall_corridor_segment') {
          targetWall.gap = corridorGapForObject(targetWall, getCorridorGapInput());
        }
        editorState.selectedIndex = objects.findIndex((item) => item === targetWall);
      } else {
        const created = {
          oid: wallType === 'wall_corridor_polyline' ? nextOid('corridor') : nextOid('wall'),
          type: wallType === 'wall_corridor_polyline' ? 'wall_corridor_polyline' : 'wall_polyline',
          points: [[start.x, start.y], [endPoint.x, endPoint.y]],
          gap: wallType === 'wall_corridor_polyline' ? getCorridorGapInput() : undefined,
          color: OBJECT_COLOR_PRESET.wall,
        };
        objects.push(created);
        editorState.pendingWallOid = created.oid;
        editorState.selectedIndex = objects.length - 1;
      }
    }
    editorState.pendingWallStart = { x: endPoint.x, y: endPoint.y };
    updateMakerHint(`${toolDisplayName(wallType)} 입력중: 클릭한 점을 계속 이어 그립니다. 우클릭 종료`);
  } else if (tool === 'portal') {
    const created = createObjectByTool(tool, x, y);
    if (!created) {
      return;
    }
    objects.push(created);
    editorState.selectedIndex = objects.length - 1;
    const firstPortalOid = String(editorState.pendingPortalOid || '').trim();
    if (!firstPortalOid) {
      editorState.pendingPortalOid = created.oid;
      updateMakerHint(`포털 A 생성: ${created.oid} → 다음 클릭 위치에 포털 B를 생성해 자동 연결`);
    } else {
      const firstPortal = objects.find((item) => item && item.oid === firstPortalOid);
      if (firstPortal && firstPortal !== created && linkPortalPairBidirectional(firstPortal, created)) {
        updateMakerHint(`포털 연결 완료: ${firstPortal.oid} ↔ ${created.oid}`);
      } else {
        updateMakerHint('포털 연결 대상이 없어 새 포털 A를 기준으로 다시 시작합니다.');
      }
      editorState.pendingPortalOid = '';
    }
  } else {
    const created = createObjectByTool(tool, x, y);
    if (!created) {
      return;
    }
    objects.push(created);
    if (tool !== 'portal') {
      resetPendingPortal();
    }
    if (tool === 'hammer' || tool === 'fan' || tool === 'sticky_pad') {
      editorState.pendingHammerOid = String(created.oid || '');
      updateMakerHint(
        tool === 'fan'
          ? '선풍기 생성 완료: 드래그/클릭으로 바람 방향·거리 설정'
          : (tool === 'sticky_pad'
            ? '점착패드 생성 완료: 드래그/클릭으로 이동 목표점(B) 지정'
            : '해머 생성 완료: 드래그/클릭으로 타격 방향·이동거리 설정'),
      );
    } else {
      resetPendingHammer();
    }
  }
  if (!isPolylineTool(tool)) {
    editorState.selectedIndex = objects.length - 1;
  }
  syncObjectList();
  refreshCurrentJsonViewer();
  queueObjectLiveDraftApply('오브젝트 추가', { autoResumeAfterReset: true });
  drawMakerCanvas();
}

function handleMakerCanvasClick(event) {
  if (editorState.suppressClickOnce) {
    editorState.suppressClickOnce = false;
    return;
  }
  const point = readCanvasWorldPoint(event);
  if (!point) {
    return;
  }
  const tool = selectedTool();
  if (tool === 'select') {
    editorState.selectedIndex = findNearestObjectIndex(point.x, point.y);
    syncObjectList({ preserveNoSelection: true });
    if (editorState.selectedIndex < 0) {
      updateMakerHint('선택 해제됨');
    }
    drawMakerCanvas();
    return;
  }
  addObjectAt(tool, point.x, point.y, { snap45: event.shiftKey === true });
}

async function waitForEngineApi(timeoutMs = 20000) {
  if (FILE_PROTOCOL) {
    throw new Error('file:// 경로에서는 엔진 모듈이 차단됩니다. tools/start_pinball_map_maker_v2.bat 로 실행하세요');
  }
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const diagnostics = readEngineFrameDiagnostics();
    if (diagnostics.bootError) {
      throw new Error(`엔진 부팅 오류: ${diagnostics.bootError}`);
    }
    const api = getEngineApi();
    if (api && typeof api.init === 'function') {
      return api;
    }
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  const diagnostics = readEngineFrameDiagnostics();
  throw new Error(`엔진 API 대기 시간 초과. ${formatEngineDiagnostics(diagnostics)}`);
}

async function waitForPreviewApi(timeoutMs = 20000) {
  if (FILE_PROTOCOL) {
    throw new Error('file:// 경로에서는 좌표창 엔진 모듈이 차단됩니다.');
  }
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const api = getPreviewApi();
    if (api && typeof api.init === 'function') {
      return api;
    }
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  throw new Error('좌표창 엔진 API 대기 시간 초과');
}

async function withEngineAction(action, options = {}) {
  const shouldRethrow = options.rethrow === true;
  setBusy(true);
  try {
    const api = await waitForEngineApi();
    return await action(api);
  } catch (error) {
    setStatus(String(error && error.message ? error.message : error), 'error');
    if (shouldRethrow) {
      throw error;
    }
    return null;
  } finally {
    setBusy(false);
  }
}

async function withPreviewAction(action, options = {}) {
  if (!elements.previewFrame) {
    return null;
  }
  const silent = options.silent !== false;
  try {
    const api = await waitForPreviewApi(8000);
    return await action(api);
  } catch (error) {
    if (!silent) {
      setStatus(String(error && error.message ? error.message : error), 'error');
      setPreviewStatus('좌표창 엔진 연결 실패', 'error');
    }
    return null;
  }
}

async function applyDraftMapToApi(api, options = {}) {
  if (!api || typeof api !== 'object') {
    return { ok: false, reason: 'api unavailable' };
  }
  const mapId = resolveCurrentMapId();
  const mapJson = getWorkingMapJson(mapId);
  mapJson.id = mapId;
  mapJson.title = mapId;

  const useLive = options.live !== false && typeof api.applyMapJsonLive === 'function';
  let result = null;
  if (useLive) {
    result = await api.applyMapJsonLive(mapJson, {
      preserveMarbles: options.preserveMarbles !== false,
      preserveRunning: options.preserveRunning !== false,
    });
  } else {
    result = await api.applyMapJson(mapJson);
  }
  if (!result || result.ok !== true) {
    throw new Error(result && result.reason ? result.reason : '드래프트 맵 적용 실패');
  }

  const rankResult = api.setWinningRank(DEFAULT_WINNING_RANK);
  if (!rankResult || rankResult.ok !== true) {
    throw new Error('당첨 순위 설정 실패');
  }

  if (options.updateCandidates === true) {
    const candidateResult = await api.setCandidates(buildAutoCandidates(getCurrentMarbleCount()));
    if (!candidateResult || candidateResult.ok !== true) {
      throw new Error(candidateResult && candidateResult.reason ? candidateResult.reason : '후보 설정 실패');
    }
  }

  return { ok: true, mapId };
}

async function syncPreviewFromDraft(options = {}) {
  if (!ENABLE_COORDINATE_OVERLAY || !elements.previewFrame) {
    return;
  }
  if (previewLiveApplyInFlight) {
    return;
  }
  previewLiveApplyInFlight = true;
  try {
    await withPreviewAction(async (api) => {
      await applyDraftMapToApi(api, {
        live: true,
        preserveMarbles: options.preserveMarbles !== false,
        preserveRunning: options.preserveRunning !== false,
        updateCandidates: options.updateCandidates === true,
      });
      ensurePreviewCanvasFill();
      const running = readEngineRunning(api);
      setPreviewPlayPauseUi(running);
      setPreviewStatus(running ? '좌표창 실행중' : '좌표창 일시정지');
    }, { silent: true });
  } finally {
    previewLiveApplyInFlight = false;
  }
}

async function applyDraftLiveNow(reason = '') {
  if (liveApplyInFlight) {
    liveApplyPending = true;
    return;
  }
  liveApplyInFlight = true;
  try {
    const shouldReset = liveApplyResetRequested === true;
    const shouldAutoStartAfterReset = shouldReset && liveApplyAutoStartRequested === true;
    liveApplyResetRequested = false;
    liveApplyAutoStartRequested = false;
    const api = await waitForEngineApi(8000);
    let restoredSlotId = '';
    let preserveMarblesForApply = !shouldReset;
    let preserveRunningForApply = !shouldReset;
    if (shouldReset) {
      const restored = await restoreSelectedSnapshotForReset(api);
      if (restored && restored.ok) {
        restoredSlotId = restored.slotId;
        preserveMarblesForApply = true;
        preserveRunningForApply = false;
      }
    }
    await applyDraftMapToApi(api, {
      live: true,
      preserveMarbles: preserveMarblesForApply,
      preserveRunning: preserveRunningForApply,
      updateCandidates: false,
    });
    if (shouldReset && !shouldAutoStartAfterReset) {
      if (typeof api.pause === 'function') {
        await api.pause();
      }
      setPlayPauseUi(false);
    }
    if (shouldReset && shouldAutoStartAfterReset && typeof api.start === 'function') {
      const startResult = await api.start();
      if (!startResult || startResult.ok !== true) {
        throw new Error(startResult && startResult.reason ? startResult.reason : '자동 시작 실패');
      }
      setCameraLock(false);
      setPlayPauseUi(true);
    }
    ensureEngineCanvasFill();
    syncViewZoomInputFromEngine();
    const running = readEngineRunning(api);
    setPlayPauseUi(running);
    applyViewZoomToEngine(!running);
    setCameraLock(!running);
    await syncPreviewFromDraft({
      preserveMarbles: preserveMarblesForApply,
      preserveRunning: preserveRunningForApply,
      updateCandidates: false,
    });
    if (reason) {
      if (shouldReset && restoredSlotId) {
        setStatus(`실시간 적용 (슬롯 ${restoredSlotId} 복귀): ${reason}`);
      } else {
        setStatus(`실시간 적용${shouldReset ? ' (리셋)' : ''}: ${reason}`);
      }
    }
  } catch (error) {
    setStatus(String(error && error.message ? error.message : error), 'error');
  } finally {
    liveApplyInFlight = false;
    if (liveApplyPending) {
      liveApplyPending = false;
      void applyDraftLiveNow('대기중 변경');
    }
  }
}

function shouldResetOnObjectMutation() {
  return !!(elements.stageResetOnObjectChangeInput && elements.stageResetOnObjectChangeInput.checked);
}

function canAutoSaveSelectedMap() {
  const selected = selectedMapCatalogEntry();
  if (!selected || !selected.id) {
    return false;
  }
  const currentMapId = resolveCurrentMapId();
  return String(selected.id) === String(currentMapId);
}

async function flushAutoSaveSelectedMap(reason = '') {
  if (!canAutoSaveSelectedMap()) {
    return;
  }
  if (autoSaveInFlight) {
    autoSavePending = true;
    return;
  }
  autoSaveInFlight = true;
  try {
    const mapId = resolveCurrentMapId();
    const mapJson = await getCurrentMapJsonForSave();
    mapJson.id = mapId;
    mapJson.title = mapId;
    await saveMapViaServer({
      mode: 'selected',
      selectedMapId: mapId,
      mapJson,
    });
  } catch (error) {
    const message = String(error && error.message ? error.message : error);
    setStatus(`자동 저장 실패: ${message}`, 'warn');
  } finally {
    autoSaveInFlight = false;
    if (autoSavePending) {
      autoSavePending = false;
      void flushAutoSaveSelectedMap('pending');
    }
  }
}

function scheduleAutoSaveSelectedMap(reason = '') {
  if (FILE_PROTOCOL || !canAutoSaveSelectedMap()) {
    return;
  }
  if (autoSaveTimer) {
    window.clearTimeout(autoSaveTimer);
    autoSaveTimer = 0;
  }
  autoSaveTimer = window.setTimeout(() => {
    autoSaveTimer = 0;
    void flushAutoSaveSelectedMap(reason);
  }, AUTO_SAVE_DEBOUNCE_MS);
}

function queueLiveDraftApply(reason = '', options = {}) {
  if (FILE_PROTOCOL) {
    return;
  }
  if (options && options.objectMutation === true && shouldResetOnObjectMutation()) {
    liveApplyResetRequested = true;
    if (options.autoResumeAfterReset === true) {
      liveApplyAutoStartRequested = true;
    }
  }
  if (liveApplyTimer) {
    window.clearTimeout(liveApplyTimer);
    liveApplyTimer = 0;
  }
  liveApplyTimer = window.setTimeout(() => {
    liveApplyTimer = 0;
    void applyDraftLiveNow(reason || '자동 적용');
  }, LIVE_APPLY_DEBOUNCE_MS);
  scheduleAutoSaveSelectedMap(reason || '자동 저장');
}

async function applyMapAndCandidates() {
  await withEngineAction(async (api) => {
    const payload = readPayload();
    const mapResult = await api.loadMapById(payload.mapId);
    if (!mapResult || mapResult.ok !== true) {
      throw new Error(mapResult && mapResult.reason ? mapResult.reason : '맵 로드에 실패했습니다');
    }
    if (typeof api.getCurrentMapJson === 'function') {
      const latestMap = api.getCurrentMapJson();
      if (latestMap && typeof latestMap === 'object') {
        setWorkingMapJson(latestMap, payload.mapId);
        syncStageInputsFromMap();
        syncObjectList();
        drawMakerCanvas();
      }
    }
    const rankResult = api.setWinningRank(payload.winningRank);
    if (!rankResult || rankResult.ok !== true) {
      throw new Error('당첨 순위 설정에 실패했습니다');
    }
    const candidateResult = await api.setCandidates(payload.candidates);
    if (!candidateResult || candidateResult.ok !== true) {
      throw new Error(candidateResult && candidateResult.reason ? candidateResult.reason : '후보 설정에 실패했습니다');
    }
    ensureEngineCanvasFill();
    syncViewZoomInputFromEngine();
    setPlayPauseUi(readEngineRunning(api));
    applyViewZoomToEngine(true);
    applyMarbleSizeToEngines(getCurrentMarbleSizeScale(), { silent: true });
    await syncPreviewFromDraft({
      preserveMarbles: false,
      preserveRunning: false,
      updateCandidates: true,
    });
    setStatus(`맵 자동 적용 완료: ${payload.mapId}`);
  }, { rethrow: true });
}

async function loadSelectedCatalogMap() {
  const entry = selectedMapCatalogEntry();
  if (!entry) {
    throw new Error('로드할 맵을 먼저 선택하세요');
  }
  const mapPayload = await callMapMakerApi(`map?mapId=${encodeURIComponent(entry.id)}&nocache=${Date.now()}`);
  if (mapPayload.mapJson && typeof mapPayload.mapJson === 'object') {
    setWorkingMapJson(mapPayload.mapJson, entry.id);
    clearUndoHistory();
    syncStageInputsFromMap();
    syncObjectList();
    drawMakerCanvas();
  }
  if (elements.mapNameInput) {
    elements.mapNameInput.value = entry.id;
  }
  await applyMapAndCandidates();
}

function selectedSnapshotSlot() {
  const checked = document.querySelector('input[name="snapshotSlot"]:checked');
  const slotId = checked && typeof checked.value === 'string' ? checked.value : 'slot1';
  return SLOT_IDS.includes(slotId) ? slotId : 'slot1';
}

function findSnapshotMetaBySlot(api, slotId) {
  if (!api || typeof api.listSnapshots !== 'function') {
    return null;
  }
  const list = api.listSnapshots();
  if (!Array.isArray(list)) {
    return null;
  }
  for (let index = 0; index < list.length; index += 1) {
    const item = list[index];
    if (item && String(item.slotId || '') === slotId) {
      return item;
    }
  }
  return null;
}

async function restoreSelectedSnapshotForReset(api) {
  if (!api || typeof api.loadSnapshot !== 'function') {
    return { ok: false, slotId: '', reason: 'snapshot api unavailable' };
  }
  const slotId = selectedSnapshotSlot();
  const snapshotMeta = findSnapshotMetaBySlot(api, slotId);
  if (!snapshotMeta) {
    return { ok: false, slotId, reason: 'no snapshot in selected slot' };
  }
  const loadResult = await api.loadSnapshot(slotId, { autoResume: false });
  if (!loadResult || loadResult.ok !== true) {
    return {
      ok: false,
      slotId,
      reason: loadResult && loadResult.reason ? loadResult.reason : 'snapshot load failed',
    };
  }
  return { ok: true, slotId, meta: snapshotMeta };
}

async function loadEngineFrame() {
  if (!elements.engineFrame || !elements.engineUrlText) {
    throw new Error('엔진 프레임 요소를 찾지 못했습니다. 페이지를 새로고침하세요');
  }
  const engineUrl = `../assets/ui/pinball/index_v2.html?editor=1&nocache=${Date.now()}`;
  elements.engineUrlText.textContent = engineUrl;
  setStatus('엔진 iframe 불러오는 중...');
  elements.engineFrame.src = engineUrl;
  await new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      elements.engineFrame.onload = null;
      elements.engineFrame.onerror = null;
      reject(new Error('엔진 iframe 로딩 시간 초과'));
    }, 15000);
    elements.engineFrame.onload = () => {
      window.clearTimeout(timeout);
      elements.engineFrame.onload = null;
      elements.engineFrame.onerror = null;
      resolve();
    };
    elements.engineFrame.onerror = () => {
      window.clearTimeout(timeout);
      elements.engineFrame.onload = null;
      elements.engineFrame.onerror = null;
      reject(new Error('엔진 iframe 로딩 실패'));
    };
  });
  const frameWindow = getEngineFrameWindow();
  if (frameWindow) {
    installContextMenuGuard(frameWindow);
  }
  startEngineCanvasFillRetry();
  setStatus('엔진 iframe 로드 완료. API 연결 대기 중...');
  const api = await waitForEngineApi(30000);
  const initResult = await api.init(readPayload());
  if (!initResult || initResult.ok !== true) {
    throw new Error(initResult && initResult.reason ? initResult.reason : '초기화에 실패했습니다');
  }
  const startupCandidates = await api.setCandidates(buildAutoCandidates(getCurrentMarbleCount()));
  if (!startupCandidates || startupCandidates.ok !== true) {
    throw new Error(startupCandidates && startupCandidates.reason ? startupCandidates.reason : '초기 공 후보 설정 실패');
  }
  if (typeof api.getCurrentMapJson === 'function') {
    const mapJson = api.getCurrentMapJson();
    if (mapJson && typeof mapJson === 'object') {
      setWorkingMapJson(mapJson);
      syncStageInputsFromMap();
      syncObjectList();
      drawMakerCanvas();
    }
  }
  ensureEngineCanvasFill();
  syncViewZoomInputFromEngine();
  setPlayPauseUi(readEngineRunning(api));
  applyViewZoomToEngine(true);
  applyMarbleSizeToEngines(getCurrentMarbleSizeScale(), { silent: true });
  setStatus(`엔진 준비 완료: 맵=${resolveCurrentMapId()}`);
}

async function loadPreviewFrame() {
  if (!ENABLE_COORDINATE_OVERLAY || !elements.previewFrame) {
    setPreviewStatus('좌표 오버레이 미사용');
    return;
  }
  const previewUrl = `../assets/ui/pinball/index_v2.html?editor=1&preview=1&nocache=${Date.now()}`;
  setPreviewStatus('좌표창 엔진 로딩중...');
  elements.previewFrame.src = previewUrl;
  await new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      elements.previewFrame.onload = null;
      elements.previewFrame.onerror = null;
      reject(new Error('좌표창 iframe 로딩 시간 초과'));
    }, 15000);
    elements.previewFrame.onload = () => {
      window.clearTimeout(timeout);
      elements.previewFrame.onload = null;
      elements.previewFrame.onerror = null;
      resolve();
    };
    elements.previewFrame.onerror = () => {
      window.clearTimeout(timeout);
      elements.previewFrame.onload = null;
      elements.previewFrame.onerror = null;
      reject(new Error('좌표창 iframe 로딩 실패'));
    };
  });
  const previewWindow = getPreviewFrameWindow();
  if (previewWindow) {
    installContextMenuGuard(previewWindow);
  }
  startPreviewCanvasFillRetry();
  const api = await waitForPreviewApi(30000);
  const initResult = await api.init(readPayload());
  if (!initResult || initResult.ok !== true) {
    throw new Error(initResult && initResult.reason ? initResult.reason : '좌표창 엔진 초기화 실패');
  }
  ensurePreviewCanvasFill();
  setPreviewPlayPauseUi(readEngineRunning(api));
  setPreviewStatus('좌표창 준비완료');
  await syncPreviewFromDraft({
    preserveMarbles: false,
    preserveRunning: false,
    updateCandidates: true,
  });
}

async function saveMapViaServer(payload) {
  return callMapMakerApi('save', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

async function getCurrentMapJsonForSave() {
  if (workingMapJson && typeof workingMapJson === 'object') {
    return deepClone(workingMapJson);
  }
  try {
    const api = await waitForEngineApi(2000);
    if (api && typeof api.getCurrentMapJson === 'function') {
      const fromEngine = api.getCurrentMapJson();
      if (fromEngine && typeof fromEngine === 'object') {
        return setWorkingMapJson(fromEngine);
      }
    }
  } catch (_) {
  }
  return getWorkingMapJson(resolveCurrentMapId());
}

async function saveAsNewMap() {
  const rawName = String(elements.mapNameInput && elements.mapNameInput.value ? elements.mapNameInput.value : '').trim();
  if (!rawName) {
    throw new Error('새 맵 이름을 입력하세요');
  }
  const newId = sanitizeMapId(rawName);
  const mapJson = await getCurrentMapJsonForSave();
  mapJson.id = newId;
  mapJson.title = newId;
  await saveMapViaServer({
    mode: 'new',
    newMapId: newId,
    newMapTitle: newId,
    mapJson,
  });
  await refreshMapCatalog(newId);
  if (elements.mapSelect) {
    elements.mapSelect.value = newId;
  }
  if (elements.mapNameInput) {
    elements.mapNameInput.value = newId;
  }
  await loadSelectedCatalogMap();
  setStatus(`새 맵 저장 완료: ${newId}`);
}

function handleMakerCanvasRightClickAction() {
  const tool = selectedTool();
  if (isPolylineTool(tool) && editorState.pendingWallStart) {
    resetPendingWall();
    updateMakerHint(`${toolDisplayName(tool)} 입력 종료`);
    drawMakerCanvas();
    setStatus(`${toolDisplayName(tool)} 입력을 종료했습니다.`);
    return;
  }
  if (tool === 'portal' && editorState.pendingPortalOid) {
    resetPendingPortal();
    updateMakerHint('포털 연결 입력 취소');
    drawMakerCanvas();
    setStatus('포털 연결 대기를 취소했습니다.');
    return;
  }
  if ((tool === 'hammer' || tool === 'fan' || tool === 'sticky_pad') && editorState.pendingHammerOid) {
    resetPendingHammer();
    updateMakerHint(tool === 'fan'
      ? '선풍기 방향 설정 입력 취소'
      : (tool === 'sticky_pad' ? '점착패드 목표점 설정 입력 취소' : '해머 방향 설정 입력 취소'));
    drawMakerCanvas();
    setStatus(tool === 'fan'
      ? '선풍기 방향 설정 대기를 취소했습니다.'
      : (tool === 'sticky_pad' ? '점착패드 목표점 설정 대기를 취소했습니다.' : '해머 방향 설정 대기를 취소했습니다.'));
    return;
  }
  setSelectedTool('select');
  resetPendingWall();
  resetPendingPortal();
  resetPendingHammer();
  cancelDrag();
  if (elements.makerToolSelect) {
    elements.makerToolSelect.dispatchEvent(new Event('change'));
  }
  setStatus('우클릭: 선택 모드로 전환');
}

function setupEvents() {
  installContextMenuGuard(window);

  bindEvent(elements.marbleCountInput, 'input', () => {
    scheduleLiveMarbleCountApply('');
  });
  bindEvent(elements.marbleCountInput, 'change', () => {
    scheduleLiveMarbleCountApply('테스트 공 개수 적용 완료');
  });

  bindEvent(elements.marbleSizeInput, 'change', () => {
    getCurrentMarbleSizeScale();
  });

  bindEvent(elements.applyMarbleSizeButton, 'click', () => {
    const scale = getCurrentMarbleSizeScale();
    applyMarbleSizeToEngines(scale);
  });

  bindEvent(elements.toggleJsonViewButton, 'click', () => {
    setJsonViewerOpen(!isJsonViewerOpen());
  });

  bindEvent(elements.refreshMapListButton, 'click', async () => {
    setBusy(true);
    try {
      await refreshMapCatalog(resolveCurrentMapId());
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), 'error');
    } finally {
      setBusy(false);
    }
  });

  bindEvent(elements.mapSelect, 'change', async () => {
    if (!selectedMapCatalogEntry()) {
      return;
    }
    setBusy(true);
    try {
      await loadSelectedCatalogMap();
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), 'error');
    } finally {
      setBusy(false);
    }
  });

  bindEvent(elements.saveAsNewMapButton, 'click', async () => {
    setBusy(true);
    try {
      await saveAsNewMap();
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), 'error');
    } finally {
      setBusy(false);
    }
  });

  bindEvent(elements.makerToolSelect, 'change', () => {
    syncToolButtons();
    resetPendingWall();
    resetPendingPortal();
    if (selectedTool() !== 'hammer' && selectedTool() !== 'fan' && selectedTool() !== 'sticky_pad') {
      resetPendingHammer();
    }
    cancelDrag();
    const tool = selectedTool();
    if (tool === 'select') {
      updateMakerHint('선택 모드: 클릭 선택, 드래그 이동, Shift+회전은 45도 스냅');
    } else if (tool === 'spawn_point') {
      updateMakerHint('공 시작점 모드: 클릭/드래그로 시작 위치를 지정');
    } else if (tool === 'wall_segment') {
      updateMakerHint('일반 벽선 모드: 드래그로 2점 벽 생성, Shift는 45도 스냅');
    } else if (tool === 'wall_corridor_segment') {
      updateMakerHint(`통로형 일반벽선 모드: 드래그 2점 생성, 간격=${getCorridorGapInput()}, Shift는 45도 스냅`);
    } else if (tool === 'wall_polyline') {
      updateMakerHint('다점 벽선 모드: 1,2,3... 클릭한 점을 이어 벽 생성, 우클릭 종료');
    } else if (tool === 'wall_corridor_polyline') {
      updateMakerHint(`통로형 다절벽선 모드: 1,2,3... 점 연결, 간격=${getCorridorGapInput()}, 우클릭 종료`);
    } else if (tool === 'black_hole') {
      updateMakerHint('블랙홀 모드: 드래그로 반경 생성, 주변을 빨아들여 화이트홀로 전송');
    } else if (tool === 'white_hole') {
      updateMakerHint('화이트홀 모드: 드래그로 반경 생성, 블랙홀에서 전송된 공이 랜덤 방향 발사');
    } else if (tool === 'hammer') {
      updateMakerHint(editorState.pendingHammerOid
        ? '해머 방향 설정 대기: 드래그/클릭으로 이동 방향·거리 지정'
        : '해머 모드: 드래그로 크기 생성 후, 점선 단계에서 방향·거리 지정');
    } else if (tool === 'fan') {
      updateMakerHint(editorState.pendingHammerOid
        ? '선풍기 방향 설정 대기: 드래그/클릭으로 바람 방향·거리 지정'
        : '선풍기 모드: 드래그로 크기 생성 후, 점선 단계에서 방향·거리 지정');
    } else if (tool === 'sticky_pad') {
      updateMakerHint(editorState.pendingHammerOid
        ? '점착패드 이동 경로 설정 대기: 드래그/클릭으로 목표점(B) 지정'
        : '점착패드 모드: 드래그로 크기 생성 후, 점선 단계에서 목표점(B) 지정');
    } else if (tool === 'domino_block') {
      updateMakerHint('도미노 블럭 모드: 드래그로 크기 생성 (동적 물리)');
    } else if (tool === 'physics_ball') {
      updateMakerHint('물리 공 모드: 드래그로 반지름 생성 (동적 물리)');
    } else if (tool === 'goal_marker_image') {
      updateMakerHint('골라인 이미지 모드: 드래그로 크기 지정 생성 (배경 마커)');
    } else if (tool === 'rotor') {
      updateMakerHint('회전 바 모드: 드래그로 길이/방향 지정 생성');
    } else {
      updateMakerHint(`${toolDisplayName(tool)} 모드: 드래그로 크기를 지정해 생성`);
    }
    drawMakerCanvas();
    renderFloatingObjectInspector();
  });

  bindEvent(elements.corridorGapInput, 'input', () => {
    const gap = getCorridorGapInput();
    const tool = selectedTool();
    if (tool === 'wall_corridor_segment' || tool === 'wall_corridor_polyline') {
      updateMakerHint(`${toolDisplayName(tool)} 간격: ${gap}`);
      drawMakerCanvas();
    }
  });

  if (Array.isArray(elements.makerToolButtons)) {
    for (let index = 0; index < elements.makerToolButtons.length; index += 1) {
      const button = elements.makerToolButtons[index];
      const activateTool = () => {
        const tool = button && button.dataset ? button.dataset.makerTool : '';
        setSelectedTool(tool);
        if (elements.makerToolSelect) {
          elements.makerToolSelect.dispatchEvent(new Event('change'));
        }
      };
      bindEvent(button, 'pointerdown', (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) {
          return;
        }
        event.preventDefault();
        activateTool();
      });
      bindEvent(button, 'mousedown', (event) => {
        if (event.button !== 0) {
          return;
        }
        event.preventDefault();
        activateTool();
      });
      bindEvent(button, 'click', () => {
        activateTool();
      });
    }
  }

  bindEvent(elements.makerCanvas, 'click', (event) => {
    handleMakerCanvasClick(event);
  });

  bindEvent(elements.makerCanvas, 'wheel', (event) => {
    handleMakerCanvasWheel(event);
  });

  bindEvent(elements.makerCanvas, 'mousedown', (event) => {
    if (event.button === 2) {
      event.preventDefault();
      handleMakerCanvasRightClickAction();
      return;
    }
    if (event.button === 1) {
      beginMakerCanvasPan(event);
      return;
    }
    handleMakerCanvasPointerDown(event);
  });

  bindEvent(elements.makerCanvas, 'auxclick', (event) => {
    if (event.button === 1) {
      event.preventDefault();
    }
  });

  bindEvent(elements.miniMapCanvas, 'mousedown', (event) => {
    beginMiniMapDrag(event);
  });
  bindEvent(elements.miniMapCanvas, 'contextmenu', (event) => {
    event.preventDefault();
  });

  window.addEventListener('mousemove', (event) => {
    updateMakerCanvasPan(event);
    handleMakerCanvasPointerMove(event);
    updateMiniMapDrag(event);
  });

  window.addEventListener('mouseup', (event) => {
    endMakerCanvasPan();
    handleMakerCanvasPointerUp(event);
    endMiniMapDrag();
  });

  bindEvent(elements.makerCanvas, 'contextmenu', (event) => {
    event.preventDefault();
    handleMakerCanvasRightClickAction();
  });

  bindEvent(elements.objectList, 'change', () => {
    const index = Number(elements.objectList && elements.objectList.value ? elements.objectList.value : -1);
    editorState.selectedIndex = Number.isFinite(index) ? index : -1;
    populateObjectEditor();
    drawMakerCanvas();
  });

  const autoObjectInputs = [
    elements.objOidInput,
    elements.objColorInput,
    elements.objXInput,
    elements.objYInput,
    elements.objExtra1Input,
    elements.objExtra2Input,
    elements.objRadiusInput,
    elements.objRotationInput,
    elements.objPairInput,
    elements.objDirInput,
    elements.objForceInput,
    elements.objIntervalInput,
    elements.objHitDistanceInput,
    elements.objRestitutionInput,
    elements.objFrictionInput,
  ];
  for (let index = 0; index < autoObjectInputs.length; index += 1) {
    const field = autoObjectInputs[index];
    bindEvent(field, 'input', () => {
      if (!getSelectedObject()) {
        return;
      }
      try {
        runApplySelectedObjectValuesAction({
          trackUndo: false,
          liveReason: '오브젝트 실시간 반영',
          silentStatus: true,
        });
      } catch (error) {
        setStatus(String(error && error.message ? error.message : error), 'error');
      }
    });
    bindEvent(field, 'change', () => {
      if (!getSelectedObject()) {
        return;
      }
      scheduleAutoObjectApply('오브젝트 자동 반영');
    });
  }

  bindEvent(elements.stageZoomInput, 'input', () => {
    try {
      runApplyStageValuesAction({
        trackUndo: false,
        liveReason: '스테이지 실시간 반영',
        silentStatus: true,
      });
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), 'error');
    }
  });
  bindEvent(elements.stageZoomInput, 'change', () => {
    scheduleAutoStageApply('스테이지 자동 반영');
  });
  bindEvent(elements.stageDisableSkillsInput, 'change', () => {
    scheduleAutoStageApply('스테이지 자동 반영');
  });
  bindEvent(elements.viewZoomInput, 'input', () => {
    applyViewZoomRespectRunning();
  });
  bindEvent(elements.viewZoomInput, 'change', () => {
    applyViewZoomRespectRunning();
  });
  bindEvent(elements.marbleSizeInput, 'input', () => {
    applyMarbleSizeToEngines(getCurrentMarbleSizeScale(), { silent: true });
  });
  bindEvent(elements.marbleSizeInput, 'change', () => {
    applyMarbleSizeToEngines(getCurrentMarbleSizeScale(), { silent: true });
  });

  bindEvent(elements.applyObjectButton, 'click', () => {
    try {
      runApplySelectedObjectValuesAction();
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), 'error');
    }
  });

  bindEvent(elements.reverseRotationButton, 'click', () => {
    try {
      runReverseSelectedObjectAction();
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), 'error');
    }
  });

  bindEvent(elements.duplicateObjectButton, 'click', () => {
    try {
      runDuplicateSelectedObjectAction();
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), 'error');
    }
  });

  bindEvent(elements.deleteObjectButton, 'click', () => {
    try {
      runDeleteSelectedObjectAction();
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), 'error');
    }
  });

  bindEvent(elements.floatingReverseButton, 'click', () => {
    try {
      runReverseSelectedObjectAction();
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), 'error');
    }
  });

  bindEvent(elements.floatingDuplicateButton, 'click', () => {
    try {
      runDuplicateSelectedObjectAction();
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), 'error');
    }
  });

  bindEvent(elements.floatingDeleteButton, 'click', () => {
    try {
      runDeleteSelectedObjectAction();
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), 'error');
    }
  });

  bindEvent(elements.floatingObjectFields, 'change', (event) => {
    const target = event && event.target instanceof HTMLInputElement ? event.target : null;
    if (!target) {
      return;
    }
    const sourceKey = String(target.dataset && target.dataset.sourceKey ? target.dataset.sourceKey : '');
    if (!sourceKey) {
      return;
    }
    try {
      applyFloatingInspectorField(sourceKey, target.value);
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), 'error');
    }
  });

  bindEvent(elements.floatingObjectFields, 'input', (event) => {
    const target = event && event.target instanceof HTMLInputElement ? event.target : null;
    if (!target) {
      return;
    }
    const sourceKey = String(target.dataset && target.dataset.sourceKey ? target.dataset.sourceKey : '');
    if (!sourceKey) {
      return;
    }
    const source = elements[sourceKey];
    if (!source || !getSelectedObject()) {
      return;
    }
    source.value = String(target.value ?? '');
    try {
      runApplySelectedObjectValuesAction({
        trackUndo: false,
        liveReason: '오브젝트 실시간 반영',
        silentStatus: true,
      });
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), 'error');
    }
  });

  bindEvent(elements.floatingObjectFields, 'keydown', (event) => {
    if (!(event && event.target instanceof HTMLInputElement)) {
      return;
    }
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    event.target.dispatchEvent(new Event('change', { bubbles: true }));
  });

  bindEvent(elements.clearObjectsButton, 'click', () => {
    rememberUndoState('오브젝트 전체삭제');
    clearAllObjects();
    syncObjectList();
    queueObjectLiveDraftApply('오브젝트 전체삭제');
    drawMakerCanvas();
    setStatus('오브젝트 전체 삭제 완료');
  });

  bindEvent(elements.fitStageButton, 'click', () => {
    rememberUndoState('스테이지 자동맞춤');
    autoFitStageFromObjects();
    queueLiveDraftApply('스테이지 자동맞춤');
    drawMakerCanvas();
    setStatus('스테이지 자동맞춤 완료');
  });

  bindEvent(elements.applyStageButton, 'click', () => {
    runApplyStageValuesAction({
      trackUndo: true,
      undoReason: '스테이지 값 변경',
      liveReason: '스테이지 값 변경',
      statusMessage: '스테이지 적용 완료 (뷰 줌/공 크기/스킬 옵션 포함)',
    });
  });

  bindEvent(elements.applyViewZoomButton, 'click', () => {
    if (applyViewZoomRespectRunning()) {
      setStatus('뷰 줌 적용 완료');
    } else {
      setStatus('엔진 준비 후 뷰 줌 적용 가능', 'warn');
    }
  });

  bindEvent(elements.reloadButton, 'click', async () => {
    setBusy(true);
    try {
      await loadEngineFrame();
      try {
        await loadPreviewFrame();
      } catch (previewError) {
        setPreviewStatus(String(previewError && previewError.message ? previewError.message : previewError), 'error');
      }
      if (selectedMapCatalogEntry()) {
        await loadSelectedCatalogMap();
      }
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), 'error');
    } finally {
      setBusy(false);
    }
  });

  bindEvent(elements.previewPlayPauseButton, 'click', async () => {
    await withPreviewAction(async (api) => {
      const running = readEngineRunning(api);
      if (running) {
        const pauseResult = await api.pause();
        if (!pauseResult || pauseResult.ok !== true) {
        throw new Error(pauseResult && pauseResult.reason ? pauseResult.reason : '좌표창 일시정지 실패');
        }
        setPreviewPlayPauseUi(false);
        setPreviewStatus('좌표창 일시정지');
        return;
      }
      const startResult = await api.start();
      if (!startResult || startResult.ok !== true) {
        throw new Error(startResult && startResult.reason ? startResult.reason : '좌표창 시작 실패');
      }
      setPreviewPlayPauseUi(true);
      setPreviewStatus('좌표창 실행중');
    }, { silent: false });
  });

  bindEvent(elements.previewResetButton, 'click', async () => {
    await withPreviewAction(async (api) => {
      const result = await api.reset();
      if (!result || result.ok !== true) {
        throw new Error(result && result.reason ? result.reason : '좌표창 리셋 실패');
      }
      setPreviewPlayPauseUi(false);
      setPreviewStatus('좌표창 리셋됨');
      await syncPreviewFromDraft({
        preserveMarbles: false,
        preserveRunning: false,
        updateCandidates: true,
      });
    }, { silent: false });
  });

  bindEvent(elements.playPauseToggleButton, 'click', async () => {
    await withEngineAction(async (api) => {
      const running = readEngineRunning(api);
      if (running) {
        const pauseResult = await api.pause();
        if (!pauseResult || pauseResult.ok !== true) {
          throw new Error(pauseResult && pauseResult.reason ? pauseResult.reason : '일시정지에 실패했습니다');
        }
        setPlayPauseUi(false);
        applyViewZoomToEngine(true);
        setStatus('일시정지되었습니다');
        return;
      }
      setCameraLock(false);
      const startResult = await api.start();
      if (!startResult || startResult.ok !== true) {
        throw new Error(startResult && startResult.reason ? startResult.reason : '시작에 실패했습니다');
      }
      setCameraLock(false);
      window.setTimeout(() => {
        setCameraLock(false);
      }, 120);
      setPlayPauseUi(true);
      setStatus('시작되었습니다');
    });
  });

  bindEvent(elements.resetButton, 'click', async () => {
    await withEngineAction(async (api) => {
      let resetMessage = '리셋이 완료되었습니다';
      const restored = await restoreSelectedSnapshotForReset(api);
      if (restored && restored.ok) {
        resetMessage = `${restored.slotId} 슬롯으로 복귀했습니다`;
      } else {
        const result = await api.reset();
        if (!result || result.ok !== true) {
          throw new Error(result && result.reason ? result.reason : '리셋에 실패했습니다');
        }
      }
      applyMarbleSizeToEngines(getCurrentMarbleSizeScale(), { silent: true });
      setPlayPauseUi(false);
      applyViewZoomToEngine(true);
      setStatus(resetMessage);
    });
  });

  bindEvent(elements.quickSaveButton, 'click', async () => {
    await withEngineAction(async (api) => {
      const slotId = selectedSnapshotSlot();
      const result = await api.saveSnapshot(slotId);
      if (!result || result.ok !== true) {
        throw new Error(result && result.reason ? result.reason : '퀵 세이브에 실패했습니다');
      }
      setStatus(`${slotId} 퀵 세이브 완료 (덮어쓰기)`);
    });
  });

  bindEvent(elements.quickLoadButton, 'click', async () => {
    await withEngineAction(async (api) => {
      const slotId = selectedSnapshotSlot();
      const result = await api.loadSnapshot(slotId, { autoResume: false });
      if (!result || result.ok !== true) {
        throw new Error(result && result.reason ? result.reason : '퀵 로드에 실패했습니다');
      }
      applyMarbleSizeToEngines(getCurrentMarbleSizeScale(), { silent: true });
      setPlayPauseUi(false);
      applyViewZoomToEngine(true);
      setStatus(`${slotId} 퀵 로드 완료 (일시정지 복원)`);
    });
  });

  window.addEventListener('keydown', (event) => {
    if (isTypingTarget(event.target)) {
      return;
    }
    const key = String(event.key || '');
    if ((event.ctrlKey || event.metaKey) && !event.altKey && key.toLowerCase() === 'z') {
      event.preventDefault();
      undoLastChange();
      return;
    }
    if (key === 'Delete') {
      if (editorState.selectedIndex >= 0) {
        try {
          runDeleteSelectedObjectAction('Delete 키 삭제', '선택 오브젝트 삭제 완료 (Delete)');
        } catch (error) {
          setStatus(String(error && error.message ? error.message : error), 'error');
        }
      }
      return;
    }
    if (event.code === 'Space') {
      event.preventDefault();
      if (elements.playPauseToggleButton) {
        elements.playPauseToggleButton.click();
      }
      return;
    }
    if (!event.ctrlKey && !event.metaKey && !event.altKey && (key === 'r' || key === 'R')) {
      event.preventDefault();
      if (elements.resetButton) {
        elements.resetButton.click();
      }
      return;
    }
    if (key === 'Escape') {
      const hadPending = !!(editorState.pendingWallStart || editorState.pendingPortalOid || editorState.pendingHammerOid || editorState.dragState);
      resetPendingWall();
      resetPendingPortal();
      resetPendingHammer();
      cancelDrag();
      if (hadPending) {
        updateMakerHint('대기중 작업을 취소했습니다.');
        drawMakerCanvas();
      }
    }
  });

  window.addEventListener('resize', () => {
    drawMakerCanvas();
  });
}

async function boot() {
  setupEvents();
  const initialMapId = 'v2_custom_map';
  setMarbleCountInput(DEFAULT_MARBLE_COUNT);
  setMarbleSizeInput(DEFAULT_MARBLE_SIZE_SCALE);
  setJsonViewerOpen(false);
  if (elements.mapNameInput) {
    elements.mapNameInput.value = initialMapId;
  }
  setWorkingMapJson(buildDefaultMapJson(initialMapId), initialMapId);
  clearUndoHistory();
  syncStageInputsFromMap();
  syncObjectList();
  setSelectedTool('select');
  drawMakerCanvas();
  updateMakerHint('드래그 생성/편집 즉시 반영. Ctrl+Z 되돌리기 / Delete 삭제 / Space 재생·일시정지 / R 리셋');
  setPlayPauseUi(false);
  setPreviewPlayPauseUi(false);
  setPreviewStatus('좌표창 엔진 연결 대기');
  if (FILE_PROTOCOL) {
    setStatus('현재 file:// 경로입니다. tools/start_pinball_map_maker_v2.bat 로 실행하세요', 'warn');
    return;
  }
  setBusy(true);
  try {
    await refreshMapCatalog('');
    await loadEngineFrame();
    try {
      await loadPreviewFrame();
    } catch (previewError) {
      setPreviewStatus(String(previewError && previewError.message ? previewError.message : previewError), 'error');
    }
    if (selectedMapCatalogEntry()) {
      await loadSelectedCatalogMap();
    } else {
      await withEngineAction(async (api) => {
        await applyDraftMapToApi(api, {
          live: false,
          preserveMarbles: false,
          preserveRunning: false,
          updateCandidates: true,
        });
        ensureEngineCanvasFill();
        syncViewZoomInputFromEngine();
        setPlayPauseUi(readEngineRunning(api));
        applyViewZoomToEngine(true);
        applyMarbleSizeToEngines(getCurrentMarbleSizeScale(), { silent: true });
        await syncPreviewFromDraft({
          preserveMarbles: false,
          preserveRunning: false,
          updateCandidates: true,
        });
        setStatus('빈 드래프트 맵 적용 완료 (맵 선택 전)');
      }, { rethrow: true });
    }
    await applyLiveMarbleCountNow('');
  } catch (error) {
    setStatus(String(error && error.message ? error.message : error), 'error');
  } finally {
    setBusy(false);
  }
}

void boot();
