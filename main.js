const { app, BrowserWindow, Menu, shell, session, ipcMain, net, Tray, dialog, nativeImage, screen, powerMonitor, WebContentsView, Notification: SysNotification } = require('electron');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const WA_URL = 'https://web.whatsapp.com/';
const START_URL = process.env.PDFROKET_TEST_URL || WA_URL;
const PARTITION = 'persist:whatsapp';
const ALLOWED_PERMS = ['notifications', 'clipboard-sanitized-write', 'media', 'fullscreen', 'clipboard-read'];

app.setAppUserModelId('local.pdfroket.desktop');

// ---------------- GitHub'dan otomatik guncelleme (content.js) ----------------
const UPDATE_BASE = process.env.PDFROKET_UPDATE_BASE || 'https://raw.githubusercontent.com/kendineselam/wp/main/';
const upDir = () => path.join(app.getPath('userData'), 'update');
const readNum = (p) => { try { const n = parseInt(fs.readFileSync(p, 'utf8').trim(), 10); return Number.isFinite(n) ? n : 0; } catch (e) { return 0; } };

// Hangi content.js kullanilacak: guncellenmis kopya zip'tekinden yeniyse o, degilse zip'taki
function currentSource() {
  const bundledVer = readNum(path.join(__dirname, 'version.txt'));
  let cachedVer = 0, cachedCode = null;
  try {
    cachedVer = readNum(path.join(upDir(), 'version.txt'));
    const c = fs.readFileSync(path.join(upDir(), 'content.js'), 'utf8');
    if (c.length > 1000) cachedCode = c; else cachedVer = 0;
  } catch (e) { cachedVer = 0; }
  if (cachedCode && cachedVer > bundledVer) return { version: cachedVer, code: cachedCode };
  return { version: bundledVer, code: fs.readFileSync(path.join(__dirname, 'content.js'), 'utf8') };
}

ipcMain.on('pr:code', (e) => { try { e.returnValue = currentSource().code; } catch (err) { e.returnValue = ''; } });
// Guncel kopya hata verirse sil, bir sonraki acilista zip'teki calisan surum kullanilir
ipcMain.on('pr:bad', () => { try { fs.rmSync(upDir(), { recursive: true, force: true }); } catch (e) {} });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------- Logo secimi (PDF Roket / WhatsApp / Karma / Ozel dosya) ----------------
try { app.setAppUserModelId('com.pdfroket.whatsapp'); } catch (e) {}
const LOGOS = {
  roket:    { label: 'PDF Roket logosu',      png: 'icons/roket.png',    ico: 'icons/roket.ico' },
  whatsapp: { label: 'WhatsApp logosu',       png: 'icons/whatsapp.png', ico: 'icons/whatsapp.ico' },
  karma:    { label: 'WhatsApp + Roket logosu', png: 'icons/karma.png',  ico: 'icons/karma.ico' }
};
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
function readSettings() { try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) || {}; } catch (e) { return {}; } }
function writeSettings(o) { try { fs.mkdirSync(app.getPath('userData'), { recursive: true }); fs.writeFileSync(settingsPath(), JSON.stringify(o), 'utf8'); } catch (e) {} }

// Secili logonun dosya yolu (png/ico). Sorun varsa varsayilan: roket
function logoFile() {
  const st = readSettings();
  if (st.logo === 'custom' && st.customFile) {
    const f = path.join(app.getPath('userData'), st.customFile);
    if (fs.existsSync(f) && !nativeImage.createFromPath(f).isEmpty()) return f;
  }
  const l = LOGOS[st.logo] || LOGOS.roket;
  return path.join(__dirname, l.png);
}
const logoImage = () => nativeImage.createFromPath(logoFile());

// Secili logonun .ico yolu (kisayol + gorev cubugu icin). Yoksa undefined.
function logoIco() {
  try {
    const st = readSettings();
    if (st.logo === 'custom') {
      const f = path.join(app.getPath('userData'), 'custom-logo.ico');
      return fs.existsSync(f) ? f : undefined;
    }
    return path.join(__dirname, (LOGOS[st.logo] || LOGOS.roket).ico);
  } catch (e) { return undefined; }
}
// Herhangi bir resmi 256x256 PNG iceren .ico dosyasina cevirir
function writeIcoFromImage(img, dest) {
  const png = img.resize({ width: 256, height: 256 }).toPNG();
  const head = Buffer.alloc(22);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
  head[6] = 0; head[7] = 0; head[8] = 0; head[9] = 0;
  head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12);
  head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18);
  fs.writeFileSync(dest, Buffer.concat([head, png]));
}

