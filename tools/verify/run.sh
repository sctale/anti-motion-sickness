#!/usr/bin/env bash
# 在 JVM 上验证原生运动提示算法（无需 Android SDK / 真机）
# 用法：bash tools/verify/run.sh
#
# kotlinc 查找顺序：PATH → $KOTLIN_HOME/bin → Android Studio 自带的 Kotlin 发行版。
# （Windows 上通常没有全局 kotlinc，但 Android Studio 里一定有一份可用的。）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

find_kotlinc() {
  if command -v kotlinc >/dev/null 2>&1; then
    command -v kotlinc
    return 0
  fi

  if [ -n "${KOTLIN_HOME:-}" ] && [ -x "${KOTLIN_HOME}/bin/kotlinc" ]; then
    echo "${KOTLIN_HOME}/bin/kotlinc"
    return 0
  fi

  local candidates=(
    "/c/Program Files/Android/Android Studio/plugins/Kotlin/kotlinc/bin/kotlinc"
    "${LOCALAPPDATA:-}/Programs/Android/Android Studio/plugins/Kotlin/kotlinc/bin/kotlinc"
    "${LOCALAPPDATA:-}/Android/Android Studio/plugins/Kotlin/kotlinc/bin/kotlinc"
    "/Applications/Android Studio.app/Contents/plugins/Kotlin/kotlinc/bin/kotlinc"
    "$HOME/android-studio/plugins/Kotlin/kotlinc/bin/kotlinc"
    "/opt/android-studio/plugins/Kotlin/kotlinc/bin/kotlinc"
  )

  local c
  for c in "${candidates[@]}"; do
    if [ -n "$c" ] && [ -f "$c" ]; then
      echo "$c"
      return 0
    fi
  done

  return 1
}

if ! KOTLINC="$(find_kotlinc)"; then
  cat >&2 <<'EOF'
未找到 kotlinc。可选任一方式：
  1) 安装 Kotlin 命令行工具并加入 PATH：https://kotlinlang.org/docs/command-line.html
  2) 设置 KOTLIN_HOME 指向 Kotlin 发行版目录
  3) 安装 Android Studio（其 plugins/Kotlin/kotlinc 会被自动发现）
EOF
  exit 1
fi

echo "使用 kotlinc: $KOTLINC"

"$KOTLINC" -nowarn \
  "$ROOT/native/android/RotationMath.kt" \
  "$ROOT/native/android/SensorFusion.kt" \
  "$ROOT/native/android/MotionCueEngine.kt" \
  "$ROOT/tools/verify/VerifyMain.kt" \
  -include-runtime -d "$OUT/verify.jar"

# Windows 控制台默认不是 UTF-8，不显式指定编码时中文输出会变乱码
java -Dfile.encoding=UTF-8 -Dstdout.encoding=UTF-8 -jar "$OUT/verify.jar"
