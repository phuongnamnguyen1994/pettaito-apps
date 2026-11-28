// App máy tính PetTaiTo / ClickOn (Mac + Windows)
// Mở thẳng pettaito.com trong cửa sổ riêng; đóng cửa sổ = chạy nền (icon trên thanh menu / khay hệ thống),
// vẫn nhận thông báo & số đỏ trên icon. Nội dung luôn là bản web mới nhất -> không cần cập nhật app khi web đổi.
const { app, BrowserWindow, Menu, Tray, nativeImage, shell, session, desktopCapturer, ipcMain, Notification, globalShortcut, screen } = require("electron");
const path = require("path");
const fs = require("fs");
const variant = require("./variant.json"); // { name, slug, url, color }
const updater = require("./updater");
const dock = require("./dock");
const claudePanel = require("./claude-panel");
const focus = require("./focus");

const SITE = "https://pettaito.com";
let win = null;
let mini = null; // khung thu nhỏ nổi trên màn hình
let tray = null;
let quitting = false;
let unread = 0;

app.setName(variant.name);
if (process.platform === "win32") app.setAppUserModelId(`com.pettaito.${variant.slug}`);

// Đăng nhập Google: Google cấm đăng nhập trong app nhúng -> mở Chrome thật, xong Chrome gọi
// "pettaito-<slug>://auth#access_token=…" về app -> app nạp phiên đăng nhập.
const SCHEME = `pettaito-${variant.slug}`;
let pendingAuth = null;
if (process.defaultApp) app.setAsDefaultProtocolClient(SCHEME, process.execPath, [path.resolve(process.argv[1] || ".")]);
else app.setAsDefaultProtocolClient(SCHEME);
function handleDeepLink(url) {
  if (!url || !url.startsWith(`${SCHEME}://`)) return;
  const hash = url.includes("#") ? url.slice(url.indexOf("#")) : "";
  if (!/access_token=/.test(hash)) return;
  const target = `${SITE}/login?app=${Date.now()}${hash}`; // ?app= để tải lại trang hẳn (chỉ đổi # thì trang không nhận)
  if (!win) {
    pendingAuth = target;
    return;
  }
  win.loadURL(target);
  show();
}
app.on("open-url", (e, url) => {
  e.preventDefault();
  if (app.isReady()) handleDeepLink(url);
  else pendingAuth = url;
});

// chỉ chạy 1 cửa sổ: mở lại thì đưa cửa sổ cũ lên (Windows: link đăng nhập đến qua đây)
if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", (_e, argv) => {
  const link = argv.find((a) => a.startsWith(`${SCHEME}://`));
  if (link) handleDeepLink(link);
  else show();
});

function icon(file) {
  return nativeImage.createFromPath(path.join(__dirname, "assets", file));
}

