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
});
