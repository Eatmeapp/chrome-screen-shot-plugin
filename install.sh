#!/usr/bin/env bash
# Meet 自動截圖 — 一鍵安裝 / 更新腳本（macOS / Linux）
#
# 用法：
#   curl -fsSL https://raw.githubusercontent.com/Eatmeapp/chrome-screen-shot-plugin/main/install.sh | bash
#
# 可用環境變數覆寫：
#   MAS_REPO   GitHub repo（預設 Eatmeapp/chrome-screen-shot-plugin）
#   MAS_BRANCH 分支（預設 main）
#   MAS_DIR    安裝位置（預設 ~/ChromeExtensions/meet-auto-screenshot）
set -euo pipefail

REPO="${MAS_REPO:-Eatmeapp/chrome-screen-shot-plugin}"
BRANCH="${MAS_BRANCH:-main}"
INSTALL_DIR="${MAS_DIR:-$HOME/ChromeExtensions/meet-auto-screenshot}"
EXT_DIR="$INSTALL_DIR/extension"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '  \033[32m✔\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '  \033[31m✘ %s\033[0m\n' "$*" >&2; exit 1; }

bold "▶ Meet 自動截圖 — 安裝 / 更新"
echo  "  來源：https://github.com/$REPO ($BRANCH)"
echo  "  位置：$INSTALL_DIR"
echo

# 1) 下載或更新程式碼
mkdir -p "$(dirname "$INSTALL_DIR")"
if command -v git >/dev/null 2>&1; then
  if [ -d "$INSTALL_DIR/.git" ]; then
    git -C "$INSTALL_DIR" fetch --depth 1 origin "$BRANCH" --quiet
    git -C "$INSTALL_DIR" reset --hard "origin/$BRANCH" --quiet
    info "已更新到最新版本"
  else
    [ -e "$INSTALL_DIR" ] && rm -rf "$INSTALL_DIR"
    git clone --depth 1 --branch "$BRANCH" "https://github.com/$REPO.git" "$INSTALL_DIR" --quiet \
      || die "git clone 失敗（repo 是否為 public？）"
    info "已下載程式碼（git）"
  fi
else
  command -v curl >/dev/null 2>&1 || die "需要 git 或 curl"
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  curl -fsSL "https://codeload.github.com/$REPO/tar.gz/refs/heads/$BRANCH" -o "$TMP/src.tgz" \
    || die "下載失敗（repo 是否為 public？）"
  mkdir -p "$TMP/src"
  tar -xzf "$TMP/src.tgz" -C "$TMP/src" --strip-components=1
  rm -rf "$INSTALL_DIR"
  mv "$TMP/src" "$INSTALL_DIR"
  info "已下載程式碼（tar.gz）"
fi

[ -f "$EXT_DIR/manifest.json" ] || die "找不到 $EXT_DIR/manifest.json"
VERSION="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$EXT_DIR/manifest.json" | head -n1)"
info "外掛版本 v${VERSION:-?}"

# 2) 把外掛資料夾路徑複製到剪貼簿
COPIED=0
if command -v pbcopy >/dev/null 2>&1; then printf '%s' "$EXT_DIR" | pbcopy && COPIED=1
elif command -v wl-copy >/dev/null 2>&1; then printf '%s' "$EXT_DIR" | wl-copy && COPIED=1
elif command -v xclip >/dev/null 2>&1; then printf '%s' "$EXT_DIR" | xclip -selection clipboard && COPIED=1
elif command -v xsel >/dev/null 2>&1; then printf '%s' "$EXT_DIR" | xsel --clipboard --input && COPIED=1
fi
[ "$COPIED" = 1 ] && info "外掛資料夾路徑已複製到剪貼簿"

# 3) 開啟 chrome://extensions
OPENED=0
case "$(uname -s)" in
  Darwin)
    for app in "Google Chrome" "Google Chrome Beta" "Chromium" "Brave Browser" "Microsoft Edge"; do
      if open -Ra "$app" >/dev/null 2>&1; then
        open -a "$app" "chrome://extensions/" >/dev/null 2>&1 && OPENED=1 && break
      fi
    done
    ;;
  Linux)
    for bin in google-chrome google-chrome-stable chromium chromium-browser brave-browser microsoft-edge; do
      if command -v "$bin" >/dev/null 2>&1; then
        nohup "$bin" "chrome://extensions/" >/dev/null 2>&1 &
        OPENED=1; break
      fi
    done
    ;;
esac
[ "$OPENED" = 1 ] && info "已開啟 chrome://extensions" || warn "請手動在 Chrome 網址列輸入 chrome://extensions"

echo
bold "▶ 最後一步（Chrome 安全限制，需手動點一次）"
cat <<EOF
  1. 在 chrome://extensions 右上角開啟「開發人員模式」
  2. 第一次安裝：點「載入未封裝項目」，選擇這個資料夾：
       $EXT_DIR
     （macOS 在選擇視窗按 ⌘+Shift+G，貼上路徑即可）
  3. 之後更新：重新執行這個腳本，再到 chrome://extensions 按外掛卡片上的「↻ 重新載入」

EOF
