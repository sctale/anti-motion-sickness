#!/usr/bin/env bash
# 在 JVM 上验证原生运动提示算法（无需 Android SDK / 真机）
# 用法：bash tools/verify/run.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="$(mktemp -d)"

if ! command -v kotlinc >/dev/null 2>&1; then
  echo "未找到 kotlinc，请先安装 Kotlin 编译器（https://kotlinlang.org/docs/command-line.html）" >&2
  exit 1
fi

kotlinc -nowarn \
  "$ROOT/native/android/RotationMath.kt" \
  "$ROOT/native/android/SensorFusion.kt" \
  "$ROOT/native/android/MotionCueEngine.kt" \
  "$ROOT/tools/verify/VerifyMain.kt" \
  -include-runtime -d "$OUT/verify.jar"

java -jar "$OUT/verify.jar"