/**
 * Darkness Battle - Schwarz- & Weiß-Anteil Analyse & Ranking Game
 * - Berechnet Schwarz- & Weiß-Anteil in Prozent (100% Schwarz = 1000 Punkte)
 * - Foto aufnehmen (Kamera)
 * - Bild hochladen (Galerie/Dateien)
 * - Bild aus Zwischenablage einfügen (Clipboard Paste)
 * - Interaktives Anklicken mit englischem Ladekreis ("Analyzing...")
 * - Visuelle Prozentbalken
 * - Speichern & Freunde herausfordern (Battle-Rangliste)
 */

const DarknessBattle = (function () {
  'use strict';

  // Spiel- & Analyse-Zustand
  const state = {
    playerName: 'Du',
    currentImage: null,
    currentCoords: { x: 0.5, y: 0.5 }, // 0..1 normalisiert
    analysisResult: null,
    isAnalyzing: false,
    savedScores: [],
    highScore: 0
  };

  // Standard Mock-Gegner für das Battle-Feeling
  const INITIAL_RIVALS = [
    {
      id: 'rival-1',
      playerName: '🌑 ShadowMaster',
      blackPercent: 98.8,
      whitePercent: 1.2,
      score: 988,
      rankTitle: 'Obsidian Overlord',
      hex: '#030303',
      isRival: true,
      timestamp: 'Heute, 14:20'
    },
    {
      id: 'rival-2',
      playerName: '🕶️ DarkHunter_07',
      blackPercent: 94.2,
      whitePercent: 5.8,
      score: 942,
      rankTitle: 'Shadow Master',
      hex: '#0F0F12',
      isRival: true,
      timestamp: 'Heute, 12:05'
    },
    {
      id: 'rival-3',
      playerName: '🌌 LunaNight',
      blackPercent: 86.5,
      whitePercent: 13.5,
      score: 865,
      rankTitle: 'Night Stalker',
      hex: '#222329',
      isRival: true,
      timestamp: 'Gestern'
    },
    {
      id: 'rival-4',
      playerName: '⚡ PixelNovice',
      blackPercent: 52.0,
      whitePercent: 48.0,
      score: 520,
      rankTitle: 'Twilight Fighter',
      hex: '#7A7A80',
      isRival: true,
      timestamp: 'Gestern'
    }
  ];

  // DOM Elemente
  let dom = {};

  // Rang-Titel nach Punktzahl
  function getRankTitle(score) {
    if (score >= 1000) return { title: 'Vantablack God', icon: '🏆', desc: '100% Absolutes Schwarz!' };
    if (score >= 950) return { title: 'Obsidian Overlord', icon: '🌑', desc: 'Extreme Dunkelheit' };
    if (score >= 850) return { title: 'Shadow Master', icon: '🕶️', desc: 'Tiefe Schattenwelt' };
    if (score >= 700) return { title: 'Night Stalker', icon: '🌘', desc: 'Dunkler Farbton' };
    if (score >= 500) return { title: 'Twilight Fighter', icon: '🌓', desc: 'Halbdunkel' };
    if (score >= 300) return { title: 'Silver Shade', icon: '⛅', desc: 'Überwiegend hell' };
    return { title: 'Light Bringer', icon: '☀️', desc: 'Sehr helles Licht' };
  }

  // Toast Meldung
  function showToast(msg, duration = 2400) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
  }

  // Haptisches Feedback
  function triggerHaptic(duration = 30) {
    if ('vibrate' in navigator) {
      try { navigator.vibrate(duration); } catch (e) {}
    }
  }

  // Berechnung Schwarz/Weiß Prozent & Punkte
  function calculateBlackWhite(r, g, b) {
    // Wahrgenommene Helligkeit (ITU-R BT.601)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b);
    
    // Weiß-Anteil: 0..100%
    let whitePercent = Math.round((luminance / 255) * 1000) / 10;
    
    // Schwarz-Anteil: 100 - Weiß-Anteil
    let blackPercent = Math.round((100 - whitePercent) * 10) / 10;

    // Spezialfälle: Absolutes Schwarz & Weiß
    if (r === 0 && g === 0 && b === 0) {
      blackPercent = 100.0;
      whitePercent = 0.0;
    } else if (r === 255 && g === 255 && b === 255) {
      blackPercent = 0.0;
      whitePercent = 100.0;
    }

    // Punkte: 100% Schwarz = 1000 Punkte
    const score = Math.round(blackPercent * 10);
    const rank = getRankTitle(score);
    const hex = ColorMath.rgbToHex(r, g, b);

    return {
      r, g, b,
      hex,
      blackPercent,
      whitePercent,
      score,
      rank
    };
  }

  // Bild auf Canvas zeichnen
  function drawImageToCanvas(img) {
    const canvas = dom.canvas;
    const ctx = canvas.getContext('2d');
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

    dom.emptyState.style.display = 'none';
    dom.canvasWrapper.style.display = 'block';

    // Fadenkreuz in Bildmitte setzen
    setTargetPoint(0.5, 0.5, false);
  }

  // Fadenkreuz & Analyse an Position
  function setTargetPoint(normX, normY, triggerAnalysis = true) {
    state.currentCoords = { x: normX, y: normY };

    dom.reticle.style.left = `${normX * 100}%`;
    dom.reticle.style.top = `${normY * 100}%`;

    if (triggerAnalysis) {
      startAnalysis();
    }
  }

  // Analyse mit englischem Ladekreis ("Analyzing...")
  function startAnalysis() {
    if (state.isAnalyzing) return;
    state.isAnalyzing = true;

    triggerHaptic(20);

    // Lade-Overlay anzeigen
    dom.analyzingOverlay.style.display = 'flex';
    dom.resultCard.style.display = 'none';

    // Pixeldaten ermitteln
    const canvas = dom.canvas;
    const ctx = canvas.getContext('2d');
    const px = Math.floor(state.currentCoords.x * canvas.width);
    const py = Math.floor(state.currentCoords.y * canvas.height);

    // Kleines 3x3 Smoothing gegen Kamerasensor-Rauschen
    const sample = samplePixelSmooth(ctx, px, py, 3, canvas.width, canvas.height);
    const result = calculateBlackWhite(sample.r, sample.g, sample.b);
    state.analysisResult = result;

    // Künstliche Ladedauer (~850ms) für das englische Analyzing-Erlebnis
    setTimeout(() => {
      dom.analyzingOverlay.style.display = 'none';
      state.isAnalyzing = false;
      renderResult(result);
      triggerHaptic(40);
    }, 850);
  }

  // Pixelabtastung mit Mittelwert
  function samplePixelSmooth(ctx, cx, cy, radius, maxW, maxH) {
    const half = Math.floor(radius / 2);
    const startX = Math.max(0, cx - half);
    const startY = Math.max(0, cy - half);
    const w = Math.min(radius, maxW - startX);
    const h = Math.min(radius, maxH - startY);

    if (w <= 0 || h <= 0) return { r: 0, g: 0, b: 0 };

    const imgData = ctx.getImageData(startX, startY, w, h).data;
    let sumR = 0, sumG = 0, sumB = 0;
    const count = imgData.length / 4;

    for (let i = 0; i < imgData.length; i += 4) {
      sumR += imgData[i];
      sumG += imgData[i + 1];
      sumB += imgData[i + 2];
    }

    return {
      r: Math.round(sumR / count),
      g: Math.round(sumG / count),
      b: Math.round(sumB / count)
    };
  }

  // Analyse-Ergebnis & Prozentbalken rendern
  function renderResult(res) {
    dom.resultCard.style.display = 'block';

    // Score & Rank
    dom.resultScore.textContent = `${res.score} PTS`;
    dom.resultRank.textContent = `${res.rank.icon} ${res.rank.title}`;
    dom.resultRankDesc.textContent = res.rank.desc;

    // Prozent-Werte Text
    dom.valBlackPercent.textContent = `${res.blackPercent.toFixed(1)}%`;
    dom.valWhitePercent.textContent = `${res.whitePercent.toFixed(1)}%`;

    // Balkenbreiten mit Animation
    dom.barBlackFill.style.width = '0%';
    dom.barWhiteFill.style.width = '0%';

    requestAnimationFrame(() => {
      dom.barBlackFill.style.width = `${Math.min(100, Math.max(0, res.blackPercent))}%`;
      dom.barWhiteFill.style.width = `${Math.min(100, Math.max(0, res.whitePercent))}%`;
    });

    // Swatch & HEX
    dom.resultSwatch.style.backgroundColor = res.hex;
    dom.resultHex.textContent = res.hex;
    dom.resultRgb.textContent = `RGB(${res.r}, ${res.g}, ${res.b})`;

    // Sanft nach unten scrollen zur Auswertung
    dom.resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Bild aus Blob/Datei laden
  function loadBlobImage(blob) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        state.currentImage = img;
        drawImageToCanvas(img);
        showToast('Bild geladen! Klicke auf die dunkelste Stelle 🎯');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(blob);
  }

  // Bild aus der Zwischenablage einfügen (Clipboard)
  async function pasteFromClipboard() {
    try {
      if (navigator.clipboard && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          for (const type of item.types) {
            if (type.startsWith('image/')) {
              const blob = await item.getType(type);
              loadBlobImage(blob);
              showToast('📋 Bild aus Zwischenablage eingefügt!');
              return;
            }
          }
        }
      }
      showToast('Kein Bild in der Zwischenablage gefunden. Kopiere erst ein Foto oder Screenshot!');
    } catch (err) {
      console.warn('Clipboard read error:', err);
      showToast('Tippe auf den Bildschirm und drücke Strg+V zum Einfügen');
    }
  }

  // Schnelle Testbilder (Presets)
  function loadPresetImage(type) {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');

    if (type === 'vantablack') {
      // Tiefschwarz mit feinstem Farbverlauf
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, 600, 400);
      const grad = ctx.createRadialGradient(300, 200, 10, 300, 200, 300);
      grad.addColorStop(0, '#000000');
      grad.addColorStop(1, '#050508');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 600, 400);
    } else if (type === 'checker') {
      // Schachbrett: 100% Schwarz vs 100% Weiß
      const size = 50;
      for (let y = 0; y < 400; y += size) {
        for (let x = 0; x < 600; x += size) {
          ctx.fillStyle = ((x / size + y / size) % 2 === 0) ? '#000000' : '#FFFFFF';
          ctx.fillRect(x, y, size, size);
        }
      }
    } else if (type === 'espresso') {
      // Dunkler Espresso-Kaffee mit Crema-Rand
      ctx.fillStyle = '#090706';
      ctx.fillRect(0, 0, 600, 400);
      const grad = ctx.createRadialGradient(300, 200, 20, 300, 200, 220);
      grad.addColorStop(0, '#070504');
      grad.addColorStop(0.7, '#19110B');
      grad.addColorStop(1, '#6F4E37');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(300, 200, 180, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'space') {
      // Weltraum mit Sternen
      ctx.fillStyle = '#030305';
      ctx.fillRect(0, 0, 600, 400);
      // Sterne
      for (let i = 0; i < 60; i++) {
        const sx = Math.random() * 600;
        const sy = Math.random() * 400;
        const sr = Math.random() * 1.5;
        ctx.fillStyle = Math.random() > 0.3 ? '#FFFFFF' : '#60A5FA';
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const dataUrl = canvas.toDataURL('image/png');
    const img = new Image();
    img.onload = () => {
      state.currentImage = img;
      drawImageToCanvas(img);
      showToast('Musterbild geladen! Klicke auf eine Stelle 🎯');
    };
    img.src = dataUrl;
  }

  // Mini Thumbnail für Bestenliste erstellen
  function generateThumbnailWithReticle(canvas, normX, normY) {
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 72;
    thumbCanvas.height = 72;
    const tCtx = thumbCanvas.getContext('2d');

    // Bildausschnitt rund um den Messpunkt
    const cropSize = Math.min(canvas.width, canvas.height, 200);
    const srcX = Math.max(0, Math.min(canvas.width - cropSize, normX * canvas.width - cropSize / 2));
    const srcY = Math.max(0, Math.min(canvas.height - cropSize, normY * canvas.height - cropSize / 2));

    tCtx.drawImage(canvas, srcX, srcY, cropSize, cropSize, 0, 0, 72, 72);

    // Roter Zielpunkt auf Thumbnail
    tCtx.strokeStyle = '#FFFFFF';
    tCtx.lineWidth = 2;
    tCtx.beginPath();
    tCtx.arc(36, 36, 6, 0, Math.PI * 2);
    tCtx.stroke();

    tCtx.fillStyle = '#EF4444';
    tCtx.beginPath();
    tCtx.arc(36, 36, 3, 0, Math.PI * 2);
    tCtx.fill();

    return thumbCanvas.toDataURL('image/jpeg', 0.85);
  }

  // Score in Bestenliste sichern
  function saveCurrentScore() {
    if (!state.analysisResult) {
      showToast('Klicke zuerst auf eine Stelle im Bild!');
      return;
    }

    const res = state.analysisResult;
    const thumb = generateThumbnailWithReticle(dom.canvas, state.currentCoords.x, state.currentCoords.y);

    const entry = {
      id: 'score-' + Date.now(),
      playerName: state.playerName,
      blackPercent: res.blackPercent,
      whitePercent: res.whitePercent,
      score: res.score,
      rankTitle: res.rank.title,
      hex: res.hex,
      thumb: thumb,
      isRival: false,
      timestamp: new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    };

    state.savedScores.push(entry);
    persistScores();

    if (res.score > state.highScore) {
      state.highScore = res.score;
      persistPlayer();
    }

    updatePlayerBanner();
    renderLeaderboard();

    triggerHaptic(50);
    showToast(`🏆 ${res.score} Punkte gespeichert! Schau in der Rangliste nach.`);
  }

  // Bestenliste rendern
  function renderLeaderboard() {
    const listEl = dom.leaderboardList;
    listEl.innerHTML = '';

    // Eigene Einträge + Rivalen kombinieren und absteigend nach Punkten sortieren
    const combined = [...state.savedScores, ...INITIAL_RIVALS].sort((a, b) => b.score - a.score);

    combined.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = `leaderboard-item ${item.isRival ? 'rival-item' : 'player-item'}`;

      let medal = '';
      if (index === 0) medal = '🥇 ';
      else if (index === 1) medal = '🥈 ';
      else if (index === 2) medal = '🥉 ';
      else medal = `#${index + 1} `;

      const thumbHtml = item.thumb
        ? `<img src="${item.thumb}" class="leaderboard-thumb" alt="Sample">`
        : `<div class="leaderboard-thumb-color" style="background-color: ${item.hex}"></div>`;

      row.innerHTML = `
        <div class="leaderboard-rank-col">${medal}</div>
        ${thumbHtml}
        <div class="leaderboard-info-col">
          <div class="leaderboard-name-row">
            <span class="leaderboard-name">${item.playerName}</span>
            ${!item.isRival ? '<span class="you-badge">DU</span>' : ''}
          </div>
          <div class="leaderboard-sub-row">
            <span>🖤 ${item.blackPercent}% Schwarz</span>
            <span>🤍 ${item.whitePercent}% Weiß</span>
          </div>
        </div>
        <div class="leaderboard-score-col">
          <strong>${item.score}</strong>
          <span>Pkt</span>
        </div>
      `;

      listEl.appendChild(row);
    });
  }

  // Freunde herausfordern / Share
  async function challengeFriends() {
    const score = state.analysisResult ? state.analysisResult.score : state.highScore;
    const black = state.analysisResult ? state.analysisResult.blackPercent : 98.5;

    const url = 'https://antigravity.luch.dev/site/d8f286ec-a4c3-4a77-b49d-305416f1ad51/f1f001e454513fd1af86548c/';
    const shareText = `⚔️ Dark Battle Challenge!
Ich habe ${black}% Schwarz (${score} Punkte) erreicht! 🌑
Kannst du das schlagen und Platz 1 erobern?
Teste dein dunkelstes Bild hier: ${url}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Darkness Battle Challenge',
          text: shareText,
          url: url
        });
      } catch (e) {}
    } else {
      copyToClipboard(shareText);
      showToast('Challenge-Link kopiert! Sende ihn an deine Freunde ⚔️');
    }
  }

  // Hilfsfunktion Zwischenablage
  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
    } catch (e) {}
  }

  // Speichern / Laden in LocalStorage
  function loadPersistedData() {
    try {
      const p = localStorage.getItem('darkness_player_v1');
      if (p) {
        const data = JSON.parse(p);
        state.playerName = data.name || 'Du';
        state.highScore = data.highScore || 0;
      }
      const s = localStorage.getItem('darkness_scores_v1');
      state.savedScores = s ? JSON.parse(s) : [];
    } catch (e) {
      state.savedScores = [];
    }

    updatePlayerBanner();
    renderLeaderboard();
  }

  function persistPlayer() {
    try {
      localStorage.setItem('darkness_player_v1', JSON.stringify({
        name: state.playerName,
        highScore: state.highScore
      }));
    } catch (e) {}
  }

  function persistScores() {
    try {
      localStorage.setItem('darkness_scores_v1', JSON.stringify(state.savedScores));
    } catch (e) {}
  }

  function updatePlayerBanner() {
    if (dom.playerNameDisplay) dom.playerNameDisplay.textContent = state.playerName;
    if (dom.playerHighScoreDisplay) dom.playerHighScoreDisplay.textContent = `${state.highScore} PTS`;
  }

  function editPlayerName() {
    const current = state.playerName === 'Du' ? '' : state.playerName;
    const newName = prompt('Dein Spielername im Dark Battle:', current);
    if (newName && newName.trim()) {
      state.playerName = newName.trim().slice(0, 16);
      persistPlayer();
      updatePlayerBanner();
      renderLeaderboard();
      showToast(`Spielername geändert zu: ${state.playerName}`);
    }
  }

  // Initialisierung der Event Listeners
  function init() {
    dom = {
      canvas: document.getElementById('battle-canvas'),
      canvasWrapper: document.getElementById('battle-canvas-wrapper'),
      reticle: document.getElementById('battle-reticle'),
      emptyState: document.getElementById('battle-empty-state'),
      cameraInput: document.getElementById('battle-camera-input'),
      fileInput: document.getElementById('battle-file-input'),
      btnTakePic: document.getElementById('btn-battle-camera'),
      btnUploadPic: document.getElementById('btn-battle-upload'),
      btnPastePic: document.getElementById('btn-battle-paste'),
      presetChips: document.querySelectorAll('.battle-preset-chip'),

      analyzingOverlay: document.getElementById('battle-analyzing-overlay'),
      resultCard: document.getElementById('battle-result-card'),
      resultScore: document.getElementById('battle-result-score'),
      resultRank: document.getElementById('battle-result-rank'),
      resultRankDesc: document.getElementById('battle-result-rank-desc'),
      valBlackPercent: document.getElementById('val-black-percent'),
      valWhitePercent: document.getElementById('val-white-percent'),
      barBlackFill: document.getElementById('bar-black-fill'),
      barWhiteFill: document.getElementById('bar-white-fill'),
      resultSwatch: document.getElementById('battle-result-swatch'),
      resultHex: document.getElementById('battle-result-hex'),
      resultRgb: document.getElementById('battle-result-rgb'),
      btnSaveScore: document.getElementById('btn-save-battle-score'),
      btnChallenge: document.getElementById('btn-challenge-friends'),
      btnPickAnother: document.getElementById('btn-pick-another-point'),

      playerNameDisplay: document.getElementById('battle-player-name'),
      playerHighScoreDisplay: document.getElementById('battle-player-highscore'),
      btnEditPlayer: document.getElementById('btn-edit-player-name'),
      leaderboardList: document.getElementById('battle-leaderboard-list'),
      btnShareLeaderboard: document.getElementById('btn-share-leaderboard')
    };

    if (!dom.canvas) return;

    // 1. Input Handler: Foto aufnehmen & Hochladen
    dom.btnTakePic.addEventListener('click', () => dom.cameraInput.click());
    dom.btnUploadPic.addEventListener('click', () => dom.fileInput.click());

    dom.cameraInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) loadBlobImage(e.target.files[0]);
    });

    dom.fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) loadBlobImage(e.target.files[0]);
    });

    // 2. Zwischenablage Button & Globales Paste
    dom.btnPastePic.addEventListener('click', pasteFromClipboard);

    window.addEventListener('paste', (e) => {
      if (e.clipboardData && e.clipboardData.items) {
        for (const item of e.clipboardData.items) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
              loadBlobImage(file);
              showToast('📋 Bild aus Zwischenablage eingefügt!');
              return;
            }
          }
        }
      }
    });

    // 3. Preset-Buttons
    dom.presetChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        triggerHaptic(15);
        loadPresetImage(chip.dataset.preset);
      });
    });

    // 4. Klick / Touch auf Bild -> Fadenkreuz setzen & Analysieren
    dom.canvasWrapper.addEventListener('click', (e) => {
      const rect = dom.canvas.getBoundingClientRect();
      const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      setTargetPoint(normX, normY, true);
    });

    // 5. Result Aktionen
    dom.btnSaveScore.addEventListener('click', saveCurrentScore);
    dom.btnChallenge.addEventListener('click', challengeFriends);
    dom.btnPickAnother.addEventListener('click', () => {
      dom.canvasWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
      showToast('Tippe auf eine andere Stelle im Bild 🎯');
    });

    // 6. Spielername & Leaderboard
    dom.btnEditPlayer.addEventListener('click', editPlayerName);
    if (dom.btnShareLeaderboard) {
      dom.btnShareLeaderboard.addEventListener('click', challengeFriends);
    }

    // 7. Daten laden
    loadPersistedData();

    // 8. Initiales Schachbrett-Muster laden für sofortigen Spaß!
    loadPresetImage('checker');
  }

  return {
    init,
    calculateBlackWhite,
    saveCurrentScore,
    challengeFriends
  };
})();

// Initialisierung bei DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  DarknessBattle.init();
});
