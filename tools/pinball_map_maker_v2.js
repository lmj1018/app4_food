const SLOT_IDS = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'slot6', 'slot7', 'slot8'];
const MAPS_BASE_URL = '../assets/ui/pinball/maps';
const FILE_PROTOCOL = window.location.protocol === 'file:';

let mapsDirectoryHandle = null;
let mapCatalog = [];

const elements = {
  mapJsonInput: document.getElementById('mapJsonInput'),
  mapsDirStatus: document.getElementById('mapsDirStatus'),
  mapSelect: document.getElementById('mapSelect'),
  refreshMapListButton: document.getElementById('refreshMapListButton'),
  loadSelectedMapButton: document.getElementById('loadSelectedMapButton'),
  newMapIdInput: document.getElementById('newMapIdInput'),
  newMapTitleInput: document.getElementById('newMapTitleInput'),
  saveSelectedMapButton: document.getElementById('saveSelectedMapButton'),
  saveAsNewMapButton: document.getElementById('saveAsNewMapButton'),
  connectMapsDirButton: document.getElementById('connectMapsDirButton'),
  pullMapButton: document.getElementById('pullMapButton'),
  applyJsonButton: document.getElementById('applyJsonButton'),
  mapIdInput: document.getElementById('mapIdInput'),
  marbleCountInput: document.getElementById('marbleCountInput'),
  winningRankInput: document.getElementById('winningRankInput'),
  candidatesInput: document.getElementById('candidatesInput'),
  applyButton: document.getElementById('applyButton'),
  reloadButton: document.getElementById('reloadButton'),
  startButton: document.getElementById('startButton'),
  pauseButton: document.getElementById('pauseButton'),
  resetButton: document.getElementById('resetButton'),
  stateButton: document.getElementById('stateButton'),
  quickSaveButton: document.getElementById('quickSaveButton'),
  quickLoadButton: document.getElementById('quickLoadButton'),
  slotSelect: document.getElementById('slotSelect'),
  saveSlotButton: document.getElementById('saveSlotButton'),
  loadSlotButton: document.getElementById('loadSlotButton'),
  deleteSlotButton: document.getElementById('deleteSlotButton'),
  refreshSlotsButton: document.getElementById('refreshSlotsButton'),
  statusBox: document.getElementById('statusBox'),
  snapshotList: document.getElementById('snapshotList'),
  engineFrame: document.getElementById('engineFrame'),
  engineUrlText: document.getElementById('engineUrlText'),
};

function setStatus(message, kind = 'ok') {
  const text = String(message ?? '');
  if (!elements.statusBox) {
    return;
  }
  elements.statusBox.textContent = text;
  if (kind === 'error') {
    elements.statusBox.style.color = '#ff9898';
  } else if (kind === 'warn') {
    elements.statusBox.style.color = '#ffcf84';
  } else {
    elements.statusBox.style.color = '#7df4bc';
  }
}

function setMapsDirStatus(message, kind = 'ok') {
  if (!elements.mapsDirStatus) {
    return;
  }
  elements.mapsDirStatus.textContent = String(message ?? '');
  if (kind === 'error') {
    elements.mapsDirStatus.style.color = '#ff9f9f';
    elements.mapsDirStatus.style.borderColor = '#7a3e3e';
    elements.mapsDirStatus.style.background = '#2a1212';
    return;
  }
  if (kind === 'warn') {
    elements.mapsDirStatus.style.color = '#ffd597';
    elements.mapsDirStatus.style.borderColor = '#7b633d';
    elements.mapsDirStatus.style.background = '#261f14';
    return;
  }
  elements.mapsDirStatus.style.color = '#8fe7be';
  elements.mapsDirStatus.style.borderColor = '#3d6a56';
  elements.mapsDirStatus.style.background = '#0e1f1b';
}

function bindEvent(element, eventName, handler) {
  if (!element || typeof element.addEventListener !== 'function') {
    return;
  }
  element.addEventListener(eventName, handler);
}

