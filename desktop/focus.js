// Chế độ Không làm phiền (giống Tập trung trên iPhone): tạm tắt thông báo tin nhắn / task / cảm xúc.
// Nhắc nhở (chuông hẹn giờ) vẫn reo. Tuỳ chọn vẫn báo tin nhắn riêng và khi được @nhắc tên.
// Lưu ở userData/focus.json để tắt app mở lại vẫn giữ.
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const file = () => path.join(app.getPath("userData"), "focus.json");
let state = { until: 0, allowImportant: true }; // until: ms; Infinity = tới khi tự tắt; 0 = đang tắt
try {
  const s = JSON.parse(fs.readFileSync(file(), "utf8"));
  state = { until: s.until === "forever" ? Infinity : Number(s.until) || 0, allowImportant: s.allowImportant !== false };
} catch {}

const save = () => {
  try {
    fs.writeFileSync(file(), JSON.stringify({ until: state.until === Infinity ? "forever" : state.until, allowImportant: state.allowImportant }));
  } catch {}
};

let timer = null;
let onChange = () => {};
function arm() {
  clearTimeout(timer);
  if (state.until && state.until !== Infinity) {
    const left = state.until - Date.now();
    // setTimeout tối đa ~24 ngày; hẹn lại theo từng đoạn
    if (left > 0) timer = setTimeout(() => (isOn() ? arm() : onChange()), Math.min(left + 500, 2 ** 31 - 1));
  }
}

function isOn() {
  return state.until === Infinity || state.until > Date.now();
}

/** 19h hôm nay, hoặc 8h sáng mai */
function at(h, nextDay) {
  const d = new Date();
  if (nextDay) d.setDate(d.getDate() + 1);
  d.setHours(h, 0, 0, 0);
  return d.getTime();
}

/** mode: "1h" | "evening" | "morning" | "forever" | "off" */
function set(mode) {
  const now = Date.now();
  state.until =
    mode === "1h" ? now + 3600_000 : mode === "evening" ? at(19, false) : mode === "morning" ? at(8, new Date().getHours() >= 8) : mode === "forever" ? Infinity : 0;
  if (state.until !== Infinity && state.until <= now) state.until = 0;
  save();
  arm();
  onChange();
}

function setAllowImportant(v) {
  state.allowImportant = !!v;
  save();
  onChange();
}

/** thông báo này có bị chặn không. n.important: tin riêng / được @nhắc; n.alarm: nhắc nhở hẹn giờ */
function blocks(n) {
  if (!isOn()) return false;
  if (n && n.alarm) return false;
  if (n && n.important && state.allowImportant) return false;
  return true;
}

function untilLabel() {
  if (!isOn()) return "";
  if (state.until === Infinity) return "cho tới khi tắt";
  const d = new Date(state.until);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return new Date().toDateString() === d.toDateString() ? `đến ${hm}` : `đến ${hm} ngày mai`;
}

function info() {
  return { on: isOn(), until: isOn() ? (state.until === Infinity ? null : state.until) : 0, label: untilLabel(), allowImportant: state.allowImportant };
}

/** các mục cho menu thanh menu / khay */
function menuItems() {
  const on = isOn();
  const evening = new Date().getHours() < 18;
  return [
    {
      label: on ? `🌙 Không làm phiền · ${untilLabel()}` : "🌙 Không làm phiền",
      submenu: [
        ...(on ? [{ label: "Tắt Không làm phiền", click: () => set("off") }, { type: "separator" }] : []),
        { label: "Trong 1 giờ", click: () => set("1h") },
        ...(evening ? [{ label: "Đến tối nay (19:00)", click: () => set("evening") }] : []),
        { label: "Đến sáng mai (8:00)", click: () => set("morning") },
        { label: "Cho tới khi tôi tắt", click: () => set("forever") },
        { type: "separator" },
        {
          label: "Vẫn báo tin nhắn riêng & khi được @nhắc tên",
          type: "checkbox",
          checked: state.allowImportant,
          click: (it) => setAllowImportant(it.checked),
        },
        { label: "Nhắc nhở hẹn giờ vẫn reo", enabled: false },
      ],
    },
  ];
}

function init(cb) {
  onChange = cb;
  arm();
}

module.exports = { init, isOn, set, setAllowImportant, blocks, info, menuItems };
