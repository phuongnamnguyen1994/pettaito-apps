// Đóng gói app Android (Trusted Web Activity): node build.mjs pettaito|clickon
// App mở pettaito.com bằng nhân Chrome toàn màn hình -> thông báo đẩy, số trên icon, ghi âm, gọi video chạy như web.
// Chạy trên GitHub Actions (ubuntu: có sẵn JDK 17 + Android SDK).
import { TwaGenerator, TwaManifest, ConsoleLog } from "@bubblewrap/core";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const VARIANTS = {
  pettaito: {
    packageId: "com.pettaito.hub",
    name: "PetTaiTo",
    manifest: "https://pettaito.com/manifest.webmanifest",
    start: "/team/chat?ws=pettaito",
    icon: "https://pettaito.com/brand/logo-square.png",
    theme: "#090909",
  },
  clickon: {
    packageId: "com.pettaito.clickon",
    name: "ClickOn",
    manifest: "https://pettaito.com/clickon.webmanifest",
    start: "/team/chat?ws=clickon",
    icon: "https://pettaito.com/brand/clickon-square.png",
    theme: "#090909",
  },
};

const key = process.argv[2];
const v = VARIANTS[key];
if (!v) throw new Error("Dùng: node build.mjs pettaito|clickon");
const here = path.dirname(new URL(import.meta.url).pathname);
const out = path.join(here, "build", key);
const keystore = process.env.KEYSTORE_PATH || path.join(here, "keystore.p12");
const PASS = process.env.KEYSTORE_PASSWORD || "pettaito-internal";
const versionCode = Number(process.env.APP_VERSION_CODE || 1);
const versionName = process.env.APP_VERSION || "1.0.0";

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const m = await TwaManifest.fromWebManifest(v.manifest);
Object.assign(m, {
  packageId: v.packageId,
  host: "pettaito.com",
  name: v.name,
  launcherName: v.name,
  startUrl: v.start,
  iconUrl: v.icon,
  maskableIconUrl: v.icon,
  themeColor: m.themeColor ?? v.theme,
  navigationColor: v.theme,
  navigationColorDark: v.theme,
  navigationDividerColor: v.theme,
  navigationDividerColorDark: v.theme,
  backgroundColor: v.theme,
  display: "standalone",
  orientation: "default",
  enableNotifications: true,
  fallbackType: "customtabs",
  appVersionCode: versionCode,
  appVersionName: versionName,
  signingKey: { path: keystore, alias: "pettaito" },
  shortcuts: [],
});
await new TwaGenerator().createTwaProject(out, m, new ConsoleLog("twa"));
await m.saveToFile(path.join(out, "twa-manifest.json"));

const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
const bt = fs
  .readdirSync(path.join(sdk, "build-tools"))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  .pop();
const tools = path.join(sdk, "build-tools", bt);
const run = (cmd, cwd = out) => execSync(cmd, { stdio: "inherit", cwd, env: { ...process.env, ANDROID_HOME: sdk } });

fs.writeFileSync(path.join(out, "local.properties"), `sdk.dir=${sdk}\n`);
run("chmod +x gradlew && ./gradlew assembleRelease --no-daemon --stacktrace");
const unsigned = path.join(out, "app/build/outputs/apk/release/app-release-unsigned.apk");
const aligned = path.join(out, "aligned.apk");
const final = path.join(here, "dist", `${v.name}-Android.apk`);
fs.mkdirSync(path.dirname(final), { recursive: true });
run(`"${tools}/zipalign" -f -p 4 "${unsigned}" "${aligned}"`);
run(`"${tools}/apksigner" sign --ks "${keystore}" --ks-type PKCS12 --ks-key-alias pettaito --ks-pass pass:${PASS} --key-pass pass:${PASS} --out "${final}" "${aligned}"`);
console.log("APK:", final);