function show() {
  updater.checkNow(variant.name);
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 380,
    minHeight: 560,
    title: variant.name,
    backgroundColor: "#090909",
    icon: icon("icon.png"),
    autoHideMenuBar: true,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 12, y: 14 },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      partition: "persist:pettaito", // giữ đăng nhập
      spellcheck: false,
    },
  });
  win.loadURL(variant.url);
  // trang tải lại -> báo lại khung Claude đang mở để trang chừa chỗ
  win.webContents.on("did-finish-load", () => claudePanel.refresh());

  // link ngoài (Google Drive, web khác…) -> mở bằng trình duyệt; link trong app -> mở ngay trong cửa sổ
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`${SITE}/team`) || url.startsWith(`${SITE}/clickon`)) {
      win.loadURL(url);
      return { action: "deny" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });
  const inApp = (url) => url.startsWith(SITE);
  win.webContents.on("will-navigate", (e, url) => {
    if (!inApp(url)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  // đóng cửa sổ = ẩn xuống nền (vẫn nhận tin); thoát hẳn bằng menu / Cmd+Q
  win.on("close", (e) => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
  });
  win.on("closed", () => {
    dock.detach();
    win = null;
  });
}

// ---------------------------------------------------------------- Pettaito thu nhỏ (luôn nằm trên cùng)
const MINI_FILE = () => path.join(app.getPath("userData"), "mini.json");
function miniBounds() {
  try {
    const b = JSON.parse(fs.readFileSync(MINI_FILE(), "utf8"));
    const area = screen.getDisplayMatching(b).workArea;
    if (b.x >= area.x - 50 && b.y >= area.y - 50 && b.x < area.x + area.width && b.y < area.y + area.height) return b;
  } catch {}
  const a = screen.getPrimaryDisplay().workArea;
  return { width: 340, height: 500, x: a.x + a.width - 360, y: a.y + a.height - 520 };
}
function createMini() {
  mini = new BrowserWindow({
    ...miniBounds(),
    minWidth: 280,
    minHeight: 320,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    minimizable: false,
    title: `${variant.name} mini`,
    backgroundColor: "#090909",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      partition: "persist:pettaito",
      spellcheck: false,
    },
  });
  // nổi trên cả Viber / Zalo đang mở toàn màn hình
  mini.setAlwaysOnTop(true, "floating");
  mini.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mini.loadURL(`${SITE}/team/mini`);
  mini.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(SITE)) openMain(url);
    else shell.openExternal(url);
    return { action: "deny" };
  });
  mini.webContents.on("will-navigate", (e, url) => {
    if (url.startsWith(`${SITE}/team/mini`)) return;
    e.preventDefault();
    if (url.startsWith(SITE)) openMain(url);
    else shell.openExternal(url);
  });
  const save = () => {
    try {
      if (mini && !mini.isDestroyed()) fs.writeFileSync(MINI_FILE(), JSON.stringify(mini.getBounds()));
    } catch {}
  };
  mini.on("moved", save);
  mini.on("resized", save);
  mini.on("close", (e) => {
    if (quitting) return;
    e.preventDefault();
    mini.hide();
  });
  mini.on("closed", () => (mini = null));
}
function toggleMini() {
  if (!mini) return createMini();
  if (mini.isVisible()) mini.hide();
  else {
    mini.showInactive();
    mini.focus();
  }
}
async function toggleDock(appName) {
  if (!win) createWindow();
  show();
  const on = await dock.toggle(win, appName);
  refreshTrayMenu();
  return on;
}
function openMain(url) {
  show();
  if (url && win) win.loadURL(url.startsWith("http") ? url : `${SITE}${url}`);
}

function setupSession() {
  const ses = session.fromPartition("persist:pettaito");
  // mic / camera / thông báo / chia sẻ màn hình cho pettaito.com
  ses.setPermissionRequestHandler((wc, permission, cb, details) => {
    cb((details.requestingUrl || "").startsWith(SITE));
  });
  ses.setPermissionCheckHandler((wc, permission, origin) => (origin || "").startsWith(SITE));
  // chia sẻ màn hình trong cuộc gọi: dùng bảng chọn của hệ thống (macOS 15+), máy khác: chia sẻ cả màn hình
  ses.setDisplayMediaRequestHandler(
    (req, cb) => {
      desktopCapturer
        .getSources({ types: ["screen", "window"] })
        .then((sources) => cb({ video: sources[0], audio: process.platform === "win32" ? "loopback" : undefined }))
        .catch(() => cb({}));
    },
    { useSystemPicker: true },
  );
}

function buildTray() {
  const img = icon("tray.png");
  tray = new Tray(img);
  tray.setToolTip(variant.name);
  refreshTrayMenu();
  tray.on("click", show);
}

