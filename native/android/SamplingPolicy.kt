package com.anonymous.anticarsicknessrn

/**
 * 采样档位。**只有三档，且顺序与省电程度一致**，
 * 这样策略层的「降级」就是数值变大，不会出现「不知道哪个更快」的歧义。
 *
 * 具体的 `SensorManager.SENSOR_DELAY_*` 常量映射在 `OverlayService` 里做，
 * 本文件保持零 Android 依赖，才能被 `tools/verify` 在 JVM 上直接验证。
 */
enum class SamplingLevel {
    /** 有运动：圆点要跟手，用最快的档 */
    HIGH,

    /** 静止一段时间：降到够用的档 */
    MEDIUM,

    /** 长时间静止：只剩「重新检测到运动」这一件事要快 */
    LOW;

    /** 档位是否比 other 更省电（数值越大越省电） */
    fun isMoreIdleThan(other: SamplingLevel): Boolean = ordinal > other.ordinal
}

/**
 * 常驻前台服务的采样强度策略。
 *
 * 为什么需要它：这个 App 的使用方式是「上车打开，一整天不管」。
 * 一直用 `SENSOR_DELAY_GAME`（约 50Hz）跑 3~5 路传感器，是发热与耗电的主要来源，
 * 而国产 ROM 一旦因为耗电冻结前台服务，用户看到的就是「圆点没了 / App 坏了」。
 * 静止时圆点本来就不动，没必要维持最高采样率。
 *
 * 规则（可完全在 JVM 上验证）：
 * - 任一帧运动强度达到 [motionThreshold]，或圆点当前正在显示（[cueVisible]）
 *   → 立刻回到 [SamplingLevel.HIGH] 并刷新静止计时；
 * - 静止累计超过 [idleToMediumMs] → 降到 [SamplingLevel.MEDIUM]；
 * - 静止累计超过 [idleToLowMs] → 降到 [SamplingLevel.LOW]；
 * - 降级只按时间、升级只看运动与显示状态，两者条件互斥，因此不会来回抖动。
 *
 * `cueVisible` 这条不能省：自动模式有淡出窗口（停车后还要显示一会儿），
 * 匀速巡航时强度也可能长期低于门限，此时若降到 200ms 采样，
 * 下一次转弯要慢半拍才跟上 —— 提示的跟手性比省那一点电重要。
 * 因此真正能省电的场景是「静止、停车后忘关、走路时带在身上」这些确实在等着的阶段。
 *
 * 线程约定：与 `OverlayService` 的融合/引擎一样，只在传感器线程上调用 [update]。
 */
class SamplingPolicy(
    val idleToMediumMs: Long = 20_000L,
    val idleToLowMs: Long = 120_000L,
    val motionThreshold: Float = 0.08f
) {

    init {
        require(idleToMediumMs in 1 until idleToLowMs) {
            "静止降级门限必须满足 0 < idleToMediumMs < idleToLowMs"
        }
        require(motionThreshold > 0f) { "motionThreshold 必须为正" }
    }

    var level: SamplingLevel = SamplingLevel.HIGH
        private set

    private var lastMotionAtMs = 0L
    private var initialized = false

    /**
     * 每帧调用一次，返回当前应有的档位。
     *
     * @param nowMs 单调时钟（elapsedRealtime），必须单调不减
     * @param magnitude01 本帧运动强度（0~1），来自 `MotionCueEngine`
     */
    fun update(nowMs: Long, magnitude01: Float, cueVisible: Boolean = false): SamplingLevel {
        if (!initialized) {
            // 冷启动先按「刚有运动」处理：否则 t=0 就会因为「静止了 120s」被误降级
            initialized = true
            lastMotionAtMs = nowMs
        }

        if (magnitude01 >= motionThreshold || cueVisible) {
            lastMotionAtMs = nowMs
            level = SamplingLevel.HIGH
            return level
        }

        val idleMs = (nowMs - lastMotionAtMs).coerceAtLeast(0L)
        level = when {
            idleMs >= idleToLowMs -> SamplingLevel.LOW
            idleMs >= idleToMediumMs -> SamplingLevel.MEDIUM
            else -> SamplingLevel.HIGH
        }
        return level
    }

    /** 传感器被注销（息屏）后重新注册时调用：下一次 update 重新计时 */
    fun reset() {
        initialized = false
        lastMotionAtMs = 0L
        level = SamplingLevel.HIGH
    }
}