function setBusy(isBusy) {
  const buttons = [
    elements.refreshMapListButton,
    elements.loadSelectedMapButton,
    elements.saveSelectedMapButton,
    elements.saveAsNewMapButton,
    elements.connectMapsDirButton,
    elements.pullMapButton,
    elements.applyJsonButton,
    elements.applyButton,
    elements.reloadButton,
    elements.startButton,
    elements.pauseButton,
    elements.resetButton,
    elements.stateButton,
    elements.quickSaveButton,
    elements.quickLoadButton,
    elements.saveSlotButton,
    elements.loadSlotButton,
    elements.deleteSlotButton,
    elements.refreshSlotsButton,
  ];
  buttons.forEach((button) => {
    if (button) {
      button.disabled = isBusy;
    }
  });
}

function buildAutoCandidates() {
  const count = Math.max(1, Math.min(200, Number(elements.marbleCountInput.value) || 1));
  const list = [];
  for (let index = 0; index < count; index += 1) {
    list.push(`후보 ${String(index + 1).padStart(2, '0')}`);
  }
  return list;
}

function readCandidates() {
  const lines = String(elements.candidatesInput.value || '')
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length > 0) {
    return lines;
  }
  return buildAutoCandidates();
}

function readPayload() {
  const mapId = String(elements.mapIdInput.value || '').trim() || 'v2_default';
  const winningRank = Math.max(1, Math.floor(Number(elements.winningRankInput.value) || 1));
  const candidates = readCandidates();
  return {
    mapId,
    winningRank,
    candidates,
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

function prettyJson(value) {
  return JSON.stringify(value, null, 2);
}

function writeMapJsonEditor(mapJson) {
  if (!elements.mapJsonInput) {
    return;
  }
  elements.mapJsonInput.value = prettyJson(mapJson);
}

function parseMapJsonText() {
  const rawText = String(elements.mapJsonInput && elements.mapJsonInput.value ? elements.mapJsonInput.value : '').trim();
  if (!rawText) {
    throw new Error('맵 JSON 입력칸이 비어 있습니다');
  }
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    throw new Error(`맵 JSON 파싱 실패: ${String(error && error.message ? error.message : error)}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('맵 JSON 형식이 올바르지 않습니다');
  }
  const fallbackMapId = String(elements.mapIdInput.value || '').trim() || `v2_custom_${Date.now()}`;
  if (typeof parsed.id !== 'string' || !parsed.id.trim()) {
    parsed.id = fallbackMapId;
  }
  if (typeof parsed.title !== 'string' || !parsed.title.trim()) {
    parsed.title = parsed.id;
  }
  if (!Number.isFinite(Number(parsed.schemaVersion))) {
    parsed.schemaVersion = 1;
  }
  if (!parsed.stage || typeof parsed.stage !== 'object' || Array.isArray(parsed.stage)) {
    parsed.stage = {};
  }
  if (!Array.isArray(parsed.objects)) {
    parsed.objects = [];
  }
  return parsed;
}

function syncMapIdInputFromMapJson(mapJson) {
  const mapId = mapJson && typeof mapJson.id === 'string' && mapJson.id.trim()
    ? mapJson.id.trim()
    : '';
  if (mapId) {
    elements.mapIdInput.value = mapId;
  }
}

function sanitizeMapId(value) {
  const raw = String(value || '').trim();
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]/g, '_');
  return cleaned || `v2_map_${Date.now()}`;
}

function buildMapFileName(mapId) {
  return `${sanitizeMapId(mapId)}.json`;
}

function selectedMapIdFromDropdown() {
  const value = String(elements.mapSelect && elements.mapSelect.value ? elements.mapSelect.value : '').trim();
  return value || '';
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
    .map((entry) => {
      const mapId = String(entry && entry.id ? entry.id : '');
      const title = String(entry && entry.title ? entry.title : mapId);
      return `<option value="${mapId}">${title} (${mapId})</option>`;
    })
    .join('');
  elements.mapSelect.innerHTML = options || '<option value="">등록된 맵 없음</option>';
  const picked = preferredMapId && mapCatalog.some((entry) => entry.id === preferredMapId)
    ? preferredMapId
    : (mapCatalog[0] ? mapCatalog[0].id : '');
  if (picked) {
    elements.mapSelect.value = picked;
  }
}

async function fetchManifestFromServer() {
  const response = await fetch(`${MAPS_BASE_URL}/manifest.json?nocache=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`manifest 로드 실패: ${response.status}`);
  }
  const json = await response.json();
  return normalizeManifestData(json);
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
      title: String(entry.title || entry.id).trim(),
      file: String(entry.file).trim(),
      enabled: entry.enabled !== false,
      sort: Number.isFinite(Number(entry.sort)) ? Number(entry.sort) : 9999,
    }));
  renderMapCatalog(preferredMapId || String(elements.mapIdInput.value || '').trim());
  const selectedMapId = selectedMapIdFromDropdown();
  if (selectedMapId && elements.mapIdInput) {
    elements.mapIdInput.value = selectedMapId;
  }
  if (mapCatalog.length > 0) {
    setStatus(`맵 목록 갱신 완료: ${mapCatalog.length}개`);
  } else {
    setStatus('맵 목록이 비어 있습니다', 'warn');
  }
}