// Kisayollarin ikonunu guncelle: masaustu + gorev cubuguna sabitlenmis kisayol(lar)
function updateShortcutIcon() {
  if (process.platform !== 'win32') return;
  const ico = logoIco();
  if (!ico) return;
  const exeDir = path.dirname(process.execPath).toLowerCase();
  const args = '"' + app.getAppPath() + '"';
  let changed = false;
  const upd = (lnk, fixArgs) => {
    try {
      if (!fs.existsSync(lnk)) return;
      const o = { icon: ico, iconIndex: 0 };
      if (fixArgs) { o.args = args; o.cwd = app.getAppPath(); }
      shell.writeShortcutLink(lnk, 'update', o);
      changed = true;
    } catch (e) {}
  };
  upd(path.join(app.getPath('desktop'), 'PDF Roket WhatsApp.lnk'), false);
  try {
    const pinDir = path.join(app.getPath('appData'), 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar');
    for (const f of fs.readdirSync(pinDir)) {
      if (!/\.lnk$/i.test(f)) continue;
      const lnk = path.join(pinDir, f);
      try {
        const t = shell.readShortcutLink(lnk).target || '';
        if (path.dirname(t).toLowerCase() === exeDir && /^(electron|pdf roket whatsapp)\.exe$/i.test(path.basename(t))) upd(lnk, true);
      } catch (e) {}
    }
  } catch (e) {}
  if (changed) {
    try { require('child_process').spawn('ie4uinit.exe', ['-show'], { detached: true, stdio: 'ignore', windowsHide: true }).on('error', () => {}).unref(); } catch (e) {}
  }
}
// Pencerenin gorev cubugu bilgisi: sabitlenince dogru ikon + dogru komutla acilsin
function applyAppDetails() {
  if (process.platform !== 'win32' || !mainWin || mainWin.isDestroyed()) return;
  try {
    const d = {
      appId: 'com.pdfroket.whatsapp',
      relaunchCommand: '"' + process.execPath + '" "' + app.getAppPath() + '"',
      relaunchDisplayName: 'PDF Roket WhatsApp'
    };
    const ico = logoIco();
    if (ico) { d.appIconPath = ico; d.appIconIndex = 0; }
    mainWin.setAppDetails(d);
  } catch (e) {}
}

let tray = null, mainWin = null;
function applyLogo() {
  const img = logoImage();
  if (img.isEmpty()) return;
  if (mainWin && !mainWin.isDestroyed()) mainWin.setIcon(img);
  applyAppDetails();
  if (tray && !tray.isDestroyed()) tray.setImage(img.resize({ width: 32, height: 32 }));
  updateShortcutIcon();
}
function setLogo(key) {
  const st = readSettings(); st.logo = key; writeSettings(st);
  applyLogo(); refreshMenus();
}
async function pickCustomLogo() {
  const r = await dialog.showOpenDialog(mainWin && !mainWin.isDestroyed() ? mainWin : undefined, {
    title: 'Uygulama logosu sec', properties: ['openFile'],
    filters: [{ name: 'Resim (PNG, ICO, JPG)', extensions: ['png', 'ico', 'jpg', 'jpeg'] }]
  });
  if (r.canceled || !r.filePaths[0]) return;
  const src = r.filePaths[0];
  if (nativeImage.createFromPath(src).isEmpty()) { dialog.showErrorBox('Logo', 'Bu dosya resim olarak okunamadi.'); return; }
  try {
    const name = 'custom-logo' + path.extname(src).toLowerCase();
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.copyFileSync(src, path.join(app.getPath('userData'), name));
    try { writeIcoFromImage(nativeImage.createFromPath(src), path.join(app.getPath('userData'), 'custom-logo.ico')); } catch (e) {}
    const st = readSettings(); st.logo = 'custom'; st.customFile = name; writeSettings(st);
    applyLogo(); refreshMenus();
  } catch (e) { dialog.showErrorBox('Logo', 'Logo kaydedilemedi: ' + e.message); }
}
function logoMenuItems() {
  const cur = readSettings().logo || 'roket';
  const items = Object.keys(LOGOS).map((k) => ({ label: LOGOS[k].label, type: 'radio', checked: cur === k, click: () => setLogo(k) }));
  items.push({ label: 'Özel logo seç...', type: 'radio', checked: cur === 'custom', click: () => pickCustomLogo() });
  return items;
}
// ---------------- Yakinlastirma (Ctrl + / Ctrl - / Ctrl 0) ----------------
const ZOOM_STEP = 0.5, ZOOM_MIN = -3, ZOOM_MAX = 5;
function zoomBy(delta) {
  try {
    if (!mainWin || mainWin.isDestroyed()) return;
    const wc = mainWin.webContents;
    wc.setZoomLevel(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round((wc.getZoomLevel() + delta) * 10) / 10)));
  } catch (e) {}
}
function zoomReset() { try { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.setZoomLevel(0); } catch (e) {} }

function buildAppMenu() {
  try {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'Logo', submenu: logoMenuItems() },
      { label: 'Bildirimler', submenu: notifMenuItems() },
      { label: 'Kilit', submenu: lockMenuItems() },
      { label: 'Düzenle', submenu: [
        { role: 'undo', label: 'Geri al' }, { role: 'redo', label: 'Yinele' }, { type: 'separator' },
        { role: 'cut', label: 'Kes' }, { role: 'copy', label: 'Kopyala' }, { role: 'paste', label: 'Yapıştır' }, { role: 'selectAll', label: 'Tümünü seç' }
      ] },
      { label: 'Görünüm', submenu: [
        { role: 'reload', label: 'Yenile' }, { type: 'separator' },
        { label: 'Yakınlaştır', accelerator: 'CommandOrControl+Plus', registerAccelerator: false, click: () => zoomBy(ZOOM_STEP) },
        { label: 'Uzaklaştır', accelerator: 'CommandOrControl+-', registerAccelerator: false, click: () => zoomBy(-ZOOM_STEP) },
        { label: 'Yakınlaştırmayı sıfırla', accelerator: 'CommandOrControl+0', registerAccelerator: false, click: () => zoomReset() },
        { type: 'separator' }, { role: 'togglefullscreen', label: 'Tam ekran' }
      ] },
      { label: 'Güncelleme', submenu: [
        { label: 'Güncellemeleri denetle', click: () => manualUpdateCheck() },
        { label: 'Ana uygulama sürümü: ' + appVersion(), enabled: false },
        { label: 'Özellikler sürümü: ' + currentSource().version, enabled: false }
      ] },
      { label: 'Çık', click: () => app.quit() }
    ]));
  } catch (e) { console.error('[PDF-ROKET] menu olusturulamadi:', e.message); }
}

// ---------------- Bildirimler ----------------
// mode 'custom': uygulamanin kendi bildirim penceresi (konum secilebilir)
// mode 'system': Windows'un kendi bildirimi (konumu Windows belirler)
const NOTIF_DEFAULTS = { enabled: true, mode: 'custom', position: 'bottom-right', duration: 6, preview: true, clickMode: 'single' };
const POSITIONS = { 'bottom-right': 'Sağ alt', 'top-right': 'Sağ üst', 'bottom-left': 'Sol alt', 'top-left': 'Sol üst', 'center': 'Ekranın ortası' };
const DURATIONS = [3, 6, 10, 20, 0];
const notifSettings = () => Object.assign({}, NOTIF_DEFAULTS, readSettings().notif || {});
function setNotif(patch) {
  const st = readSettings(); st.notif = Object.assign({}, notifSettings(), patch); writeSettings(st);
  refreshMenus();
}
const TOAST_W = 380, TOAST_H = 104, TOAST_GAP = 4, TOAST_MARGIN = 6, MAX_TOASTS = 4;
let toasts = [], toastSeq = 0;
const sysNotifs = new Set();

