/**
 * Farbton-Erkenner Mobile - Hauptanwendung
 * Unterstützt Echtzeit-Kamera-Scan, Lupe, Foto-Analyse, Farbauszug,
 * RAL-Classic-Katalog, Farbharmonien, Sprachausgabe und Favoriten.
 */

const App = (function () {
  'use strict';

  // Anwendungszustand (State)
  const state = {
    currentTab: 'camera',
    currentColor: {
      r: 52,
      g: 129,
      b: 184,
      hex: '#3481B8'
    },
    cameraStream: null,
    cameraTrack: null,
    facingMode: 'environment', // Rückkamera bevorzugt
    isCameraFrozen: false,
    sampleRadius: 5, // 1px, 5px, 15px
    samplePoint: { x: 0.5, y: 0.5 }, // relativ 0..1 (Zentrum)
    torchActive: false,
    hasTorch: false,
    savedColors: [],
    photoImage: null,
    animFrameId: null
  };

  // DOM Elemente cachen
  const dom = {
    // Header & Tabs
    btnTorch: document.getElementById('btn-torch'),
    btnInfo: document.getElementById('btn-info'),
    navTabs: document.querySelectorAll('.nav-tab'),
    viewPanels: document.querySelectorAll('.view-panel'),
    savedCounter: document.getElementById('saved-counter'),

    // Camera View
    cameraVideo: document.getElementById('camera-video'),
    cameraCanvas: document.getElementById('camera-canvas'),
    videoWrapper: document.getElementById('video-wrapper'),
    cameraReticle: document.getElementById('camera-reticle'),
    miniLoupe: document.getElementById('mini-loupe'),
    loupeCanvas: document.getElementById('loupe-canvas'),
    loupeSwatch: document.getElementById('loupe-swatch'),
    permissionOverlay: document.getElementById('camera-permission-overlay'),
    btnStartCamera: document.getElementById('btn-start-camera'),
    btnDemoMode: document.getElementById('btn-demo-mode'),
    btnCaptureColor: document.getElementById('btn-capture-color'),
    captureIndicator: document.getElementById('capture-indicator'),
    btnFreezeCamera: document.getElementById('btn-freeze-camera'),
    freezeIconPause: document.getElementById('freeze-icon-pause'),
    freezeIconPlay: document.getElementById('freeze-icon-play'),
    cameraFrozenBadge: document.getElementById('camera-frozen-badge'),
    btnFlipCamera: document.getElementById('btn-flip-camera'),
    radiusBtns: document.querySelectorAll('.pill-btn'),

    // Photo View
    photoDropZone: document.getElementById('photo-drop-zone'),
    photoFileInput: document.getElementById('photo-file-input'),
    photoEmptyState: document.getElementById('photo-empty-state'),
    photoCanvasContainer: document.getElementById('photo-canvas-container'),
    photoCanvas: document.getElementById('photo-canvas'),
    photoReticle: document.getElementById('photo-reticle'),
    photoControls: document.getElementById('photo-controls'),
    btnSelectFile: document.getElementById('btn-select-file'),
    btnChangePhoto: document.getElementById('btn-change-photo'),
    dominantGrid: document.getElementById('dominant-colors-grid'),

    // Picker & RAL View
    nativeColorPicker: document.getElementById('native-color-picker'),
    manualHexInput: document.getElementById('manual-hex-input'),
    sliderR: document.getElementById('slider-r'),
    sliderG: document.getElementById('slider-g'),
    sliderB: document.getElementById('slider-b'),
    valR: document.getElementById('val-r'),
    valG: document.getElementById('val-g'),
    valB: document.getElementById('val-b'),
    ralSearchInput: document.getElementById('ral-search-input'),
    btnClearSearch: document.getElementById('btn-clear-search'),
    ralListGrid: document.getElementById('ral-list-grid'),
    filterChips: document.querySelectorAll('.chip'),

    // Saved View
    savedEmptyState: document.getElementById('saved-empty-state'),
    savedListContainer: document.getElementById('saved-list-container'),
    btnExportSaved: document.getElementById('btn-export-saved'),
    btnClearSaved: document.getElementById('btn-clear-saved'),

    // Color Inspector / Detail
    colorDetailSection: document.getElementById('color-detail-section'),
    detailColorSwatch: document.getElementById('detail-color-swatch'),
    detailTemperatureBadge: document.getElementById('detail-temperature-badge'),
    detailColorName: document.getElementById('detail-color-name'),
    detailNaturalDesc: document.getElementById('detail-natural-desc'),
    detailRalTag: document.getElementById('detail-ral-tag'),
    detailMatchScore: document.getElementById('detail-match-score'),
    btnSpeakColor: document.getElementById('btn-speak-color'),
    compareMeasured: document.getElementById('compare-measured'),
    compareRal: document.getElementById('compare-ral'),
    compareRalLabel: document.getElementById('compare-ral-label'),
    compareDeltaE: document.getElementById('compare-delta-e'),
    codeHex: document.getElementById('code-hex'),
    codeRgb: document.getElementById('code-rgb'),
    codeHsl: document.getElementById('code-hsl'),
    codeCmyk: document.getElementById('code-cmyk'),
    codeBoxes: document.querySelectorAll('.code-box'),
    btnSaveCurrent: document.getElementById('btn-save-current'),
    btnShareCurrent: document.getElementById('btn-share-current'),
    harmoniesContainer: document.getElementById('harmonies-container'),

    // Modals & Toast
    modalInfo: document.getElementById('modal-info'),
    btnCloseModal: document.getElementById('btn-close-modal'),
    btnModalOk: document.getElementById('btn-modal-ok'),
    modalSave: document.getElementById('modal-save'),
    saveModalSwatch: document.getElementById('save-modal-swatch'),
    saveModalName: document.getElementById('save-modal-name'),
    saveInputNote: document.getElementById('save-input-note'),
    btnCloseSaveModal: document.getElementById('btn-close-save-modal'),
    btnConfirmSave: document.getElementById('btn-confirm-save'),
    toast: document.getElementById('toast')
  };

  // Toast Meldung
  let toastTimer = null;
  function showToast(message, duration = 2400) {
    if (toastTimer) clearTimeout(toastTimer);
    dom.toast.textContent = message;
    dom.toast.classList.add('show');
    toastTimer = setTimeout(() => {
      dom.toast.classList.remove('show');
    }, duration);
  }

  // Haptisches Feedback (auf Smartphones mit Vibrations-Support)
  function triggerHaptic(duration = 25) {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(duration);
      } catch (e) {
        // Ignorieren falls nicht erlaubt
      }
    }
  }

  // Tab-Wechsel
  function switchTab(tabId) {
    state.currentTab = tabId;

    dom.navTabs.forEach((tab) => {
      const isTarget = tab.dataset.tab === tabId;
      tab.classList.toggle('active', isTarget);
      tab.setAttribute('aria-selected', isTarget);
    });

    dom.viewPanels.forEach((panel) => {
      const isTarget = panel.id === `view-${tabId}`;
      panel.classList.toggle('active', isTarget);
    });

    // Falls auf Kamera gewechselt wird und Stream nicht läuft
    if (tabId === 'camera' && !state.cameraStream && !state.isCameraFrozen) {
      // Bleibt im Overlay-Zustand, bis Nutzer klickt
    }
  }

  // ================= KAMERA STEUERUNG =================
  async function startCamera() {
    stopCamera();

    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: state.facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      state.cameraStream = stream;
      state.cameraTrack = stream.getVideoTracks()[0];
      dom.cameraVideo.srcObject = stream;

      await dom.cameraVideo.play();
      dom.permissionOverlay.style.display = 'none';
      state.isCameraFrozen = false;
      updateFreezeUI();

      // Taschenlampen-Unterstützung prüfen
      checkTorchSupport();

      // Live-Sampling Schleife starten
      startSamplingLoop();
      showToast('Kamera bereit');
    } catch (err) {
      console.warn('Kamera-Zugriff fehlgeschlagen:', err);
      dom.permissionOverlay.style.display = 'flex';
      showToast('Kamera-Zugriff nicht möglich. Tippe auf "Muster-Farben".');
    }
  }

  function stopCamera() {
    if (state.animFrameId) {
      cancelAnimationFrame(state.animFrameId);
      state.animFrameId = null;
    }
    if (state.cameraStream) {
      state.cameraStream.getTracks().forEach((track) => track.stop());
      state.cameraStream = null;
      state.cameraTrack = null;
    }
  }

  function checkTorchSupport() {
    if (!state.cameraTrack) return;
    const capabilities = state.cameraTrack.getCapabilities ? state.cameraTrack.getCapabilities() : {};
    state.hasTorch = Boolean(capabilities.torch);
    dom.btnTorch.style.display = state.hasTorch ? 'flex' : 'none';
  }

  async function toggleTorch() {
    if (!state.cameraTrack || !state.hasTorch) return;
    try {
      state.torchActive = !state.torchActive;
      await state.cameraTrack.applyConstraints({
        advanced: [{ torch: state.torchActive }]
      });
      dom.btnTorch.classList.toggle('active', state.torchActive);
      showToast(state.torchActive ? 'Taschenlampe Ein' : 'Taschenlampe Aus');
    } catch (e) {
      console.warn('Torch constraint error:', e);
    }
  }

  async function flipCamera() {
    state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';
    triggerHaptic(20);
    await startCamera();
  }

  function toggleCameraFreeze() {
    if (!state.cameraStream) return;
    state.isCameraFrozen = !state.isCameraFrozen;
    triggerHaptic(30);

    if (state.isCameraFrozen) {
      dom.cameraVideo.pause();
    } else {
      dom.cameraVideo.play();
      startSamplingLoop();
    }
    updateFreezeUI();
  }

  function updateFreezeUI() {
    dom.cameraFrozenBadge.style.display = state.isCameraFrozen ? 'block' : 'none';
    dom.freezeIconPause.style.display = state.isCameraFrozen ? 'none' : 'block';
    dom.freezeIconPlay.style.display = state.isCameraFrozen ? 'block' : 'none';
  }

  // Live Pixel-Sampling aus dem Videobild
  function startSamplingLoop() {
    const video = dom.cameraVideo;
    const canvas = dom.cameraCanvas;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const loupeCtx = dom.loupeCanvas.getContext('2d');

    function loop() {
      if (!state.isCameraFrozen && video.readyState === video.HAVE_ENOUGH_DATA) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Berechne Pixel-Koordinate des Messpunkts
        const px = Math.floor(state.samplePoint.x * canvas.width);
        const py = Math.floor(state.samplePoint.y * canvas.height);

        // Farbwert ermitteln mit Mittelwert
        const rgb = sampleAverageColor(ctx, px, py, state.sampleRadius, canvas.width, canvas.height);
        
        // Mini-Lupe rendern (4x Zoom)
        renderLoupe(ctx, px, py, rgb, loupeCtx);

        // Aktiven Farbton aktualisieren
        updateCurrentColor(rgb.r, rgb.g, rgb.b, false);
      }

      if (!state.isCameraFrozen && state.cameraStream) {
        state.animFrameId = requestAnimationFrame(loop);
      }
    }

    if (state.animFrameId) cancelAnimationFrame(state.animFrameId);
    state.animFrameId = requestAnimationFrame(loop);
  }

  // Berechnet den gemittelten Farbwert im Radius
  function sampleAverageColor(ctx, cx, cy, radius, maxW, maxH) {
    const half = Math.floor(radius / 2);
    const startX = Math.max(0, cx - half);
    const startY = Math.max(0, cy - half);
    const w = Math.min(radius, maxW - startX);
    const h = Math.min(radius, maxH - startY);

    if (w <= 0 || h <= 0) return { r: 128, g: 128, b: 128 };

    const imgData = ctx.getImageData(startX, startY, w, h);
    const data = imgData.data;
    let sumR = 0, sumG = 0, sumB = 0;
    const count = data.length / 4;

    for (let i = 0; i < data.length; i += 4) {
      sumR += data[i];
      sumG += data[i + 1];
      sumB += data[i + 2];
    }

    return {
      r: Math.round(sumR / count),
      g: Math.round(sumG / count),
      b: Math.round(sumB / count)
    };
  }

  // Rendert die Vergrößerungs-Lupe
  function renderLoupe(sourceCtx, cx, cy, rgb, loupeCtx) {
    const loupeSize = 64;
    const zoom = 4;
    const sampleSize = Math.floor(loupeSize / zoom);
    const halfSample = Math.floor(sampleSize / 2);

    loupeCtx.imageSmoothingEnabled = false;
    loupeCtx.clearRect(0, 0, loupeSize, loupeSize);

    // Zoom-Ausschnitt zeichnen
    loupeCtx.drawImage(
      sourceCtx.canvas,
      cx - halfSample,
      cy - halfSample,
      sampleSize,
      sampleSize,
      0,
      0,
      loupeSize,
      loupeSize
    );

    // Fadenkreuz in Lupe
    loupeCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    loupeCtx.lineWidth = 1;
    loupeCtx.beginPath();
    loupeCtx.arc(loupeSize / 2, loupeSize / 2, 4, 0, Math.PI * 2);
    loupeCtx.stroke();

    // Farbfeld unterhalb der Lupe
    dom.loupeSwatch.style.backgroundColor = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  }

  // Reticle auf Klick/Touch ausrichten
  function handleReticleRelocate(clientX, clientY, containerRect) {
    const relX = Math.max(0.05, Math.min(0.95, (clientX - containerRect.left) / containerRect.width));
    const relY = Math.max(0.05, Math.min(0.95, (clientY - containerRect.top) / containerRect.height));

    state.samplePoint = { x: relX, y: relY };

    dom.cameraReticle.style.left = `${relX * 100}%`;
    dom.cameraReticle.style.top = `${relY * 100}%`;

    // Falls eingefroren, sofort neu berechnen
    if (state.isCameraFrozen && dom.cameraCanvas.width > 0) {
      const ctx = dom.cameraCanvas.getContext('2d');
      const px = Math.floor(relX * dom.cameraCanvas.width);
      const py = Math.floor(relY * dom.cameraCanvas.height);
      const rgb = sampleAverageColor(ctx, px, py, state.sampleRadius, dom.cameraCanvas.width, dom.cameraCanvas.height);
      renderLoupe(ctx, px, py, rgb, dom.loupeCanvas.getContext('2d'));
      updateCurrentColor(rgb.r, rgb.g, rgb.b, true);
    }
  }

  // ================= FOTO-ANALYSE =================
  function setupPhotoHandling() {
    dom.btnSelectFile.addEventListener('click', () => dom.photoFileInput.click());
    dom.btnChangePhoto.addEventListener('click', () => dom.photoFileInput.click());

    dom.photoFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      loadPhotoFile(file);
    });

    // Drag and Drop
    dom.photoDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dom.photoDropZone.style.borderColor = 'var(--primary)';
    });

    dom.photoDropZone.addEventListener('dragleave', () => {
      dom.photoDropZone.style.borderColor = 'var(--border-medium)';
    });

    dom.photoDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dom.photoDropZone.style.borderColor = 'var(--border-medium)';
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        loadPhotoFile(e.dataTransfer.files[0]);
      }
    });

    // Touch / Drag auf Foto Canvas
    const canvas = dom.photoCanvas;
    let isDragging = false;

    function handlePhotoPick(e) {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      const normX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const normY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

      // Reticle positionieren
      dom.photoReticle.style.left = `${normX * 100}%`;
      dom.photoReticle.style.top = `${normY * 100}%`;

      // Farbe abtasten
      const px = Math.floor(normX * canvas.width);
      const py = Math.floor(normY * canvas.height);
      const ctx = canvas.getContext('2d');
      const rgb = sampleAverageColor(ctx, px, py, state.sampleRadius, canvas.width, canvas.height);

      updateCurrentColor(rgb.r, rgb.g, rgb.b, true);
    }

    canvas.addEventListener('mousedown', (e) => {
      isDragging = true;
      handlePhotoPick(e);
    });

    window.addEventListener('mousemove', (e) => {
      if (isDragging) handlePhotoPick(e);
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });

    canvas.addEventListener('touchstart', (e) => {
      isDragging = true;
      handlePhotoPick(e);
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      if (isDragging) {
        e.preventDefault();
        handlePhotoPick(e);
      }
    }, { passive: false });

    window.addEventListener('touchend', () => {
      isDragging = false;
    });
  }

  function loadPhotoFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        state.photoImage = img;
        renderPhotoToCanvas(img);
        extractDominantPalette(img);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function renderPhotoToCanvas(img) {
    const canvas = dom.photoCanvas;
    const ctx = canvas.getContext('2d');

    // Skaliere Bild sinnvoll (z.B. max 1200px)
    const maxDim = 1200;
    let w = img.width;
    let h = img.height;
    if (w > maxDim || h > maxDim) {
      if (w > h) {
        h = Math.round((h * maxDim) / w);
        w = maxDim;
      } else {
        w = Math.round((w * maxDim) / h);
        h = maxDim;
      }
    }

    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(img, 0, 0, w, h);

    dom.photoEmptyState.style.display = 'none';
    dom.photoCanvasContainer.style.display = 'flex';
    dom.photoControls.style.display = 'block';

    // Mittleren Pixel initial messen
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);
    const rgb = sampleAverageColor(ctx, cx, cy, state.sampleRadius, w, h);
    updateCurrentColor(rgb.r, rgb.g, rgb.b, true);

    dom.photoReticle.style.left = '50%';
    dom.photoReticle.style.top = '50%';
  }

  // Dominante Farbtöne aus Foto extrahieren (Quantisierung)
  function extractDominantPalette(img) {
    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d');
    tempCanvas.width = 64;
    tempCanvas.height = 64;
    ctx.drawImage(img, 0, 0, 64, 64);

    const imgData = ctx.getImageData(0, 0, 64, 64).data;
    const buckets = {};

    // Farbkörbe bilden (Quantisierung auf 32er Schritte)
    for (let i = 0; i < imgData.length; i += 16) {
      const r = Math.floor(imgData[i] / 32) * 32 + 16;
      const g = Math.floor(imgData[i + 1] / 32) * 32 + 16;
      const b = Math.floor(imgData[i + 2] / 32) * 32 + 16;
      const key = `${r},${g},${b}`;
      buckets[key] = (buckets[key] || 0) + 1;
    }

    const sorted = Object.entries(buckets)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([key]) => {
        const [r, g, b] = key.split(',').map(Number);
        return { r, g, b, hex: ColorMath.rgbToHex(r, g, b) };
      });

    dom.dominantGrid.innerHTML = '';
    sorted.forEach((item) => {
      const swatch = document.createElement('div');
      swatch.className = 'dominant-swatch';
      swatch.style.backgroundColor = item.hex;
      swatch.title = item.hex;

      const textColor = ColorMath.getContrastTextColor(item.r, item.g, item.b);
      swatch.innerHTML = `<span style="color:${textColor}">${item.hex}</span>`;

      swatch.addEventListener('click', () => {
        triggerHaptic(20);
        updateCurrentColor(item.r, item.g, item.b, true);
        showToast(`Farbton ${item.hex} gewählt`);
      });

      dom.dominantGrid.appendChild(swatch);
    });
  }

  // ================= MANUELLER PICKER & RAL KATALOG =================
  function setupManualPicker() {
    // Native Color Picker
    dom.nativeColorPicker.addEventListener('input', (e) => {
      const rgb = ColorMath.hexToRgb(e.target.value);
      syncManualSliders(rgb.r, rgb.g, rgb.b);
      updateCurrentColor(rgb.r, rgb.g, rgb.b, false);
    });

    // HEX Text Input
    dom.manualHexInput.addEventListener('change', (e) => {
      let val = e.target.value.trim();
      if (!val.startsWith('#')) val = '#' + val;
      if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
        const rgb = ColorMath.hexToRgb(val);
        syncManualSliders(rgb.r, rgb.g, rgb.b);
        updateCurrentColor(rgb.r, rgb.g, rgb.b, true);
      } else {
        e.target.value = state.currentColor.hex;
      }
    });

    // RGB Range Sliders
    const handleSliderChange = () => {
      const r = parseInt(dom.sliderR.value, 10);
      const g = parseInt(dom.sliderG.value, 10);
      const b = parseInt(dom.sliderB.value, 10);
      dom.valR.textContent = r;
      dom.valG.textContent = g;
      dom.valB.textContent = b;
      updateCurrentColor(r, g, b, false);
    };

    dom.sliderR.addEventListener('input', handleSliderChange);
    dom.sliderG.addEventListener('input', handleSliderChange);
    dom.sliderB.addEventListener('input', handleSliderChange);

    // RAL Suchleiste
    dom.ralSearchInput.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      dom.btnClearSearch.style.display = q ? 'block' : 'none';
      filterRalCatalog(q, getActiveFilterChip());
    });

    dom.btnClearSearch.addEventListener('click', () => {
      dom.ralSearchInput.value = '';
      dom.btnClearSearch.style.display = 'none';
      filterRalCatalog('', getActiveFilterChip());
    });

    // Filter Chips (1xxx, 2xxx, ...)
    dom.filterChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        dom.filterChips.forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        filterRalCatalog(dom.ralSearchInput.value.trim().toLowerCase(), chip.dataset.filter);
      });
    });

    // Initiale RAL Liste rendern
    renderRalList(globalThis.RAL_COLORS || []);
  }

  function getActiveFilterChip() {
    const active = document.querySelector('.chip.active');
    return active ? active.dataset.filter : 'all';
  }

  function filterRalCatalog(query, seriesFilter) {
    let list = globalThis.RAL_COLORS || [];

    if (seriesFilter && seriesFilter !== 'all') {
      const prefix = `RAL ${seriesFilter}`;
      list = list.filter((item) => item.code.startsWith(prefix));
    }

    if (query) {
      list = list.filter((item) => {
        const codeMatch = item.code.toLowerCase().includes(query);
        const nameMatch = item.name.toLowerCase().includes(query);
        return codeMatch || nameMatch;
      });
    }

    renderRalList(list);
  }

  function renderRalList(colors) {
    dom.ralListGrid.innerHTML = '';
    if (colors.length === 0) {
      dom.ralListGrid.innerHTML = '<div style="grid-column: span 2; text-align: center; color: var(--text-muted); padding: 20px;">Keine RAL-Farbe gefunden</div>';
      return;
    }

    const fragment = document.createDocumentFragment();
    colors.slice(0, 80).forEach((item) => {
      const card = document.createElement('div');
      card.className = 'ral-card-item';
      card.innerHTML = `
        <div class="ral-card-swatch" style="background-color: ${item.hex}"></div>
        <div class="ral-card-meta">
          <span class="ral-card-code">${item.code}</span>
          <span class="ral-card-name">${item.name}</span>
        </div>
      `;

      card.addEventListener('click', () => {
        triggerHaptic(20);
        updateCurrentColor(item.rgb[0], item.rgb[1], item.rgb[2], true);
        syncManualSliders(item.rgb[0], item.rgb[1], item.rgb[2]);
        showToast(`${item.code} ${item.name} ausgewählt`);
      });

      fragment.appendChild(card);
    });

    dom.ralListGrid.appendChild(fragment);
  }

  function syncManualSliders(r, g, b) {
    dom.sliderR.value = r;
    dom.sliderG.value = g;
    dom.sliderB.value = b;
    dom.valR.textContent = r;
    dom.valG.textContent = g;
    dom.valB.textContent = b;
    const hex = ColorMath.rgbToHex(r, g, b);
    dom.nativeColorPicker.value = hex;
    dom.manualHexInput.value = hex;
  }

  // ================= FARBTON-AKTUALISIERUNG (ZENTRAL) =================
  function updateCurrentColor(r, g, b, isExplicitPick = false) {
    const hex = ColorMath.rgbToHex(r, g, b);
    const hsl = ColorMath.rgbToHsl(r, g, b);
    const cmyk = ColorMath.rgbToCmyk(r, g, b);

    // RAL & Common Name Matching
    const ralResult = ColorMath.findClosestColor({ r, g, b }, globalThis.RAL_COLORS || []);
    const commonResult = ColorMath.findClosestColor({ r, g, b }, globalThis.COMMON_COLORS || []);

    const naturalDesc = ColorMath.describeColor(r, g, b);
    const temp = ColorMath.getColorTemperature(r, g, b);

    state.currentColor = {
      r,
      g,
      b,
      hex,
      hsl,
      cmyk,
      ralMatch: ralResult ? ralResult.match : null,
      deltaE: ralResult ? ralResult.deltaE : 0,
      similarity: ralResult ? ralResult.similarityPercent : 100,
      commonMatch: commonResult ? commonResult.match : null,
      desc: naturalDesc,
      temp: temp
    };

    // UI Elemente aktualisieren
    renderColorDetail(state.currentColor, isExplicitPick);
  }

  function renderColorDetail(color, isExplicitPick) {
    const { r, g, b, hex, hsl, cmyk, ralMatch, deltaE, similarity, commonMatch, desc, temp } = color;

    // Auslöser-Button Farbe & Vorschau
    dom.captureIndicator.style.backgroundColor = hex;
    dom.detailColorSwatch.style.backgroundColor = hex;

    // Temperatur Badge
    const tempIcons = {
      warm: '🔥 Warm',
      cool: '❄️ Kühl',
      neutral: '⚪ Neutral',
      balanced: '🌿 Ausgewogen',
      'warm-cool': '✨ Nuanciert'
    };
    dom.detailTemperatureBadge.textContent = tempIcons[temp.type] || temp.label;

    // Hauptname: Bevorzuge gängigen deutschen Farbnamen oder RAL-Namen
    let displayName = 'Farbton';
    if (commonMatch && ralMatch) {
      displayName = commonMatch.name;
    } else if (ralMatch) {
      displayName = ralMatch.name;
    }
    dom.detailColorName.textContent = displayName;

    // Natürliche Beschreibung
    dom.detailNaturalDesc.textContent = desc;

    // RAL Tag & Match Score
    if (ralMatch) {
      dom.detailRalTag.textContent = `${ralMatch.code} ${ralMatch.name}`;
      dom.detailMatchScore.textContent = `${similarity}% Passgenauigkeit (ΔE: ${deltaE})`;
      dom.compareRal.style.backgroundColor = ralMatch.hex;
      dom.compareRalLabel.textContent = ralMatch.code;
    } else {
      dom.detailRalTag.textContent = 'RAL Farbton';
      dom.detailMatchScore.textContent = '';
    }

    // Side-by-Side Vergleich
    dom.compareMeasured.style.backgroundColor = hex;
    dom.compareDeltaE.textContent = deltaE.toFixed(1);

    // Farbcodes
    dom.codeHex.textContent = hex;
    dom.codeRgb.textContent = `${r}, ${g}, ${b}`;
    dom.codeHsl.textContent = `${hsl.h}°, ${hsl.s}%, ${hsl.l}%`;
    dom.codeCmyk.textContent = `${cmyk.c}%, ${cmyk.m}%, ${cmyk.y}%, ${cmyk.k}%`;

    // Farbharmonien berechnen & anzeigen (nur bei gezieltem Auswählen oder seltener aktualisieren)
    if (isExplicitPick || !dom.harmoniesContainer.hasChildNodes()) {
      renderHarmonies(r, g, b);
    }
  }

  // Harmonische Paletten rendern
  function renderHarmonies(r, g, b) {
    const harmonies = ColorMath.generateHarmonies(r, g, b);
    dom.harmoniesContainer.innerHTML = '';

    Object.values(harmonies).forEach((group) => {
      const groupEl = document.createElement('div');
      groupEl.className = 'harmony-group';

      const header = document.createElement('div');
      header.className = 'harmony-header';
      header.innerHTML = `<span class="harmony-title">${group.title}</span>`;
      groupEl.appendChild(header);

      const row = document.createElement('div');
      row.className = 'harmony-row';

      group.colors.forEach((item) => {
        const chip = document.createElement('div');
        chip.className = 'harmony-chip';
        chip.style.backgroundColor = item.hex;
        const textColor = ColorMath.getContrastTextColor(item.rgb.r, item.rgb.g, item.rgb.b);
        chip.innerHTML = `<span style="color:${textColor}">${item.hex}</span>`;
        chip.title = `${item.label} (${item.hex})`;

        chip.addEventListener('click', () => {
          triggerHaptic(25);
          updateCurrentColor(item.rgb.r, item.rgb.g, item.rgb.b, true);
          syncManualSliders(item.rgb.r, item.rgb.g, item.rgb.b);
          showToast(`Harmonie-Farbe ${item.hex} gewählt`);
        });

        row.appendChild(chip);
      });

      groupEl.appendChild(row);
      dom.harmoniesContainer.appendChild(groupEl);
    });
  }

  // ================= SPRACHAUSGABE (TTS) =================
  function speakCurrentColor() {
    if (!('speechSynthesis' in window)) {
      showToast('Sprachausgabe auf diesem Gerät nicht verfügbar');
      return;
    }

    window.speechSynthesis.cancel();

    const color = state.currentColor;
    const ralText = color.ralMatch ? `${color.ralMatch.code}, ${color.ralMatch.name}.` : '';
    const text = `${dom.detailColorName.textContent}. ${ralText} ${color.desc}.`;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    utterance.rate = 0.95;

    // Versuche deutsche Stimme zu finden
    const voices = window.speechSynthesis.getVoices();
    const deVoice = voices.find((v) => v.lang.startsWith('de'));
    if (deVoice) utterance.voice = deVoice;

    window.speechSynthesis.speak(utterance);
    showToast('🔊 Farbton wird vorgelesen...');
  }

  // ================= GESPEICHERTE FARBTÖNE & LOCALSTORAGE =================
  function loadSavedColors() {
    try {
      const data = localStorage.getItem('farbton_saved_v1');
      state.savedColors = data ? JSON.parse(data) : [];
    } catch (e) {
      state.savedColors = [];
    }
    updateSavedUI();
  }

  function persistSavedColors() {
    try {
      localStorage.setItem('farbton_saved_v1', JSON.stringify(state.savedColors));
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }
    updateSavedUI();
  }

  function openSaveModal() {
    const c = state.currentColor;
    dom.saveModalSwatch.style.backgroundColor = c.hex;
    dom.saveModalName.textContent = `${dom.detailColorName.textContent} (${c.ralMatch ? c.ralMatch.code : c.hex})`;
    dom.saveInputNote.value = '';
    dom.modalSave.style.display = 'flex';
    setTimeout(() => dom.saveInputNote.focus(), 150);
  }

  function saveCurrentColorWithNote() {
    const note = dom.saveInputNote.value.trim();
    const item = {
      id: Date.now(),
      hex: state.currentColor.hex,
      r: state.currentColor.r,
      g: state.currentColor.g,
      b: state.currentColor.b,
      name: dom.detailColorName.textContent,
      ralCode: state.currentColor.ralMatch ? state.currentColor.ralMatch.code : '',
      ralName: state.currentColor.ralMatch ? state.currentColor.ralMatch.name : '',
      note: note || '',
      timestamp: new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    };

    state.savedColors.unshift(item);
    persistSavedColors();
    dom.modalSave.style.display = 'none';
    triggerHaptic(40);
    showToast('Farbton erfolgreich gespeichert ⭐');
  }

  function updateSavedUI() {
    dom.savedCounter.textContent = state.savedColors.length;

    if (state.savedColors.length === 0) {
      dom.savedEmptyState.style.display = 'block';
      dom.savedListContainer.style.display = 'none';
      return;
    }

    dom.savedEmptyState.style.display = 'none';
    dom.savedListContainer.style.display = 'flex';
    dom.savedListContainer.innerHTML = '';

    state.savedColors.forEach((item) => {
      const el = document.createElement('div');
      el.className = 'saved-item';
      el.innerHTML = `
        <div class="saved-swatch" style="background-color: ${item.hex}"></div>
        <div class="saved-meta">
          <div class="saved-title-row">
            <span class="saved-name">${item.name}</span>
            ${item.ralCode ? `<span class="saved-ral">${item.ralCode}</span>` : ''}
          </div>
          ${item.note ? `<div class="saved-note">📝 ${item.note}</div>` : ''}
          <div class="saved-time">${item.hex} • ${item.timestamp}</div>
        </div>
        <button class="saved-delete-btn" title="Löschen">&times;</button>
      `;

      // Klick lädt den Farbton
      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('saved-delete-btn')) {
          deleteSavedColor(item.id);
          return;
        }
        triggerHaptic(20);
        updateCurrentColor(item.r, item.g, item.b, true);
        syncManualSliders(item.r, item.g, item.b);
        showToast(`${item.name} geladen`);
      });

      dom.savedListContainer.appendChild(el);
    });
  }

  function deleteSavedColor(id) {
    state.savedColors = state.savedColors.filter((i) => i.id !== id);
    persistSavedColors();
    showToast('Farbton entfernt');
  }

  function clearAllSaved() {
    if (state.savedColors.length === 0) return;
    if (confirm('Möchtest du wirklich alle gespeicherten Farbtöne löschen?')) {
      state.savedColors = [];
      persistSavedColors();
      showToast('Alle Farbtöne gelöscht');
    }
  }

  // Farbton teilen via Web Share API
  async function shareCurrentColor() {
    const c = state.currentColor;
    const text = `🎨 Farbton-Messung:
Name: ${dom.detailColorName.textContent}
${c.ralMatch ? `RAL: ${c.ralMatch.code} (${c.ralMatch.name}) - Passgenauigkeit: ${c.similarity}%` : ''}
HEX: ${c.hex}
RGB: ${c.r}, ${c.g}, ${c.b}
HSL: ${c.hsl.h}°, ${c.hsl.s}%, ${c.hsl.l}%
CMYK: ${c.cmyk.c}%, ${c.cmyk.m}%, ${c.cmyk.y}%, ${c.cmyk.k}%
Nuance: ${c.desc}
`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `Farbton ${dom.detailColorName.textContent}`,
          text: text
        });
      } catch (e) {
        // Abbruch durch Nutzer
      }
    } else {
      await copyToClipboard(text);
      showToast('Farbbericht in Zwischenablage kopiert 📋');
    }
  }

  async function shareSavedList() {
    if (state.savedColors.length === 0) {
      showToast('Noch keine Farbtöne zum Teilen vorhanden');
      return;
    }

    let summary = '🎨 Meine gespeicherten Farbtöne:\n\n';
    state.savedColors.forEach((item, idx) => {
      summary += `${idx + 1}. ${item.name} (${item.hex})${item.ralCode ? ' - ' + item.ralCode : ''}${item.note ? ' [' + item.note + ']' : ''}\n`;
    });

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Meine Farbtöne-Sammlung',
          text: summary
        });
      } catch (e) {}
    } else {
      await copyToClipboard(summary);
      showToast('Farbton-Liste kopiert 📋');
    }
  }

  // Clipboard Hilfsfunktion
  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
    } catch (e) {
      console.warn('Copy error:', e);
    }
  }

  // ================= DEMO MODUS =================
  function startDemoMode() {
    dom.permissionOverlay.style.display = 'none';
    showToast('Muster-Farbe geladen (RAL 5012 Lichtblau)');
    updateCurrentColor(52, 129, 184, true);
    syncManualSliders(52, 129, 184);
  }

  // ================= INITIALISIERUNG =================
  function init() {
    // 1. Event Listeners für Header & Navigation
    dom.navTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        triggerHaptic(15);
        switchTab(tab.dataset.tab);
      });
    });

    dom.btnTorch.addEventListener('click', toggleTorch);
    dom.btnInfo.addEventListener('click', () => {
      dom.modalInfo.style.display = 'flex';
    });
    dom.btnCloseModal.addEventListener('click', () => {
      dom.modalInfo.style.display = 'none';
    });
    dom.btnModalOk.addEventListener('click', () => {
      dom.modalInfo.style.display = 'none';
    });

    // 2. Kamera Event Listeners
    dom.btnStartCamera.addEventListener('click', () => {
      startCamera();
    });
    dom.btnDemoMode.addEventListener('click', startDemoMode);
    dom.btnFlipCamera.addEventListener('click', flipCamera);
    dom.btnFreezeCamera.addEventListener('click', toggleCameraFreeze);

    // Klick auf den großen Auslöser: Fixiert Farbe und gibt Feedback
    dom.btnCaptureColor.addEventListener('click', () => {
      triggerHaptic(40);
      showToast(`Farbe ${state.currentColor.hex} erfasst!`);
      // Sanft nach unten scrollen zur Detailansicht
      dom.colorDetailSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // Touch/Klick auf Videobild zur Fadenkreuz-Verschiebung
    dom.videoWrapper.addEventListener('click', (e) => {
      if (dom.permissionOverlay.style.display !== 'none') return;
      const rect = dom.videoWrapper.getBoundingClientRect();
      handleReticleRelocate(e.clientX, e.clientY, rect);
    });

    // Sample Radius Umschaltung
    dom.radiusBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        dom.radiusBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.sampleRadius = parseInt(btn.dataset.radius, 10);
        triggerHaptic(15);
        showToast(`Messpunkt: ${btn.textContent}`);
      });
    });

    // 3. Foto-Verarbeitung
    setupPhotoHandling();

    // 4. Manuelle Farbwahl & RAL Suche
    setupManualPicker();

    // 5. Farbcodes 1-Klick-Kopieren
    dom.codeBoxes.forEach((box) => {
      box.addEventListener('click', async () => {
        const val = box.querySelector('.code-val').textContent;
        const fmt = box.dataset.format.toUpperCase();
        await copyToClipboard(val);
        triggerHaptic(20);
        showToast(`${fmt}-Wert (${val}) kopiert!`);
      });
    });

    // 6. Audio-Ausgabe
    dom.btnSpeakColor.addEventListener('click', speakCurrentColor);

    // 7. Speichern & Teilen
    dom.btnSaveCurrent.addEventListener('click', openSaveModal);
    dom.btnCloseSaveModal.addEventListener('click', () => {
      dom.modalSave.style.display = 'none';
    });
    dom.btnConfirmSave.addEventListener('click', saveCurrentColorWithNote);
    dom.btnShareCurrent.addEventListener('click', shareCurrentColor);
    dom.btnExportSaved.addEventListener('click', shareSavedList);
    dom.btnClearSaved.addEventListener('click', clearAllSaved);

    // 8. Gespeicherte Farben laden
    loadSavedColors();

    // 9. Initialen Farbton setzen (Lichtblau RAL 5012)
    updateCurrentColor(52, 129, 184, true);
    syncManualSliders(52, 129, 184);

    // 10. Auto-Prompt für Kamera falls Nutzer auf mobilen Geräten ist
    // Wir lassen das Overlay da, damit iOS Safari nicht den Kamera-Dialog ohne User-Geste abbricht
  }

  return {
    init,
    switchTab
  };
})();

// Starte App sobald das DOM geladen ist
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
