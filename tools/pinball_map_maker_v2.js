const SLOT_IDS = ['slot1', 'slot2', 'slot3'];
const FILE_PROTOCOL = window.location.protocol === 'file:';
const DEFAULT_MARBLE_COUNT = 32;
const DEFAULT_WINNING_RANK = 1;
const WORLD_WIDTH = 24;
const MIN_MARBLE_COUNT = 1;
const MAX_MARBLE_COUNT = 256;
const LIVE_APPLY_DEBOUNCE_MS = 120;
const CANVAS_MIN_ZOOM = 0.35;
const CANVAS_MAX_ZOOM = 6;
let engineCanvasFillTimer = 0;
let liveApplyTimer = 0;
let liveApplyInFlight = false;
let liveApplyPending = false;
let previewLiveApplyInFlight = false;
let previewCanvasFillTimer = 0;

let mapCatalog = [];
let workingMapJson = null;
const editorState = {
  selectedIndex: -1,
  pendingWallStart: null,
  pendingPortalOid: '',
  canvasZoom: 1,
  canvasPanX: 0,
  canvasPanY: 0,
  isCanvasPanning: false,
  canvasPanLastX: 0,
  canvasPanLastY: 0,
  canvasHoverWorld: null,
  dragState: null,
  suppressClickOnce: false,
};

const elements = {
  mapSelect: document.getElementById('mapSelect'),
  mapNameInput: document.getElementById('mapNameInput'),
  refreshMapListButton: document.getElementById('refreshMapListButton'),
  saveSelectedMapButton: document.getElementById('saveSelectedMapButton'),
  saveAsNewMapButton: document.getElementById('saveAsNewMapButton'),
  reloadButton: document.getElementById('reloadButton'),
  playPauseToggleButton: document.getElementById('playPauseToggleButton'),
  playPauseIcon: document.getElementById('playPauseIcon'),
  playPauseText: document.getElementById('playPauseText'),
  resetButton: document.getElementById('resetButton'),
  quickSaveButton: document.getElementById('quickSaveButton'),
  quickLoadButton: document.getElementById('quickLoadButton'),
  marbleCountInput: document.getElementById('marbleCountInput'),
  applyMarbleCountButton: document.getElementById('applyMarbleCountButton'),
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
  stageGoalInput: document.getElementById('stageGoalInput'),
  stageZoomInput: document.getElementById('stageZoomInput'),
  applyViewZoomButton: document.getElementById('applyViewZoomButton'),
  fitStageButton: document.getElementById('fitStageButton'),
  applyStageButton: document.getElementById('applyStageButton'),
  makerToolSelect: document.getElementById('makerToolSelect'),
  makerToolButtons: Array.from(document.querySelectorAll('.maker-tool-button')),
  makerCanvas: document.getElementById('makerCanvas'),
  applyDraftButton: document.getElementById('applyDraftButton'),
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
  objHitDistanceInput: document.getElementById('objHitDistanceInput'),
  applyObjectButton: document.getElementById('applyObjectButton'),
  duplicateObjectButton: document.getElementById('duplicateObjectButton'),
  deleteObjectButton: document.getElementById('deleteObjectButton'),
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

function bindEvent(element, eventName, handler) {
  if (!element || typeof element.addEventListener !== 'function') {
    return;
  }
  element.addEventListener(eventName, handler);
}

function setBusy(isBusy) {
  const controls = [
    elements.mapSelect,
    elements.mapNameInput,
    elements.refreshMapListButton,
    elements.saveSelectedMapButton,
    elements.saveAsNewMapButton,
    elements.reloadButton,
    elements.playPauseToggleButton,
    elements.resetButton,
    elements.quickSaveButton,
    elements.quickLoadButton,
    elements.previewPlayPauseButton,
    elements.previewResetButton,
    elements.marbleCountInput,
    elements.applyMarbleCountButton,
    elements.toggleJsonViewButton,
    elements.viewZoomInput,
    elements.stageGoalInput,
    elements.stageZoomInput,
    elements.applyViewZoomButton,
    elements.fitStageButton,
    elements.applyStageButton,
    elements.makerToolSelect,
    elements.applyDraftButton,
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
    elements.applyObjectButton,
    elements.duplicateObjectButton,
    elements.deleteObjectButton,
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
      spawn: { x: 10.25, y: 0, columns: 10, spacingX: 0.6, visibleRows: 5 },
    },
    objects: [],
  };
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
  return source;
}

