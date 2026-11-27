// Khung Claude bên phải cửa sổ Pettaito: chạy claude.ai thật (tài khoản Claude của chính người dùng).
// Trang Pettaito tự chừa chỗ bên phải (nhận sự kiện "pt:claude-panel" với độ rộng khung).
const { app, WebContentsView, shell } = require("electron");
const fs = require("fs");
const path = require("path");

const CLAUDE_URL = "https://claude.ai/new";
// trang được mở ngay trong khung (đăng nhập Claude, Google, Apple); còn lại mở bằng trình duyệt
const INSIDE = /^https:\/\/([a-z0-9-]+\.)*(claude\.ai|claude\.com|anthropic\.com|accounts\.google\.com|google\.com|gstatic\.com|appleid\.apple\.com|apple\.com)(\/|$)/i;

let view = null;
let host = null;
let open = false;
let width = 460;

const cfgFile = () => path.join(app.getPath("userData"), "claude-panel.json");
try {
  const c = JSON.parse(fs.readFileSync(cfgFile(), "utf8"));
  if (c.width) width = c.width;
} catch {}
const save = () => {
  try {
    fs.writeFileSync(cfgFile(), JSON.stringify({ width }));
  } catch {}
};

function layout() {
  if (!host || host.isDestroyed() || !view || !open) return;
  const [w, h] = host.getContentSize();
  const pw = Math.round(Math.min(Math.max(width, 320), Math.max(320, w - 360)));
  view.setBounds({ x: w - pw, y: 0, width: pw, height: h });
  host.webContents.send("pt:claude-panel", { open: true, width: pw });
}

function ensure() {
  if (view) return;
  view = new WebContentsView({ webPreferences: { partition: "persist:claude", spellcheck: true } });
  // giống Chrome bình thường để đăng nhập Google / claude.ai không bị chặn
  const ua = view.webContents.getUserAgent().replace(/\s*Electron\/\S+/i, "").replace(/\s*[\w.-]*pettaito[\w.-]*\/\S+/gi, "");
  view.webContents.setUserAgent(ua);
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (INSIDE.test(url)) return { action: "allow", overrideBrowserWindowOptions: { width: 520, height: 680, autoHideMenuBar: true } };
    shell.openExternal(url);
    return { action: "deny" };
  });
  view.webContents.on("will-navigate", (e, url) => {
    if (!INSIDE.test(url)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
  view.webContents.loadURL(CLAUDE_URL);
}

/** bật / tắt khung Claude; trả về true nếu đang mở */
function toggle(win) {
  if (!win || win.isDestroyed()) return false;
  if (host !== win) {
    host = win;
    for (const ev of ["resize", "resized", "maximize", "unmaximize", "enter-full-screen", "leave-full-screen"]) win.on(ev, layout);
  }
  if (open) {
    win.contentView.removeChildView(view);
    open = false;
    win.webContents.send("pt:claude-panel", { open: false, width: 0 });
    win.webContents.focus();
    return false;
  }
  ensure();
  win.contentView.addChildView(view);
  open = true;
  layout();
  view.webContents.focus();
  return true;
}

function setWidth(w) {
  if (!Number.isFinite(w)) return;
  width = Math.round(w);
  layout();
  save();
}

function reload() {
  if (view) view.webContents.loadURL(CLAUDE_URL);
}

module.exports = { toggle, setWidth, reload, refresh: layout, isOpen: () => open };
