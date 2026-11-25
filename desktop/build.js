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
  files: ["main.js", "preload.js", "updater.js", "variant.json", "assets/**"],
  extraMetadata: { version, productName: v.name },
  // link "pettaito-hub://" / "pettaito-clickon://" -> đưa vé đăng nhập Google từ Chrome về app
  protocols: [{ name: `${v.name} login`, schemes: [`pettaito-${v.slug}`] }],
  mac: {
    icon: "assets/icon.png",
    category: "public.app-category.productivity",
    target: [{ target: "dmg", arch: ["universal"] }],
    identity: "-", // ký ad-hoc (chưa có chứng chỉ Apple): cài bằng file "Cai dat" để không bị Gatekeeper hỏi
    hardenedRuntime: false,
    extendInfo: {
      NSMicrophoneUsageDescription: "Dùng micro cho cuộc gọi và ghi chép cuộc họp",
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