function seedNewMapInputsFromCurrentMap(mapJson) {
  if (elements.newMapIdInput) {
    const nextId = mapJson && typeof mapJson.id === 'string' && mapJson.id.trim()
      ? mapJson.id.trim()
      : 'v2_custom_map';
    elements.newMapIdInput.value = nextId;
  }
  if (elements.newMapTitleInput) {
    const nextTitle = mapJson && typeof mapJson.title === 'string' && mapJson.title.trim()
      ? mapJson.title.trim()
      : 'V2 Custom Map';
    elements.newMapTitleInput.value = nextTitle;
  }
}

async function loadSelectedCatalogMap() {
  const entry = selectedMapCatalogEntry();
  if (!entry) {
    throw new Error('로드할 맵을 먼저 선택하세요');
  }
  elements.mapIdInput.value = entry.id;
  await applyMapAndCandidates();
  await withEngineAction(async (api) => {
    await syncMapJsonEditorFromEngine(api);
  });
  seedNewMapInputsFromCurrentMap(parseMapJsonText());
  setStatus(`선택 맵 로드 완료: ${entry.title} (${entry.id})`);
}

async function syncMapJsonEditorFromEngine(api) {
  if (!api || typeof api.getCurrentMapJson !== 'function') {
    const fallback = buildDefaultMapJson(String(elements.mapIdInput.value || '').trim() || 'v2_custom_map');
    writeMapJsonEditor(fallback);
    seedNewMapInputsFromCurrentMap(fallback);
    return;
  }
  const mapJson = api.getCurrentMapJson();
  if (mapJson && typeof mapJson === 'object') {
    writeMapJsonEditor(mapJson);
    syncMapIdInputFromMapJson(mapJson);
    seedNewMapInputsFromCurrentMap(mapJson);
  } else {
    const fallback = buildDefaultMapJson(String(elements.mapIdInput.value || '').trim() || 'v2_custom_map');
    writeMapJsonEditor(fallback);
    seedNewMapInputsFromCurrentMap(fallback);
  }
}