function setWorkingMapJson(rawMapJson, fallbackMapId = '') {
  const fallbackId = fallbackMapId || resolveCurrentMapId();
  const normalized = normalizeMapJson(rawMapJson, fallbackId);
  workingMapJson = deepClone(normalized);
  resetPendingWall();
  resetPendingPortal();
  resetActiveDrag();
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

function syncStageInputsFromMap() {
  const mapJson = getMutableMap();
  if (elements.stageGoalInput) {
    elements.stageGoalInput.value = String(Math.round(toFinite(mapJson.stage.goalY, 210)));
  }
  if (elements.stageZoomInput) {
    elements.stageZoomInput.value = String(round1(toFinite(mapJson.stage.zoomY, 206)));
  }
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
  elements.mapSelect.innerHTML = options || '<option value="">등록된 맵 없음</option>';
  const picked = preferredMapId && mapCatalog.some((entry) => entry.id === preferredMapId)
    ? preferredMapId
    : (mapCatalog[0] ? mapCatalog[0].id : '');
  if (picked) {
    elements.mapSelect.value = picked;
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

async function refreshMapCatalog(preferredMapId = '') {
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
  renderMapCatalog(preferredMapId || resolveCurrentMapId());
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
    case 'wall_polyline':
      return '벽2점연결';
    case 'peg_circle':
      return '원형 핀';
    case 'diamond_block':
      return '마름모';
    case 'box_block':
      return '박스';
    case 'rotor':
      return '회전 바';
    case 'portal':
      return '포털 A/B';
    case 'hammer':
      return '해머';
    case 'burst_bumper':
      return '버스트 범퍼';
    default:
      return String(tool || '툴');
  }
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
    'wall_polyline',
    'peg_circle',
    'diamond_block',
    'box_block',
    'rotor',
    'portal',
    'hammer',
    'burst_bumper',
  ]);
  const nextTool = allowed.has(String(tool || '')) ? String(tool) : fallback;
  if (elements.makerToolSelect) {
    elements.makerToolSelect.value = nextTool;
  }
  syncToolButtons();
}

function resetPendingWall() {
  editorState.pendingWallStart = null;
}

