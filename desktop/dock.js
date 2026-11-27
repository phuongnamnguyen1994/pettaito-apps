// Ghép dính Viber / Zalo cạnh cửa sổ Pettaito (side by side).
// Pettaito di chuyển / đổi cỡ -> app kia đi theo, cao bằng nhau; bấm vào Pettaito -> app kia nổi lên cùng;
// ẩn / thu nhỏ Pettaito -> app kia thu nhỏ theo. Chỉ điều khiển VỊ TRÍ cửa sổ, không đọc nội dung.
// Mac: dùng AppleScript (cần quyền Trợ năng / Accessibility). Windows: PowerShell + user32 SetWindowPos.
const { execFile, spawn } = require("child_process");
const { screen, systemPreferences, dialog, shell } = require("electron");

const isMac = process.platform === "darwin";
const isWin = process.platform === "win32";
const APPS = { viber: "Viber", zalo: "Zalo" };

let state = null; // { app: "viber"|"zalo", side: "right"|"left", width }
let win = null;
let busy = false;
let pending = null;
let ps = null;

function osa(script) {
  return new Promise((resolve) => execFile("osascript", ["-e", script], { timeout: 4000 }, (err, out) => resolve(err ? null : String(out).trim())));
}

function winHelper() {
  if (ps && !ps.killed) return ps;
  const script = `
$sig = '[DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);'
Add-Type -MemberDefinition $sig -Name W -Namespace P
while ($null -ne ($line = [Console]::In.ReadLine())) {
  $a = $line.Split(' ')
  $p = Get-Process -Name $a[0] -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if (-not $p) { continue }
  $h = $p.MainWindowHandle
  switch ($a[1]) {
    'pos' { [P.W]::ShowWindow($h, 9) | Out-Null; [P.W]::SetWindowPos($h, [IntPtr]::Zero, [int]$a[2], [int]$a[3], [int]$a[4], [int]$a[5], 0x0010) | Out-Null }
    'raise' { [P.W]::SetWindowPos($h, [IntPtr]::Zero, 0, 0, 0, 0, 0x0013) | Out-Null }
    'min' { [P.W]::ShowWindow($h, 6) | Out-Null }
    'restore' { [P.W]::ShowWindow($h, 4) | Out-Null }
  }
}`;
  ps = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], { windowsHide: true });
  ps.on("exit", () => (ps = null));
  ps.stdin.on("error", () => {});
  return ps;
}

/** vị trí app kia theo cửa sổ Pettaito hiện tại */
function target() {
  const b = win.getBounds();
  const area = screen.getDisplayMatching(b).workArea;
  let w = state.width;
  let x = state.side === "right" ? b.x + b.width : b.x - w;
  // tràn khỏi màn hình -> thu bớt cho vừa
  if (state.side === "right" && x + w > area.x + area.width) w = Math.max(360, area.x + area.width - x);
  if (state.side === "left" && x < area.x) {
    w = Math.max(360, b.x - area.x);
    x = b.x - w;
  }
  return { x: Math.round(x), y: Math.round(b.y), width: Math.round(w), height: Math.round(b.height) };
}

async function place() {
  if (!state || !win || win.isDestroyed()) return;
  if (busy) return void (pending = true);
  busy = true;
  const r = target();
  const name = APPS[state.app];
  if (isMac) {
    await osa(`tell application "System Events" to tell process "${name}"
      if (count of windows) > 0 then
        set position of window 1 to {${r.x}, ${r.y}}
        set size of window 1 to {${r.width}, ${r.height}}
      end if
    end tell`);
  } else if (isWin) {
    const p = screen.dipToScreenRect(win, r);
    winHelper().stdin.write(`${name} pos ${p.x} ${p.y} ${p.width} ${p.height}\n`);
  }
  busy = false;
  if (pending) {
    pending = false;
    setTimeout(place, 30);
  }
}

async function raise() {
  if (!state) return;
  const name = APPS[state.app];
  if (isMac) await osa(`tell application "System Events" to tell process "${name}" to if (count of windows) > 0 then perform action "AXRaise" of window 1`);
  else if (isWin) winHelper().stdin.write(`${name} raise\n`);
}

async function setMin(min) {
  if (!state) return;
  const name = APPS[state.app];
  if (isMac) await osa(`tell application "System Events" to tell process "${name}" to if (count of windows) > 0 then set value of attribute "AXMinimized" of window 1 to ${min}`);
  else if (isWin) winHelper().stdin.write(`${name} ${min ? "min" : "restore"}\n`);
}

let timer = null;
const onMove = () => {
  clearTimeout(timer);
  timer = setTimeout(place, 16);
};
const onFocus = () => void raise();
const onHide = () => void setMin(true);
const onShow = () => {
  void setMin(false).then(place);
};

function detach() {
  if (win && !win.isDestroyed()) {
    for (const ev of ["move", "moved", "resize", "resized"]) win.off(ev, onMove);
    win.off("focus", onFocus);
    win.off("hide", onHide);
    win.off("minimize", onHide);
    win.off("show", onShow);
    win.off("restore", onShow);
  }
  state = null;
}

/** bật ghép: app = "viber" | "zalo"; gọi lại với app đang ghép = tách ra */
async function toggle(mainWin, app, side = "right") {
  if (state && state.app === app) {
    detach();
    return false;
  }
  detach();
  if (!isMac && !isWin) return false;
  const name = APPS[app];
  if (isMac && !systemPreferences.isTrustedAccessibilityClient(false)) {
    systemPreferences.isTrustedAccessibilityClient(true); // mở hộp xin quyền của macOS
    const r = await dialog.showMessageBox({
      type: "info",
      message: `Cho phép Pettaito xếp cửa sổ ${name}`,
      detail:
        `Để ${name} dính cạnh Pettaito, macOS cần cấp quyền "Trợ năng" (Accessibility) cho app Pettaito.\n\n` +
        `Vào Cài đặt hệ thống → Quyền riêng tư & Bảo mật → Trợ năng → bật Pettaito, rồi bấm "Ghép ${name}" lần nữa.\n\n` +
        `Pettaito chỉ dời vị trí cửa sổ, không đọc tin nhắn ${name}.`,
      buttons: ["Mở Cài đặt", "Để sau"],
    });
    if (r.response === 0) shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility");
    return false;
  }
  // mở app kia nếu chưa chạy
  if (isMac) await new Promise((r) => execFile("open", ["-g", "-a", name], () => r(null)));
  else if (isWin) {
    winHelper();
    shell.openExternal(app === "viber" ? "viber://" : "zalo://").catch(() => {});
  }
  win = mainWin;
  // chia màn hình: Pettaito 40% bên trái, app kia 60% bên phải (hoặc ngược lại)
  const area = screen.getDisplayMatching(win.getBounds()).workArea;
  const pw = Math.max(420, Math.round(area.width * 0.4));
  const ow = area.width - pw;
  if (win.isMaximized()) win.unmaximize();
  if (win.isFullScreen()) win.setFullScreen(false);
  win.setBounds({ x: side === "right" ? area.x : area.x + ow, y: area.y, width: pw, height: area.height });
  state = { app, side, width: ow };
  for (const ev of ["move", "moved", "resize", "resized"]) win.on(ev, onMove);
  win.on("focus", onFocus);
  win.on("hide", onHide);
  win.on("minimize", onHide);
  win.on("show", onShow);
  win.on("restore", onShow);
  setTimeout(place, 600); // chờ app kia mở xong
  setTimeout(place, 2000);
  return true;
}

module.exports = { toggle, current: () => (state ? state.app : null), detach };
