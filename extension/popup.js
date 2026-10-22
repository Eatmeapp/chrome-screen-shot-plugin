// popup.js — 外掛面板：設定 + 開始/停止
const DEFAULTS = {
  interval: 10,
  mode: 'video-main',
  format: 'png',
  quality: 92,
  folder: 'Meet-Screenshots',
  autoStart: false,
  skipDuplicates: false,
};
const MEET_RE = /^https:\/\/meet\.google\.com\//;
const MODE_HINTS = {
  'video-main': '擷取畫面上最大的視訊（發言者或螢幕分享），以影片原始解析度存檔；分頁在背景也能拍。',
  'video-all': '每個可見的視訊各存一張（檔名加 _v1、_v2…），原始解析度；分頁在背景也能拍。',
  tab: '擷取整個 Meet 分頁（含介面）。會議分頁必須保持在前景顯示。',
};

const $ = (id) => document.getElementById(id);
let settings = { ...DEFAULTS };
let tab = null;
let status = null;
let clockSkew = 0;
let saveTimer = null;

init();

async function init() {
  const { settings: saved } = await chrome.storage.local.get('settings');
  settings = { ...DEFAULTS, ...(saved || {}) };
  fillForm();
  bindForm();

  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !MEET_RE.test(tab.url)) {
    $('notMeet').hidden = false;
    setPill('非 Meet 分頁', '');
    return;
  }

  try {
    status = await ensureContentScript();
  } catch (e) {
    showMessage('無法連線到 Meet 分頁，請重新整理該分頁後再試。', 'error');
    return;
  }
  $('toggleBtn').disabled = false;
  $('snapBtn').disabled = false;
  render();
  setInterval(refresh, 500);
}

// 外掛安裝前就開著的 Meet 分頁不會有 content.js → 這裡補注入
async function ensureContentScript() {
  try {
    return await chrome.tabs.sendMessage(tab.id, { type: 'getStatus' });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    return await chrome.tabs.sendMessage(tab.id, { type: 'getStatus' });
  }
}

async function refresh() {
  try {
    status = await chrome.tabs.sendMessage(tab.id, { type: 'getStatus' });
    render();
  } catch { /* 分頁已關閉 */ }
}

function render() {
  if (!status?.ok) return;
  const s = status.state;
  clockSkew = Date.now() - status.now;

  $('meetingCode').textContent = status.meetingCode !== 'meet'
    ? `會議代碼 ${status.meetingCode}${s.inCall ? ' · 會議中' : ''}`
    : 'Google Meet';

  if (s.running) setPill(s.startedBy === 'auto' ? '自動擷取中' : '擷取中', 'rec');
  else if (settings.autoStart && !s.inCall) setPill('等待進入會議', 'wait');
  else setPill('待命中', '');

  $('statCount').textContent = s.count + (s.skipped ? ` (+${s.skipped}略)` : '');
  $('statCount').title = s.skipped ? `已略過 ${s.skipped} 張重複畫面` : '';
  $('statLast').textContent = s.lastAt ? new Date(s.lastAt).toLocaleTimeString('zh-TW', { hour12: false }) : '—';
  if (s.running && s.nextAt) {
    const left = Math.max(0, Math.ceil((s.nextAt + clockSkew - Date.now()) / 1000));
    $('statNext').textContent = `${left} 秒`;
  } else {
    $('statNext').textContent = '—';
  }

  const btn = $('toggleBtn');
  btn.textContent = s.running ? '停止擷取' : '開始擷取';
  btn.classList.toggle('stop', s.running);

  if (s.lastError) showMessage(s.lastError, 'error');
  else if ($('message').dataset.kind === 'error' && $('message').dataset.sticky !== '1') hideMessage();
}

function setPill(text, cls) {
  const pill = $('statusPill');
  pill.textContent = text;
  pill.className = `pill ${cls}`;
}

