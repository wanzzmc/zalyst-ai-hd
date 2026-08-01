'use strict';

/* =========================================================
   ZALYST AI HD — script.js
   Vanilla JS (ES6+), no frameworks.
   ========================================================= */

// ------------------------- Constants -------------------------
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const HISTORY_KEY = 'zalyst_hd_history';
const MAX_HISTORY_ITEMS = 30;

// ------------------------- DOM refs -------------------------
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const uploadZoneEmpty = document.getElementById('uploadZoneEmpty');
const uploadZonePreview = document.getElementById('uploadZonePreview');
const previewImg = document.getElementById('previewImg');
const clearImageBtn = document.getElementById('clearImageBtn');

const modelSelect = document.getElementById('modelSelect');
const enhanceBtn = document.getElementById('enhanceBtn');

const progressPanel = document.getElementById('progressPanel');
const progressFill = document.getElementById('progressFill');
const progressPercent = document.getElementById('progressPercent');
const progressSteps = Array.from(document.querySelectorAll('.progress-step'));

const resultSection = document.getElementById('resultSection');
const beforeImg = document.getElementById('beforeImg');
const afterImg = document.getElementById('afterImg');
const afterClip = document.getElementById('afterClip');
const compareSlider = document.getElementById('compareSlider');
const compareHandle = document.getElementById('compareHandle');

const zoomBtn = document.getElementById('zoomBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const downloadBtn = document.getElementById('downloadBtn');
const copyResultBtn = document.getElementById('copyResultBtn');
const copyGithubBtn = document.getElementById('copyGithubBtn');
const openImageBtn = document.getElementById('openImageBtn');
const compareAgainBtn = document.getElementById('compareAgainBtn');

const historyGrid = document.getElementById('historyGrid');
const historyEmpty = document.getElementById('historyEmpty');
const historyToggleBtn = document.getElementById('historyToggleBtn');

const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');
const lightboxClose = document.getElementById('lightboxClose');

const toastStack = document.getElementById('toastStack');
const confettiCanvas = document.getElementById('confettiCanvas');

// ------------------------- State -------------------------
let currentFile = null;
let currentGithubUrl = null;
let currentResultUrl = null;
let isProcessing = false;

// =========================================================
// TOAST NOTIFICATIONS
// =========================================================
function showToast(message, type = 'info') {
  const icons = { success: '✅', error: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `<span class="toast__icon">${icons[type] || icons.info}</span><span>${escapeHtml(message)}</span>`;
  toastStack.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), 260);
  }, 3600);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// =========================================================
// FILE VALIDATION + PREVIEW
// =========================================================
function handleFileSelected(file) {
  if (!file) return;

  if (!ALLOWED_TYPES.includes(file.type)) {
    showToast('Unsupported File', 'error');
    return;
  }

  if (file.size > MAX_FILE_SIZE) {
    showToast('Maximum file size is 20MB', 'error');
    return;
  }

  currentFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    previewImg.src = e.target.result;
    uploadZoneEmpty.hidden = true;
    uploadZonePreview.hidden = false;
    enhanceBtn.disabled = false;
  };
  reader.onerror = () => showToast('Failed to read image file', 'error');
  reader.readAsDataURL(file);
}

uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  handleFileSelected(file);
});

// Drag & Drop
['dragenter', 'dragover'].forEach((evt) => {
  uploadZone.addEventListener(evt, (e) => {
    e.preventDefault();
    uploadZone.classList.add('is-dragover');
  });
});
['dragleave', 'drop'].forEach((evt) => {
  uploadZone.addEventListener(evt, (e) => {
    e.preventDefault();
    uploadZone.classList.remove('is-dragover');
  });
});
uploadZone.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files[0];
  handleFileSelected(file);
});

// Paste from clipboard
document.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      handleFileSelected(file);
      showToast('Image pasted from clipboard', 'info');
      break;
    }
  }
});

clearImageBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  resetUpload();
});

function resetUpload() {
  currentFile = null;
  fileInput.value = '';
  previewImg.src = '';
  uploadZoneEmpty.hidden = false;
  uploadZonePreview.hidden = true;
  enhanceBtn.disabled = true;
}

// =========================================================
// RIPPLE EFFECT (delegated to any .btn--ripple)
// =========================================================
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn--ripple');
  if (!btn || btn.disabled) return;

  const rect = btn.getBoundingClientRect();
  const ripple = document.createElement('span');
  const size = Math.max(rect.width, rect.height);
  ripple.className = 'ripple';
  ripple.style.width = ripple.style.height = `${size}px`;
  ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
  ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
  btn.appendChild(ripple);
  setTimeout(() => ripple.remove(), 650);
});

// =========================================================
// PROGRESS UI
// =========================================================
const STEP_PERCENT = {
  upload: 12,
  uploaded: 30,
  sending: 45,
  processing: 75,
  almost: 92,
  done: 100,
};

