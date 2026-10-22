// background.js — Service Worker (Manifest V3)
// 負責：1) 分頁畫面截圖 (chrome.tabs.captureVisibleTab)
//      2) 把圖片存檔 (chrome.downloads)
//      3) 工具列徽章 (REC / !)
// 計時器放在 content.js（會議分頁裡），因為 MV3 的 Service Worker 會休眠，
// chrome.alarms 最短間隔又是 30 秒，無法支援「每 X 秒」的需求。

const lastSignature = new Map(); // tabId -> 縮圖簽章（略過重複畫面用）

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = handlers[msg && msg.type];
  if (!handler) return false;
  Promise.resolve()
    .then(() => handler(msg, sender))
    .then(sendResponse, (err) => sendResponse({ ok: false, error: err?.message || String(err) }));
  return true; // 非同步回應
});

const handlers = {
  // content.js 已經擷取好影像（視訊模式），這裡只負責下載
  async download(msg) {
    const id = await saveFile(msg.dataUrl, msg.filename);
    return { ok: true, id };
  },

  // 分頁畫面模式：擷取整個 Meet 分頁的可見畫面
  async captureTab(msg, sender) {
    const tabId = sender.tab?.id;
    if (tabId == null) throw new Error('找不到來源分頁');

    const tab = await chrome.tabs.get(tabId);
    if (!tab.active) {
      throw new Error('Meet 分頁不在前景：「分頁畫面」模式需要讓會議分頁保持顯示（或改用視訊模式）');
    }
    const win = await chrome.windows.get(tab.windowId);
    if (win.state === 'minimized') {
      throw new Error('視窗已最小化，無法擷取分頁畫面（或改用視訊模式）');
    }

    const isJpeg = msg.format === 'jpeg';
    const options = isJpeg ? { format: 'jpeg', quality: clamp(msg.quality, 50, 100) } : { format: 'png' };

    let dataUrl;
    try {
      dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, options);
    } catch (err) {
      const text = String(err?.message || err);
      if (/activeTab|all_urls|permission/i.test(text)) {
        throw new Error('需要授權：請點一下工具列上的外掛圖示（打開面板即完成授權）');
      }
      throw err;
    }

    if (msg.skipDuplicates) {
      const sig = await signatureFromDataUrl(dataUrl);
      if (isSimilar(lastSignature.get(tabId), sig)) return { ok: true, saved: 0, duplicate: true };
      lastSignature.set(tabId, sig);
    }

    await saveFile(dataUrl, `${msg.filenameBase}.${isJpeg ? 'jpg' : 'png'}`);
    return { ok: true, saved: 1 };
  },

  async badge(msg, sender) {
    const tabId = sender.tab?.id;
    if (tabId == null) return { ok: false };
    await chrome.action.setBadgeBackgroundColor({ tabId, color: msg.color || '#d93025' });
    await chrome.action.setBadgeText({ tabId, text: msg.text || '' });
    return { ok: true };
  },
};

chrome.tabs.onRemoved.addListener((tabId) => lastSignature.delete(tabId));

async function saveFile(url, filename) {
  return chrome.downloads.download({
    url,
    filename,
    conflictAction: 'uniquify',
    saveAs: false,
  });
}

// ---- 重複畫面偵測：縮成 32x18 灰階後比較平均差異 ----
async function signatureFromDataUrl(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(32, 18);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, 32, 18);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, 32, 18);
  const out = new Uint8Array(32 * 18);
  for (let i = 0; i < out.length; i++) {
    out[i] = (data[i * 4] * 299 + data[i * 4 + 1] * 587 + data[i * 4 + 2] * 114) / 1000;
  }
  return out;
}

function isSimilar(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]);
  return diff / a.length < 2.5;
}

function clamp(n, min, max) {
  n = Number(n);
  if (!Number.isFinite(n)) return max;
  return Math.min(max, Math.max(min, Math.round(n)));
}
