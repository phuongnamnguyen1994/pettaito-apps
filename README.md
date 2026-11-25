# PetTaiTo / ClickOn apps

App máy tính (Mac, Windows) và Android cho https://pettaito.com — mở thẳng app web của team trong cửa sổ riêng.

- `desktop/` — Electron: chạy nền (icon thanh menu / khay), số đỏ trên icon, thông báo hệ thống, chia sẻ màn hình.
- `android/` — Trusted Web Activity: dùng nhân Chrome nên thông báo đẩy, gọi video, ghi âm chạy như web.
- GitHub Actions tự đóng gói mỗi lần đẩy code lên `main` và đăng ở **Releases**.

Link tải cố định (bản mới nhất):

| | PetTaiTo | ClickOn |
|---|---|---|
| Mac | `releases/latest/download/PetTaiTo-mac-universal.dmg` | `releases/latest/download/ClickOn-mac-universal.dmg` |
| Windows | `releases/latest/download/PetTaiTo-win-x64.exe` | `releases/latest/download/ClickOn-win-x64.exe` |
| Android | `releases/latest/download/PetTaiTo-Android.apk` | `releases/latest/download/ClickOn-Android.apk` |

Secrets cần có: `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD` (khoá ký app Android — giữ cố định, đổi khoá thì máy đã cài phải gỡ ra cài lại).
