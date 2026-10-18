package com.anonymous.anticarsicknessrn

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * 运动提示引擎（纯 Kotlin，无 Android 依赖，可在 JVM 上测试）。
 *
 * 设计对标 Apple Vehicle Motion Cues / Google Motion Assist / KineStop：
 *
 * 1. **方向语义**：圆点像「车窗外掠过的景物」一样流动 ——
 *    - 车辆加速前进 → 圆点自上而下流动；刹车 → 自下而上流动
 *    - 左转 → 圆点整体向右移动；右转 → 整体向左移动
 *    （多篇实测报道确认：右转时圆点向屏幕左移、刹车时向上滑）
 * 2. **姿态自适应**：竖握手机时车身前进方向 ≈ 屏幕背面朝向，
 *    平放时 ≈ 屏幕上边缘朝向，按屏幕倾角在两者间平滑混合，
 *    因此竖握和平放都能正确响应（Apple 官方也说明「面朝前方坐姿效果最佳」）
 * 3. **响应速度**：转向同时使用偏航角速度（瞬时、跟手）与横向加速度
 *    （转向中持续存在），二者符号一致互相加强；
 * 4. **平滑**：临界阻尼二阶弹簧，避免抖动，运动结束后自然回中；
 * 5. **自动模式**：对标 Apple「自动」/ Google「Start in a moving vehicle」，
 *    检测到车辆运动时淡入，静止一段时间后淡出。
 */
