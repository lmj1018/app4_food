const SLOT_IDS = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'slot6', 'slot7', 'slot8'];

const elements = {
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
    list.push(`Candidate ${String(index + 1).padStart(2, '0')}`);
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
  throw new Error('Engine API did not become available');
}

function renderSnapshotList(items) {
  if (!Array.isArray(items) || items.length === 0) {
    elements.snapshotList.innerHTML = '<div class="snapshot-item">No snapshots yet.</div>';
    return;
  }
  const html = items
    .map((item) => {
      const slot = String(item.slotId || '');
      const label = String(item.label || '');
      const mapId = String(item.mapId || '');
      const count = Number(item.marbleCount || 0);
      return `<div class="snapshot-item"><span class="snapshot-slot">${slot}</span>${label}<br>map=${mapId} marbles=${count}</div>`;
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
    throw new Error(initResult && initResult.reason ? initResult.reason : 'init failed');
  }
  await refreshSnapshotList();
  setStatus(`Engine ready. map=${payload.mapId}, marbles=${payload.candidates.length}`);
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
      throw new Error(mapResult && mapResult.reason ? mapResult.reason : 'map load failed');
    }
    const rankResult = api.setWinningRank(payload.winningRank);
    if (!rankResult || rankResult.ok !== true) {
      throw new Error('failed to set winning rank');
    }
    const candidateResult = await api.setCandidates(payload.candidates);
    if (!candidateResult || candidateResult.ok !== true) {
      throw new Error(candidateResult && candidateResult.reason ? candidateResult.reason : 'candidate set failed');
    }
    setStatus(`Applied map=${payload.mapId}, candidates=${payload.candidates.length}`);
  });
}

function setupSlotOptions() {
  elements.slotSelect.innerHTML = SLOT_IDS.map((slotId) => `<option value="${slotId}">${slotId}</option>`).join('');
}

function selectedSlot() {
  const value = String(elements.slotSelect.value || '').trim();
  return SLOT_IDS.includes(value) ? value : 'slot1';
}

function setupEvents() {
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
        throw new Error(result && result.reason ? result.reason : 'start failed');
      }
      setStatus('Started');
    });
  });

  elements.pauseButton.addEventListener('click', async () => {
    await withEngineAction(async (api) => {
      const result = await api.pause();
      if (!result || result.ok !== true) {
        throw new Error(result && result.reason ? result.reason : 'pause failed');
      }
      setStatus('Paused');
    });
  });

  elements.resetButton.addEventListener('click', async () => {
    await withEngineAction(async (api) => {
      const result = await api.reset();
      if (!result || result.ok !== true) {
        throw new Error(result && result.reason ? result.reason : 'reset failed');
      }
      setStatus('Reset complete');
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
        throw new Error(result && result.reason ? result.reason : 'quick save failed');
      }
      await refreshSnapshotList();
      setStatus(`Quick saved: ${result.meta ? result.meta.label : 'ok'}`);
    });
  });

  elements.quickLoadButton.addEventListener('click', async () => {
    await withEngineAction(async (api) => {
      const result = await api.loadSnapshot('quick', { autoResume: false });
      if (!result || result.ok !== true) {
        throw new Error(result && result.reason ? result.reason : 'quick load failed');
      }
      await refreshSnapshotList();
      setStatus('Restored to snapshot (paused)');
    });
  });

  elements.saveSlotButton.addEventListener('click', async () => {
    await withEngineAction(async (api) => {
      const slotId = selectedSlot();
      const result = await api.saveSnapshot(slotId);
      if (!result || result.ok !== true) {
        throw new Error(result && result.reason ? result.reason : `save failed (${slotId})`);
      }
      await refreshSnapshotList();
      setStatus(`Saved ${slotId}: ${result.meta ? result.meta.label : 'ok'}`);
    });
  });

  elements.loadSlotButton.addEventListener('click', async () => {
    await withEngineAction(async (api) => {
      const slotId = selectedSlot();
      const result = await api.loadSnapshot(slotId, { autoResume: false });
      if (!result || result.ok !== true) {
        throw new Error(result && result.reason ? result.reason : `load failed (${slotId})`);
      }
      await refreshSnapshotList();
      setStatus('Restored to snapshot (paused)');
    });
  });

  elements.deleteSlotButton.addEventListener('click', async () => {
    await withEngineAction(async (api) => {
      const slotId = selectedSlot();
      const result = api.deleteSnapshot(slotId);
      if (!result || result.ok !== true) {
        throw new Error(result && result.reason ? result.reason : `delete failed (${slotId})`);
      }
      await refreshSnapshotList();
      setStatus(`Deleted ${slotId}`);
    });
  });

  elements.refreshSlotsButton.addEventListener('click', async () => {
    await withEngineAction(async () => {
      await refreshSnapshotList();
      setStatus('Snapshot list refreshed');
    });
  });
}

async function boot() {
  setupSlotOptions();
  setupEvents();
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
