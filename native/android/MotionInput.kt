package com.anonymous.anticarsicknessrn

/**
 * 多路传感器原始值 → 融合输入（纯 Kotlin，零 Android 依赖，可在 JVM 验证台上断言）。
 *
 * 为什么抽出来：常驻服务（`OverlayService`）与 App 内预览（`CuePreview`）需要**完全相同**的
 * 采样缓存与回退规则。以前这套逻辑长在服务里，预览只能另写一份 —— 那正是
 * 「预览看着对、真机不灵」这类无法复现问题的温床。
 *
 * 线程约定：与调用者同线程（服务里是传感器 HandlerThread），内部无锁。
 */
class MotionInput {

    // 4 槽容纳 Android 旋转矢量的 w 分量；长度单独记录
    private val rotationVectorRaw = FloatArray(4)
    private var rotationVectorLength = 0
    private val rotationVector3 = FloatArray(3)
    private val rotationVector4 = FloatArray(4)

    private val accelValues = FloatArray(3)
    private var hasAccel = false

    private val linearAccelValues = FloatArray(3)
    private var hasLinearAccel = false

    private val gravityValues = FloatArray(3)
    private var hasGravity = false

    private val gyroValues = FloatArray(3)
    private var hasGyro = false

    fun onRotationVector(values: FloatArray) {
        val n = minOf(values.size, rotationVectorRaw.size)
        System.arraycopy(values, 0, rotationVectorRaw, 0, n)
        rotationVectorLength = n
    }

    fun onLinearAcceleration(values: FloatArray) = copy3(values, linearAccelValues).also { hasLinearAccel = true }

    fun onAcceleration(values: FloatArray) = copy3(values, accelValues).also { hasAccel = true }

    fun onGravity(values: FloatArray) = copy3(values, gravityValues).also { hasGravity = true }

    fun onGyroscope(values: FloatArray) = copy3(values, gyroValues).also { hasGyro = true }

    /** 至少有一路加速度才算有数据，否则融合结果没有意义 */
    fun hasMotionData(): Boolean = hasAccel || hasLinearAccel

    /** 拿到这一帧的融合结果；数据不足时返回 null（调用方应跳过本帧而不是画上一帧） */
    fun fuse(fusion: SensorFusion): SensorFusion.FusionOutput? {
        if (!hasMotionData()) return null

        val rotationVector = when (rotationVectorLength) {
            0 -> null
            3 -> {
                System.arraycopy(rotationVectorRaw, 0, rotationVector3, 0, 3)
                rotationVector3
            }
            else -> {
                System.arraycopy(rotationVectorRaw, 0, rotationVector4, 0, 4)
                rotationVector4
            }
        }

        return fusion.update(
            rotationVector = rotationVector,
            accel = if (hasAccel) accelValues else null,
            linearAccel = if (hasLinearAccel) linearAccelValues else null,
            gravity = if (hasGravity) gravityValues else null,
            gyro = if (hasGyro) gyroValues else null
        )
    }

    /** 传感器重新注册（息屏后亮屏、预览重新打开）时清空，避免用过期数据出第一帧 */
    fun reset() {
        rotationVectorLength = 0
        hasAccel = false
        hasLinearAccel = false
        hasGravity = false
        hasGyro = false
    }

    private fun copy3(source: FloatArray, target: FloatArray) {
        val n = minOf(source.size, 3)
        System.arraycopy(source, 0, target, 0, n)
    }
}
