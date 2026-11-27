// Ký app Mac bằng CHỮ KÝ CỐ ĐỊNH "PetTaiTo Code Signing" (tự tạo, lưu trong GitHub Secrets).
// Vì chữ ký giữ nguyên qua các bản, macOS nhớ quyền đã cấp (Trợ năng, micro, camera…) — cập nhật app không phải cấp lại.
// Chưa có chữ ký (MAC_SIGN_ID trống) -> giữ cách ký ad-hoc như cũ.
const { execSync } = require("child_process");

exports.default = async function afterSign(ctx) {
  if (ctx.electronPlatformName !== "darwin") return;
  const id = process.env.MAC_SIGN_ID;
  if (!id) {
    console.log("• Chưa có chữ ký cố định -> ký ad-hoc");
    return;
  }
  const app = `${ctx.appOutDir}/${ctx.packager.appInfo.productFilename}.app`;
  const kc = process.env.MAC_SIGN_KEYCHAIN ? `--keychain "${process.env.MAC_SIGN_KEYCHAIN}"` : "";
  execSync(`codesign --force --deep --timestamp=none --sign "${id}" ${kc} "${app}"`, { stdio: "inherit" });
  execSync(`codesign --verify --deep --strict "${app}"`, { stdio: "inherit" });
  const info = execSync(`codesign -dvv "${app}" 2>&1`).toString();
  if (!/Authority=PetTaiTo Code Signing/.test(info)) throw new Error("KIỂM TRA THẤT BẠI: app chưa được ký bằng chữ ký cố định");
  console.log("✓ Ký bằng chữ ký cố định PetTaiTo Code Signing");
  console.log(execSync(`codesign -d -r- "${app}" 2>&1`).toString());
};