function showMain() {
  if (mainWin && !mainWin.isDestroyed()) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.show(); mainWin.focus(); }
}
function sendToPage(id, type) {
  try { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('pr:notif-event', id, type); } catch (e) {}
}
function toastDisplay() {
  try { if (mainWin && !mainWin.isDestroyed()) return screen.getDisplayMatching(mainWin.getBounds()); } catch (e) {}
  return screen.getPrimaryDisplay();
}
function layoutToasts() {
  const pos = notifSettings().position;
  const wa = toastDisplay().workArea;
  const n = toasts.length, step = TOAST_H + TOAST_GAP;
  const x = /right/.test(pos) ? wa.x + wa.width - TOAST_W - TOAST_MARGIN
          : /left/.test(pos) ? wa.x + TOAST_MARGIN
          : wa.x + Math.round((wa.width - TOAST_W) / 2);
  toasts.forEach((t, i) => {
    const k = n - 1 - i;                       // 0 = en yeni
    let y;
    if (pos === 'center') y = wa.y + Math.round((wa.height - (n * step - TOAST_GAP)) / 2) + i * step;
    else if (/^top/.test(pos)) y = wa.y + TOAST_MARGIN + k * step;
    else y = wa.y + wa.height - TOAST_H - TOAST_MARGIN - k * step;
    try { t.win.setBounds({ x: Math.round(x), y: Math.round(y), width: TOAST_W, height: TOAST_H }); } catch (e) {}
  });
}
function toastDuration() {
  const d = Number(notifSettings().duration);
  return Number.isFinite(d) ? d : 6;
}
function startToastTimer(t) {
  clearTimeout(t.timer);
  const d = toastDuration();
  if (d > 0) t.timer = setTimeout(() => closeToast(t.id, 'timeout'), d * 1000);
}
function closeToast(id, reason) {
  const i = toasts.findIndex((t) => t.id === id);
  if (i < 0) return;
  const t = toasts.splice(i, 1)[0];
  clearTimeout(t.timer);
  clearTimeout(t.hard);
  try { t.win.webContents.send('toast:out'); } catch (e) {}
  setTimeout(() => { try { t.win.destroy(); } catch (e) {} }, 240);
  layoutToasts();
  if (reason === 'click') showMain();
  sendToPage(t.pid, reason === 'click' ? 'click' : 'close');
}
function showToast(d) {
  if (d.tag) { const old = toasts.find((t) => t.tag === d.tag); if (old) closeToast(old.id, 'replaced'); }
  while (toasts.length >= MAX_TOASTS) closeToast(toasts[0].id, 'overflow');
  const id = ++toastSeq;
  const win = new BrowserWindow({
    width: TOAST_W, height: TOAST_H, frame: false, transparent: true, hasShadow: false,
    resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: true, focusable: false, show: false,
    webPreferences: { preload: path.join(__dirname, 'toast-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  try { win.setAlwaysOnTop(true, 'screen-saver'); } catch (e) {}
  const t = { id, pid: d.id, tag: d.tag || '', win, timer: null };
  toasts.push(t);
  layoutToasts();
  let fallback = '';
  try { fallback = logoImage().resize({ width: 96, height: 96 }).toDataURL(); } catch (e) {}
  win.webContents.once('did-finish-load', () => {
    try {
      win.webContents.send('toast:init', { title: d.title, body: d.body, icon: d.icon, fallback, pos: notifSettings().position, clickMode: notifSettings().clickMode });
      setTimeout(() => { if (!win.isDestroyed()) win.showInactive(); }, 40);
    } catch (e) {}
  });
  win.loadFile(path.join(__dirname, 'toast.html')).catch(() => {});
  startToastTimer(t);
  // Fare bildirimin ustunde unutulsa bile en gec (sure + 15 sn) sonra kapansin
  if (toastDuration() > 0) t.hard = setTimeout(() => closeToast(t.id, 'timeout'), (toastDuration() + 15) * 1000);
}
function handleNotify(d) {
  const s = notifSettings();
  if (!s.enabled) return;
  const title = locked ? 'WhatsApp' : String(d.title || 'WhatsApp').slice(0, 200);
  const body = (s.preview && !locked) ? String(d.body || '').slice(0, 500) : 'Yeni mesaj';
  const icon = (!locked && /^(data:image\/|https:\/\/)/.test(d.icon || '')) ? d.icon : '';
  if (s.mode === 'system' && SysNotification.isSupported()) {
    try {
      const n = new SysNotification({ title, body, icon: logoImage() });
      sysNotifs.add(n);
      n.on('click', () => { showMain(); sendToPage(d.id, 'click'); sysNotifs.delete(n); });
      n.on('close', () => { sendToPage(d.id, 'close'); sysNotifs.delete(n); });
      n.show();
      return;
    } catch (e) {}
  }
  showToast({ id: d.id, title, body, icon, tag: String(d.tag || '').slice(0, 200) });
}
function testNotif() {
  handleNotify({ id: -1, title: 'PDF Roket WhatsApp', body: 'Bildirimler böyle görünecek 👋', icon: '', tag: 'pr-test' });
}

ipcMain.on('pr:notify', (e, d) => { if (mainWin && e.sender === mainWin.webContents && d && typeof d === 'object') handleNotify(d); });
ipcMain.on('pr:notify-close', (e, id) => { const t = toasts.find((x) => x.pid === id); if (t) closeToast(t.id, 'api'); });
const toastOf = (e) => toasts.find((t) => { try { return t.win.webContents === e.sender; } catch (err) { return false; } });
ipcMain.on('toast:click', (e) => { const t = toastOf(e); if (t) closeToast(t.id, 'click'); });
ipcMain.on('toast:close', (e) => { const t = toastOf(e); if (t) closeToast(t.id, 'user'); });
ipcMain.on('toast:hover', (e, on) => { const t = toastOf(e); if (!t) return; if (on) clearTimeout(t.timer); else startToastTimer(t); });

function notifMenuItems() {
  const s = notifSettings();
  const custom = s.mode === 'custom';
  return [
    { label: 'Bildirimleri göster', type: 'checkbox', checked: s.enabled, click: (i) => setNotif({ enabled: i.checked }) },
    { label: 'Mesaj içeriğini göster', type: 'checkbox', checked: s.preview, click: (i) => setNotif({ preview: i.checked }) },
    { type: 'separator' },
    { label: 'Bildirim türü', submenu: [
      { label: 'Uygulamanın kendi bildirimi (konum seçilebilir)', type: 'radio', checked: custom, click: () => { setNotif({ mode: 'custom' }); testNotif(); } },
      { label: 'Windows bildirimi (konumu Windows belirler)', type: 'radio', checked: !custom, click: () => { setNotif({ mode: 'system' }); testNotif(); } }
    ] },
    { label: 'Konum', enabled: custom, submenu: Object.keys(POSITIONS).map((k) => ({
      label: POSITIONS[k], type: 'radio', checked: s.position === k, click: () => { setNotif({ position: k }); testNotif(); }
    })) },
    { label: 'Ekranda kalma süresi', enabled: custom, submenu: DURATIONS.map((d) => ({
      label: d ? d + ' saniye' : 'Ben kapatana kadar', type: 'radio', checked: s.duration === d, click: () => setNotif({ duration: d })
    })) },
    { label: 'Bildirime tıklayınca mesajı aç', enabled: custom, submenu: [
      { label: 'Tek tıklayınca', type: 'radio', checked: s.clickMode !== 'double', click: () => setNotif({ clickMode: 'single' }) },
      { label: 'Çift tıklayınca (yanlışlıkla açılmasın)', type: 'radio', checked: s.clickMode === 'double', click: () => setNotif({ clickMode: 'double' }) }
    ] },
    { type: 'separator' },
    { label: 'Deneme bildirimi gönder', click: () => testNotif() }
  ];
}

// Windows'un kendi bildirimleri icin Baslat Menusunde AppUserModelID'li kisayol gerekir
function ensureStartMenuShortcut() {
  if (process.platform !== 'win32') return;
  try {
    const dir = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
    const lnk = path.join(dir, 'PDF Roket WhatsApp.lnk');
    const o = { target: process.execPath, args: '"' + app.getAppPath() + '"', cwd: app.getAppPath(), description: 'PDF Roket WhatsApp', appUserModelId: 'com.pdfroket.whatsapp' };
    const ico = logoIco();
    if (ico) { o.icon = ico; o.iconIndex = 0; }
    shell.writeShortcutLink(lnk, fs.existsSync(lnk) ? 'replace' : 'create', o);
  } catch (e) {}
}


// ---------------- Uygulama kilidi ----------------
// Kilitliyken WhatsApp'in ustune tam ekran bir kilit ekrani (WebContentsView) biner; sifre dogru olunca kalkar.
const lockLib = require('./lock');
const throttle = new lockLib.Throttle();
const LOCK_AUTO = [0, 1, 5, 15, 30, 60];
let locked = false, lockView = null, lockModal = null;
const lockRec = () => readSettings().lock || {};
const lockEnabled = () => !!(lockRec().hash && lockRec().salt);
const lockSettings = () => Object.assign({ autoMin: 0, onScreenLock: true }, lockRec());
function setLock(patch) { const st = readSettings(); st.lock = Object.assign({}, st.lock || {}, patch); writeSettings(st); refreshMenus(); }
function dropLockPassword() { const st = readSettings(); if (st.lock) { delete st.lock.hash; delete st.lock.salt; } writeSettings(st); refreshMenus(); }
const lockPrefs = () => ({ preload: path.join(__dirname, 'lock-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false });

function sizeLockView() {
  try {
    if (!lockView || !mainWin || mainWin.isDestroyed()) return;
    const b = mainWin.contentView.getBounds();
    lockView.setBounds({ x: 0, y: 0, width: b.width, height: b.height });
  } catch (e) {}
}
function focusLock() { try { if (locked && lockView && !lockView.webContents.isDestroyed()) lockView.webContents.focus(); } catch (e) {} }
function closeAllToasts() { toasts.slice().forEach((t) => closeToast(t.id, 'locked')); }

function lockApp() {
  if (!lockEnabled() || locked || !mainWin || mainWin.isDestroyed()) return;
  locked = true;
  closeAllToasts();
  try { if (lockModal && !lockModal.isDestroyed()) lockModal.close(); } catch (e) {}
  lockView = new WebContentsView({ webPreferences: lockPrefs() });
  try { lockView.setBackgroundColor('#111b21'); } catch (e) {}
  mainWin.contentView.addChildView(lockView);
  sizeLockView();
  lockView.webContents.loadFile(path.join(__dirname, 'lockui.html'), { query: { mode: 'unlock' } }).catch(() => {});
  lockView.webContents.once('did-finish-load', () => { if (mainWin.isVisible()) focusLock(); });
  refreshMenus();
}
function unlockApp() {
  if (!locked) return;
  locked = false;
  try { mainWin.contentView.removeChildView(lockView); } catch (e) {}
  try { lockView.webContents.close(); } catch (e) {}
  lockView = null;
  throttle.ok();
  try { mainWin.webContents.focus(); } catch (e) {}
  refreshMenus();
}
function openLockModal(mode) {
  if (!mainWin || mainWin.isDestroyed() || locked) return;
  try { if (lockModal && !lockModal.isDestroyed()) lockModal.close(); } catch (e) {}
  lockModal = new BrowserWindow({
    parent: mainWin, modal: true, width: 400, height: mode === 'change' ? 470 : 400, useContentSize: true,
    resizable: false, minimizable: false, maximizable: false, autoHideMenuBar: true,
    title: 'Uygulama kilidi', backgroundColor: '#111b21', icon: logoImage(), webPreferences: lockPrefs()
  });
  lockModal.setMenu(null);
  lockModal.on('closed', () => { lockModal = null; });
  lockModal.loadFile(path.join(__dirname, 'lockui.html'), { query: { mode } }).catch(() => {});
}

const fromOverlay = (e) => { try { return !!lockView && e.sender === lockView.webContents; } catch (err) { return false; } };
const fromModal = (e) => { try { return !!lockModal && !lockModal.isDestroyed() && e.sender === lockModal.webContents; } catch (err) { return false; } };

ipcMain.handle('lock:unlock', (e, pw) => {
  if (!fromOverlay(e) || !locked) return { ok: false };
  const w = throttle.wait();
  if (w > 0) return { ok: false, wait: w };
  if (lockLib.verifyPassword(pw, lockRec())) { unlockApp(); return { ok: true }; }
  throttle.fail();
  return { ok: false, wait: throttle.wait() };
});
ipcMain.handle('lock:set', (e, d) => {
  if (!fromModal(e) || locked) return { ok: false, error: 'İşlem yapılamadı.' };
  d = d || {};
  if (lockEnabled()) {
    const w = throttle.wait();
    if (w > 0) return { ok: false, wait: w };
    if (!lockLib.verifyPassword(d.oldPw, lockRec())) { throttle.fail(); return { ok: false, error: 'Mevcut şifre yanlış.', wait: throttle.wait() }; }
  }
  if (String(d.newPw || '').length < lockLib.MIN_LEN) return { ok: false, error: 'Yeni şifre en az 4 karakter olmalı.' };
  setLock(lockLib.hashPassword(d.newPw));
  throttle.ok();
  return { ok: true };
});
ipcMain.handle('lock:remove', (e, pw) => {
  if (!fromModal(e) || locked) return { ok: false, error: 'İşlem yapılamadı.' };
  const w = throttle.wait();
  if (w > 0) return { ok: false, wait: w };
  if (!lockLib.verifyPassword(pw, lockRec())) { throttle.fail(); return { ok: false, error: 'Şifre yanlış.', wait: throttle.wait() }; }
  dropLockPassword();
  throttle.ok();
  return { ok: true };
});
ipcMain.on('lock:close', (e) => { if (fromModal(e)) { try { lockModal.close(); } catch (err) {} } });

// "Sifremi unuttum": WhatsApp oturumunu tamamen siler (QR'dan yeniden giris gerekir) ve kilidi kaldirir
ipcMain.handle('lock:reset', async (e) => {
  if (!fromOverlay(e) || !locked) return { ok: false };
  try {
    const ses = session.fromPartition(PARTITION);
    try { await mainWin.webContents.loadURL('about:blank'); } catch (err) {}
    await ses.clearStorageData();
    try { await ses.clearCache(); } catch (err) {}
    try { await ses.clearAuthCache(); } catch (err) {}
    dropLockPassword();
    unlockApp();
    mainWin.loadURL(START_URL).catch(() => {});
    dialog.showMessageBox(mainWin, {
      type: 'info', title: 'Şifre sıfırlandı', icon: logoImage(), noLink: true, buttons: ['Tamam'],
      message: 'Şifre sıfırlandı ve WhatsApp oturumu kapatıldı.',
      detail: 'Telefonunda WhatsApp → Bağlı cihazlar → Cihaz bağla ile ekrandaki QR kodu okut. İstersen yeni bir şifreyi Kilit menüsünden belirleyebilirsin.'
    }).catch(() => {});
    return { ok: true };
  } catch (err) {
    console.error('[PDF-ROKET] sifre sifirlama hatasi:', err && err.message);
    return { ok: false };
  }
});

// Otomatik kilit: bilgisayar X dakika bos kalirsa, ekran kilitlenirse ya da uykuya gecerse
function startLockTimers() {
  setInterval(() => {
    if (locked || !lockEnabled()) return;
    const m = lockSettings().autoMin;
    try { if (m > 0 && powerMonitor.getSystemIdleTime() >= m * 60) lockApp(); } catch (e) {}
  }, 15000);
  const onSys = () => { if (lockSettings().onScreenLock) lockApp(); };
  try { powerMonitor.on('lock-screen', onSys); powerMonitor.on('suspend', onSys); } catch (e) {}
}

function lockMenuItems() {
  const en = lockEnabled(), ls = lockSettings();
  return [
    { label: en ? 'Şifreyi değiştir...' : 'Şifre belirle...', enabled: !locked, click: () => openLockModal(en ? 'change' : 'set') },
    { label: 'Şifreyi kaldır...', enabled: en && !locked, click: () => openLockModal('remove') },
    { type: 'separator' },
    { label: 'Şimdi kilitle', accelerator: 'CmdOrCtrl+Shift+L', enabled: en && !locked, click: () => lockApp() },
    { label: 'Otomatik kilit (bilgisayar boşta kalınca)', enabled: en, submenu: LOCK_AUTO.map((m) => ({
      label: m ? m + ' dakika sonra' : 'Kapalı', type: 'radio', checked: ls.autoMin === m, click: () => setLock({ autoMin: m })
    })) },
    { label: 'Ekran kilitlenince / uykuya geçince kilitle', type: 'checkbox', checked: ls.onScreenLock, enabled: en, click: (i) => setLock({ onScreenLock: i.checked }) }
  ];
}

function refreshMenus() { buildTrayMenu(); buildAppMenu(); }
function buildTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  const items = logoMenuItems();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Uygulama logosu', enabled: false },
    ...items,
    { type: 'separator' },
    { label: 'Bildirimler', submenu: notifMenuItems() },
    { type: 'separator' },
    { label: 'Kilit', submenu: lockMenuItems() },
    { label: 'Güncellemeleri denetle', click: () => manualUpdateCheck() },
    { label: 'Pencereyi göster', click: () => { if (mainWin && !mainWin.isDestroyed()) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.show(); mainWin.focus(); } } },
    { label: 'Çık', click: () => app.quit() }
  ]));
}
function createTray() {
  try {
    const img = logoImage();
    if (img.isEmpty()) return;
    tray = new Tray(img.resize({ width: 32, height: 32 }));
    tray.setToolTip('PDF Roket WhatsApp  (sağ tık: logo değiştir)');
    tray.on('click', () => { if (mainWin && !mainWin.isDestroyed()) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.show(); mainWin.focus(); } });
    buildTrayMenu();
  } catch (e) { console.error('[PDF-ROKET] tray olusturulamadi:', e.message); }
}

// ---------------- Tek dosyali surum bilgisi: guncelleme.txt ----------------
// Icerik:  program=8   (wp.zip / app klasoru surumu)
//          script=6    (content.js gibi script dosyalarinin surumu)
//          content.js  (ALTTA: indirilecek script dosyalari, satira bir tane)
// '#' ile baslayan satirlar yorumdur. Dosya yoksa (404) eski sistem (version.txt / appversion.txt) kullanilir.
const MANIFEST_NAME = 'guncelleme.txt';
const SAFE_FILE = /^[A-Za-z0-9_][A-Za-z0-9_.\-]*$/;   // sadece duz dosya adi: klasor / .. yok

function parseManifest(text) {
  const m = { program: NaN, script: NaN, files: [] };
  for (const raw of String(text).replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const kv = line.match(/^(program|script)\s*=\s*(\d+)\s*$/i);
    if (kv) { m[kv[1].toLowerCase()] = parseInt(kv[2], 10); continue; }
    if (SAFE_FILE.test(line)) { if (!m.files.includes(line)) m.files.push(line); }
  }
  if (!Number.isFinite(m.program) && !Number.isFinite(m.script)) return null;
  return m;
}
// Dosya gruplari: content.js (ve *.user.js) = script grubu (script= surumu); digerleri (main.js ...) = program grubu (program= surumu)
const isScriptFile = (n) => n === 'content.js' || /\.user\.js$/i.test(n);

// Donen: manifest nesnesi | null (dosya yok / okunamadi -> eski sisteme dus). Ag hatasinda firlatir.
async function fetchManifest(t) {
  const r = await net.fetch(UPDATE_BASE + MANIFEST_NAME + '?t=' + t, { cache: 'no-store', signal: AbortSignal.timeout(7000) });
  if (!r.ok) return null;
  return parseManifest(await r.text());
}

async function fetchLegacyNumber(name, t) {
  const r = await net.fetch(UPDATE_BASE + name + '?t=' + t, { cache: 'no-store', signal: AbortSignal.timeout(7000) });
  if (!r.ok) return NaN;
  return parseInt((await r.text()).trim(), 10);
}

// Donen durum: 'yok' (yeni surum yok) | 'guncellendi' | 'cevrimdisi' | 'hata'
async function checkUpdate(onFound) {
  try {
    const t = Date.now();
    const man = await fetchManifest(t);
    let remote = man && Number.isFinite(man.script) ? man.script : await fetchLegacyNumber('version.txt', t);
    let files = man && Number.isFinite(man.script) ? man.files.filter(isScriptFile) : [];
    if (!files.includes('content.js')) files.unshift('content.js');
    if (!Number.isFinite(remote)) return { status: 'hata' };
    if (remote <= currentSource().version) return { status: 'yok', version: currentSource().version };

    if (onFound) await onFound(remote);

    // Once hepsini indir + dogrula, hicbiri bozuksa hicbirini kaydetme
    const got = {};
    for (const name of files) {
      const r2 = await net.fetch(UPDATE_BASE + name + '?t=' + t, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (!r2.ok) return { status: 'hata' };
      const code = await r2.text();
      if (name === 'content.js' && (code.length < 1000 || !code.includes('PDF-ROKET'))) return { status: 'hata' };
      if (/\.js$/i.test(name)) new vm.Script(code);   // sozdizimi hatasi varsa kaydetme
      got[name] = code;
    }
    if (!got['content.js']) return { status: 'hata' };

    fs.mkdirSync(upDir(), { recursive: true });
    for (const name of Object.keys(got)) fs.writeFileSync(path.join(upDir(), name), got[name], 'utf8');
    fs.writeFileSync(path.join(upDir(), 'version.txt'), String(remote), 'utf8');   // en son yazilir
    console.log('[PDF-ROKET] guncellendi -> script surumu ' + remote + ' (' + files.join(', ') + ')');
    return { status: 'guncellendi', version: remote };
  } catch (e) {
    console.error('[PDF-ROKET] guncelleme kontrolu yapilamadi:', e.message);
    return { status: 'cevrimdisi' };
  }
}


// ---------------- Tam surum guncellemesi (wp.zip) ----------------
// GitHub'daki guncelleme.txt (program=) - yoksa appversion.txt - app/appversion.txt'ten buyukse wp.zip indirilir ve app/ klasorunun uzerine kurulur.
const updater = require('./updater');
const appVerFile = path.join(__dirname, 'appversion.txt');
const appVersion = () => readNum(appVerFile);
let updating = false, askedVersion = 0;

// Donen durum: 'yok' | 'var' | 'cevrimdisi' | 'hata'
async function checkFullUpdate() {
  try {
    const t = Date.now();
    const man = await fetchManifest(t);
    const remote = man && Number.isFinite(man.program) ? man.program : await fetchLegacyNumber('appversion.txt', t);
    if (!Number.isFinite(remote)) return { status: 'hata' };
    if (remote <= appVersion()) return { status: 'yok', version: appVersion() };
    let notes = '';
    try {
      const n = await net.fetch(UPDATE_BASE + 'appnotes.txt?t=' + t, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (n.ok) notes = (await n.text()).trim().slice(0, 600);
    } catch (e) {}
    const files = man && Number.isFinite(man.program) ? man.files.filter((n) => !isScriptFile(n)) : [];
    return { status: 'var', version: remote, notes, files };
  } catch (e) {
    return { status: 'cevrimdisi' };
  }
}

async function installFromFileList(version, names, onStatus) {
  const files = [];
  for (const name of names) {
    if (onStatus) onStatus('İndiriliyor: ' + name);
    const r = await net.fetch(UPDATE_BASE + name + '?t=' + Date.now(), { cache: 'no-store', signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(name + ' indirilemedi (HTTP ' + r.status + ')');
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 200 || buf.length > 5 * 1024 * 1024) throw new Error(name + ' boyutu beklenmedik');
    if (/\.js$/i.test(name)) {
      const code = buf.toString('utf8');
      try { new vm.Script(code, { filename: name }); } catch (e) { throw new Error(name + ' dosyasında hata var: ' + e.message); }
      if (name === 'main.js' && !code.includes('PDF-ROKET')) throw new Error('main.js beklenen dosya değil');
    }
    files.push({ rel: name, data: buf });
  }
  files.push({ rel: 'appversion.txt', data: Buffer.from(String(version)) });   // en son yazilir
  if (onStatus) onStatus('Kuruluyor...');
  updater.installFiles(files, __dirname);
}

async function installFullUpdate(version, onStatus, names) {
  try {
    if (names && names.length) {
      await installFromFileList(version, names, onStatus);
      return { ok: true };
    }
    if (onStatus) onStatus('Yeni sürüm indiriliyor...');
    const r = await net.fetch(UPDATE_BASE + 'wp.zip?t=' + Date.now(), { cache: 'no-store', signal: AbortSignal.timeout(90000) });
    if (!r.ok) throw new Error('İndirilemedi (HTTP ' + r.status + ')');
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 10000 || buf.length > 80 * 1024 * 1024) throw new Error('İndirilen dosyanın boyutu beklenmedik');
    if (onStatus) onStatus('Dosyalar kontrol ediliyor...');
    const files = updater.pickAppFiles(updater.readZip(buf));
    updater.validate(files, version);
    if (onStatus) onStatus('Kuruluyor...');
    updater.installFiles(files, __dirname);
    return { ok: true };
  } catch (e) {
    console.error('[PDF-ROKET] tam guncelleme basarisiz:', e.message);
    return { ok: false, error: e.message };
  }
}

function relaunchApp() {
  toasts.slice().forEach((t) => { try { t.win.destroy(); } catch (e) {} });
  app.relaunch();
  app.exit(0);
}

async function askFullUpdate(info, parent) {
  const r = await dialog.showMessageBox(parent && !parent.isDestroyed() ? parent : undefined, {
    type: 'info', title: 'Yeni sürüm var', icon: logoImage(), noLink: true,
    message: 'PDF Roket WhatsApp için yeni sürüm var.\nAna uygulama sürümü: ' + info.version + ' (sende: ' + appVersion() + ')',
    detail: (info.notes ? info.notes + '\n\n' : '') + 'Şimdi indirilip kurulsun mu? Uygulama kendini yeniden başlatır.',
    buttons: ['Şimdi güncelle', 'Sonra'], defaultId: 0, cancelId: 1
  });
  return r.response === 0;
}

// Sor -> indir -> kur -> yeniden baslat (ana pencere acikken kullanilir)
async function promptAndInstall(info, parent) {
  if (updating) return;
  updating = true;
  try {
    if (!(await askFullUpdate(info, parent))) return;
    try { if (mainWin && !mainWin.isDestroyed()) mainWin.setProgressBar(2, { mode: 'indeterminate' }); } catch (e) {}
    const r = await installFullUpdate(info.version, null, info.files);
    try { if (mainWin && !mainWin.isDestroyed()) mainWin.setProgressBar(-1); } catch (e) {}
    if (r.ok) {
      await dialog.showMessageBox(parent && !parent.isDestroyed() ? parent : undefined, { type: 'info', title: 'Güncelleme', message: 'Güncelleme kuruldu 🎉', detail: 'Uygulama şimdi yeniden başlatılacak.', buttons: ['Tamam'] });
      relaunchApp();
    } else {
      dialog.showErrorBox('Güncelleme', 'Güncelleme kurulamadı, eski sürümle devam ediliyor.\n\n' + r.error);
    }
  } finally { updating = false; }
}

// Menuden elle kontrol
async function manualUpdateCheck() {
  if (updating) return;
  const parent = mainWin && !mainWin.isDestroyed() ? mainWin : undefined;
  const full = await checkFullUpdate();
  if (full.status === 'var') { askedVersion = full.version; return promptAndInstall(full, parent); }
  if (full.status !== 'yok') {
    return dialog.showMessageBox(parent, { type: 'warning', title: 'Güncelleme', message: 'Güncelleme kontrol edilemedi.', detail: 'İnternet bağlantını kontrol edip tekrar dene.', buttons: ['Tamam'] });
  }
  const c = await checkUpdate();
  if (c.status === 'guncellendi') {
    const r = await dialog.showMessageBox(parent, { type: 'info', title: 'Güncelleme', message: 'Özellikler güncellemesi indirildi (özellikler sürümü: ' + c.version + ').', detail: 'Uygulanması için yeniden başlatılsın mı?', buttons: ['Yeniden başlat', 'Sonra'], defaultId: 0, cancelId: 1 });
    if (r.response === 0) relaunchApp();
    return;
  }
  return dialog.showMessageBox(parent, { type: 'info', title: 'Güncelleme', message: 'Her şey güncel ✅', detail: 'Ana uygulama sürümü: ' + appVersion() + '\nÖzellikler sürümü: ' + currentSource().version, buttons: ['Tamam'] });
}

// Uygulama gunlerce acik kalirsa 6 saatte bir sessizce bakar, yeni surum varsa bir kez sorar
function scheduleUpdateChecks() {
  setInterval(async () => {
    if (updating) return;
    const full = await checkFullUpdate();
    if (full.status === 'var' && full.version !== askedVersion) {
      askedVersion = full.version;
      promptAndInstall(full, mainWin);
    }
  }, 6 * 60 * 60 * 1000);
}

// ---------------- Acilis ekrani ----------------
function createSplash() {
  const sp = new BrowserWindow({
    width: 440, height: 280, frame: false, resizable: false, center: true, show: false,
    alwaysOnTop: true, backgroundColor: '#111b21', icon: logoImage(),
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  let logoUrl = '';
  try { logoUrl = logoImage().resize({ width: 72, height: 72 }).toDataURL(); } catch (e) {}
  const logoHtml = logoUrl ? `<img src="${logoUrl}" style="width:64px;height:64px">` : '🚀';
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;height:100vh;box-sizing:border-box;border:1px solid #2a3942;background:#111b21;color:#e9edef;font-family:Segoe UI,Arial,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;user-select:none;-webkit-app-region:drag">
<div style="font-size:54px;line-height:1">${logoHtml}</div>
<div style="font-size:22px;font-weight:700;margin-top:10px">PDF Roket <span style="color:#25D366">WhatsApp</span></div>
<div id="m" style="margin:22px 24px 0;font-size:15px;min-height:42px;line-height:1.4">Başlatılıyor...</div>
<div id="sp" style="width:30px;height:30px;margin-top:14px;border:3px solid #2a3942;border-top-color:#25D366;border-radius:50%;animation:r .8s linear infinite"></div>
<div id="v" style="position:absolute;bottom:10px;font-size:11px;color:#667781"></div>
<div style="position:absolute;bottom:8px;right:14px;font-size:14px;color:#8696a0;font-family:'Segoe Script','Brush Script MT',cursive;font-style:italic;letter-spacing:.3px">Yasin Çelik</div>
<div style="position:absolute;left:0;right:0;bottom:0;height:3px;background:#1f2c34"><div style="height:100%;width:0;background:#25D366;animation:b 5.2s linear forwards"></div></div>
<style>@keyframes r{to{transform:rotate(360deg)}}@keyframes b{to{width:100%}}</style></body>`;
  sp.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html)).catch(() => {});
  sp.once('ready-to-show', () => sp.show());
  return sp;
}
async function splashMsg(sp, text, spin = true) {
  if (!sp || sp.isDestroyed()) return;
  try {
    await sp.webContents.executeJavaScript(
      `document.getElementById('m').textContent=${JSON.stringify(text)};document.getElementById('sp').style.display=${spin ? "'block'" : "'none'"};`);
  } catch (e) {}
}

async function startup() {
  const sp = createSplash();
  const splashStart = Date.now();
  await sleep(400);
  try { await sp.webContents.executeJavaScript(`document.getElementById('v').textContent=${JSON.stringify('Ana uygulama ' + appVersion() + '  ·  Özellikler ' + currentSource().version)}`); } catch (e) {}
  await splashMsg(sp, 'Güncellemeler kontrol ediliyor...');
  const t0 = Date.now();

  const res = await checkUpdate(async (v) => {
    await splashMsg(sp, 'Aha! Yeni güncelleme var 👀 Hemen indiriyorum hehehe 😈');
    await sleep(1400);
  });
  const full = await checkFullUpdate();
  // en az 1 sn "kontrol ediliyor" gorunsun
  if (Date.now() - t0 < 2500) await sleep(2500 - (Date.now() - t0));

  // Guncelleme bitti: WhatsApp'i arka planda hemen yuklemeye basla (acilis ekrani sirasinda)
  const win = createWindow();
  lockApp();   // sifre varsa WhatsApp gorunmeden once kilitle

  // Yeni TAM surum varsa sor; evet denirse indir, kur, yeniden baslat
  if (full.status === 'var') {
    askedVersion = full.version;
    try { sp.setAlwaysOnTop(false); } catch (e) {}
    const yes = await askFullUpdate(full, sp);
    try { if (!sp.isDestroyed()) sp.setAlwaysOnTop(true); } catch (e) {}
    if (yes) {
      await splashMsg(sp, 'Yeni sürüm indiriliyor... ⏬');
      const r = await installFullUpdate(full.version, (m) => splashMsg(sp, m), full.files);
      if (r.ok) {
        await splashMsg(sp, 'Güncelleme tamam! 🎉 Yeniden başlatılıyor...', false);
        await sleep(1200);
        relaunchApp();
        return;
      }
      try { sp.setAlwaysOnTop(false); } catch (e) {}
      dialog.showErrorBox('Güncelleme', 'Güncelleme kurulamadı, mevcut sürümle devam ediliyor.\n\n' + r.error);
      try { if (!sp.isDestroyed()) sp.setAlwaysOnTop(true); } catch (e) {}
    }
  }

  if (res.status === 'guncellendi') {
    await splashMsg(sp, 'Güncelleme tamam! 🎉 Özellikler sürümü ' + res.version + ' hazır, açılıyor...', false);
    await sleep(2000);
  } else if (res.status === 'yok') {
    await splashMsg(sp, 'Yeni sürüm yok, her şey güncel ✅ İşimize bakalım 😎', false);
    await sleep(2000);
  } else {
    await splashMsg(sp, 'Güncelleme kontrol edilemedi (internet yok mu?) 🤷 Mevcut sürümle devam ediyoruz.', false);
    await sleep(2200);
  }
  // acilis ekrani toplamda en az 5 sn acik kalsin
  const spent = Date.now() - splashStart;
  if (spent < 5200) await sleep(5200 - spent);
  if (!sp.isDestroyed()) sp.close();
  if (win && !win.isDestroyed()) { win.show(); win.focus(); sizeLockView(); focusLock(); }
  scheduleUpdateChecks();
}

// WhatsApp Web "tarayici desteklenmiyor" demesin diye Electron izini sil
function chromeUA() {
  return app.userAgentFallback
    .replace(/\s(Electron|pdf-roket-masaustu)\/\S+/g, '')
    .trim();
}

const OFFLINE_HTML = `<!doctype html><meta charset="utf-8"><title>PDF Roket WhatsApp</title>
<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#111b21;color:#e9edef;font-family:Segoe UI,sans-serif;text-align:center">
<div><div style="font-size:48px">📡</div><h2>WhatsApp'a ulasilamiyor</h2>
<p>Internet baglantini kontrol et. Baglanti gelince otomatik yenilenecek.</p>
<button onclick="location.href='${WA_URL}'" style="padding:10px 22px;border:0;border-radius:8px;background:#25D366;color:#fff;font-size:15px;font-weight:bold;cursor:pointer">Simdi dene</button></div>
<script>setTimeout(function(){location.href='${WA_URL}'},5000)</script></body>`;

function createWindow() {
  const ses = session.fromPartition(PARTITION);
  const ua = chromeUA();
  ses.setUserAgent(ua);

  ses.setPermissionRequestHandler((wc, perm, cb) => cb(ALLOWED_PERMS.includes(perm)));
  ses.setPermissionCheckHandler((wc, perm) => ALLOWED_PERMS.includes(perm));

  buildAppMenu();
  const win = new BrowserWindow({
    show: false,            // acilis ekrani bitince gosterilir (WhatsApp arka planda yuklenir)
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 500,
    icon: logoImage(),
    autoHideMenuBar: false,
    backgroundColor: '#111b21',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,           // preload dosya okuyabilsin
      partition: PARTITION      // QR girisi kalici olsun
    }
  });
  win.webContents.setUserAgent(ua);

  // blob: (PDF "yeni sekmede ac") uygulama icinde yeni pencerede acilsin, diger linkler tarayicida
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('blob:')) {
      return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, width: 1000, height: 800 } };
    }
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // WhatsApp disina gidilmesin
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(WA_URL) && !url.startsWith(START_URL) && !url.startsWith('blob:')) {
      e.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  // Internet yoksa bos ekran yerine bilgi sayfasi + otomatik tekrar deneme
  win.webContents.on('did-fail-load', (e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;   // -3 = iptal (sorun degil)
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(OFFLINE_HTML)).catch(() => {});
  });

  // Render sureci cokerse otomatik yeniden yukle
  win.webContents.on('render-process-gone', () => {
    setTimeout(() => { if (!win.isDestroyed()) win.loadURL(START_URL).catch(() => {}); }, 1000);
  });

  // Sag tik menusu (Electron'da varsayilan yok): kopyala / yapistir / link
  win.webContents.on('context-menu', (e, p) => {
    const items = [];
    if (p.linkURL) items.push({ label: 'Linki kopyala', click: () => require('electron').clipboard.writeText(p.linkURL) });
    if (p.isEditable) {
      items.push({ role: 'cut', label: 'Kes' }, { role: 'copy', label: 'Kopyala' }, { role: 'paste', label: 'Yapistir' }, { type: 'separator' }, { role: 'selectAll', label: 'Tumunu sec' });
    } else if (p.selectionText) {
      items.push({ role: 'copy', label: 'Kopyala' });
    }
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });

  mainWin = win;
  ['resize', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen', 'restore', 'show'].forEach((ev) => win.on(ev, sizeLockView));
  win.on('focus', focusLock);
  win.webContents.on('before-input-event', (e, input) => {
    if (locked) { e.preventDefault(); return; }   // kilitliyken arkadaki WhatsApp'a yazilamaz
    // Ctrl + / Ctrl - / Ctrl 0 (klavye duzeni fark etmez: harf, sayi tusu takimi, Shift'li hali)
    if (input.type === 'keyDown' && input.control && !input.alt && !input.meta) {
      const k = input.key, c = input.code;
      if (k === '+' || k === '=' || c === 'NumpadAdd') { e.preventDefault(); zoomBy(ZOOM_STEP); }
      else if (k === '-' || k === '_' || c === 'NumpadSubtract') { e.preventDefault(); zoomBy(-ZOOM_STEP); }
      else if (k === '0' || c === 'Numpad0') { e.preventDefault(); zoomReset(); }
    }
  });
  win.webContents.on('zoom-changed', (e, dir) => zoomBy(dir === 'in' ? ZOOM_STEP : -ZOOM_STEP));   // Ctrl + fare tekerlegi
  win.on('closed', () => { toasts.slice().forEach((t) => { try { t.win.destroy(); } catch (e) {} }); app.quit(); });
  applyAppDetails();
  if (!tray) createTray();
  updateShortcutIcon();
  win.loadURL(START_URL).catch(() => {});
  return win;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showMain();
  });
  app.whenReady().then(() => { ensureStartMenuShortcut(); startLockTimers(); startup(); });
  app.on('window-all-closed', () => app.quit());
}
