// Tự cập nhật: kiểm tra bản mới trên GitHub Releases, tải ngầm, cài khi người dùng bấm (hoặc khi thoát app).
// Không dùng electron-updater vì app Mac chưa ký với Apple (Squirrel.Mac bắt buộc ký).
const { app, net, Notification } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const REPO = "phuongnamnguyen1994/pettaito-apps";
let ready = null; // { version, file }
let onReadyCb = () => {};
let checking = false;
let lastCheck = 0;

const newer = (a, b) => {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};

async function check(name, manual = false) {
  if (ready || !app.isPackaged || checking) return;
  checking = true;
  lastCheck = Date.now();
  try {
    const r = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
    if (!r.ok) return;
    const rel = await r.json();
    const version = String(rel.tag_name || "").replace(/^v/, "");
    if (!version || !newer(version, app.getVersion())) {
      if (manual && Notification.isSupported()) new Notification({ title: name, body: `Đang dùng bản mới nhất (${app.getVersion()})` }).show();
      return;
    }
    if (manual && Notification.isSupported()) new Notification({ title: name, body: `Đang tải bản ${version}… xong sẽ báo` }).show();
    const want = process.platform === "darwin" ? `${name}-mac-universal.dmg` : `${name}-win-x64.exe`;
    const asset = (rel.assets || []).find((a) => a.name === want);
    if (!asset) return; // bản mới chưa đăng xong
    const file = path.join(os.tmpdir(), `pt-update-${version}-${want}`);
    if (!fs.existsSync(file) || fs.statSync(file).size !== asset.size) {
      const res = await net.fetch(asset.browser_download_url);
      if (!res.ok) return;
      const tmp = file + ".part";
      fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
      if (fs.statSync(tmp).size !== asset.size) return;
      fs.renameSync(tmp, file);
    }
    ready = { version, file };
    onReadyCb(ready);
    if (Notification.isSupported()) {
      const n = new Notification({ title: `${name} có bản mới ${version}`, body: "Bấm để cập nhật ngay (mất vài giây). Hoặc để đó — tự cập nhật khi thoát app." });
      n.on("click", () => install(name));
      n.show();
    }
  } catch (e) {
    console.error("update check failed", e);
  } finally {
    checking = false;
  }
}

/** kiểm tra ngay (bấm menu) hoặc khi mở cửa sổ — tối đa 1 lần / 5 phút */
function checkNow(name, manual = false) {
  if (manual || Date.now() - lastCheck > 5 * 60_000) check(name, manual);
}

/** Cài bản đã tải rồi mở lại app */
function install(name) {
  if (!ready) return false;
  const { file } = ready;
  if (process.platform === "darwin") {
    const appPath = path.resolve(app.getPath("exe"), "../../.."); // .../PetTaiTo.app
    const script = `
      while kill -0 ${process.pid} 2>/dev/null; do sleep 0.5; done
      MNT=$(hdiutil attach -nobrowse -readonly "${file}" | awk -F'\\t' '/\\/Volumes\\//{print $NF; exit}')
      SRC=$(ls -d "$MNT"/*.app | head -1)
      if [ -n "$SRC" ]; then rm -rf "${appPath}" && cp -R "$SRC" "${appPath}"; xattr -cr "${appPath}" 2>/dev/null; fi
      hdiutil detach "$MNT" -quiet
      open "${appPath}"`;
    spawn("/bin/bash", ["-c", script], { detached: true, stdio: "ignore" }).unref();
  } else {
    const exe = app.getPath("exe");
    spawn("cmd.exe", ["/c", `ping -n 3 127.0.0.1 >nul & start /wait "" "${file}" /S & start "" "${exe}"`], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  }
  ready = null;
  app.exit(0);
  return true;
}

function start(name, onReady) {
  onReadyCb = onReady || onReadyCb;
  setTimeout(() => check(name), 20_000);
  setInterval(() => check(name), 30 * 60_000);
}

module.exports = { start, install, checkNow, hasUpdate: () => ready };
