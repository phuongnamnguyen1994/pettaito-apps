// Đóng gói 1 bản: node build.js pettaito|clickon  (chạy trên GitHub Actions: macOS ra .dmg, Windows ra .exe)
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const VARIANTS = {
  pettaito: { name: "PetTaiTo", slug: "hub", url: "https://pettaito.com/team/chat?ws=pettaito", color: "#facc15" },
  clickon: { name: "ClickOn", slug: "clickon", url: "https://pettaito.com/team/chat?ws=clickon", color: "#ff5300" },
};
const key = process.argv[2];
const v = VARIANTS[key];
if (!v) throw new Error("Dùng: node build.js pettaito|clickon");

// tài nguyên của bản này
const dst = path.join(__dirname, "assets");
fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(dst, { recursive: true });
for (const f of fs.readdirSync(path.join(__dirname, "..", "assets", key))) fs.copyFileSync(path.join(__dirname, "..", "assets", key, f), path.join(dst, f));
fs.copyFileSync(path.join(__dirname, "..", "assets", "badge.png"), path.join(dst, "badge.png"));
fs.writeFileSync(path.join(__dirname, "variant.json"), JSON.stringify(v, null, 2));

const version = process.env.APP_VERSION || require("./package.json").version;
const config = {
  appId: `com.pettaito.${v.slug}`,
  productName: v.name,
  copyright: "PetTaiTo",
  artifactName: `${v.name}-\${os}-\${arch}.\${ext}`,
  directories: { output: path.join("dist", key) },
  files: ["main.js", "preload.js", "updater.js", "dock.js", "variant.json", "assets/**"],
  extraMetadata: { version, productName: v.name },
  // link "pettaito-hub://" / "pettaito-clickon://" -> đưa vé đăng nhập Google từ Chrome về app
  protocols: [{ name: `${v.name} login`, schemes: [`pettaito-${v.slug}`] }],
  mac: {
    icon: "assets/icon-mac.png", // khuôn icon chuẩn Apple: bo góc + chừa lề + bóng đổ (giống Viber)
    category: "public.app-category.productivity",
    target: [{ target: "dmg", arch: ["arm64"] }], // chỉ Mac chip M (Apple) — chạy thẳng trên chip, không qua Rosetta
    identity: "-", // ký ad-hoc (chưa có chứng chỉ Apple): cài bằng file "Cai dat" để không bị Gatekeeper hỏi
    hardenedRuntime: false,
    extendInfo: {
      NSMicrophoneUsageDescription: "Dùng micro cho cuộc gọi và ghi chép cuộc họp",
      NSAppleEventsUsageDescription: "Xếp cửa sổ Viber / Zalo dính cạnh Pettaito (chỉ dời vị trí cửa sổ, không đọc tin nhắn)",
      NSCameraUsageDescription: "Dùng camera cho cuộc gọi video",
    },
  },
  dmg: { title: `${v.name}` },
  win: { icon: "assets/icon.png", target: [{ target: "nsis", arch: ["x64"] }] },
  nsis: {
    oneClick: true, // bấm là cài xong, tự tạo icon Desktop + Start Menu
    perMachine: false,
    createDesktopShortcut: "always",
    createStartMenuShortcut: true,
    shortcutName: v.name,
    runAfterFinish: true,
  },
};
fs.writeFileSync(path.join(__dirname, "builder.json"), JSON.stringify(config, null, 2));
const target = process.platform === "darwin" ? "--mac" : process.platform === "win32" ? "--win" : "--linux";
execSync(`npx electron-builder ${target} --config builder.json --publish never`, { stdio: "inherit", cwd: __dirname });

// ---- Tự kiểm tra trước khi đăng: sai là dừng, không phát hành bản lỗi ----
const out = path.join(__dirname, "dist", key);
const must = (ok, msg) => {
  if (!ok) throw new Error(`KIỂM TRA THẤT BẠI: ${msg}`);
  console.log(`✓ ${msg}`);
};
const asarOf = (appDir) => {
  const { listPackage } = require("@electron/asar");
  return listPackage(appDir, {}).map((f) => f.replace(/\\/g, "/"));
};
if (process.platform === "darwin") {
  for (const [dir, arch] of [["mac-arm64", "arm64"]]) {
    const app = path.join(out, dir, `${v.name}.app`);
    must(fs.existsSync(app), `có ${dir}/${v.name}.app`);
    const archs = execSync(`lipo -archs "${app}/Contents/MacOS/${v.name}"`).toString().trim().split(/\s+/).sort().join(" ");
    must(archs === arch.split(" ").sort().join(" "), `${dir}: chip ${archs}`);
    const files = asarOf(path.join(app, "Contents/Resources/app.asar"));
    for (const f of ["/main.js", "/preload.js", "/updater.js", "/dock.js", "/variant.json"]) must(files.includes(f), `${dir}: có ${f}`);
    const plist = fs.readFileSync(path.join(app, "Contents/Info.plist"), "utf8");
    must(plist.includes(`pettaito-${v.slug}`), `${dir}: đăng ký link đăng nhập pettaito-${v.slug}://`);
  }
  for (const a of ["arm64"]) must(fs.existsSync(path.join(out, `${v.name}-mac-${a}.dmg`)), `có file ${v.name}-mac-${a}.dmg`);
} else if (process.platform === "win32") {
  const files = asarOf(path.join(out, "win-unpacked", "resources", "app.asar"));
  for (const f of ["/main.js", "/preload.js", "/updater.js", "/dock.js", "/variant.json"]) must(files.includes(f), `win: có ${f}`);
  must(fs.existsSync(path.join(out, `${v.name}-win-x64.exe`)), `có file ${v.name}-win-x64.exe`);
}
// chạy thử phần tự cập nhật bằng Node (cú pháp + nạp được)
execSync(`node --check "${path.join(__dirname, "updater.js")}" && node --check "${path.join(__dirname, "main.js")}"`, { stdio: "inherit" });
console.log("✓ Tự kiểm tra xong");