function getFrameWindow() {
  return elements.engineFrame && elements.engineFrame.contentWindow
    ? elements.engineFrame.contentWindow
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

function readEngineFrameDiagnostics() {
  const frameWindow = getFrameWindow();
  if (!frameWindow) {
    return {
      hasFrameWindow: false,
      hasApi: false,
      hasRoulette: false,
      readyState: '',
      statusText: '',
      bootError: '',
      href: '',
    };
  }
  let readyState = '';
  let statusText = '';
  let href = '';
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
    href = frameWindow.location && frameWindow.location.href
      ? String(frameWindow.location.href)
      : '';
  } catch (_) {
  }
  let bootError = '';
  try {
    bootError = frameWindow.__v2BootError ? String(frameWindow.__v2BootError) : '';
  } catch (_) {
  }
  return {
    hasFrameWindow: true,
    hasApi: !!(frameWindow.__appPinballV2 && typeof frameWindow.__appPinballV2 === 'object'),
    hasRoulette: !!(frameWindow.roulette && typeof frameWindow.roulette === 'object'),
    readyState,
    statusText,
    bootError,
    href,
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

async function waitForEngineApi(timeoutMs = 20000) {
  if (FILE_PROTOCOL) {
    throw new Error('file:// 경로에서는 엔진 모듈이 차단될 수 있습니다. 로컬 서버로 열어주세요 (예: python -m http.server 8080)');
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

function renderSnapshotList(items) {
  if (!Array.isArray(items) || items.length === 0) {
    elements.snapshotList.innerHTML = '<div class="snapshot-item">저장된 스냅샷이 없습니다.</div>';
    return;
  }
  const html = items
    .map((item) => {
      const slot = String(item.slotId || '');
      const label = String(item.label || '');
      const mapId = String(item.mapId || '');
      const count = Number(item.marbleCount || 0);
      return `<div class="snapshot-item"><span class="snapshot-slot">${slot}</span>${label}<br>진행상황 스냅샷 · 맵=${mapId} 볼=${count}</div>`;
    })
    .join('');
  elements.snapshotList.innerHTML = html;
}

async function refreshSnapshotList() {
  const api = getEngineApi();
  if (!api || typeof api.listSnapshots !== 'function') {
    renderSnapshotList([]);
    return;
  }
  const items = api.listSnapshots();
  renderSnapshotList(items);
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
  setStatus('엔진 iframe 로드 완료. API 연결 대기 중...');
  const api = await waitForEngineApi(30000);
  const payload = readPayload();
  const initResult = await api.init(payload);
  if (!initResult || initResult.ok !== true) {
    throw new Error(initResult && initResult.reason ? initResult.reason : '초기화에 실패했습니다');
  }
  await syncMapJsonEditorFromEngine(api);
  await refreshSnapshotList();
  setStatus(`엔진 준비 완료: 맵=${payload.mapId}, 볼=${payload.candidates.length}`);
}

async function withEngineAction(action) {
  setBusy(true);
  try {
    const api = await waitForEngineApi();
    await action(api);
  } catch (error) {
    setStatus(String(error && error.message ? error.message : error), 'error');
  } finally {
    setBusy(false);
  }
}

async function applyMapAndCandidates() {
  await withEngineAction(async (api) => {
    const payload = readPayload();
    const mapResult = await api.loadMapById(payload.mapId);
    if (!mapResult || mapResult.ok !== true) {
      throw new Error(mapResult && mapResult.reason ? mapResult.reason : '맵 로드에 실패했습니다');
    }
    await syncMapJsonEditorFromEngine(api);
    const rankResult = api.setWinningRank(payload.winningRank);
    if (!rankResult || rankResult.ok !== true) {
      throw new Error('당첨 순위 설정에 실패했습니다');
    }
    const candidateResult = await api.setCandidates(payload.candidates);
    if (!candidateResult || candidateResult.ok !== true) {
      throw new Error(candidateResult && candidateResult.reason ? candidateResult.reason : '후보 설정에 실패했습니다');
    }
    if (elements.mapSelect && mapCatalog.some((entry) => entry.id === payload.mapId)) {
      elements.mapSelect.value = payload.mapId;
    }
    setStatus(`맵 설정 적용 완료(테스트 반영): 맵=${payload.mapId}, 후보=${payload.candidates.length}`);
  });
}

async function applyMapJsonFromEditor() {
  await withEngineAction(async (api) => {
    if (typeof api.applyMapJson !== 'function') {
      throw new Error('엔진이 맵 JSON 적용 API를 지원하지 않습니다');
    }
    const payload = readPayload();
    const mapJson = parseMapJsonText();
    const mapResult = await api.applyMapJson(mapJson);
    if (!mapResult || mapResult.ok !== true) {
      throw new Error(mapResult && mapResult.reason ? mapResult.reason : '맵 JSON 적용에 실패했습니다');
    }
    syncMapIdInputFromMapJson(mapJson);
    seedNewMapInputsFromCurrentMap(mapJson);
    writeMapJsonEditor(mapJson);
    const rankResult = api.setWinningRank(payload.winningRank);
    if (!rankResult || rankResult.ok !== true) {
      throw new Error('당첨 순위 설정에 실패했습니다');
    }
    const candidateResult = await api.setCandidates(payload.candidates);
    if (!candidateResult || candidateResult.ok !== true) {
      throw new Error(candidateResult && candidateResult.reason ? candidateResult.reason : '후보 설정에 실패했습니다');
    }
    setStatus(`JSON 맵 적용 완료: 맵=${mapJson.id}, 후보=${payload.candidates.length}`);
  });
}

async function pullMapJsonFromEngine() {
  await withEngineAction(async (api) => {
    await syncMapJsonEditorFromEngine(api);
    const mapJson = parseMapJsonText();
    setStatus(`현재 맵 JSON을 가져왔습니다: ${mapJson.id}`);
  });
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

function nextManifestSort(maps) {
  let maxSort = 0;
  for (let index = 0; index < maps.length; index += 1) {
    const entry = maps[index];
    const value = Number(entry && entry.sort);
    if (Number.isFinite(value) && value > maxSort) {
      maxSort = value;
    }
  }
  return maxSort + 10;
}

function buildManifestEntry(mapJson, fileName, existingEntry, existingMaps) {
  const current = existingEntry && typeof existingEntry === 'object' ? existingEntry : {};
  return {
    ...current,
    id: String(mapJson.id || '').trim(),
    title: String(mapJson.title || mapJson.id || '').trim() || String(mapJson.id || '').trim(),
    engine: 'v2',
    file: fileName,
    enabled: current.enabled === false ? false : true,
    sort: Number.isFinite(Number(current.sort)) ? Number(current.sort) : nextManifestSort(existingMaps),
  };
}

function updateMapsDirConnectedStatus() {
  if (mapsDirectoryHandle) {
    setMapsDirStatus('저장 경로: 연결됨 (assets/ui/pinball/maps 폴더)', 'ok');
    return;
  }
  setMapsDirStatus('저장 경로: 미연결 (연결 버튼으로 1회 선택)', 'warn');
}

async function connectMapsDirectory() {
  if (typeof window.showDirectoryPicker !== 'function') {
    throw new Error('이 브라우저는 폴더 직접 연결을 지원하지 않습니다 (Chrome/Edge 권장)');
  }
  mapsDirectoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
  try {
    await mapsDirectoryHandle.getFileHandle('manifest.json', { create: true });
  } catch (_) {
  }
  updateMapsDirConnectedStatus();
  setStatus('저장 경로 연결 완료. 이제 선택 맵 저장/새 맵 저장을 사용할 수 있습니다.');
}

async function ensureMapsDirectoryConnected() {
  if (!mapsDirectoryHandle) {
    throw new Error('먼저 "저장 경로 연결" 버튼으로 assets/ui/pinball/maps 폴더를 선택하세요');
  }
  if (typeof mapsDirectoryHandle.queryPermission === 'function') {
    const permission = await mapsDirectoryHandle.queryPermission({ mode: 'readwrite' });
    if (permission === 'denied') {
      throw new Error('저장 폴더 쓰기 권한이 거부되었습니다. 다시 연결하세요');
    }
  }
  return mapsDirectoryHandle;
}

async function readJsonFromHandle(fileHandle, fallbackValue) {
  try {
    const file = await fileHandle.getFile();
    const text = await file.text();
    if (!String(text || '').trim()) {
      return fallbackValue;
    }
    return JSON.parse(text);
  } catch (_) {
    return fallbackValue;
  }
}

async function writeJsonToHandle(fileHandle, jsonValue) {
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(prettyJson(jsonValue));
  } finally {
    await writable.close();
  }
}

async function saveMapToConnectedDirectory(mapJson, fileName) {
  const dirHandle = await ensureMapsDirectoryConnected();
  const mapHandle = await dirHandle.getFileHandle(fileName, { create: true });
  await writeJsonToHandle(mapHandle, mapJson);

  const manifestHandle = await dirHandle.getFileHandle('manifest.json', { create: true });
  const manifestRaw = await readJsonFromHandle(manifestHandle, { version: 1, maps: [] });
  const manifestData = normalizeManifestData(manifestRaw);
  const maps = Array.isArray(manifestData.maps) ? manifestData.maps.slice() : [];

  const existingIndex = maps.findIndex((entry) => {
    const id = entry && typeof entry.id === 'string' ? entry.id : '';
    const file = entry && typeof entry.file === 'string' ? entry.file : '';
    return id === mapJson.id || file === fileName;
  });
  const existingEntry = existingIndex >= 0 ? maps[existingIndex] : null;
  const nextEntry = buildManifestEntry(mapJson, fileName, existingEntry, maps);
  if (existingIndex >= 0) {
    maps[existingIndex] = nextEntry;
  } else {
    maps.push(nextEntry);
  }
  manifestData.maps = maps;
  await writeJsonToHandle(manifestHandle, manifestData);
}

async function saveSelectedMapOverwrite() {
  const selected = selectedMapCatalogEntry();
  if (!selected) {
    throw new Error('덮어쓸 맵을 목록에서 먼저 선택하세요');
  }
  const mapJson = parseMapJsonText();
  mapJson.id = selected.id;
  if (typeof mapJson.title !== 'string' || !mapJson.title.trim()) {
    mapJson.title = selected.title || selected.id;
  }
  await saveMapToConnectedDirectory(mapJson, selected.file);
  await refreshMapCatalog(selected.id);
  syncMapIdInputFromMapJson(mapJson);
  seedNewMapInputsFromCurrentMap(mapJson);
  setStatus(`선택 맵 저장 완료: ${selected.title} (${selected.id})`);
}

async function saveAsNewMap() {
  const mapJson = parseMapJsonText();
  const newId = sanitizeMapId(elements.newMapIdInput ? elements.newMapIdInput.value : '');
  const newTitle = String(elements.newMapTitleInput && elements.newMapTitleInput.value
    ? elements.newMapTitleInput.value
    : '')
    .trim() || newId;
  mapJson.id = newId;
  mapJson.title = newTitle;
  const fileName = buildMapFileName(newId);
  await saveMapToConnectedDirectory(mapJson, fileName);
  await refreshMapCatalog(newId);
  syncMapIdInputFromMapJson(mapJson);
  seedNewMapInputsFromCurrentMap(mapJson);
  setStatus(`새 맵 저장 완료: ${newTitle} (${newId})`);
}

function setupSlotOptions() {
  elements.slotSelect.innerHTML = SLOT_IDS.map((slotId) => `<option value="${slotId}">${slotId}</option>`).join('');
}

function selectedSlot() {
  const value = String(elements.slotSelect.value || '').trim();
  return SLOT_IDS.includes(value) ? value : 'slot1';
}

function setupEvents() {
  bindEvent(elements.mapIdInput, 'change', () => {
    const mapId = String(elements.mapIdInput.value || '').trim();
    if (!mapId) {
      return;
    }
    if (elements.newMapIdInput && !String(elements.newMapIdInput.value || '').trim()) {
      elements.newMapIdInput.value = mapId;
    }
  });

  bindEvent(elements.refreshMapListButton, 'click', async () => {
    setBusy(true);
    try {
      await refreshMapCatalog(String(elements.mapIdInput.value || '').trim());
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), 'error');
    } finally {
      setBusy(false);
    }
  });

  bindEvent(elements.loadSelectedMapButton, 'click', async () => {
    setBusy(true);
    try {
      await loadSelectedCatalogMap();
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), 'error');
    } finally {
      setBusy(false);
    }
  });

  bindEvent(elements.connectMapsDirButton, 'click', async () => {
    setBusy(true);
    try {
      await connectMapsDirectory();
    } catch (error) {
      setMapsDirStatus(String(error && error.message ? error.message : error), 'error');
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

  bindEvent(elements.pullMapButton, 'click', async () => {
    await pullMapJsonFromEngine();
  });

  bindEvent(elements.applyJsonButton, 'click', async () => {
    await applyMapJsonFromEditor();
  });

  bindEvent(elements.mapSelect, 'change', () => {
    const entry = selectedMapCatalogEntry();
    if (!entry) {
      return;
    }
    if (elements.mapIdInput) {
      elements.mapIdInput.value = entry.id;
    }
    if (elements.newMapIdInput) {
      elements.newMapIdInput.value = entry.id;
    }
    if (elements.newMapTitleInput) {
      elements.newMapTitleInput.value = entry.title || entry.id;
    }
  });

  bindEvent(elements.reloadButton, 'click', async () => {
    setBusy(true);
    try {
      await loadEngineFrame();
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), 'error');
    } finally {
      setBusy(false);
    }
  });

  bindEvent(elements.applyButton, 'click', async () => {
    await applyMapAndCandidates();
  });

  bindEvent(elements.startButton, 'click', async () => {
    await withEngineAction(async (api) => {
      const result = await api.start();
      if (!result || result.ok !== true) {
        throw new Error(result && result.reason ? result.reason : '시작에 실패했습니다');
      }
      setStatus('시작되었습니다');
    });
  });

  bindEvent(elements.pauseButton, 'click', async () => {
    await withEngineAction(async (api) => {
      const result = await api.pause();
      if (!result || result.ok !== true) {
        throw new Error(result && result.reason ? result.reason : '일시정지에 실패했습니다');
      }
      setStatus('일시정지되었습니다');
    });
  });

  bindEvent(elements.resetButton, 'click', async () => {
    await withEngineAction(async (api) => {
      const result = await api.reset();
      if (!result || result.ok !== true) {
        throw new Error(result && result.reason ? result.reason : '리셋에 실패했습니다');
      }
      setStatus('리셋이 완료되었습니다');
    });
  });

  bindEvent(elements.stateButton, 'click', async () => {
    await withEngineAction(async (api) => {
      const state = api.getState();
      setStatus(JSON.stringify(state, null, 2));
    });
  });

  bindEvent(elements.quickSaveButton, 'click', async () => {
    await withEngineAction(async (api) => {
      const result = await api.saveSnapshot('quick');
      if (!result || result.ok !== true) {
        throw new Error(result && result.reason ? result.reason : '빠른 저장에 실패했습니다');
      }
      await refreshSnapshotList();
      setStatus(`빠른 저장 완료(현재 진행상황): ${result.meta ? result.meta.label : '성공'}`);
    });
  });

  bindEvent(elements.quickLoadButton, 'click', async () => {
    await withEngineAction(async (api) => {
      const result = await api.loadSnapshot('quick', { autoResume: false });
      if (!result || result.ok !== true) {
        throw new Error(result && result.reason ? result.reason : '빠른 불러오기에 실패했습니다');
      }
      await refreshSnapshotList();
      setStatus('진행상황 스냅샷으로 복원되었습니다 (일시정지)');
    });
  });

  bindEvent(elements.saveSlotButton, 'click', async () => {
    await withEngineAction(async (api) => {
      const slotId = selectedSlot();
      const result = await api.saveSnapshot(slotId);
      if (!result || result.ok !== true) {
        throw new Error(result && result.reason ? result.reason : `저장에 실패했습니다 (${slotId})`);
      }
      await refreshSnapshotList();
      setStatus(`${slotId} 저장 완료(현재 진행상황): ${result.meta ? result.meta.label : '성공'}`);
    });
  });

  bindEvent(elements.loadSlotButton, 'click', async () => {
    await withEngineAction(async (api) => {
      const slotId = selectedSlot();
      const result = await api.loadSnapshot(slotId, { autoResume: false });
      if (!result || result.ok !== true) {
        throw new Error(result && result.reason ? result.reason : `불러오기에 실패했습니다 (${slotId})`);
      }
      await refreshSnapshotList();
      setStatus('진행상황 스냅샷으로 복원되었습니다 (일시정지)');
    });
  });

  bindEvent(elements.deleteSlotButton, 'click', async () => {
    await withEngineAction(async (api) => {
      const slotId = selectedSlot();
      const result = api.deleteSnapshot(slotId);
      if (!result || result.ok !== true) {
        throw new Error(result && result.reason ? result.reason : `삭제에 실패했습니다 (${slotId})`);
      }
      await refreshSnapshotList();
      setStatus(`${slotId} 삭제 완료`);
    });
  });

  bindEvent(elements.refreshSlotsButton, 'click', async () => {
    await withEngineAction(async () => {
      await refreshSnapshotList();
      setStatus('스냅샷 목록을 새로고침했습니다');
    });
  });
}

async function boot() {
  setupSlotOptions();
  setupEvents();
  const initialMap = buildDefaultMapJson(String(elements.mapIdInput.value || '').trim() || 'v2_custom_map');
  writeMapJsonEditor(initialMap);
  seedNewMapInputsFromCurrentMap(initialMap);
  updateMapsDirConnectedStatus();
  if (FILE_PROTOCOL) {
    setStatus('현재 file:// 경로입니다. 버튼 동작을 위해 로컬 서버로 열어주세요: python -m http.server 8080 후 http://localhost:8080/tools/pinball_map_maker_v2.html', 'warn');
    return;
  }
  setBusy(true);
  try {
    try {
      await refreshMapCatalog(String(elements.mapIdInput.value || '').trim());
    } catch (catalogError) {
      setStatus(`맵 목록 갱신 실패: ${String(catalogError && catalogError.message ? catalogError.message : catalogError)}`, 'warn');
    }
    await loadEngineFrame();
  } catch (error) {
    setStatus(String(error && error.message ? error.message : error), 'error');
  } finally {
    setBusy(false);
  }
}

void boot();