function resetPendingPortal() {
  editorState.pendingPortalOid = '';
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
      color: '#ffd166',
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
      color: '#62c2ff',
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
      color: '#74d4ff',
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
      color: '#ef476f',
    };
  }
  if (tool === 'portal') {
    return {
      oid: nextOid('portal'),
      type: 'portal',
      x: px,
      y: py,
      radius: 0.6,
      pair: '',
      cooldownMs: 900,
      exitImpulse: 2.4,
      exitDirDeg: 0,
      color: '#c18bff',
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
      color: '#ffa557',
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
      color: '#ff9f6e',
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
  if (elements.objRotationInput) elements.objRotationInput.value = '';
  if (elements.objPairInput) elements.objPairInput.value = '';
  if (elements.objDirInput) elements.objDirInput.value = '';
  if (elements.objForceInput) elements.objForceInput.value = '';
  if (elements.objIntervalInput) elements.objIntervalInput.value = '';
  if (elements.objHitDistanceInput) elements.objHitDistanceInput.value = '';
  if (elements.objHitDistanceInput) elements.objHitDistanceInput.disabled = true;
  if (elements.reverseRotationButton) elements.reverseRotationButton.disabled = true;
  if (elements.objDirLabel) elements.objDirLabel.textContent = 'dirDeg';
  if (elements.objForceLabel) elements.objForceLabel.textContent = 'force';
  if (elements.objIntervalLabel) elements.objIntervalLabel.textContent = 'interval';
}

function populateObjectEditor() {
  const obj = getSelectedObject();
  if (!obj) {
    clearObjectEditor();
    updateMakerHint('툴을 선택하고 캔버스를 클릭해서 오브젝트를 추가하세요.');
    return;
  }
  if (elements.objOidInput) elements.objOidInput.value = String(obj.oid || '');
  if (elements.objColorInput) elements.objColorInput.value = String(obj.color || '');
  if (elements.objRadiusInput) elements.objRadiusInput.value = String(round1(toFinite(obj.radius, 0.6)));
  if (elements.objRotationInput) elements.objRotationInput.value = String(round1(toFinite(obj.rotation, 0)));
  if (elements.objPairInput) elements.objPairInput.value = String(obj.pair || '');
  if (elements.objDirInput) {
    elements.objDirInput.value = obj.type === 'rotor'
      ? ''
      : String(Math.round(toFinite(obj.dirDeg, 90)));
  }
  if (elements.objForceInput) {
    elements.objForceInput.value = obj.type === 'rotor'
      ? String(round2(toFinite(obj.angularVelocity, 2.2)))
      : String(round1(toFinite(obj.force, 4.2)));
  }
  if (elements.objIntervalInput) {
    elements.objIntervalInput.value = obj.type === 'rotor'
      ? ''
      : String(Math.round(toFinite(obj.intervalMs, 1200)));
  }
  if (elements.objHitDistanceInput) {
    elements.objHitDistanceInput.value = obj.type === 'hammer'
      ? String(round1(toFinite(obj.hitDistance, 0.95)))
      : '';
    elements.objHitDistanceInput.disabled = obj.type !== 'hammer';
  }
  if (elements.reverseRotationButton) {
    elements.reverseRotationButton.disabled = !supportsRotationHandle(obj);
  }
  if (elements.objDirLabel) {
    elements.objDirLabel.textContent = obj.type === 'rotor' ? 'dirDeg(미사용)' : 'dirDeg';
  }
  if (elements.objForceLabel) {
    elements.objForceLabel.textContent = obj.type === 'rotor' ? 'angVel' : 'force';
  }
  if (elements.objIntervalLabel) {
    elements.objIntervalLabel.textContent = obj.type === 'rotor' ? 'interval(미사용)' : 'interval';
  }

  if (obj.type === 'wall_polyline') {
    const points = Array.isArray(obj.points) ? obj.points : [];
    const p1 = points[0] || [0, 0];
    const p2 = points[Math.max(1, points.length - 1)] || [0, 0];
    if (elements.objXInput) elements.objXInput.value = String(round1(toFinite(p1[0], 0)));
    if (elements.objYInput) elements.objYInput.value = String(round1(toFinite(p1[1], 0)));
    if (elements.objExtra1Input) elements.objExtra1Input.value = String(round1(toFinite(p2[0], 0)));
    if (elements.objExtra2Input) elements.objExtra2Input.value = String(round1(toFinite(p2[1], 0)));
    if (elements.objExtra1Label) elements.objExtra1Label.textContent = '점2 x';
    if (elements.objExtra2Label) elements.objExtra2Label.textContent = '점2 y';
  } else if (obj.type === 'burst_bumper') {
    if (elements.objXInput) elements.objXInput.value = String(round1(toFinite(obj.x, 0)));
    if (elements.objYInput) elements.objYInput.value = String(round1(toFinite(obj.y, 0)));
    if (elements.objExtra1Input) elements.objExtra1Input.value = String(round1(toFinite(obj.triggerRadius, toFinite(obj.radius, 0.7) + 0.45)));
    if (elements.objExtra2Input) elements.objExtra2Input.value = String(round1(toFinite(obj.restitution, 3.2)));
    if (elements.objExtra1Label) elements.objExtra1Label.textContent = 'triggerR';
    if (elements.objExtra2Label) elements.objExtra2Label.textContent = 'bounce';
  } else if (obj.type === 'hammer') {
    if (elements.objXInput) elements.objXInput.value = String(round1(toFinite(obj.x, 0)));
    if (elements.objYInput) elements.objYInput.value = String(round1(toFinite(obj.y, 0)));
    if (elements.objExtra1Input) elements.objExtra1Input.value = String(round1(toFinite(obj.triggerRadius, 1.2)));
    if (elements.objExtra2Input) elements.objExtra2Input.value = String(Math.round(toFinite(obj.cooldownMs, 320)));
    if (elements.objExtra1Label) elements.objExtra1Label.textContent = 'triggerR';
    if (elements.objExtra2Label) elements.objExtra2Label.textContent = 'cooldown';
  } else if (obj.type === 'rotor') {
    if (elements.objXInput) elements.objXInput.value = String(round1(toFinite(obj.x, 0)));
    if (elements.objYInput) elements.objYInput.value = String(round1(toFinite(obj.y, 0)));
    if (elements.objExtra1Input) elements.objExtra1Input.value = String(round1(toFinite(obj.width, 3.2)));
    if (elements.objExtra2Input) elements.objExtra2Input.value = String(round1(toFinite(obj.height, 0.12)));
    if (elements.objExtra1Label) elements.objExtra1Label.textContent = 'width';
    if (elements.objExtra2Label) elements.objExtra2Label.textContent = 'height';
  } else {
    if (elements.objXInput) elements.objXInput.value = String(round1(toFinite(obj.x, 0)));
    if (elements.objYInput) elements.objYInput.value = String(round1(toFinite(obj.y, 0)));
    if (elements.objExtra1Input) elements.objExtra1Input.value = String(round1(toFinite(obj.width, 1.2)));
    if (elements.objExtra2Input) elements.objExtra2Input.value = String(round1(toFinite(obj.height, 0.2)));
    if (elements.objExtra1Label) elements.objExtra1Label.textContent = 'width';
    if (elements.objExtra2Label) elements.objExtra2Label.textContent = 'height';
  }
  updateMakerHint(`선택됨: ${obj.oid} (${obj.type})`);
}

function syncObjectList() {
  if (!elements.objectList) {
    return;
  }
  const objects = getObjects();
  const options = objects
    .map((obj, index) => {
      const oid = String(obj && obj.oid ? obj.oid : `obj_${index + 1}`);
      const type = String(obj && obj.type ? obj.type : 'unknown');
      let suffix = '';
      if (type === 'wall_polyline') {
        const points = Array.isArray(obj.points) ? obj.points.length : 0;
        suffix = ` (${points}pt)`;
      } else if (type === 'portal' && obj && obj.pair) {
        suffix = ` (→ ${obj.pair})`;
      }
      return `<option value="${index}">${index + 1}. ${oid} [${type}]${suffix}</option>`;
    })
    .join('');
  elements.objectList.innerHTML = options || '<option value="">오브젝트 없음</option>';
  if (objects.length === 0) {
    editorState.selectedIndex = -1;
    populateObjectEditor();
    return;
  }
  if (editorState.selectedIndex < 0 || editorState.selectedIndex >= objects.length) {
    editorState.selectedIndex = objects.length - 1;
  }
  elements.objectList.value = String(editorState.selectedIndex);
  populateObjectEditor();
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
  if (obj.type === 'wall_polyline') {
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
    refreshCurrentJsonViewer();
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
    refreshCurrentJsonViewer();
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
    refreshCurrentJsonViewer();
    return;
  }
  if (obj.type === 'hammer') {
    obj.x = round1(toFinite(elements.objXInput ? elements.objXInput.value : obj.x, toFinite(obj.x, 0)));
    obj.y = round1(toFinite(elements.objYInput ? elements.objYInput.value : obj.y, toFinite(obj.y, 0)));
    obj.triggerRadius = round1(toFinite(elements.objExtra1Input ? elements.objExtra1Input.value : obj.triggerRadius, toFinite(obj.triggerRadius, 1.2)));
    obj.cooldownMs = Math.round(toFinite(elements.objExtra2Input ? elements.objExtra2Input.value : obj.cooldownMs, toFinite(obj.cooldownMs, 320)));
    obj.radius = round1(toFinite(elements.objRadiusInput ? elements.objRadiusInput.value : obj.radius, toFinite(obj.radius, 0.6)));
    obj.rotation = round1(toFinite(elements.objRotationInput ? elements.objRotationInput.value : obj.rotation, toFinite(obj.rotation, 0)));
    obj.dirDeg = Math.round(toFinite(elements.objDirInput ? elements.objDirInput.value : obj.dirDeg, toFinite(obj.dirDeg, 90)));
    obj.force = round1(toFinite(elements.objForceInput ? elements.objForceInput.value : obj.force, toFinite(obj.force, 4.2)));
    obj.intervalMs = Math.round(toFinite(elements.objIntervalInput ? elements.objIntervalInput.value : obj.intervalMs, toFinite(obj.intervalMs, 1200)));
    obj.hitDistance = round1(toFinite(
      elements.objHitDistanceInput ? elements.objHitDistanceInput.value : obj.hitDistance,
      toFinite(obj.hitDistance, 0.95),
    ));
    refreshCurrentJsonViewer();
    return;
  }
  obj.x = round1(toFinite(elements.objXInput ? elements.objXInput.value : obj.x, toFinite(obj.x, 0)));
  obj.y = round1(toFinite(elements.objYInput ? elements.objYInput.value : obj.y, toFinite(obj.y, 0)));
  obj.width = round1(toFinite(elements.objExtra1Input ? elements.objExtra1Input.value : obj.width, toFinite(obj.width, 1.2)));
  obj.height = round1(toFinite(elements.objExtra2Input ? elements.objExtra2Input.value : obj.height, toFinite(obj.height, 0.2)));
  obj.radius = round1(toFinite(elements.objRadiusInput ? elements.objRadiusInput.value : obj.radius, toFinite(obj.radius, 0.6)));
  obj.rotation = round1(toFinite(elements.objRotationInput ? elements.objRotationInput.value : obj.rotation, toFinite(obj.rotation, 0)));
  obj.pair = String(elements.objPairInput && elements.objPairInput.value ? elements.objPairInput.value : obj.pair || '').trim();
  obj.dirDeg = Math.round(toFinite(elements.objDirInput ? elements.objDirInput.value : obj.dirDeg, toFinite(obj.dirDeg, 90)));
  obj.force = round1(toFinite(elements.objForceInput ? elements.objForceInput.value : obj.force, toFinite(obj.force, 4.2)));
  obj.intervalMs = Math.round(toFinite(elements.objIntervalInput ? elements.objIntervalInput.value : obj.intervalMs, toFinite(obj.intervalMs, 1200)));
  refreshCurrentJsonViewer();
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
    obj.rotation = round1(normalizeDeg(-toFinite(obj.rotation, 0)));
    refreshCurrentJsonViewer();
    return `해머 타격 방향 반전 완료 (dirDeg=${obj.dirDeg})`;
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
  if (copy.type === 'wall_polyline') {
    const points = Array.isArray(copy.points) ? copy.points : [];
    for (let index = 0; index < points.length; index += 1) {
      points[index][1] = round1(toFinite(points[index][1], 0) + 2);
    }
  } else if (copy.type === 'portal') {
    copy.y = round1(toFinite(copy.y, 0) + 2);
    copy.pair = '';
  } else {
    copy.y = round1(toFinite(copy.y, 0) + 2);
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
  if (objects.length === 0) {
    editorState.selectedIndex = -1;
    refreshCurrentJsonViewer();
    return;
  }
  editorState.selectedIndex = Math.min(editorState.selectedIndex, objects.length - 1);
  refreshCurrentJsonViewer();
}

function clearAllObjects() {
  const mapJson = getMutableMap();
  mapJson.objects = [];
  editorState.selectedIndex = -1;
  editorState.pendingWallStart = null;
  editorState.pendingPortalOid = '';
  resetActiveDrag();
  refreshCurrentJsonViewer();
}

function applyStageInputsToDraft() {
  const mapJson = getMutableMap();
  mapJson.stage.goalY = Math.max(20, toFinite(elements.stageGoalInput ? elements.stageGoalInput.value : mapJson.stage.goalY, mapJson.stage.goalY));
  mapJson.stage.zoomY = Math.max(10, toFinite(elements.stageZoomInput ? elements.stageZoomInput.value : mapJson.stage.zoomY, mapJson.stage.zoomY));
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
    if (obj.type === 'wall_polyline') {
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

function objectDistanceWorld(obj, x, y) {
  if (!obj || typeof obj !== 'object') {
    return Number.POSITIVE_INFINITY;
  }
  if (obj.type === 'wall_polyline') {
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
  if (bestDistance > 2.2) {
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

function getObjectAnchorWorld(obj) {
  if (!obj || typeof obj !== 'object') {
    return { x: 0, y: 0 };
  }
  if (obj.type === 'wall_polyline') {
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
  if (obj.type === 'wall_polyline') {
    const points = Array.isArray(obj.points) ? obj.points : [];
    if (points.length < 2) {
      return;
    }
    const anchor = getObjectAnchorWorld(obj);
    const dx = round1(targetX - anchor.x);
    const dy = round1(targetY - anchor.y);
    for (let index = 0; index < points.length; index += 1) {
      points[index][0] = round1(toFinite(points[index][0], 0) + dx);
      points[index][1] = round1(toFinite(points[index][1], 0) + dy);
    }
    return;
  }
  obj.x = round1(targetX);
  obj.y = round1(targetY);
}

function supportsRotationHandle(obj) {
  const type = String(obj && obj.type ? obj.type : '');
  return type === 'box_block' || type === 'diamond_block' || type === 'rotor' || type === 'hammer';
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

function findSelectedHandle(point, layout) {
  const obj = getSelectedObject();
  if (!obj || !layout) {
    return null;
  }
  const thresholdWorld = Math.max(0.08, 9 / Math.max(0.001, layout.scale));
  const type = String(obj.type || '');
  if (type === 'wall_polyline') {
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
  const rotateHandle = getRotationHandleWorld(obj);
  if (rotateHandle) {
    const dist = Math.hypot(point.x - rotateHandle.x, point.y - rotateHandle.y);
    if (dist <= thresholdWorld) {
      return { kind: 'rotation' };
    }
  }
  return null;
}

function drawObjectOnCanvas(ctx, layout, obj, selected) {
  ctx.save();
  const color = String(obj && obj.color ? obj.color : '#77b7ff');
  ctx.strokeStyle = selected ? '#ffd44d' : color;
  ctx.fillStyle = selected ? 'rgba(255, 212, 77, 0.25)' : 'rgba(110, 180, 255, 0.22)';
  ctx.lineWidth = selected ? 3 : 2;

  if (obj.type === 'wall_polyline') {
    const points = Array.isArray(obj.points) ? obj.points : [];
    if (points.length >= 2) {
      const first = worldToCanvas(layout, points[0][0], points[0][1]);
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      for (let index = 1; index < points.length; index += 1) {
        const next = worldToCanvas(layout, points[index][0], points[index][1]);
        ctx.lineTo(next.x, next.y);
      }
      ctx.stroke();
      if (selected) {
        for (let index = 0; index < points.length; index += 1) {
          const point = worldToCanvas(layout, points[index][0], points[index][1]);
          ctx.beginPath();
          ctx.arc(point.x, point.y, 4.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
    return;
  }

  const center = worldToCanvas(layout, obj.x, obj.y);
  if (obj.type === 'peg_circle' || obj.type === 'portal' || obj.type === 'burst_bumper') {
    const radius = Math.max(0.08, toFinite(obj.radius, 0.6)) * layout.scale;
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
    }
    ctx.restore();
    return;
  }

  const width = Math.max(0.08, toFinite(obj.width, obj.type === 'rotor' ? 3 : (obj.type === 'diamond_block' ? 0.32 : 1.2)));
  const height = Math.max(0.05, toFinite(obj.height, obj.type === 'rotor' ? 0.12 : (obj.type === 'diamond_block' ? 0.32 : 0.2)));
  const rad = (Math.PI / 180) * toFinite(obj.rotation, 0);
  const drawWidth = width * layout.scale;
  const drawHeight = height * layout.scale;
  ctx.translate(center.x, center.y);
  ctx.rotate(rad);
  ctx.beginPath();
  ctx.rect(-drawWidth, -drawHeight, drawWidth * 2, drawHeight * 2);
  ctx.fill();
  ctx.stroke();

  if (selected && supportsRotationHandle(obj)) {
    const handleLength = (Math.max(width, height) + 0.65) * layout.scale;
    ctx.strokeStyle = '#ffd44d';
    ctx.fillStyle = '#ffd44d';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -handleLength);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -handleLength, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
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
  const hasLiveFrame = !!(elements.previewFrame && elements.previewFrame.src);
  ctx.fillStyle = hasLiveFrame ? 'rgba(8, 18, 38, 0.12)' : '#081226';
  ctx.fillRect(0, 0, layout.width, layout.height);
  ctx.strokeStyle = 'rgba(120, 158, 225, 0.28)';
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

  const objects = getObjects();
  for (let index = 0; index < objects.length; index += 1) {
    drawObjectOnCanvas(ctx, layout, objects[index], index === editorState.selectedIndex);
  }

  if (editorState.pendingWallStart) {
    const p = worldToCanvas(layout, editorState.pendingWallStart.x, editorState.pendingWallStart.y);
    if (editorState.canvasHoverWorld) {
      const hover = worldToCanvas(layout, editorState.canvasHoverWorld.x, editorState.canvasHoverWorld.y);
      ctx.strokeStyle = '#ffd44d';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(hover.x, hover.y);
      ctx.stroke();
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

  if (editorState.dragState && editorState.dragState.type === 'hammer_create') {
    const start = editorState.dragState.startWorld;
    const current = editorState.dragState.currentWorld || start;
    if (start && current) {
      const p1 = worldToCanvas(layout, start.x, start.y);
      const p2 = worldToCanvas(layout, current.x, current.y);
      const left = Math.min(p1.x, p2.x);
      const top = Math.min(p1.y, p2.y);
      const width = Math.abs(p2.x - p1.x);
      const height = Math.abs(p2.y - p1.y);
      ctx.fillStyle = 'rgba(255, 165, 87, 0.18)';
      ctx.strokeStyle = '#ffa557';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(left, top, width, height);
      ctx.fill();
      ctx.stroke();
    }
  }
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
  const zoomFactor = direction > 0 ? 1.12 : 1 / 1.12;
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
    moved: false,
  };
  return true;
}

function beginHandleDrag(index, handle) {
  if (!handle || !Number.isFinite(index)) {
    return false;
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
  if (handle.kind === 'rotation') {
    editorState.dragState = {
      type: 'rotation',
      index,
      moved: false,
    };
    return true;
  }
  return false;
}

function beginHammerCreateDrag(point) {
  editorState.dragState = {
    type: 'hammer_create',
    startWorld: { x: point.x, y: point.y },
    currentWorld: { x: point.x, y: point.y },
    moved: false,
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
    color: '#ffa557',
  };
}

function updateObjectByDrag(point) {
  const drag = editorState.dragState;
  if (!drag) {
    return false;
  }
  const objects = getObjects();
  const index = Math.floor(toFinite(drag.index, -1));
  if (drag.type === 'hammer_create') {
    drag.currentWorld = { x: point.x, y: point.y };
    drag.moved = true;
    drawMakerCanvas();
    return false;
  }
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
      points[pointIndex][0] = round1(point.x);
      points[pointIndex][1] = round1(point.y);
      drag.moved = true;
      return true;
    }
    return false;
  }
  if (drag.type === 'rotation') {
    const cx = toFinite(obj.x, 0);
    const cy = toFinite(obj.y, 0);
    const angleRad = Math.atan2(point.y - cy, point.x - cx);
    const nextRotation = round1((angleRad * 180) / Math.PI + 90);
    obj.rotation = normalizeDeg(nextRotation);
    drag.moved = true;
    return true;
  }
  if (drag.type === 'move') {
    const mapJson = getMutableMap();
    const goalY = Math.max(25, toFinite(mapJson.stage && mapJson.stage.goalY, 210) + 4);
    const targetX = clamp(toFinite(point.x - toFinite(drag.offsetX, 0), 0), 0, WORLD_WIDTH);
    const targetY = clamp(toFinite(point.y - toFinite(drag.offsetY, 0), 0), 0, goalY);
    moveObjectToWorld(obj, round1(targetX), round1(targetY));
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
  if (drag.type === 'hammer_create') {
    const start = drag.startWorld;
    const end = drag.currentWorld || drag.startWorld;
    const created = createHammerFromDrag(start, end);
    const objects = getObjects();
    objects.push(created);
    editorState.selectedIndex = objects.length - 1;
    syncObjectList();
    refreshCurrentJsonViewer();
    queueLiveDraftApply('해머 생성');
    updateMakerHint(`해머 생성 완료: ${created.oid}`);
    resetActiveDrag();
    drawMakerCanvas();
    return;
  }
  const moved = drag.moved === true;
  resetActiveDrag();
  if (moved) {
    syncObjectList();
    refreshCurrentJsonViewer();
    queueLiveDraftApply('오브젝트 드래그 수정');
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
  const tool = selectedTool();
  if (tool === 'hammer') {
    event.preventDefault();
    beginHammerCreateDrag(point);
    editorState.suppressClickOnce = true;
    drawMakerCanvas();
    updateMakerHint('해머 드래그: 시작점부터 드래그 후 마우스를 놓으면 생성');
    return;
  }
  if (tool !== 'select') {
    addObjectAt(tool, point.x, point.y);
    editorState.suppressClickOnce = true;
    return;
  }
  const layout = getCanvasLayout();
  const selectedIndex = editorState.selectedIndex;
  const handle = findSelectedHandle(point, layout);
  if (selectedIndex >= 0 && handle) {
    beginHandleDrag(selectedIndex, handle);
    editorState.suppressClickOnce = true;
    updateMakerHint(handle.kind === 'wall_point' ? '벽 끝점 드래그 편집중' : '회전 핸들 드래그 편집중');
    return;
  }
  const nearestIndex = findNearestObjectIndex(point.x, point.y);
  editorState.selectedIndex = nearestIndex;
  syncObjectList();
  if (nearestIndex >= 0) {
    beginMoveDrag(nearestIndex, point);
    editorState.suppressClickOnce = true;
    updateMakerHint('오브젝트 드래그 이동중');
  }
  drawMakerCanvas();
}

function handleMakerCanvasPointerMove(event) {
  const shouldTrackHover = !!(editorState.pendingWallStart || editorState.pendingPortalOid || editorState.dragState);
  if (!shouldTrackHover) {
    if (editorState.canvasHoverWorld) {
      editorState.canvasHoverWorld = null;
      drawMakerCanvas();
    }
    return;
  }
  updateCanvasHoverPoint(event);
  const point = readCanvasWorldPoint(event);
  if (!point || !editorState.dragState) {
    drawMakerCanvas();
    return;
  }
  const updated = updateObjectByDrag(point);
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

function addObjectAt(tool, x, y) {
  const objects = getObjects();
  if (tool === 'wall_polyline') {
    if (!editorState.pendingWallStart) {
      editorState.pendingWallStart = { x, y };
      updateMakerHint(`벽 시작점 설정됨 (${x}, ${y}) → 다음 클릭으로 끝점/연결`);
      drawMakerCanvas();
      return;
    }
    const start = editorState.pendingWallStart;
    const length = Math.hypot(toFinite(x, 0) - toFinite(start.x, 0), toFinite(y, 0) - toFinite(start.y, 0));
    if (length < 0.06) {
      updateMakerHint('벽 길이가 너무 짧습니다. 다른 위치를 클릭하세요.');
      drawMakerCanvas();
      return;
    }
    objects.push({
      oid: nextOid('wall'),
      type: 'wall_polyline',
      points: [[start.x, start.y], [x, y]],
      color: '#4f6fdb',
    });
    editorState.pendingWallStart = { x, y };
    updateMakerHint('벽 연결 추가됨. 계속 클릭하면 이어서 생성됩니다. 우클릭으로 선택 모드 전환');
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
      if (firstPortal && firstPortal !== created) {
        firstPortal.pair = created.oid;
        created.pair = firstPortal.oid;
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
  }
  editorState.selectedIndex = objects.length - 1;
  syncObjectList();
  refreshCurrentJsonViewer();
  queueLiveDraftApply('오브젝트 추가');
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
    syncObjectList();
    drawMakerCanvas();
    return;
  }
  addObjectAt(tool, point.x, point.y);
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
    const api = await waitForEngineApi(8000);
    await applyDraftMapToApi(api, {
      live: true,
      preserveMarbles: true,
      preserveRunning: true,
      updateCandidates: false,
    });
    setWorkingMapJson(getWorkingMapJson(resolveCurrentMapId()), resolveCurrentMapId());
    ensureEngineCanvasFill();
    syncViewZoomInputFromEngine();
    const running = readEngineRunning(api);
    setPlayPauseUi(running);
    applyViewZoomToEngine(!running);
    await syncPreviewFromDraft({
      preserveMarbles: true,
      preserveRunning: true,
      updateCandidates: false,
    });
    if (reason) {
      setStatus(`실시간 적용: ${reason}`);
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

function queueLiveDraftApply(reason = '') {
  if (FILE_PROTOCOL) {
    return;
  }
  if (liveApplyTimer) {
    window.clearTimeout(liveApplyTimer);
    liveApplyTimer = 0;
  }
  liveApplyTimer = window.setTimeout(() => {
    liveApplyTimer = 0;
    void applyDraftLiveNow(reason || '자동 적용');
  }, LIVE_APPLY_DEBOUNCE_MS);
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
  startEngineCanvasFillRetry();
  setStatus('엔진 iframe 로드 완료. API 연결 대기 중...');
  const api = await waitForEngineApi(30000);
  const initResult = await api.init(readPayload());
  if (!initResult || initResult.ok !== true) {
    throw new Error(initResult && initResult.reason ? initResult.reason : '초기화에 실패했습니다');
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
  setStatus(`엔진 준비 완료: 맵=${resolveCurrentMapId()}`);
}

async function loadPreviewFrame() {
  if (!elements.previewFrame) {
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

async function saveSelectedMapOverwrite() {
  const selected = selectedMapCatalogEntry();
  if (!selected) {
    throw new Error('덮어쓸 맵을 목록에서 먼저 선택하세요');
  }
  const mapJson = await getCurrentMapJsonForSave();
  mapJson.id = selected.id;
  mapJson.title = selected.id;
  await saveMapViaServer({
    mode: 'selected',
    selectedMapId: selected.id,
    mapJson,
  });
  await refreshMapCatalog(selected.id);
  if (elements.mapSelect) {
    elements.mapSelect.value = selected.id;
  }
  if (elements.mapNameInput) {
    elements.mapNameInput.value = selected.id;
  }
  await loadSelectedCatalogMap();
  setStatus(`선택 맵 저장 완료: ${selected.id}`);
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

function setupEvents() {
  window.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });

  bindEvent(elements.marbleCountInput, 'change', () => {
    getCurrentMarbleCount();
  });

  bindEvent(elements.applyMarbleCountButton, 'click', async () => {
    const marbleCount = getCurrentMarbleCount();
    await withEngineAction(async (api) => {
      const candidateResult = await api.setCandidates(buildAutoCandidates(marbleCount));
      if (!candidateResult || candidateResult.ok !== true) {
        throw new Error(candidateResult && candidateResult.reason ? candidateResult.reason : '공 개수 적용에 실패했습니다');
      }
      setPlayPauseUi(readEngineRunning(api));
      setStatus(`테스트 공 개수 적용 완료: ${marbleCount}개`);
    });
    await syncPreviewFromDraft({
      preserveMarbles: false,
      preserveRunning: false,
      updateCandidates: true,
    });
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

  bindEvent(elements.saveSelectedMapButton, 'click', async () => {
    setBusy(true);
    try {
      await saveSelectedMapOverwrite();
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
    cancelDrag();
    const tool = selectedTool();
    if (tool === 'select') {
      updateMakerHint('선택 모드: 클릭 선택, 드래그 이동, 벽 끝점/회전 핸들 드래그 편집');
    } else if (tool === 'wall_polyline') {
      updateMakerHint('벽 모드: 첫 클릭 시작점, 이후 클릭마다 연결 벽이 계속 생성됩니다');
    } else if (tool === 'portal') {
      updateMakerHint('포털 모드: 두 번 클릭해서 A/B 포털을 자동으로 연결');
    } else if (tool === 'hammer') {
      updateMakerHint('해머 모드: 캔버스에서 드래그해 두꺼운 사각형 해머를 생성');
    } else {
      updateMakerHint(`${toolDisplayName(tool)} 모드: 캔버스 클릭으로 오브젝트 추가`);
    }
    drawMakerCanvas();
  });

  if (Array.isArray(elements.makerToolButtons)) {
    for (let index = 0; index < elements.makerToolButtons.length; index += 1) {
      const button = elements.makerToolButtons[index];
      bindEvent(button, 'click', () => {
        const tool = button && button.dataset ? button.dataset.makerTool : '';
        setSelectedTool(tool);
        if (elements.makerToolSelect) {
          elements.makerToolSelect.dispatchEvent(new Event('change'));
        }
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

  window.addEventListener('mousemove', (event) => {
    updateMakerCanvasPan(event);
    handleMakerCanvasPointerMove(event);
  });

  window.addEventListener('mouseup', (event) => {
    endMakerCanvasPan();
    handleMakerCanvasPointerUp(event);
  });

  bindEvent(elements.makerCanvas, 'contextmenu', (event) => {
    event.preventDefault();
    setSelectedTool('select');
    resetPendingWall();
    resetPendingPortal();
    cancelDrag();
    if (elements.makerToolSelect) {
      elements.makerToolSelect.dispatchEvent(new Event('change'));
    }
    setStatus('우클릭: 선택 모드로 전환');
  });

  bindEvent(elements.objectList, 'change', () => {
    const index = Number(elements.objectList && elements.objectList.value ? elements.objectList.value : -1);
    editorState.selectedIndex = Number.isFinite(index) ? index : -1;
    populateObjectEditor();
    drawMakerCanvas();
  });

  bindEvent(elements.applyObjectButton, 'click', () => {
    try {
      applyObjectEditorValues();
      syncObjectList();
      queueLiveDraftApply('오브젝트 수정');
      drawMakerCanvas();
      setStatus('선택 오브젝트 값 반영 완료');
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), 'error');
    }
  });

  bindEvent(elements.reverseRotationButton, 'click', () => {
    try {
      const message = reverseSelectedObjectRotation();
      syncObjectList();
      populateObjectEditor();
      queueLiveDraftApply('회전 반전');
      drawMakerCanvas();
      setStatus(message);
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), 'error');
    }
  });

  bindEvent(elements.duplicateObjectButton, 'click', () => {
    try {
      duplicateSelectedObject();
      syncObjectList();
      queueLiveDraftApply('오브젝트 복제');
      drawMakerCanvas();
      setStatus('선택 오브젝트 복제 완료');
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), 'error');
    }
  });

  bindEvent(elements.deleteObjectButton, 'click', () => {
    try {
      deleteSelectedObject();
      syncObjectList();
      queueLiveDraftApply('오브젝트 삭제');
      drawMakerCanvas();
      setStatus('선택 오브젝트 삭제 완료');
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), 'error');
    }
  });

  bindEvent(elements.clearObjectsButton, 'click', () => {
    clearAllObjects();
    syncObjectList();
    queueLiveDraftApply('오브젝트 전체삭제');
    drawMakerCanvas();
    setStatus('오브젝트 전체 삭제 완료');
  });

  bindEvent(elements.fitStageButton, 'click', () => {
    autoFitStageFromObjects();
    queueLiveDraftApply('스테이지 자동맞춤');
    drawMakerCanvas();
    setStatus('스테이지 자동맞춤 완료');
  });

  bindEvent(elements.applyStageButton, 'click', () => {
    applyStageInputsToDraft();
    queueLiveDraftApply('스테이지 값 변경');
    drawMakerCanvas();
    setStatus('스테이지 값 반영 완료 (드래프트)');
  });

  bindEvent(elements.applyViewZoomButton, 'click', () => {
    if (applyViewZoomToEngine(true)) {
      setStatus('뷰 줌 적용 완료');
    } else {
      setStatus('엔진 준비 후 뷰 줌 적용 가능', 'warn');
    }
  });

  bindEvent(elements.applyDraftButton, 'click', async () => {
    void applyDraftLiveNow('수동 적용');
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
      setPlayPauseUi(true);
      setStatus('시작되었습니다');
    });
  });

  bindEvent(elements.resetButton, 'click', async () => {
    await withEngineAction(async (api) => {
      const result = await api.reset();
      if (!result || result.ok !== true) {
        throw new Error(result && result.reason ? result.reason : '리셋에 실패했습니다');
      }
      setPlayPauseUi(false);
      applyViewZoomToEngine(true);
      setStatus('리셋이 완료되었습니다');
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
      setPlayPauseUi(false);
      applyViewZoomToEngine(true);
      setStatus(`${slotId} 퀵 로드 완료 (일시정지 복원)`);
    });
  });

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') {
      return;
    }
    const hadPending = !!(editorState.pendingWallStart || editorState.pendingPortalOid || editorState.dragState);
    resetPendingWall();
    resetPendingPortal();
    cancelDrag();
    if (hadPending) {
      updateMakerHint('대기중 작업을 취소했습니다.');
      drawMakerCanvas();
    }
  });

  window.addEventListener('resize', () => {
    drawMakerCanvas();
  });
}

async function boot() {
  setupEvents();
  const initialMapId = 'v2_default';
  setMarbleCountInput(DEFAULT_MARBLE_COUNT);
  setJsonViewerOpen(false);
  if (elements.mapNameInput) {
    elements.mapNameInput.value = initialMapId;
  }
  setWorkingMapJson(buildDefaultMapJson(initialMapId), initialMapId);
  syncStageInputsFromMap();
  syncObjectList();
  setSelectedTool('select');
  drawMakerCanvas();
  updateMakerHint('툴을 선택해 배치하고, 선택 모드에서 드래그/핸들로 즉시 수정하세요.');
  setPlayPauseUi(false);
  setPreviewPlayPauseUi(false);
  setPreviewStatus('좌표창 엔진 연결 대기');
  if (FILE_PROTOCOL) {
    setStatus('현재 file:// 경로입니다. tools/start_pinball_map_maker_v2.bat 로 실행하세요', 'warn');
    return;
  }
  setBusy(true);
  try {
    await refreshMapCatalog(initialMapId);
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
}

void boot();
