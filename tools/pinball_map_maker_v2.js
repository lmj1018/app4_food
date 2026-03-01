const SLOT_IDS = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'slot6', 'slot7', 'slot8'];
const MAP_DRAFT_STORAGE_PREFIX = 'pinball_v2_map_draft:';

const elements = {
  mapJsonInput: document.getElementById('mapJsonInput'),
  mapFileNameInput: document.getElementById('mapFileNameInput'),
  pullMapButton: document.getElementById('pullMapButton'),
  applyJsonButton: document.getElementById('applyJsonButton'),
  downloadMapButton: document.getElementById('downloadMapButton'),
  uploadMapButton: document.getElementById('uploadMapButton'),
  saveDraftButton: document.getElementById('saveDraftButton'),
  loadDraftButton: document.getElementById('loadDraftButton'),
  installMapButton: document.getElementById('installMapButton'),
  copyManifestEntryButton: document.getElementById('copyManifestEntryButton'),
  mapFileInput: document.getElementById('mapFileInput'),
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
  elements.statusBox.textContent = text;
  if (kind === 'error') {
    elements.statusBox.style.color = '#ff9898';
  } else if (kind === 'warn') {
    elements.statusBox.style.color = '#ffcf84';
  } else {
    elements.statusBox.style.color = '#7df4bc';
  }
}

function setBusy(isBusy) {
  const buttons = [
    elements.pullMapButton,
    elements.applyJsonButton,
    elements.downloadMapButton,
    elements.uploadMapButton,
    elements.saveDraftButton,
    elements.loadDraftButton,
    elements.installMapButton,
    elements.copyManifestEntryButton,
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

function normalizeMapFilename(value, fallbackMapJson = null) {
  const raw = String(value || '').trim();
  const fallbackMapId = fallbackMapJson && typeof fallbackMapJson.id === 'string' && fallbackMapJson.id.trim()
    ? fallbackMapJson.id.trim()
    : `v2_map_${Date.now()}`;
  const fallback = `${fallbackMapId}.json`;
  const base = raw || fallback;
  const sanitized = base.replace(/[^a-zA-Z0-9._-]/g, '_');
  const hasJsonExt = sanitized.toLowerCase().endsWith('.json');
  return hasJsonExt ? sanitized : `${sanitized}.json`;
}

function resolveMapFilename(mapJson) {
  const mapId = mapJson && typeof mapJson.id === 'string' && mapJson.id.trim()
    ? mapJson.id.trim()
    : `v2_map_${Date.now()}`;
  return normalizeMapFilename(`${mapId}.json`);
}

function syncMapFileNameInputFromMapJson(mapJson) {
  if (!elements.mapFileNameInput) {
    return;
  }
  elements.mapFileNameInput.value = resolveMapFilename(mapJson);
}

function resolveDraftStorageKey(mapJson) {
  const mapId = mapJson && typeof mapJson.id === 'string' && mapJson.id.trim()
    ? mapJson.id.trim()
    : (String(elements.mapIdInput.value || '').trim() || 'v2_draft');
  return `${MAP_DRAFT_STORAGE_PREFIX}${mapId}`;
}

async function readFileText(file) {
  if (!file) {
    throw new Error('선택된 파일이 없습니다');
  }
  if (typeof file.text === 'function') {
    return file.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('파일 읽기에 실패했습니다'));
    reader.readAsText(file, 'utf-8');
  });
}

