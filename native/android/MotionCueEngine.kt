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
        /** 水平方向最大位移（dp） */
        val maxOffsetXdp: Float = 40f,
        /** 垂直方向最大位移（dp） */
        val maxOffsetYdp: Float = 48f,
        /** 偏航角速度 → 位移增益（dp per rad/s） */
        val yawGainDpPerRadS: Float = 110f,
        /** 横向加速度 → 位移增益（dp per m/s²） */
        val lateralGainDpPerMS2: Float = 20f,
        /** 纵向（前进）加速度 → 位移增益（dp per m/s²），正号表示加速时圆点向下 */
        val longitudinalGainDpPerMS2: Float = 24f,
        /** 加速度死区（m/s²），抑制静止噪声 */
        val deadbandAccel: Float = 0.12f,
        /** 偏航角速度死区（rad/s） */
        val deadbandYaw: Float = 0.015f,
        /** 弹簧固有频率（rad/s），越大越跟手 */
        val springOmega: Float = 12f,
        /** 弹簧阻尼比（1.0 = 临界阻尼） */
        val springZeta: Float = 1.0f,
        /** 自动模式：判定为「运动」的加速度阈值（m/s²） */
        val motionAccelThreshold: Float = 0.25f,
        /** 自动模式：判定为「运动」的偏航角速度阈值（rad/s） */
        val motionYawThreshold: Float = 0.05f,
        /** 自动模式：静止多久后淡出（秒） */
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
        val forward = if (hasForward) mergedForward else floatArrayOf(0f, 1f, 0f)
        val right = RotationMath.normalize(RotationMath.cross(forward, WORLD_UP))

        // ---- 2. 车辆坐标系下的加速度分量 ----
        val aLong = if (hasForward) RotationMath.dot(fusion.horizontalAccel, forward) else 0f
        val aLat = if (hasForward) RotationMath.dot(fusion.horizontalAccel, right) else 0f

        val aLongDead = softDeadband(aLong, config.deadbandAccel)
        val aLatDead = softDeadband(aLat, config.deadbandAccel)
        val yawDead = softDeadband(fusion.yawRate, config.deadbandYaw)

        // ---- 3. 映射到屏幕位移（圆点流动方向 = 车窗外景物流动方向）----
        // 左转 yaw > 0 → 向右；左转时向心加速度朝左（aLat < 0）→ 同样向右
        val targetXdp = clamp(
            yawDead * config.yawGainDpPerRadS - aLatDead * config.lateralGainDpPerMS2,
            config.maxOffsetXdp
        )
        // 加速前进 → 圆点向下；刹车 → 圆点向上
        val targetYdp = clamp(
            aLongDead * config.longitudinalGainDpPerMS2,
            config.maxOffsetYdp
        )

        // ---- 4. 自动模式可见性 ----
        val isMoving = fusion.horizontalAccelMagnitude > config.motionAccelThreshold ||
            abs(fusion.yawRate) > config.motionYawThreshold
        if (isMoving) {
            lastMotionAtMs = timestampMs
        }
        val shouldShow = if (autoMode) {
            lastMotionAtMs > 0 && timestampMs - lastMotionAtMs < (config.stillTimeoutS * 1000f)
        } else {
            true
        }

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
        lastMagnitude01 = 0f
    }

    fun currentOutput(): CueOutput = CueOutput(offsetX, offsetY, alpha, lastMagnitude01)

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

    private fun clamp(value: Float, limit: Float): Float =
        value.coerceIn(-limit, limit)

    private fun smoothStep(x: Float): Float {
        val t = x.coerceIn(0f, 1f)
        return t * t * (3f - 2f * t)
    }
}