class MotionCueEngine(
    private val config: CueConfig = CueConfig()
) {

    data class CueConfig(
        /**
         * 横向满行程位移（dp）。
         *
         * 必须 ≤ OverlayView 在边缘带内能显示的横向行程
         * `OverlayView.MAX_SHIFT_X_DP = EDGE_INSET_DP − DOT_RADIUS_DP × RADIUS_MAX_SCALE ≈ 20.4`。
         * 之前这里是 40dp 而 View 只给到 ±21.5/±30dp，结果左右两列在不同位置撞墙、
         * 不再像「整组平移」，而且引擎算出的后半段位移被静默裁掉。
         */
        val maxOffsetXdp: Float = 20f,
        /** 纵向满行程位移（dp）；纵向可用空间是整个屏幕高度，不受边缘带限制 */
        val maxOffsetYdp: Float = 48f,

        /** 达到满行程所需的偏航角速度 (rad/s)。约等于 30km/h 急打方向的量级 */
        val yawReferenceRadS: Float = 0.55f,
        /** 达到满行程所需的横向加速度 (m/s²) */
        val lateralReferenceMS2: Float = 3.5f,
        /** 达到满行程所需的纵向加速度 (m/s²) */
        val longitudinalReferenceMS2: Float = 3.0f,
        /** 横向通道里偏航角速度的权重，余下权重给横向加速度（两者符号一致） */
        val yawChannelWeight: Float = 0.65f,

        /** 加速度死区（m/s²），抑制静止噪声 */
        val deadbandAccel: Float = 0.12f,
        /** 偏航角速度死区（rad/s） */
        val deadbandYaw: Float = 0.015f,
        /** 弹簧固有频率（rad/s），越大越跟手 */
        val springOmega: Float = 12f,
        /** 弹簧阻尼比（1.0 = 临界阻尼） */
        val springZeta: Float = 1.0f,

        /** 自动模式进入「运动中」的阈值（高于此值才开始计时） */
        val motionAccelEnterMS2: Float = 0.30f,
        val motionYawEnterRadS: Float = 0.06f,
        /** 维持「运动中」的阈值（低于此值才开始计时走向淡出）——与进入阈值构成迟滞 */
        val motionAccelExitMS2: Float = 0.12f,
        val motionYawExitRadS: Float = 0.02f,
        /** 连续满足进入阈值多久才认定真的在动（抑制手机被拿起来晃一下的误触发） */
        val motionConfirmMs: Float = 600f,
        /** 自动模式：低于退出阈值多久后淡出（秒） */
        val stillTimeoutS: Float = 10f,
        /** 淡入淡出时长（秒） */
        val fadeDurationS: Float = 0.8f
    )

    data class CueOutput(
        /** 水平位移（dp，正 = 向右） */
        val offsetXdp: Float,
        /** 垂直位移（dp，正 = 向下） */
        val offsetYdp: Float,
        /** 淡入淡出一透明度（0~1） */
        val alpha: Float,
        /** 位移强度 0~1（可用于微调圆点大小） */
        val magnitude01: Float
    ) {
        companion object {
            val ZERO = CueOutput(0f, 0f, 0f, 0f)
        }
    }

    /** 是否处于自动模式（静止隐藏 / 运动显示） */
    var autoMode: Boolean = true

    private var offsetX = 0f
    private var offsetY = 0f
    private var velocityX = 0f
    private var velocityY = 0f
    private var alpha = 0f

    private var lastTimestampMs: Long = 0L
    private var lastMotionAtMs: Long = 0L
    private var enterCandidateSinceMs: Long = 0L
    private var isMoving: Boolean = false
    private var lastMagnitude01 = 0f

    companion object {
        private val WORLD_UP = floatArrayOf(0f, 0f, 1f)
    }

    fun update(fusion: SensorFusion.FusionOutput, timestampMs: Long): CueOutput {
        val dt = computeDt(timestampMs)
        lastTimestampMs = timestampMs

        // ---- 1. 姿态自适应：推断「车辆前进方向」在水平面内的投影 ----
        val screenNormal = fusion.deviceUp
        val flatness = abs(RotationMath.dot(screenNormal, WORLD_UP)).coerceIn(0f, 1f)

        // 竖握：屏幕背面朝向 ≈ 乘客面朝方向 ≈ 车辆前进方向
        val uprightForward = RotationMath.horizontal(
            floatArrayOf(-screenNormal[0], -screenNormal[1], -screenNormal[2])
        )
        // 平放：屏幕上边缘朝向 ≈ 前进方向（用户朝屏幕上方看）
        val flatForward = RotationMath.horizontal(fusion.deviceTop)

        val blend = smoothStep(flatness)
        val mergedForward = RotationMath.normalize(
            floatArrayOf(
                (1f - blend) * uprightForward[0] + blend * flatForward[0],
                (1f - blend) * uprightForward[1] + blend * flatForward[1],
                0f
            )
        )

        val hasForward = RotationMath.magnitude(mergedForward) > 0.1f
        val forward = if (hasForward) mergedForward else null

        // ---- 2. 车辆坐标系下的加速度分量 ----
        // 姿态退化（车头方向投影到水平面几乎为 0）时直接不输出纵向/横向提示：
        // 以前会兜底成「世界 Y 轴 = 磁北」，而 AGENTS 明文禁止用磁北当前进方向，
        // 且这个兜底值在 hasForward=false 分支里根本没被用到，属于误导性死代码。
        val aLong: Float
        val aLat: Float
        if (forward != null) {
            aLong = RotationMath.dot(fusion.horizontalAccel, forward)
            val rightAxis = RotationMath.normalize(RotationMath.cross(forward, WORLD_UP))
            aLat = RotationMath.dot(fusion.horizontalAccel, rightAxis)
        } else {
            aLong = 0f
            aLat = 0f
        }

        val aLongDead = softDeadband(aLong, config.deadbandAccel)
        val aLatDead = softDeadband(aLat, config.deadbandAccel)
        val yawDead = softDeadband(fusion.yawRate, config.deadbandYaw)

        // ---- 3. 映射到屏幕位移（圆点流动方向 = 车窗外景物流动方向）----
        // 偏航角速度（瞬时、跟手）与横向加速度（持续、可靠）符号一致，
        // 但必须按权重合成、各自归一到满行程，不能各按满增益相加：
        // 老参数下 2.5 m/s² 的普通转弯光横向加速度就顶出 50dp，
        // 缓转和急转看起来完全一样。
        val yawNorm = aYawToNormalized(yawDead)
        val latNorm = aLatDead / config.lateralReferenceMS2
        val longNorm = aLongDead / config.longitudinalReferenceMS2

        // 左转 yaw > 0 → 圆点向右；左转时向心加速度朝左（aLat < 0）→ 同样向右
        val targetXdp = clampTo1(
            yawNorm * config.yawChannelWeight - latNorm * (1f - config.yawChannelWeight)
        ) * config.maxOffsetXdp
        // 加速前进 → 圆点向下；刹车 → 圆点向上
        val targetYdp = clampTo1(longNorm) * config.maxOffsetYdp

        // ---- 4. 自动模式可见性（进入/退出双阈值 + 确认窗口，构成迟滞）----
        val accelMag = fusion.horizontalAccelMagnitude
        val yawMag = abs(fusion.yawRate)
        updateMotionState(
            accelMag = accelMag,
            yawMag = yawMag,
            timestampMs = timestampMs
        )
        val shouldShow = if (autoMode) isMoving else true

        val alphaStep = if (config.fadeDurationS > 0f) dt / config.fadeDurationS else 1f
        alpha = if (shouldShow) {
            min(1f, alpha + alphaStep)
        } else {
            max(0f, alpha - alphaStep)
        }

        // 隐藏过程中目标归零，让圆点自然回中
        val effectiveTargetX = if (alpha > 0.01f) targetXdp else 0f
        val effectiveTargetY = if (alpha > 0.01f) targetYdp else 0f

        // ---- 5. 临界阻尼弹簧平滑 ----
        val omega = config.springOmega
        val zeta = config.springZeta
        val accelX = omega * omega * (effectiveTargetX - offsetX) - 2f * zeta * omega * velocityX
        val accelY = omega * omega * (effectiveTargetY - offsetY) - 2f * zeta * omega * velocityY
        velocityX += accelX * dt
        velocityY += accelY * dt
        offsetX += velocityX * dt
        offsetY += velocityY * dt

        val magnitude01 = max(
            abs(offsetX) / config.maxOffsetXdp,
            abs(offsetY) / config.maxOffsetYdp
        ).coerceIn(0f, 1f)
        lastMagnitude01 = magnitude01

        return CueOutput(offsetX, offsetY, alpha, magnitude01)
    }

    fun reset() {
        offsetX = 0f
        offsetY = 0f
        velocityX = 0f
        velocityY = 0f
        alpha = 0f
        lastTimestampMs = 0L
        lastMotionAtMs = 0L
        enterCandidateSinceMs = 0L
        isMoving = false
        lastMagnitude01 = 0f
    }

    fun currentOutput(): CueOutput = CueOutput(offsetX, offsetY, alpha, lastMagnitude01)

    /** 当前是否处于「车辆运动中」（自动模式的可见性判据，带迟滞） */
    fun isVehicleMoving(): Boolean = isMoving

    /**
     * 进入用高阈值、维持用低阈值：
     * - 静止态：连续 [CueConfig.motionConfirmMs] 超过进入阈值才认定「在动」，
     *   避免把「拿起手机晃一下」当成上车；
     * - 运动态：只有跌破退出阈值并持续 [CueConfig.stillTimeoutS] 才认「停了」，
     *   匀速巡航时加速度信号很弱，单阈值会让圆点忽隐忽现。
     */
    private fun updateMotionState(accelMag: Float, yawMag: Float, timestampMs: Long) {
        if (isMoving) {
            if (accelMag > config.motionAccelExitMS2 || yawMag > config.motionYawExitRadS) {
                lastMotionAtMs = timestampMs
            } else if (timestampMs - lastMotionAtMs > config.stillTimeoutS * 1000f) {
                isMoving = false
                enterCandidateSinceMs = 0L
            }
            return
        }

        val aboveEnter = accelMag > config.motionAccelEnterMS2 ||
            yawMag > config.motionYawEnterRadS
        if (!aboveEnter) {
            enterCandidateSinceMs = 0L
            return
        }
        if (enterCandidateSinceMs == 0L) {
            enterCandidateSinceMs = timestampMs
            return
        }
        if (timestampMs - enterCandidateSinceMs >= config.motionConfirmMs) {
            isMoving = true
            lastMotionAtMs = timestampMs
            enterCandidateSinceMs = 0L
        }
    }

    /** 偏航角速度归一到 ±1（以满行程参考角速度为单位） */
    private fun aYawToNormalized(yawDeadRadS: Float): Float =
        yawDeadRadS / config.yawReferenceRadS

    private fun clampTo1(value: Float): Float = value.coerceIn(-1f, 1f)

    private fun computeDt(timestampMs: Long): Float {
        if (lastTimestampMs == 0L) return 0.016f
        val dt = (timestampMs - lastTimestampMs) / 1000f
        return dt.coerceIn(0.002f, 0.05f)
    }

    /** 软死区：超出死区的部分才参与映射，保证中心附近稳定 */
    private fun softDeadband(value: Float, deadband: Float): Float {
        val magnitude = abs(value)
        if (magnitude <= deadband) return 0f
        return (magnitude - deadband) * (if (value > 0f) 1f else -1f)
    }

    private fun smoothStep(x: Float): Float {
        val t = x.coerceIn(0f, 1f)
        return t * t * (3f - 2f * t)
    }
}

/**
 * 按灵敏度缩放「满行程参考输入」：灵敏度越高，同样的驾驶动作越接近满行程。
 *
 * 只动参考输入、不动 maxOffsetXdp/maxOffsetYdp，是为了保住 OverlayView 的边缘带几何约束。
 * 如果改成放大位移上限，会重新引入 v0.3.3 前「引擎请求 40dp、View 只给 20dp」的静默裁剪。
 * 死区与自动模式判据不随灵敏度变：那两类阈值描述的是传感器噪声和「有没有在动」，
 * 与用户希望的显示幅度无关。
 */
fun MotionCueEngine.CueConfig.withSensitivity(sensitivity: Float): MotionCueEngine.CueConfig {
    val s = sensitivity.coerceIn(0.5f, 2.0f)
    return copy(
        yawReferenceRadS = yawReferenceRadS / s,
        lateralReferenceMS2 = lateralReferenceMS2 / s,
        longitudinalReferenceMS2 = longitudinalReferenceMS2 / s
    )
}