function setProgressStep(stepKey) {
  const order = ['upload', 'uploaded', 'sending', 'processing', 'almost', 'done'];
  const targetIndex = order.indexOf(stepKey);

  progressSteps.forEach((el) => {
    const key = el.dataset.step;
    const idx = order.indexOf(key);
    el.classList.remove('is-active', 'is-done');
    if (idx < targetIndex) el.classList.add('is-done');
    else if (idx === targetIndex) el.classList.add('is-active');
  });

  const percent = STEP_PERCENT[stepKey] || 0;
  progressFill.style.width = `${percent}%`;
  progressPercent.textContent = `${percent}%`;
}

function resetProgress() {
  progressSteps.forEach((el) => el.classList.remove('is-active', 'is-done'));
  progressFill.style.width = '0%';
  progressPercent.textContent = '0%';
}

// =========================================================
// MAIN ENHANCE FLOW
// =========================================================
enhanceBtn.addEventListener('click', async () => {
  if (isProcessing) return;
  if (!currentFile) {
    showToast('Please select an image first', 'error');
    return;
  }
  if (!navigator.onLine) {
    showToast('No Internet Connection', 'error');
    return;
  }

  const selectedModel = modelSelect.querySelector('input[name="aiModel"]:checked')?.value;
  if (!selectedModel) {
    showToast('Please select an AI model', 'error');
    return;
  }

  isProcessing = true;
  enhanceBtn.disabled = true;
  progressPanel.hidden = false;
  resetProgress();
  resultSection.hidden = true;

  try {
    // ---- STEP 1: Upload to GitHub via /api/upload ----
    setProgressStep('upload');
    const formData = new FormData();
    formData.append('image', currentFile);

    const uploadRes = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    const uploadData = await uploadRes.json().catch(() => ({}));

    if (!uploadRes.ok || !uploadData.success) {
      throw new AppError('Failed Upload');
    }

    currentGithubUrl = uploadData.url;
    setProgressStep('uploaded');
    await wait(300);

    // ---- STEP 2: Send RAW URL to /api/enhance ----
    setProgressStep('sending');
    await wait(250);
    setProgressStep('processing');

    const enhanceRes = await fetch('/api/enhance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: currentGithubUrl, model: selectedModel }),
    });

    const enhanceData = await enhanceRes.json().catch(() => ({}));

    if (!enhanceRes.ok || !enhanceData.success) {
      throw new AppError('AI Processing Failed');
    }

    setProgressStep('almost');
    await wait(350);

    currentResultUrl = enhanceData.resultUrl;

    // ---- Show result ----
    showResult(previewImg.src, currentResultUrl);
    setProgressStep('done');

    const modelLabel = document
      .querySelector(`input[value="${selectedModel}"]`)
      ?.closest('.model-card')
      ?.querySelector('.model-card__name')?.textContent || selectedModel;

    saveToHistory({
      thumbnail: currentResultUrl,
      model: modelLabel,
      time: new Date().toISOString(),
      resultUrl: currentResultUrl,
    });

    launchConfetti();
    showToast('Image enhanced successfully!', 'success');

    setTimeout(() => {
      progressPanel.hidden = true;
    }, 900);
  } catch (err) {
    console.error(err);
    const message = err instanceof AppError ? err.message : 'AI Processing Failed';
    showToast(message, 'error');
    progressPanel.hidden = true;
  } finally {
    isProcessing = false;
    enhanceBtn.disabled = false;
  }
});

