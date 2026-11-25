// App máy tính PetTaiTo / ClickOn (Mac + Windows)
// Mở thẳng pettaito.com trong cửa sổ riêng; đóng cửa sổ = chạy nền (icon trên thanh menu / khay hệ thống),
// vẫn nhận thông báo & số đỏ trên icon. Nội dung luôn là bản web mới nhất -> không cần cập nhật app khi web đổi.
const { app, BrowserWindow, Menu, Tray, nativeImage, shell, session, desktopCapturer, ipcMain, Notification } = require("electron");
const path = require("path");
const variant = require("./variant.json"); // { name, slug, url, color }
const updater = require("./updater");

const SITE = "https://pettaito.com";
let win = null;
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
  win.on("closed", () => (win = null));
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
ipcMain.on("pt:notify", (_e, n) => {
  if (!Notification.isSupported()) return;
  const note = new Notification({ title: String(n.title || variant.name), body: String(n.body || ""), silent: false, icon: icon("icon.png") });
  note.on("click", () => {
    show();
    if (n.url && win) win.webContents.send("pt:open", n.url);
  });
  note.show();
});

ipcMain.on("pt:scheme", (e) => (e.returnValue = SCHEME));

// trang đăng nhập nhờ mở Chrome (chỉ cho trang đăng nhập Google / Supabase)
ipcMain.on("pt:open-external", (_e, url) => {
  if (/^https:\/\/([a-z0-9-]+\.supabase\.co\/auth\/|accounts\.google\.com\/)/i.test(String(url))) shell.openExternal(url);
});

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
  app.on("activate", show);
  updater.start(variant.name, () => refreshTrayMenu());
  // mở app bằng link đăng nhập (Windows: nằm trong argv; Mac: open-url trước khi sẵn sàng)
  const link = pendingAuth || process.argv.find((a) => a.startsWith(`${SCHEME}://`));
  pendingAuth = null;
  if (link) handleDeepLink(link.startsWith(SITE) ? `${SCHEME}://auth${link.slice(link.indexOf("#"))}` : link);
});

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