function showMessage(text, kind = 'ok', sticky = false) {
  const el = $('message');
  el.textContent = text;
  el.className = `msg ${kind}`;
  el.dataset.kind = kind;
  el.dataset.sticky = sticky ? '1' : '';
  el.hidden = false;
}
function hideMessage() { $('message').hidden = true; $('message').dataset.kind = ''; }

// ---------- 表單 ----------
function fillForm() {
  $('interval').value = settings.interval;
  document.querySelector(`input[name="mode"][value="${settings.mode}"]`).checked = true;
  $('format').value = settings.format;
  $('quality').value = settings.quality;
  $('qualityVal').textContent = settings.quality;
  $('qualityRow').hidden = settings.format !== 'jpeg';
  $('folder').value = settings.folder;
  $('autoStart').checked = settings.autoStart;
  $('skipDuplicates').checked = settings.skipDuplicates;
  $('modeHint').textContent = MODE_HINTS[settings.mode];
  markChips();
}

function markChips() {
  document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', Number(c.dataset.v) === settings.interval));
}

function bindForm() {
  $('interval').addEventListener('input', () => {
    const v = Math.round(Number($('interval').value));
    if (v >= 1 && v <= 3600) { settings.interval = v; markChips(); save(); }
  });
  $('interval').addEventListener('blur', () => { $('interval').value = settings.interval; });
  $('chips').addEventListener('click', (e) => {
    const v = e.target?.dataset?.v;
    if (!v) return;
    settings.interval = Number(v);
    $('interval').value = v;
    markChips();
    save();
  });

  document.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener('change', () => {
    settings.mode = r.value;
    $('modeHint').textContent = MODE_HINTS[settings.mode];
    save();
    maybeRequestTabPermission();
  }));

  $('autoStart').addEventListener('change', () => {
    settings.autoStart = $('autoStart').checked;
    save();
    maybeRequestTabPermission();
  });

  $('format').addEventListener('change', () => {
    settings.format = $('format').value;
    $('qualityRow').hidden = settings.format !== 'jpeg';
    save();
  });
  $('quality').addEventListener('input', () => {
    settings.quality = Number($('quality').value);
    $('qualityVal').textContent = settings.quality;
    save();
  });
  $('folder').addEventListener('input', () => {
    settings.folder = $('folder').value.trim() || DEFAULTS.folder;
    save();
  });
  $('skipDuplicates').addEventListener('change', () => {
    settings.skipDuplicates = $('skipDuplicates').checked;
    save();
  });

  $('toggleBtn').addEventListener('click', async () => {
    await flushSave();
    const running = status?.state?.running;
    try {
      status = { ...status, ...(await chrome.tabs.sendMessage(tab.id, { type: running ? 'stop' : 'start' })) };
      hideMessage();
      refresh();
    } catch {
      showMessage('無法控制 Meet 分頁，請重新整理該分頁。', 'error', true);
    }
  });

  $('snapBtn').addEventListener('click', async () => {
    await flushSave();
    $('snapBtn').disabled = true;
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { type: 'snapNow' });
      if (res?.ok) showMessage(res.saved ? `已儲存 ${res.saved} 張截圖` : '畫面與上一張相同，已略過', 'ok', true);
      else showMessage(res?.error || '擷取失敗', 'error', true);
    } finally {
      $('snapBtn').disabled = false;
    }
  });
}

// 「整個分頁」+「自動開始」：自動開始時沒有點外掛圖示，activeTab 不會生效，
// 所以向使用者申請可選的網站權限，讓 captureVisibleTab 可以在背景觸發。
async function maybeRequestTabPermission() {
  if (!(settings.autoStart && settings.mode === 'tab')) return;
  let granted = false;
  try {
    granted = await chrome.permissions.request({ origins: ['<all_urls>'] });
  } catch { /* ignore */ }
  if (!granted) {
    showMessage('未授權：自動開始時「整個分頁」模式可能失敗，需要時點一下外掛圖示即可。建議改用視訊模式。', 'warn', true);
  }
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 250);
}
async function flushSave() {
  clearTimeout(saveTimer);
  await chrome.storage.local.set({ settings });
}