class AppError extends Error {}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =========================================================
// BEFORE/AFTER COMPARISON
// =========================================================
function showResult(beforeSrc, afterSrc) {
  beforeImg.src = beforeSrc;
  afterImg.src = afterSrc;
  compareSlider.value = 50;
  updateCompareClip(50);
  resultSection.hidden = false;
  resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updateCompareClip(value) {
  afterClip.style.clipPath = `inset(0 ${100 - value}% 0 0)`;
  compareHandle.style.left = `${value}%`;
}

compareSlider.addEventListener('input', (e) => {
  updateCompareClip(Number(e.target.value));
});

compareAgainBtn.addEventListener('click', () => {
  compareSlider.value = 50;
  updateCompareClip(50);
});

// =========================================================
// ZOOM / FULLSCREEN (Lightbox)
// =========================================================
function openLightbox(src) {
  lightboxImg.src = src;
  lightbox.hidden = false;
}
zoomBtn.addEventListener('click', () => openLightbox(currentResultUrl || afterImg.src));
lightboxClose.addEventListener('click', () => { lightbox.hidden = true; });
lightbox.addEventListener('click', (e) => { if (e.target === lightbox) lightbox.hidden = true; });

fullscreenBtn.addEventListener('click', () => {
  const frame = document.getElementById('compareFrame');
  if (frame.requestFullscreen) {
    frame.requestFullscreen().catch(() => showToast('Fullscreen not supported', 'error'));
  } else {
    showToast('Fullscreen not supported', 'error');
  }
});

// =========================================================
// DOWNLOAD / COPY / OPEN
// =========================================================
downloadBtn.addEventListener('click', async () => {
  if (!currentResultUrl) return;

  try {
    const response = await fetch(currentResultUrl, { mode: 'cors' });
    if (!response.ok) throw new Error('fetch-failed');
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    const ext = guessExtension(blob.type) || 'jpg';
    const fileName = `AI-HD-${Date.now()}.${ext}`;

    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);

    showToast('Image downloaded successfully!', 'success');
  } catch (err) {
    console.error(err);
    // Fallback: force download via direct anchor (may open new context on some browsers,
    // but still triggers the OS-level download dialog for same-origin/CORS-enabled hosts)
    try {
      const a = document.createElement('a');
      a.href = currentResultUrl;
      a.download = `AI-HD-${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast('Image downloaded successfully!', 'success');
    } catch (fallbackErr) {
      showToast('Failed to download image.', 'error');
    }
  }
});

function guessExtension(mimeType) {
  const map = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  return map[mimeType];
}

copyResultBtn.addEventListener('click', () => copyToClipboard(currentResultUrl, 'Result URL copied!'));
copyGithubBtn.addEventListener('click', () => copyToClipboard(currentGithubUrl, 'GitHub URL copied!'));
openImageBtn.addEventListener('click', () => {
  if (currentResultUrl) window.open(currentResultUrl, '_blank', 'noopener');
});

async function copyToClipboard(text, successMsg) {
  if (!text) {
    showToast('Nothing to copy yet', 'error');
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMsg, 'success');
  } catch (err) {
    showToast('Failed to copy to clipboard', 'error');
  }
}

// =========================================================
// HISTORY (localStorage)
// =========================================================
function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToHistory(entry) {
  const history = loadHistory();
  history.unshift(entry);
  if (history.length > MAX_HISTORY_ITEMS) history.length = MAX_HISTORY_ITEMS;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  renderHistory();
}

function renderHistory() {
  const history = loadHistory();
  historyGrid.querySelectorAll('.history-card').forEach((el) => el.remove());

  if (history.length === 0) {
    historyEmpty.hidden = false;
    return;
  }
  historyEmpty.hidden = true;

  history.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'history-card';
    const time = new Date(item.time).toLocaleString('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    card.innerHTML = `
      <img src="${escapeHtml(item.thumbnail)}" alt="Hasil enhance ${escapeHtml(item.model)}" loading="lazy" />
      <div class="history-card__body">
        <div class="history-card__model">${escapeHtml(item.model)}</div>
        <div class="history-card__time">${escapeHtml(time)}</div>
        <button class="btn history-card__dl" type="button">⬇ Download</button>
      </div>
    `;
    card.querySelector('.history-card__dl').addEventListener('click', () => downloadHistoryItem(item));
    historyGrid.appendChild(card);
  });
}

async function downloadHistoryItem(item) {
  try {
    const response = await fetch(item.resultUrl, { mode: 'cors' });
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const ext = guessExtension(blob.type) || 'jpg';
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `AI-HD-${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
    showToast('Image downloaded successfully!', 'success');
  } catch {
    showToast('Failed to download image.', 'error');
  }
}

historyToggleBtn.addEventListener('click', () => {
  document.getElementById('historySection').scrollIntoView({ behavior: 'smooth' });
});

// =========================================================
// CONFETTI
// =========================================================
function launchConfetti() {
  const ctx = confettiCanvas.getContext('2d');
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;

  const colors = ['#7DD3FC', '#38BDF8', '#F5F7FF', '#4ADE80', '#FDE047'];
  const pieces = Array.from({ length: 120 }, () => ({
    x: Math.random() * confettiCanvas.width,
    y: -20 - Math.random() * confettiCanvas.height * 0.4,
    size: 6 + Math.random() * 6,
    color: colors[Math.floor(Math.random() * colors.length)],
    speedY: 2 + Math.random() * 3,
    speedX: -1.5 + Math.random() * 3,
    rotation: Math.random() * 360,
    rotationSpeed: -6 + Math.random() * 12,
  }));

  let frame = 0;
  const maxFrames = 130;

  function draw() {
    ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    pieces.forEach((p) => {
      p.x += p.speedX;
      p.y += p.speedY;
      p.rotation += p.rotationSpeed;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    });
    frame += 1;
    if (frame < maxFrames) {
      requestAnimationFrame(draw);
    } else {
      ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    }
  }
  draw();
}

window.addEventListener('resize', () => {
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
});

// =========================================================
// ONLINE / OFFLINE DETECTION
// =========================================================
window.addEventListener('offline', () => showToast('No Internet Connection', 'error'));

// =========================================================
// INIT
// =========================================================
renderHistory();
