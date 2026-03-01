const SLOT_IDS = ['slot1', 'slot2', 'slot3'];
const FILE_PROTOCOL = window.location.protocol === 'file:';

let mapCatalog = [];
let workingMapJson = null;

const elements = {
  mapsDirStatus: document.getElementById('mapsDirStatus'),
  mapSelect: document.getElementById('mapSelect'),
  refreshMapListButton: document.getElementById('refreshMapListButton'),
  saveSelectedMapButton: document.getElementById('saveSelectedMapButton'),
  saveAsNewMapButton: document.getElementById('saveAsNewMapButton'),
  mapIdInput: document.getElementById('mapIdInput'),
  marbleCountInput: document.getElementById('marbleCountInput'),
  winningRankInput: document.getElementById('winningRankInput'),
  candidatesInput: document.getElementById('candidatesInput'),
  applyButton: document.getElementById('applyButton'),
  reloadButton: document.getElementById('reloadButton'),
  playPauseToggleButton: document.getElementById('playPauseToggleButton'),
  playPauseIcon: document.getElementById('playPauseIcon'),
  playPauseText: document.getElementById('playPauseText'),
  resetButton: document.getElementById('resetButton'),
  quickSaveButton: document.getElementById('quickSaveButton'),
  quickLoadButton: document.getElementById('quickLoadButton'),
  statusBox: document.getElementById('statusBox'),
  engineFrame: document.getElementById('engineFrame'),
  engineUrlText: document.getElementById('engineUrlText'),
};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
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
    elements.refreshMapListButton,
    elements.saveSelectedMapButton,
    elements.saveAsNewMapButton,
    elements.applyButton,
    elements.reloadButton,
    elements.playPauseToggleButton,
    elements.resetButton,
    elements.quickSaveButton,
    elements.quickLoadButton,
  ];
  controls.forEach((control) => {
    if (control) {
      control.disabled = isBusy;
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
  return {
    mapId,
    winningRank,
    candidates: readCandidates(),
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
  if (typeof source.title !== 'string' || !source.title.trim()) {
    source.title = source.id;
  } else {
    source.title = source.title.trim();
  }
  if (!Number.isFinite(Number(source.schemaVersion))) {
    source.schemaVersion = 1;
  } else {
    source.schemaVersion = Math.max(1, Math.floor(Number(source.schemaVersion)));
  }
  if (!source.stage || typeof source.stage !== 'object' || Array.isArray(source.stage)) {
    source.stage = {};
  }
  if (!Array.isArray(source.objects)) {
    source.objects = [];
  }
  return source;
}

function syncMapIdInputFromMapJson(mapJson) {
  const mapId = mapJson && typeof mapJson.id === 'string' && mapJson.id.trim()
    ? mapJson.id.trim()
    : '';
  if (mapId) {
    elements.mapIdInput.value = mapId;
  }
}

function setWorkingMapJson(rawMapJson, fallbackMapId = '') {
  const fallbackId = fallbackMapId || String(elements.mapIdInput.value || '').trim() || 'v2_custom_map';
  const normalized = normalizeMapJson(rawMapJson, fallbackId);
  workingMapJson = deepClone(normalized);
  syncMapIdInputFromMapJson(normalized);
  return deepClone(normalized);
}

function getWorkingMapJson(fallbackMapId = '') {
  if (workingMapJson && typeof workingMapJson === 'object') {
    return deepClone(workingMapJson);
  }
  const fallbackId = fallbackMapId || String(elements.mapIdInput.value || '').trim() || 'v2_custom_map';
  return setWorkingMapJson(buildDefaultMapJson(fallbackId), fallbackId);
}

function sanitizeMapId(value) {
  const raw = String(value || '').trim();
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]/g, '_');
  return cleaned || `v2_map_${Date.now()}`;
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

function lookupMapCatalogById(mapId) {
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
      return `<option value="${mapId}">${mapId}</option>`;
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
  if (payload.mapsDir) {
    setMapsDirStatus(`저장 경로(자동): ${payload.mapsDir}`, 'ok');
  }
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
      enabled: entry.enabled !== false,
      sort: Number.isFinite(Number(entry.sort)) ? Number(entry.sort) : 9999,
    }));
  renderMapCatalog(preferredMapId || String(elements.mapIdInput.value || '').trim());
  const selectedMapId = selectedMapIdFromDropdown();
  if (selectedMapId) {
    elements.mapIdInput.value = selectedMapId;
  }
  if (mapCatalog.length > 0) {
    setStatus(`맵 목록 갱신 완료: ${mapCatalog.length}개`);
  } else {
    setStatus('맵 목록이 비어 있습니다', 'warn');
  }
}

