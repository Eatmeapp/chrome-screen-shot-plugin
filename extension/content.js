// content.js — 注入在 https://meet.google.com/* 分頁中
// 負責：計時器、偵測是否已進入會議、擷取視訊畫面（原始解析度）
(() => {
  if (window.__meetAutoShotLoaded) return; // 避免重複注入
  window.__meetAutoShotLoaded = true;

  const DEFAULTS = {
    interval: 10,          // 秒
    mode: 'video-main',    // video-main | video-all | tab
    format: 'png',         // png | jpeg
    quality: 92,           // JPEG 品質 50–100
    folder: 'Meet-Screenshots',
    autoStart: false,      // 進入會議自動開始
    skipDuplicates: false, // 畫面沒變就不存
  };

  let settings = { ...DEFAULTS };
  const state = {
    running: false,
    startedBy: null, // 'manual' | 'auto'
    count: 0,
    skipped: 0,
    startedAt: 0,
    lastAt: 0,
    nextAt: 0,
    lastError: '',
    inCall: false,
  };

  let timer = null;
  let watcher = null;
  let busy = false;
  let userStopped = false;   // 使用者在這場會議手動停止 → 不再自動開始
  let sawCall = false;       // 擷取期間曾經在會議中
  let notInCallStreak = 0;
  const lastSig = new Map(); // 重複畫面偵測

  // ---------- 工具 ----------
  const alive = () => {
    try { return !!chrome.runtime?.id; } catch { return false; }
  };

  function send(msg) {
    return new Promise((resolve) => {
      if (!alive()) { teardown(); resolve({ ok: false, error: '外掛已重新載入，請重新整理此頁' }); return; }
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          const err = chrome.runtime.lastError;
          resolve(err ? { ok: false, error: err.message } : (res || { ok: false, error: '沒有回應' }));
        });
      } catch (e) {
        teardown();
        resolve({ ok: false, error: String(e?.message || e) });
      }
    });
  }

  async function loadSettings() {
    try {
      const { settings: saved } = await chrome.storage.local.get('settings');
      settings = { ...DEFAULTS, ...(saved || {}) };
    } catch { /* 外掛被移除或重新載入 */ }
    settings.interval = Math.min(3600, Math.max(1, Math.round(Number(settings.interval) || DEFAULTS.interval)));
  }

  const pad = (n) => String(n).padStart(2, '0');
  function timestamp(d = new Date()) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  }

  function meetingCode() {
    const m = location.pathname.match(/^\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i);
    return m ? m[1].toLowerCase() : 'meet';
  }

  function safeFolder(name) {
    const cleaned = String(name || '')
      .split(/[\\/]+/)
      .map((p) => p.replace(/[<>:"|?*\u0000-\u001f]/g, '').replace(/^\.+/, '').trim())
      .filter(Boolean)
      .join('/');
    return cleaned || DEFAULTS.folder;
  }

  // ---------- 是否已進入會議（而不是在等候室 / 首頁） ----------
  function isInCall() {
    if (!/^\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i.test(location.pathname)) return false;
    // 「離開通話」按鈕（多語系）
    const leave = document.querySelector(
      'button[aria-label*="Leave call" i],button[aria-label*="離開通話"],button[aria-label*="退出通话"],' +
      'button[aria-label*="通話から退出"],button[aria-label*="통화에서 나가기"],[jsname="CQylAd"]'
    );
    if (leave) return true;
    // 退而求其次：Material icon 文字 call_end（與語系無關）
    for (const el of document.querySelectorAll('i')) {
      if (el.textContent.trim() === 'call_end') return true;
    }
    return false;
  }

  // ---------- 擷取 ----------
  function isVisible(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05;
  }

  function candidateVideos() {
    return [...document.querySelectorAll('video')]
      .filter((v) => v.readyState >= 2 && v.videoWidth >= 160 && v.videoHeight >= 90 && isVisible(v))
      .map((v) => {
        const r = v.getBoundingClientRect();
        return { v, area: r.width * r.height };
      })
      .sort((a, b) => b.area - a.area)
      .map((x) => x.v);
  }

  function grabFrame(video) {
    // 用影片「原始解析度」繪製，不受畫面上的縮放影響 → 最高畫質
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    let sig = null;
    if (settings.skipDuplicates) {
      const small = document.createElement('canvas');
      small.width = 32; small.height = 18;
      const sctx = small.getContext('2d', { willReadFrequently: true });
      sctx.drawImage(canvas, 0, 0, 32, 18);
      const { data } = sctx.getImageData(0, 0, 32, 18);
      sig = new Uint8Array(32 * 18);
      for (let i = 0; i < sig.length; i++) {
        sig[i] = (data[i * 4] * 299 + data[i * 4 + 1] * 587 + data[i * 4 + 2] * 114) / 1000;
      }
    }

    const isJpeg = settings.format === 'jpeg';
    const dataUrl = isJpeg
      ? canvas.toDataURL('image/jpeg', Math.min(100, Math.max(50, settings.quality)) / 100)
      : canvas.toDataURL('image/png');
    return { dataUrl, sig, width: canvas.width, height: canvas.height };
  }

  function isSimilar(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]);
    return diff / a.length < 2.5;
  }

  async function captureTab(base) {
    const res = await send({
      type: 'captureTab',
      filenameBase: base,
      format: settings.format,
      quality: settings.quality,
      skipDuplicates: settings.skipDuplicates,
    });
    if (!res.ok) throw new Error(res.error);
    if (res.duplicate) state.skipped++;
    return res.saved || 0;
  }

  async function captureOnce() {
    const code = meetingCode();
    const base = `${safeFolder(settings.folder)}/${code}/${code}_${timestamp()}`;

    if (settings.mode === 'tab') return captureTab(base);

    const videos = candidateVideos();
    if (videos.length === 0) {
      // 沒有可用的視訊（大家都關鏡頭）→ 改用分頁畫面
      return captureTab(base);
    }

    const targets = settings.mode === 'video-all' ? videos : [videos[0]];
    const ext = settings.format === 'jpeg' ? 'jpg' : 'png';
    let saved = 0;

    for (let i = 0; i < targets.length; i++) {
      const shot = grabFrame(targets[i]);
      const key = `${settings.mode}:${i}`;
      if (settings.skipDuplicates) {
        if (isSimilar(lastSig.get(key), shot.sig)) { state.skipped++; continue; }
        lastSig.set(key, shot.sig);
      }
      const suffix = targets.length > 1 ? `_v${i + 1}` : '';
      const res = await send({ type: 'download', dataUrl: shot.dataUrl, filename: `${base}${suffix}.${ext}` });
      if (!res.ok) throw new Error(res.error);
      saved++;
    }
    return saved;
  }

  async function tick() {
    if (busy || !state.running) return;
    busy = true;
    try {
      const n = await captureOnce();
      state.count += n;
      if (n > 0) state.lastAt = Date.now();
      if (state.lastError) { state.lastError = ''; setBadge(); }
    } catch (e) {
      state.lastError = String(e?.message || e);
      setBadge();
    } finally {
      busy = false;
      if (state.running) state.nextAt = Date.now() + settings.interval * 1000;
    }
  }

  function schedule() {
    clearInterval(timer);
    const ms = settings.interval * 1000;
    timer = setInterval(tick, ms);
    state.nextAt = Date.now() + ms;
  }

  function setBadge() {
    if (!state.running) return send({ type: 'badge', text: '' });
    if (state.lastError) return send({ type: 'badge', text: '!', color: '#f29900' });
    return send({ type: 'badge', text: 'REC', color: '#d93025' });
  }

  async function start(by) {
    await loadSettings();
    if (state.running) { schedule(); return; }
    Object.assign(state, {
      running: true, startedBy: by, count: 0, skipped: 0,
      startedAt: Date.now(), lastAt: 0, lastError: '',
    });
    sawCall = isInCall();
    lastSig.clear();
    setBadge();
    tick();       // 立刻先拍一張
    schedule();
  }

  function stop() {
    clearInterval(timer);
    timer = null;
    state.running = false;
    state.startedBy = null;
    state.nextAt = 0;
    setBadge();
  }

  function teardown() {
    clearInterval(timer);
    clearInterval(watcher);
    timer = watcher = null;
    state.running = false;
  }

  // ---------- 會議狀態監看（自動開始 / 離開會議自動停止） ----------
  function watch() {
    if (!alive()) { teardown(); return; }
    state.inCall = isInCall();

    if (state.inCall) {
      notInCallStreak = 0;
      if (state.running) sawCall = true;
      if (settings.autoStart && !state.running && !userStopped) start('auto');
    } else {
      notInCallStreak++;
      if (notInCallStreak >= 2) {
        userStopped = false; // 下一場會議可以再自動開始
        if (state.running && (sawCall || state.startedBy === 'auto')) stop();
      }
    }
  }

  // ---------- 與 popup 溝通 ----------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg?.type) {
      case 'getStatus':
        state.inCall = isInCall();
        sendResponse({ ok: true, state: { ...state }, meetingCode: meetingCode(), now: Date.now() });
        return false;
      case 'start':
        userStopped = false;
        start('manual').then(() => sendResponse({ ok: true, state: { ...state } }));
        return true;
      case 'stop':
        userStopped = true;
        stop();
        sendResponse({ ok: true, state: { ...state } });
        return false;
      case 'snapNow':
        (async () => {
          await loadSettings();
          try {
            const n = await captureOnce();
            if (state.running) state.count += n;
            if (n > 0) state.lastAt = Date.now();
            sendResponse({ ok: true, saved: n });
          } catch (e) {
            sendResponse({ ok: false, error: String(e?.message || e) });
          }
        })();
        return true;
      default:
        return false;
    }
  });

  // 設定變更即時生效（例如擷取中修改秒數）
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    const prevInterval = settings.interval;
    loadSettings().then(() => {
      if (state.running && settings.interval !== prevInterval) schedule();
    });
  });

  loadSettings().then(() => {
    watch();
    watcher = setInterval(watch, 2000);
  });
})();