async function syncMapJsonEditorFromEngine(api) {
  if (!api || typeof api.getCurrentMapJson !== 'function') {
    const fallback = buildDefaultMapJson(String(elements.mapIdInput.value || '').trim() || 'v2_custom_map');
    writeMapJsonEditor(fallback);
    syncMapFileNameInputFromMapJson(fallback);
    return;
  }
  const mapJson = api.getCurrentMapJson();
  if (mapJson && typeof mapJson === 'object') {
    writeMapJsonEditor(mapJson);
    syncMapIdInputFromMapJson(mapJson);
    syncMapFileNameInputFromMapJson(mapJson);
  } else {
    const fallback = buildDefaultMapJson(String(elements.mapIdInput.value || '').trim() || 'v2_custom_map');
    writeMapJsonEditor(fallback);
    syncMapFileNameInputFromMapJson(fallback);
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

async function waitForEngineApi(timeoutMs = 20000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const api = getEngineApi();
    if (api && typeof api.init === 'function') {
      return api;
    }
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  throw new Error('엔진 API가 준비되지 않았습니다');
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
  const engineUrl = `../assets/ui/pinball/index_v2.html?editor=1&nocache=${Date.now()}`;
  elements.engineUrlText.textContent = engineUrl;
  elements.engineFrame.src = engineUrl;
  await new Promise((resolve) => {
    elements.engineFrame.onload = () => resolve();
  });
  const api = await waitForEngineApi();
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
    syncMapFileNameInputFromMapJson(mapJson);
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

function triggerMapFileDialog() {
  if (elements.mapFileInput) {
    elements.mapFileInput.click();
  }
}

async function handleMapFileSelected(file) {
  const text = await readFileText(file);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`맵 파일 JSON 파싱 실패: ${String(error && error.message ? error.message : error)}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('맵 파일 형식이 올바르지 않습니다');
  }
  writeMapJsonEditor(parsed);
  syncMapIdInputFromMapJson(parsed);
  syncMapFileNameInputFromMapJson(parsed);
  setStatus(`맵 파일을 불러왔습니다: ${file && file.name ? file.name : '이름없음'}`);
}

async function pullMapJsonFromEngine() {
  await withEngineAction(async (api) => {
    await syncMapJsonEditorFromEngine(api);
    const mapJson = parseMapJsonText();
    setStatus(`현재 맵 JSON을 가져왔습니다: ${mapJson.id}`);
  });
}

async function downloadMapJsonFile() {
  let mapJson;
  try {
    mapJson = parseMapJsonText();
  } catch (_) {
    mapJson = buildDefaultMapJson(String(elements.mapIdInput.value || '').trim() || 'v2_custom_map');
    writeMapJsonEditor(mapJson);
    syncMapFileNameInputFromMapJson(mapJson);
  }
  const fileName = normalizeMapFilename(
    elements.mapFileNameInput ? elements.mapFileNameInput.value : '',
    mapJson,
  );
  if (elements.mapFileNameInput) {
    elements.mapFileNameInput.value = fileName;
  }
  const blob = new Blob([prettyJson(mapJson)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    URL.revokeObjectURL(url);
  }
  setStatus(`맵 JSON 파일 저장 완료: ${fileName}`);
}

function saveMapDraftToStorage() {
  if (!window.localStorage) {
    throw new Error('브라우저 저장소를 사용할 수 없습니다');
  }
  const mapJson = parseMapJsonText();
  const key = resolveDraftStorageKey(mapJson);
  const serialized = prettyJson(mapJson);
  window.localStorage.setItem(key, serialized);
  setStatus(`브라우저 임시저장 완료: ${key}`);
}

function loadMapDraftFromStorage() {
  if (!window.localStorage) {
    throw new Error('브라우저 저장소를 사용할 수 없습니다');
  }
  const key = resolveDraftStorageKey({
    id: String(elements.mapIdInput.value || '').trim() || 'v2_draft',
  });
  const serialized = window.localStorage.getItem(key);
  if (!serialized) {
    throw new Error(`임시저장 데이터가 없습니다: ${key}`);
  }
  let mapJson;
  try {
    mapJson = JSON.parse(serialized);
  } catch (_) {
    throw new Error(`임시저장 JSON이 손상되었습니다: ${key}`);
  }
  writeMapJsonEditor(mapJson);
  syncMapIdInputFromMapJson(mapJson);
  syncMapFileNameInputFromMapJson(mapJson);
  setStatus(`브라우저 임시불러오기 완료: ${key}`);
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

async function installMapIntoProjectMapsFolder() {
  const mapJson = parseMapJsonText();
  const fileName = normalizeMapFilename(
    elements.mapFileNameInput ? elements.mapFileNameInput.value : '',
    mapJson,
  );
  if (elements.mapFileNameInput) {
    elements.mapFileNameInput.value = fileName;
  }
  if (typeof window.showDirectoryPicker !== 'function') {
    throw new Error('이 브라우저는 폴더 직접 설치를 지원하지 않습니다. 맵 JSON 파일 저장 후 수동 복사하세요');
  }
  const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });

  const mapHandle = await dirHandle.getFileHandle(fileName, { create: true });
  {
    const writable = await mapHandle.createWritable();
    try {
      await writable.write(prettyJson(mapJson));
    } finally {
      await writable.close();
    }
  }

  const manifestHandle = await dirHandle.getFileHandle('manifest.json', { create: true });
  let manifestData = { version: 1, maps: [] };
  try {
    const existingFile = await manifestHandle.getFile();
    const existingText = await existingFile.text();
    if (String(existingText || '').trim()) {
      manifestData = normalizeManifestData(JSON.parse(existingText));
    }
  } catch (_) {
    manifestData = { version: 1, maps: [] };
  }

  const existingMaps = Array.isArray(manifestData.maps) ? manifestData.maps.slice() : [];
  const targetMapId = String(mapJson.id || '').trim();
  if (!targetMapId) {
    throw new Error('맵 JSON에 id가 비어 있습니다');
  }
  const existingIndex = existingMaps.findIndex((entry) => {
    const id = entry && typeof entry.id === 'string' ? entry.id : '';
    const file = entry && typeof entry.file === 'string' ? entry.file : '';
    return id === targetMapId || file === fileName;
  });
  const existingEntry = existingIndex >= 0 ? existingMaps[existingIndex] : null;
  const nextEntry = buildManifestEntry(mapJson, fileName, existingEntry, existingMaps);
  if (existingIndex >= 0) {
    existingMaps[existingIndex] = nextEntry;
  } else {
    existingMaps.push(nextEntry);
  }
  manifestData.maps = existingMaps;

  {
    const writable = await manifestHandle.createWritable();
    try {
      await writable.write(prettyJson(manifestData));
    } finally {
      await writable.close();
    }
  }

  syncMapIdInputFromMapJson(mapJson);
  setStatus(`설치 완료: ${fileName} + manifest 등록(${targetMapId}). 엔진 다시 불러오기를 누르세요.`);
}

async function copyManifestEntryToClipboard() {
  const mapJson = parseMapJsonText();
  const fileName = normalizeMapFilename(
    elements.mapFileNameInput ? elements.mapFileNameInput.value : '',
    mapJson,
  );
  if (elements.mapFileNameInput) {
    elements.mapFileNameInput.value = fileName;
  }
  const entry = buildManifestEntry(mapJson, fileName, null, []);
  const text = prettyJson(entry);
  if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
    throw new Error('클립보드 복사를 지원하지 않습니다');
  }
  await navigator.clipboard.writeText(text);
  setStatus('manifest 항목 JSON을 클립보드에 복사했습니다');
}

function setupSlotOptions() {
  elements.slotSelect.innerHTML = SLOT_IDS.map((slotId) => `<option value="${slotId}">${slotId}</option>`).join('');
}

function selectedSlot() {
  const value = String(elements.slotSelect.value || '').trim();
  return SLOT_IDS.includes(value) ? value : 'slot1';
}

function setupEvents() {
  elements.mapIdInput.addEventListener('change', () => {
    const mapId = String(elements.mapIdInput.value || '').trim();
    if (!mapId || !elements.mapFileNameInput) {
      return;
    }
    if (!String(elements.mapFileNameInput.value || '').trim()) {
      elements.mapFileNameInput.value = resolveMapFilename({ id: mapId });
    }
  });

  elements.pullMapButton.addEventListener('click', async () => {
    await pullMapJsonFromEngine();
  });

  elements.applyJsonButton.addEventListener('click', async () => {
    await applyMapJsonFromEditor();
  });

  elements.downloadMapButton.addEventListener('click', async () => {
    try {
      await downloadMapJsonFile();
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), 'error');
    }
  });

  elements.uploadMapButton.addEventListener('click', () => {
    triggerMapFileDialog();
  });

  elements.saveDraftButton.addEventListener('click', () => {
    try {
      saveMapDraftToStorage();
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), 'error');
    }
  });

  elements.loadDraftButton.addEventListener('click', () => {
    try {
      loadMapDraftFromStorage();
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), 'error');
    }
  });

  elements.installMapButton.addEventListener('click', async () => {
    try {
      await installMapIntoProjectMapsFolder();
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), 'error');
    }
  });

  elements.copyManifestEntryButton.addEventListener('click', async () => {
    try {
      await copyManifestEntryToClipboard();
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), 'error');
    }
  });

  elements.mapFileInput.addEventListener('change', async () => {
    const files = elements.mapFileInput.files;
    const file = files && files.length > 0 ? files[0] : null;
    if (!file) {
      return;
    }
    try {
      await handleMapFileSelected(file);
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), 'error');
    } finally {
      elements.mapFileInput.value = '';
    }
  });

  elements.reloadButton.addEventListener('click', async () => {
    setBusy(true);
    try {
      await loadEngineFrame();
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), 'error');
    } finally {
      setBusy(false);
    }
  });

  elements.applyButton.addEventListener('click', async () => {
    await applyMapAndCandidates();
  });

  elements.startButton.addEventListener('click', async () => {
    await withEngineAction(async (api) => {
      const result = await api.start();
      if (!result || result.ok !== true) {
        throw new Error(result && result.reason ? result.reason : '시작에 실패했습니다');
      }
      setStatus('시작되었습니다');
    });
  });

  elements.pauseButton.addEventListener('click', async () => {
    await withEngineAction(async (api) => {
      const result = await api.pause();
      if (!result || result.ok !== true) {
        throw new Error(result && result.reason ? result.reason : '일시정지에 실패했습니다');
      }
      setStatus('일시정지되었습니다');
    });
  });

  elements.resetButton.addEventListener('click', async () => {
    await withEngineAction(async (api) => {
      const result = await api.reset();
      if (!result || result.ok !== true) {
        throw new Error(result && result.reason ? result.reason : '리셋에 실패했습니다');
      }
      setStatus('리셋이 완료되었습니다');
    });
  });

  elements.stateButton.addEventListener('click', async () => {
    await withEngineAction(async (api) => {
      const state = api.getState();
      setStatus(JSON.stringify(state, null, 2));
    });
  });

  elements.quickSaveButton.addEventListener('click', async () => {
    await withEngineAction(async (api) => {
      const result = await api.saveSnapshot('quick');
      if (!result || result.ok !== true) {
        throw new Error(result && result.reason ? result.reason : '빠른 저장에 실패했습니다');
      }
      await refreshSnapshotList();
      setStatus(`빠른 저장 완료(현재 진행상황): ${result.meta ? result.meta.label : '성공'}`);
    });
  });

  elements.quickLoadButton.addEventListener('click', async () => {
    await withEngineAction(async (api) => {
      const result = await api.loadSnapshot('quick', { autoResume: false });
      if (!result || result.ok !== true) {
        throw new Error(result && result.reason ? result.reason : '빠른 불러오기에 실패했습니다');
      }
      await refreshSnapshotList();
      setStatus('진행상황 스냅샷으로 복원되었습니다 (일시정지)');
    });
  });

  elements.saveSlotButton.addEventListener('click', async () => {
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

  elements.loadSlotButton.addEventListener('click', async () => {
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

  elements.deleteSlotButton.addEventListener('click', async () => {
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

  elements.refreshSlotsButton.addEventListener('click', async () => {
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
  syncMapFileNameInputFromMapJson(initialMap);
  setBusy(true);
  try {
    await loadEngineFrame();
  } catch (error) {
    setStatus(String(error && error.message ? error.message : error), 'error');
  } finally {
    setBusy(false);
  }
}

void boot();
