// Cầu nối an toàn giữa trang pettaito.com và app máy tính
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ptNative", {
  platform: process.platform,
  /** scheme để Chrome gọi về app sau khi đăng nhập Google */
  authScheme: ipcRenderer.sendSync("pt:scheme"),
  /** mở trang đăng nhập Google bằng trình duyệt thật */
  openExternal: (url) => ipcRenderer.send("pt:open-external", url),
  /** số tin chưa đọc -> số đỏ trên icon */
  setBadge: (n) => ipcRenderer.send("pt:badge", n),
  /** hiện thông báo hệ thống */
  notify: (n) => ipcRenderer.send("pt:notify", n),
  /** cửa sổ app có đang được chọn không */
  isFocused: () => ipcRenderer.invoke("pt:focused"),
  /** bấm thông báo -> mở đúng trang */
  onOpen: (cb) => ipcRenderer.on("pt:open", (_e, url) => cb(url)),
  /** kéo ảnh / file ra màn hình máy tính bằng FILE GỐC: tải sẵn khi rê chuột vào, kéo là ra file thật */
  prefetchFile: (url, name) => ipcRenderer.send("pt:drag-prefetch", { url, name }),
  dragReady: (url) => ipcRenderer.sendSync("pt:drag-ready", url),
  dragFile: (url) => ipcRenderer.send("pt:drag", url),
  /** Pettaito thu nhỏ nổi trên màn hình */
  toggleMini: () => ipcRenderer.send("pt:mini-toggle"),
  hideMini: () => ipcRenderer.send("pt:mini-hide"),
  openMain: (url) => ipcRenderer.send("pt:open-main", url),
  /** ghép dính Viber / Zalo cạnh cửa sổ Pettaito; trả về true nếu đang ghép */
  toggleDock: (app) => ipcRenderer.invoke("pt:dock-toggle", app),
  dockCurrent: () => ipcRenderer.invoke("pt:dock-current"),
  /** khung Claude (claude.ai) bên phải cửa sổ */
  toggleClaude: () => ipcRenderer.invoke("pt:claude-toggle"),
  claudeOpen: () => ipcRenderer.invoke("pt:claude-open"),
  setClaudeWidth: (w) => ipcRenderer.send("pt:claude-width", w),
  reloadClaude: () => ipcRenderer.send("pt:claude-reload"),
  /** Không làm phiền: { on, until, label, allowImportant } */
  focusInfo: () => ipcRenderer.invoke("pt:focus-get"),
  setFocus: (mode) => ipcRenderer.send("pt:focus-set", mode),
  onFocus: (cb) => {
    const f = (_e, s) => cb(s);
    ipcRenderer.on("pt:focus", f);
    return () => ipcRenderer.removeListener("pt:focus", f);
  },
  onClaudePanel: (cb) => {
    const f = (_e, s) => cb(s);
    ipcRenderer.on("pt:claude-panel", f);
    return () => ipcRenderer.removeListener("pt:claude-panel", f);
  },
});
