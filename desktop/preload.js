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
});