function refreshTrayMenu() {
  if (!tray) return;
  const up = updater.hasUpdate();
  const menu = () =>
    Menu.buildFromTemplate([
      { label: `Mở ${variant.name}`, click: show },
      ...focus.menuItems(),
      { type: "separator" },
      { label: "Pettaito thu nhỏ (luôn nổi)", accelerator: "CommandOrControl+Shift+Space", click: toggleMini },
      { label: "Ghép dính Viber bên cạnh", type: "checkbox", checked: dock.current() === "viber", click: () => toggleDock("viber") },
      { label: "Ghép dính Zalo bên cạnh", type: "checkbox", checked: dock.current() === "zalo", click: () => toggleDock("zalo") },
      { label: "Ghép dính Claude bên cạnh", type: "checkbox", checked: dock.current() === "claude", click: () => toggleDock("claude") },
      { label: "Khung Claude trong Pettaito", click: () => { show(); claudePanel.toggle(win); } },
      ...(up ? [{ label: `⬆️ Cập nhật lên bản ${up.version} & mở lại`, click: () => updater.install(variant.name) }] : [{ label: "Kiểm tra cập nhật", click: () => updater.checkNow(variant.name, true) }]),
      { type: "separator" },
      {
        label: "Mở cùng máy tính",
        type: "checkbox",
        checked: app.getLoginItemSettings().openAtLogin,
        click: (it) => app.setLoginItemSettings({ openAtLogin: it.checked, openAsHidden: true }),
      },
      { type: "separator" },
      { label: `Phiên bản ${app.getVersion()}`, enabled: false },
      {
        label: "Thoát",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]);
  tray.setContextMenu(menu());
}

// trang web báo số tin chưa đọc -> số đỏ trên icon Dock / thanh tác vụ
ipcMain.on("pt:badge", (_e, n) => {
  unread = Math.max(0, Number(n) || 0);
  if (process.platform === "darwin") app.dock.setBadge(unread ? (unread > 99 ? "99+" : String(unread)) : "");
  else app.setBadgeCount(unread);
  if (win && process.platform === "win32") {
    // Windows: chấm đỏ nhỏ trên icon thanh tác vụ
    win.setOverlayIcon(unread ? icon("badge.png") : null, unread ? `${unread} tin chưa đọc` : "");
  }
  tray?.setToolTip(unread ? `${variant.name} — ${unread} tin chưa đọc` : variant.name);
});

// thông báo từ trang web (khi cửa sổ không được chọn); bấm vào -> mở đúng nhóm
// ảnh đại diện nhóm / người gửi cho thông báo (Windows hiện được; Mac luôn dùng icon app)
const avatarCache = new Map();
async function notifyIcon(url) {
  const fallback = icon(process.platform === "darwin" ? "icon-mac.png" : "icon.png");
  if (process.platform === "darwin" || typeof url !== "string" || !url.startsWith("/api/files/avatars/")) return fallback;
  if (avatarCache.has(url)) return avatarCache.get(url);
  try {
    const res = await session.fromPartition("persist:pettaito").fetch(SITE + url);
    if (!res.ok) return fallback;
    const img = nativeImage.createFromBuffer(Buffer.from(await res.arrayBuffer())).resize({ width: 96, height: 96 });
    if (img.isEmpty()) return fallback;
    if (avatarCache.size > 200) avatarCache.clear();
    avatarCache.set(url, img);
    return img;
  } catch {
    return fallback;
  }
}

// ===== Kéo file gốc từ chat ra màn hình máy tính =====
const fsp = require("fs/promises");
const DRAG_DIR = path.join(require("os").tmpdir(), "pettaito-drag");
const dragCache = new Map(); // url -> { file, icon } | Promise
fsp.rm(DRAG_DIR, { recursive: true, force: true }).catch(() => {});
ipcMain.on("pt:drag-prefetch", (_e, { url, name }) => {
  if (typeof url !== "string" || !url.startsWith(SITE + "/api/files/") || dragCache.has(url)) return;
  const job = (async () => {
    try {
      const res = await session.fromPartition("persist:pettaito").fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const safe = String(name || "file").replace(/[\/:*?"<>|]/g, "_").slice(0, 150) || "file";
      const dir = path.join(DRAG_DIR, String(dragCache.size));
      await fsp.mkdir(dir, { recursive: true });
      const file = path.join(dir, safe);
      await fsp.writeFile(file, Buffer.from(await res.arrayBuffer()));
      let img = nativeImage.createThumbnailFromPath ? await nativeImage.createThumbnailFromPath(file, { width: 96, height: 96 }).catch(() => null) : null;
      if (!img || img.isEmpty()) img = icon("icon.png").resize({ width: 64, height: 64 });
      dragCache.set(url, { file, icon: img });
    } catch {
      dragCache.delete(url);
    }
  })();
  dragCache.set(url, job);
});
ipcMain.on("pt:drag-ready", (e, url) => {
  const v = dragCache.get(url);
  e.returnValue = !!v && !(v instanceof Promise);
});
ipcMain.on("pt:drag", (e, url) => {
  const v = dragCache.get(url);
  if (v && !(v instanceof Promise)) e.sender.startDrag({ file: v.file, icon: v.icon });
});

ipcMain.on("pt:notify", async (_e, n) => {
  if (!Notification.isSupported()) return;
  if (focus.blocks(n)) return; // đang Không làm phiền
  // kiểu báo: chỉ tiếng -> kêu "ting" của máy, không hiện khung (nhắc nhở hẹn giờ thì vẫn hiện)
  const st = focus.style();
  if (st === "sound" && !n.alarm) {
    shell.beep();
    return;
  }
  const note = new Notification({ title: String(n.title || variant.name), body: String(n.body || ""), silent: st === "silent" && !n.alarm, icon: await notifyIcon(n.icon) });
  note.on("click", () => {
    show();
    if (n.url && win) win.webContents.send("pt:open", n.url);
  });
  note.show();
});

ipcMain.on("pt:scheme", (e) => (e.returnValue = SCHEME));

// Không làm phiền: trang hỏi trạng thái / bật tắt từ trong app
ipcMain.handle("pt:focus-get", () => focus.info());
ipcMain.on("pt:focus-set", (_e, mode) => focus.set(["1h", "evening", "morning", "forever", "off"].includes(mode) ? mode : "off"));
ipcMain.on("pt:notify-style", (_e, v) => focus.setStyle(v));

/** cập nhật biểu tượng 🌙 trên thanh menu + báo cho trang */
function applyFocusUi() {
  const f = focus.info();
  if (tray && process.platform === "darwin") tray.setTitle(f.on ? "☾" : "");
  for (const w of [win, mini]) if (w && !w.isDestroyed()) w.webContents.send("pt:focus", f);
}

// trang đăng nhập nhờ mở Chrome (chỉ cho trang đăng nhập Google / Supabase)
ipcMain.on("pt:open-external", (_e, url) => {
  if (/^https:\/\/([a-z0-9-]+\.supabase\.co\/auth\/|accounts\.google\.com\/)/i.test(String(url))) shell.openExternal(url);
});

ipcMain.on("pt:mini-toggle", () => toggleMini());
ipcMain.handle("pt:dock-toggle", (_e, appName) => toggleDock(appName === "zalo" || appName === "claude" ? appName : "viber"));
ipcMain.handle("pt:dock-current", () => dock.current());
// khung Claude bên phải
ipcMain.handle("pt:claude-toggle", () => claudePanel.toggle(win));
ipcMain.handle("pt:claude-open", () => claudePanel.isOpen());
ipcMain.on("pt:claude-width", (_e, w) => claudePanel.setWidth(Number(w)));
ipcMain.on("pt:claude-reload", () => claudePanel.reload());
ipcMain.on("pt:mini-hide", () => mini && mini.hide());
ipcMain.on("pt:open-main", (_e, url) => openMain(url));
ipcMain.handle("pt:focused", () => !!win && win.isVisible() && win.isFocused());

app.whenReady().then(() => {
  // menu tối giản (giữ phím tắt copy / paste / zoom / reload)
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === "darwin" ? [{ role: "appMenu" }] : []),
      { role: "editMenu" },
      { role: "viewMenu" },
      { role: "windowMenu" },
    ]),
  );
  setupSession();
  createWindow();
  buildTray();
  focus.init(() => {
    refreshTrayMenu();
    applyFocusUi();
  });
  applyFocusUi();
  // phím tắt toàn máy: bật / ẩn khung thu nhỏ từ bất kỳ app nào (Viber, Zalo…)
  try {
    globalShortcut.register("CommandOrControl+Shift+Space", toggleMini);
  } catch {}
  app.on("activate", show);
  updater.start(variant.name, () => refreshTrayMenu());
  // mở app bằng link đăng nhập (Windows: nằm trong argv; Mac: open-url trước khi sẵn sàng)
  const link = pendingAuth || process.argv.find((a) => a.startsWith(`${SCHEME}://`));
  pendingAuth = null;
  if (link) handleDeepLink(link.startsWith(SITE) ? `${SCHEME}://auth${link.slice(link.indexOf("#"))}` : link);
});

app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("before-quit", (e) => {
  quitting = true;
  // có bản mới đã tải -> cài luôn khi thoát
  if (updater.hasUpdate()) {
    e.preventDefault();
    updater.install(variant.name);
  }
});
app.on("window-all-closed", () => {
  /* chạy nền */
});