async function syncMapJsonFromEngine(api) {
  if (!api || typeof api.getCurrentMapJson !== 'function') {
    const fallbackId = String(elements.mapIdInput.value || '').trim() || 'v2_custom_map';
    setWorkingMapJson(buildDefaultMapJson(fallbackId), fallbackId);
    return getWorkingMapJson(fallbackId);
  }
  const mapJson = api.getCurrentMapJson();
  if (mapJson && typeof mapJson === 'object') {
    return setWorkingMapJson(mapJson);
  }
  const fallbackId = String(elements.mapIdInput.value || '').trim() || 'v2_custom_map';
  return setWorkingMapJson(buildDefaultMapJson(fallbackId), fallbackId);
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
    hasFrameWindow: true,
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
  setStatus('엔진 iframe 로드 완료. API 연결 대기 중...');
  const api = await waitForEngineApi(30000);
  const payload = readPayload();
  const initResult = await api.init(payload);
  if (!initResult || initResult.ok !== true) {
    throw new Error(initResult && initResult.reason ? initResult.reason : '초기화에 실패했습니다');
  }
  await syncMapJsonFromEngine(api);
  setPlayPauseUi(readEngineRunning(api));
  setStatus(`엔진 준비 완료: 맵=${payload.mapId}, 볼=${payload.candidates.length}`);
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

async function applyMapAndCandidates() {
  await withEngineAction(async (api) => {
    const payload = readPayload();
    const catalogEntry = lookupMapCatalogById(payload.mapId);
    if (catalogEntry) {
      const mapResult = await api.loadMapById(payload.mapId);
      if (!mapResult || mapResult.ok !== true) {
        throw new Error(mapResult && mapResult.reason ? mapResult.reason : '맵 로드에 실패했습니다');
      }
      await syncMapJsonFromEngine(api);
    } else {
      if (typeof api.applyMapJson !== 'function') {
        throw new Error('엔진이 맵 JSON 적용 API를 지원하지 않습니다');
      }
      const mapJson = getWorkingMapJson(payload.mapId);
      mapJson.id = payload.mapId;
      mapJson.title = payload.mapId;
      const mapResult = await api.applyMapJson(mapJson);
      if (!mapResult || mapResult.ok !== true) {
        throw new Error(mapResult && mapResult.reason ? mapResult.reason : '맵 JSON 적용에 실패했습니다');
      }
      setWorkingMapJson(mapJson, payload.mapId);
    }
    const rankResult = api.setWinningRank(payload.winningRank);
    if (!rankResult || rankResult.ok !== true) {
      throw new Error('당첨 순위 설정에 실패했습니다');
    }
    const candidateResult = await api.setCandidates(payload.candidates);
    if (!candidateResult || candidateResult.ok !== true) {
      throw new Error(candidateResult && candidateResult.reason ? candidateResult.reason : '후보 설정에 실패했습니다');
    }
    setPlayPauseUi(readEngineRunning(api));
    if (elements.mapSelect && catalogEntry) {
      elements.mapSelect.value = payload.mapId;
    }
    setStatus(`맵 적용 완료: 맵=${payload.mapId}, 후보=${payload.candidates.length}`);
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
  }
  elements.mapIdInput.value = entry.id;
  await applyMapAndCandidates();
}

function updateMapsDirConnectedStatus() {
  setMapsDirStatus('저장 경로(자동): assets/ui/pinball/maps', 'ok');
}

async function saveMapViaServer(payload) {
  const result = await callMapMakerApi('save', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (result.mapsDir) {
    setMapsDirStatus(`저장 경로(자동): ${result.mapsDir}`, 'ok');
  }
  return result;
}

async function getCurrentMapJsonForSave() {
  const api = await waitForEngineApi();
  if (api && typeof api.getCurrentMapJson === 'function') {
    const fromEngine = api.getCurrentMapJson();
    if (fromEngine && typeof fromEngine === 'object') {
      return setWorkingMapJson(fromEngine);
    }
  }
  const fallbackId = String(elements.mapIdInput.value || '').trim() || 'v2_custom_map';
  return getWorkingMapJson(fallbackId);
}

async function saveSelectedMapOverwrite() {
  const selected = selectedMapCatalogEntry();
  if (!selected) {
    throw new Error('덮어쓸 맵을 목록에서 먼저 선택하세요');
  }
  const mapJson = await getCurrentMapJsonForSave();
  mapJson.id = selected.id;
  mapJson.title = selected.id;
  const result = await saveMapViaServer({
    mode: 'selected',
    selectedMapId: selected.id,
    mapJson,
  });
  await refreshMapCatalog(result.mapId || selected.id);
  if (elements.mapSelect) {
    elements.mapSelect.value = selected.id;
  }
  elements.mapIdInput.value = selected.id;
  setWorkingMapJson(mapJson, selected.id);
  setStatus(`선택 맵 저장 완료: ${selected.id}`);
}

async function saveAsNewMap() {
  const newId = sanitizeMapId(String(elements.mapIdInput.value || '').trim());
  const mapJson = await getCurrentMapJsonForSave();
  mapJson.id = newId;
  mapJson.title = newId;
  const result = await saveMapViaServer({
    mode: 'new',
    newMapId: newId,
    newMapTitle: newId,
    mapJson,
  });
  await refreshMapCatalog(result.mapId || newId);
  if (elements.mapSelect && mapCatalog.some((entry) => entry.id === newId)) {
    elements.mapSelect.value = newId;
  }
  elements.mapIdInput.value = newId;
  setWorkingMapJson(mapJson, newId);
  setStatus(`새 맵 저장 완료: ${newId}`);
}

function setupEvents() {
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
    setBusy(true);
    try {
      await applyMapAndCandidates();
    } catch (_) {
    } finally {
      setBusy(false);
    }
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
        setStatus('일시정지되었습니다');
        return;
      }
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
      setStatus(`${slotId} 퀵 로드 완료 (일시정지 복원)`);
    });
  });
}

async function boot() {
  setupEvents();
  const initialMapId = String(elements.mapIdInput.value || '').trim() || 'v2_default';
  setWorkingMapJson(buildDefaultMapJson(initialMapId), initialMapId);
  updateMapsDirConnectedStatus();
  setPlayPauseUi(false);
  if (FILE_PROTOCOL) {
    setStatus('현재 file:// 경로입니다. tools/start_pinball_map_maker_v2.bat 로 실행하세요', 'warn');
    return;
  }
  setBusy(true);
  try {
    try {
      await refreshMapCatalog(initialMapId);
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
